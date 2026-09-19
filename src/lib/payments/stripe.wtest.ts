import { env } from "cloudflare:test";
import { describe, expect, it, beforeEach, vi, afterEach } from "vitest";
import type { Env } from "@/lib/bindings";
import {
  createStripeCheckoutSession,
  handleStripeWebhook,
  CREDIT_PACKS,
  type PaymentOrderRecord,
} from "./stripe";
import { getAvailableCredits } from "@/lib/credits/ledger";

let testUserId: string;

async function applyMigrations(db: D1Database) {
  await db.batch([
    db.prepare(
      `CREATE TABLE IF NOT EXISTS user (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
        emailVerified INTEGER NOT NULL DEFAULT 0, role TEXT NOT NULL DEFAULT 'user',
        image TEXT, createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL
      )`
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS credit_ledger (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
        entry_type TEXT NOT NULL CHECK (entry_type IN ('grant','payment','usage','hold','release')),
        amount INTEGER NOT NULL,
        reason TEXT NOT NULL,
        ref_type TEXT,
        ref_id TEXT,
        grant_key TEXT,
        workspace_id TEXT,
        created_at INTEGER NOT NULL
      )`
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_credit_ledger_user_created ON credit_ledger(user_id, created_at)`
    ),
    db.prepare(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_ledger_grant_key
        ON credit_ledger(user_id, grant_key) WHERE grant_key IS NOT NULL`
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS credit_holds (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
        amount INTEGER NOT NULL CHECK (amount > 0),
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','settled','released')),
        ref_type TEXT NOT NULL,
        ref_id TEXT NOT NULL,
        ledger_hold_id TEXT,
        workspace_id TEXT,
        created_at INTEGER NOT NULL,
        settled_at INTEGER,
        released_at INTEGER
      )`
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_credit_holds_user_status ON credit_holds(user_id, status)`
    ),
    db.prepare(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_holds_ref_active
        ON credit_holds(ref_type, ref_id) WHERE status = 'active'`
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS payment_orders (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
        provider TEXT NOT NULL CHECK (provider IN ('stripe', 'sepay')),
        pack TEXT NOT NULL CHECK (pack IN ('lite', 'plus', 'pro', 'max')),
        amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
        currency TEXT NOT NULL DEFAULT 'usd',
        credits_granted INTEGER NOT NULL CHECK (credits_granted > 0),
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
        provider_session_id TEXT UNIQUE,
        provider_payment_id TEXT UNIQUE,
        ledger_entry_id TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_payment_orders_user_created ON payment_orders(user_id, created_at)`
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_payment_orders_session ON payment_orders(provider_session_id)`
    ),
  ]);
}

async function seedUser(id = crypto.randomUUID(), email = `user-${Date.now()}@example.com`): Promise<string> {
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO user (id, name, email, emailVerified, role, createdAt, updatedAt)
     VALUES (?1, 'Test User', ?2, 1, 'user', ?3, ?3)`
  )
    .bind(id, email, now)
    .run();
  return id;
}

beforeEach(async () => {
  await applyMigrations(env.DB);
  testUserId = await seedUser();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Stripe Checkout & Webhook Fulfillment on Workers Runtime (Ticket 3.1)", () => {
  describe("createStripeCheckoutSession", () => {
    it("fails closed with 503 when STRIPE_SECRET_KEY is missing", async () => {
      const mockEnv = { ...(env as unknown as Env), STRIPE_SECRET_KEY: undefined };
      await expect(
        createStripeCheckoutSession(mockEnv, {
          userId: testUserId,
          userEmail: "test@example.com",
          pack: "lite",
          successUrl: "https://example.com/success",
          cancelUrl: "https://example.com/cancel",
        })
      ).rejects.toThrow("STRIPE_NOT_CONFIGURED");
    });

    it("creates a pending payment_order and returns checkout session info", async () => {
      const mockSessionId = "cs_test_mock_session_123";
      const mockCheckoutUrl = "https://checkout.stripe.com/pay/cs_test_mock_session_123";

      vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        const url = String(input);
        if (url.includes("api.stripe.com/v1/checkout/sessions")) {
          expect(init?.headers).toMatchObject({
            Authorization: "Bearer sk_test_secret_key_123",
          });
          return new Response(JSON.stringify({ id: mockSessionId, url: mockCheckoutUrl }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response("Not Found", { status: 404 });
      });

      const mockEnv = {
        ...(env as unknown as Env),
        STRIPE_SECRET_KEY: "sk_test_secret_key_123",
      };

      const result = await createStripeCheckoutSession(mockEnv, {
        userId: testUserId,
        userEmail: "test@example.com",
        pack: "plus",
        successUrl: "https://example.com/success",
        cancelUrl: "https://example.com/cancel",
      });

      expect(result.sessionId).toBe(mockSessionId);
      expect(result.checkoutUrl).toBe(mockCheckoutUrl);
      expect(result.orderId).toBeTruthy();

      // Verify row in D1 payment_orders
      const order = await env.DB.prepare(
        `SELECT * FROM payment_orders WHERE id = ?1`
      )
        .bind(result.orderId)
        .first<PaymentOrderRecord>();

      expect(order).toBeDefined();
      expect(order?.user_id).toBe(testUserId);
      expect(order?.pack).toBe("plus");
      expect(order?.amount_cents).toBe(CREDIT_PACKS.plus.amountCents);
      expect(order?.credits_granted).toBe(CREDIT_PACKS.plus.credits);
      expect(order?.status).toBe("pending");
      expect(order?.provider_session_id).toBe(mockSessionId);
    });
  });

  describe("handleStripeWebhook", () => {
    it("fulfills order, credits user, and is idempotent on duplicate webhook events", async () => {
      const sessionId = `cs_test_${crypto.randomUUID()}`;
      const paymentIntentId = `pi_test_${crypto.randomUUID()}`;
      const orderId = crypto.randomUUID();
      const now = Date.now();

      // 1. Insert pending order directly
      await env.DB.prepare(
        `INSERT INTO payment_orders (id, user_id, provider, pack, amount_cents, currency, credits_granted, status, provider_session_id, created_at, updated_at)
         VALUES (?1, ?2, 'stripe', 'pro', 2900, 'usd', 320, 'pending', ?3, ?4, ?4)`
      )
        .bind(orderId, testUserId, sessionId, now)
        .run();

      const initialCredits = await getAvailableCredits(env, testUserId);
      expect(initialCredits).toBe(0);

      const event = {
        type: "checkout.session.completed",
        data: {
          object: {
            id: sessionId,
            payment_intent: paymentIntentId,
          },
        },
      };

      // 2. First fulfillment
      const firstResult = await handleStripeWebhook(env, event);
      expect(firstResult.ok).toBe(true);
      expect(firstResult.orderId).toBe(orderId);
      expect(firstResult.creditsGranted).toBe(320);
      expect(firstResult.ledgerEntryId).toBeTruthy();

      // Check credits increased
      const creditsAfterFirst = await getAvailableCredits(env, testUserId);
      expect(creditsAfterFirst).toBe(320);

      // Check order status in D1
      const order = await env.DB.prepare(
        `SELECT * FROM payment_orders WHERE id = ?1`
      )
        .bind(orderId)
        .first<PaymentOrderRecord>();

      expect(order?.status).toBe("completed");
      expect(order?.provider_payment_id).toBe(paymentIntentId);
      expect(order?.ledger_entry_id).toBe(firstResult.ledgerEntryId);

      // 3. Second fulfillment (Idempotent duplicate webhook call)
      const secondResult = await handleStripeWebhook(env, event);
      expect(secondResult.ok).toBe(true);
      expect(secondResult.alreadyProcessed).toBe(true);
      expect(secondResult.creditsGranted).toBe(320);

      // Verify credits DID NOT increase a second time
      const creditsAfterSecond = await getAvailableCredits(env, testUserId);
      expect(creditsAfterSecond).toBe(320);
    });

    it("throws 404 when session does not match any order", async () => {
      const event = {
        type: "checkout.session.completed",
        data: {
          object: { id: "cs_non_existent" },
        },
      };

      await expect(handleStripeWebhook(env, event)).rejects.toThrow("ORDER_NOT_FOUND");
    });
  });
});
