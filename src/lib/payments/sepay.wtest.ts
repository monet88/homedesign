import { env } from "cloudflare:test";
import { describe, expect, it, beforeEach, vi, afterEach } from "vitest";
import type { Env } from "@/lib/bindings";
import {
  createSepayVietQROrder,
  handleSepayWebhook,
  getSepayOrderStatus,
  SEPAY_CREDIT_PACKS,
} from "./sepay";
import type { PaymentOrderRecord } from "./stripe";
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

describe("SePay & VietQR Fulfillment on Workers Runtime (Ticket 3.2)", () => {
  describe("createSepayVietQROrder", () => {
    it("creates a pending payment_order in D1 and generates VietQR Quicklink", async () => {
      const mockEnv = {
        ...(env as unknown as Env),
        VIETQR_BANK_ID: "MBBank",
        VIETQR_ACCOUNT_NO: "0987654321",
        VIETQR_ACCOUNT_NAME: "HOMEDESIGN AI",
        VIETQR_TEMPLATE: "compact2",
      };

      const result = await createSepayVietQROrder(mockEnv, {
        userId: testUserId,
        pack: "pro",
      });

      expect(result.orderId).toMatch(/^[A-Z0-9]{10}$/);
      expect(result.transferCode).toBe(`HD${result.orderId}`);
      expect(result.amount).toBe(SEPAY_CREDIT_PACKS.pro.amountVnd);
      expect(result.credits).toBe(SEPAY_CREDIT_PACKS.pro.credits);
      expect(result.qrUrl).toContain("img.vietqr.io/image/MBBank-0987654321-compact2.png");
      expect(result.qrUrl).toContain(`addInfo=HD${result.orderId}`);

      // Verify row in D1 payment_orders
      const order = await env.DB.prepare(
        `SELECT * FROM payment_orders WHERE id = ?1`
      )
        .bind(result.orderId)
        .first<PaymentOrderRecord>();

      expect(order).toBeDefined();
      expect(order?.user_id).toBe(testUserId);
      expect(order?.provider).toBe("sepay");
      expect(order?.pack).toBe("pro");
      expect(order?.amount_cents).toBe(700_000);
      expect(order?.currency).toBe("vnd");
      expect(order?.credits_granted).toBe(320);
      expect(order?.status).toBe("pending");
      expect(order?.provider_session_id).toBe(`HD${result.orderId}`);
    });
  });

  describe("handleSepayWebhook", () => {
    it("fulfills order, atomically credits ledger, and enforces idempotency on repeated webhooks", async () => {
      const orderId = "TEST123456";
      const transferCode = `HD${orderId}`;
      const now = Date.now();

      // 1. Insert pending order directly into D1
      await env.DB.prepare(
        `INSERT INTO payment_orders (id, user_id, provider, pack, amount_cents, currency, credits_granted, status, provider_session_id, created_at, updated_at)
         VALUES (?1, ?2, 'sepay', 'plus', 400000, 'vnd', 160, 'pending', ?3, ?4, ?4)`
      )
        .bind(orderId, testUserId, transferCode, now)
        .run();

      const initialCredits = await getAvailableCredits(env, testUserId);
      expect(initialCredits).toBe(0);

      const sepayPayload = {
        id: 100200300,
        gateway: "MBBank",
        content: `Chuyen khoan thanh toan ${transferCode} cho goi Plus`,
        transferType: "in",
        transferAmount: 400000,
      };

      // 2. First Webhook Fulfillment
      const firstResult = await handleSepayWebhook(env as unknown as Env, sepayPayload);
      expect(firstResult.ok).toBe(true);
      expect(firstResult.orderId).toBe(orderId);
      expect(firstResult.creditsGranted).toBe(160);
      expect(firstResult.ledgerEntryId).toBeTruthy();

      // Check credits increased in credit_ledger
      const creditsAfterFirst = await getAvailableCredits(env, testUserId);
      expect(creditsAfterFirst).toBe(160);

      // Check payment_orders status updated in D1
      const order = await env.DB.prepare(
        `SELECT * FROM payment_orders WHERE id = ?1`
      )
        .bind(orderId)
        .first<PaymentOrderRecord>();

      expect(order?.status).toBe("completed");
      expect(order?.provider_payment_id).toBe("100200300");
      expect(order?.ledger_entry_id).toBe(firstResult.ledgerEntryId);

      // 3. Second Webhook Fulfillment (SePay retry simulation)
      const secondResult = await handleSepayWebhook(env as unknown as Env, sepayPayload);
      expect(secondResult.ok).toBe(true);
      expect(secondResult.alreadyProcessed).toBe(true);
      expect(secondResult.creditsGranted).toBe(160);

      // Verify credits DID NOT increase twice
      const creditsAfterSecond = await getAvailableCredits(env, testUserId);
      expect(creditsAfterSecond).toBe(160);
    });

    it("ignores non-incoming transfers safely without error", async () => {
      const payload = {
        id: 999,
        content: "Chuyen tien di",
        transferType: "out",
        transferAmount: 50000,
      };

      const result = await handleSepayWebhook(env as unknown as Env, payload);
      expect(result.ok).toBe(true);
      expect(result.ignored).toBe(true);
    });

    it("rejects when transfer amount is less than order amount", async () => {
      const orderId = "UNDERPAID1";
      const transferCode = `HD${orderId}`;
      const now = Date.now();

      await env.DB.prepare(
        `INSERT INTO payment_orders (id, user_id, provider, pack, amount_cents, currency, credits_granted, status, provider_session_id, created_at, updated_at)
         VALUES (?1, ?2, 'sepay', 'pro', 700000, 'vnd', 320, 'pending', ?3, ?4, ?4)`
      )
        .bind(orderId, testUserId, transferCode, now)
        .run();

      const payload = {
        id: 100200301,
        content: `Thanh toan ${transferCode}`,
        transferType: "in",
        transferAmount: 350000, // Less than 700,000
      };

      await expect(handleSepayWebhook(env as unknown as Env, payload)).rejects.toThrow("AMOUNT_MISMATCH");
    });

    it("rejects when order code is not found in content", async () => {
      const payload = {
        id: 100200302,
        content: "No code in this memo",
        transferType: "in",
        transferAmount: 200000,
      };

      await expect(handleSepayWebhook(env as unknown as Env, payload)).rejects.toThrow("ORDER_CODE_NOT_FOUND");
    });

    it("throws 404 when order code does not match any order in D1", async () => {
      const payload = {
        id: 100200303,
        content: "HDNONEXISTENT",
        transferType: "in",
        transferAmount: 200000,
      };

      await expect(handleSepayWebhook(env as unknown as Env, payload)).rejects.toThrow("ORDER_NOT_FOUND");
    });
  });

  describe("getSepayOrderStatus", () => {
    it("returns order status for polling", async () => {
      const orderId = "POLLSTATUS1";
      const now = Date.now();

      await env.DB.prepare(
        `INSERT INTO payment_orders (id, user_id, provider, pack, amount_cents, currency, credits_granted, status, provider_session_id, created_at, updated_at)
         VALUES (?1, ?2, 'sepay', 'lite', 200000, 'vnd', 80, 'completed', ?3, ?4, ?4)`
      )
        .bind(orderId, testUserId, `HD${orderId}`, now)
        .run();

      const status = await getSepayOrderStatus(env as unknown as Env, orderId, testUserId);
      expect(status).not.toBeNull();
      expect(status?.id).toBe(orderId);
      expect(status?.status).toBe("completed");
      expect(status?.completed).toBe(true);
      expect(status?.credits).toBe(80);
    });

    it("returns null when order is not found or belongs to another user", async () => {
      const status = await getSepayOrderStatus(env as unknown as Env, "unknown-order", testUserId);
      expect(status).toBeNull();
    });
  });
});
