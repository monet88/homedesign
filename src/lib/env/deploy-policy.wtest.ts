// Workers-runtime production policy tests (ticket #18).
// Public seams: HTTP 403/404 and grant no-op.

import { env } from "cloudflare:test";
import { describe, expect, it, beforeEach } from "vitest";
import type { Env } from "@/lib/bindings";
import { createDesign } from "@/lib/ai/lifecycle";
import { ensureFreeCreditGrant, getAvailableCredits } from "@/lib/credits/ledger";
import { mockPurchase } from "@/lib/payments/core";
import { handleAuthRequest, createAuth } from "@/lib/auth/server";
import { validPngBytes } from "@/lib/fixtures/images";
import { getPrivateBucketName } from "@/lib/env/policy";

function prodEnv(): Env {
  return { ...(env as unknown as Env), ENVIRONMENT: "production" };
}

function demoEnv(): Env {
  return { ...(env as unknown as Env), ENVIRONMENT: "demo" };
}

let userId: string;

beforeEach(async () => {
  await applyMigrations(env.DB);
  userId = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt)
     VALUES (?1, 'Prod User', ?2, 1, 1, 1)`
  )
    .bind(userId, `${userId}@example.com`)
    .run();
});

describe("production policy matrix", () => {
  it("free grant is a no-op in production", async () => {
    const p = prodEnv();
    const granted = await ensureFreeCreditGrant(p, userId);
    expect(granted).toBe(false);
    expect(await getAvailableCredits(p, userId)).toBe(0);
  });

  it("mock payment returns 403 in production", async () => {
    await expect(mockPurchase(prodEnv(), userId, "lite", "k1")).rejects.toThrow(
      "MOCK_PAYMENT_BANNED_IN_PRODUCTION"
    );
  });

  it("createDesign returns GENERATION_DISABLED in production", async () => {
    const assetId = crypto.randomUUID();
    const key = `ready/${assetId}`;
    const bytes = validPngBytes();
    await env.HD_PRIVATE.put(key, bytes);
    await env.DB.prepare(
      `INSERT INTO assets (
         id, name, mime_type, size, lifecycle, storage_key, user_id,
         declared_size, actual_size, created_by, created_at, updated_at
       ) VALUES (?1, 'source.png', 'image/png', ?2, 'ready', ?3, ?4, ?2, ?2, 'test', 1, 1)`
    )
      .bind(assetId, bytes.length, key, userId)
      .run();

    await expect(
      createDesign(prodEnv(), userId, {
        sourceAssetId: assetId,
        scene: "interior",
        intent: { mode: "redesign", roomType: "living-room", style: "modern" },
        idempotencyKey: "prod-blocked",
      })
    ).rejects.toMatchObject({ code: "GENERATION_DISABLED", status: 403 });
  });

  it("email sign-up is banned in production", async () => {
    const res = await handleAuthRequest(
      {
        ...(env as unknown as Env),
        ENVIRONMENT: "production",
        BETTER_AUTH_SECRET: "test-secret-that-is-long-enough-32-chars",
        BETTER_AUTH_URL: "https://homedesign.example.com",
        EMAIL_DELIVERY_MODE: "production",
      },
      new Request("https://homedesign.example.com/api/auth/sign-up/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "new@example.com",
          password: "password123",
          name: "New User",
        }),
      })
    );
    expect(res.status).toBe(403);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("EMAIL_SIGNUP_BANNED_IN_PRODUCTION");
  });
});

describe("demo policy matrix (ADR 0008, Issue #72)", () => {
  it("free grant is a no-op in demo", async () => {
    const d = demoEnv();
    const granted = await ensureFreeCreditGrant(d, userId);
    expect(granted).toBe(false);
    expect(await getAvailableCredits(d, userId)).toBe(0);
  });

  it("mock payment returns 403 in demo", async () => {
    await expect(mockPurchase(demoEnv(), userId, "lite", "k1")).rejects.toThrow(
      "MOCK_PAYMENT_BANNED_IN_DEMO"
    );
  });

  it("email sign-up is banned in demo", async () => {
    const res = await handleAuthRequest(
      {
        ...(env as unknown as Env),
        ENVIRONMENT: "demo",
        BETTER_AUTH_SECRET: "test-secret-that-is-long-enough-32-chars",
        BETTER_AUTH_URL: "https://homedesign.monet.uno",
        GOOGLE_CLIENT_ID: "demo-client-id",
        GOOGLE_CLIENT_SECRET: "demo-client-secret",
      },
      new Request("https://homedesign.monet.uno/api/auth/sign-up/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "new@example.com",
          password: "password123",
          name: "New User",
        }),
      })
    );
    expect(res.status).toBe(403);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("EMAIL_SIGNUP_BANNED_IN_DEMO");
  });

  it("email sign-in is banned in demo", async () => {
    const res = await handleAuthRequest(
      {
        ...(env as unknown as Env),
        ENVIRONMENT: "demo",
        BETTER_AUTH_SECRET: "test-secret-that-is-long-enough-32-chars",
        BETTER_AUTH_URL: "https://homedesign.monet.uno",
        GOOGLE_CLIENT_ID: "demo-client-id",
        GOOGLE_CLIENT_SECRET: "demo-client-secret",
      },
      new Request("https://homedesign.monet.uno/api/auth/sign-in/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "someone@example.com",
          password: "password123",
        }),
      })
    );
    expect(res.status).toBe(403);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("EMAIL_SIGNIN_BANNED_IN_DEMO");
  });
  it("requires distinct GOOGLE_CLIENT_SECRET for demo and fails closed when missing or identical", () => {
    const baseDemo = {
      ...(env as unknown as Env),
      ENVIRONMENT: "demo",
      BETTER_AUTH_SECRET: "test-secret-that-is-long-enough-32-chars",
      BETTER_AUTH_URL: "https://homedesign.monet.uno",
      GOOGLE_CLIENT_ID: "client-id-123",
    };

    // Missing GOOGLE_CLIENT_SECRET in demo must throw
    expect(() => createAuth(baseDemo)).toThrow("GOOGLE_CLIENT_SECRET is required and must be distinct from GOOGLE_CLIENT_ID in demo");

    // GOOGLE_CLIENT_SECRET identical to GOOGLE_CLIENT_ID in demo must throw
    expect(() =>
      createAuth({ ...baseDemo, GOOGLE_CLIENT_SECRET: "client-id-123" })
    ).toThrow("GOOGLE_CLIENT_SECRET is required and must be distinct from GOOGLE_CLIENT_ID in demo");

    // Valid distinct GOOGLE_CLIENT_SECRET succeeds
    const validAuth = createAuth({ ...baseDemo, GOOGLE_CLIENT_SECRET: "distinct-secret-456" });
    expect(validAuth).toBeDefined();
  });


  it("resolves private bucket name per environment (Issue #72, ADR 0008)", () => {
    expect(getPrivateBucketName({ ENVIRONMENT: "demo" })).toBe("hd-demo-private");
    expect(getPrivateBucketName({ ENVIRONMENT: "staging" })).toBe("hd-staging-private");
    expect(getPrivateBucketName({ ENVIRONMENT: "production" })).toBe("hd-prod-private");
    expect(getPrivateBucketName({ ENVIRONMENT: "preview" })).toBe("hd-preview-private");
    expect(getPrivateBucketName({ ENVIRONMENT: "development" })).toBe("hd-dev-private");
    expect(getPrivateBucketName({ ENVIRONMENT: "local" })).toBe("homedesign-private");
    expect(getPrivateBucketName({ ENVIRONMENT: "demo", HD_PRIVATE_BUCKET_NAME: "custom-private" })).toBe("custom-private");
  });
});

async function applyMigrations(db: D1Database) {
  await db.batch([
    db.prepare(
      `CREATE TABLE IF NOT EXISTS user (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
        emailVerified INTEGER NOT NULL DEFAULT 0, createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL
      )`
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS assets (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, mime_type TEXT NOT NULL,
        size INTEGER NOT NULL,
        lifecycle TEXT NOT NULL DEFAULT 'pending-upload',
        storage_key TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
        user_id TEXT, declared_size INTEGER, actual_size INTEGER,
        width INTEGER, height INTEGER, created_by TEXT
      )`
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS credit_ledger (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, entry_type TEXT NOT NULL,
        amount INTEGER NOT NULL, reason TEXT NOT NULL,
        ref_type TEXT, ref_id TEXT, grant_key TEXT, created_at INTEGER NOT NULL
      )`
    ),
    db.prepare(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_ledger_grant_key
       ON credit_ledger (user_id, grant_key) WHERE grant_key IS NOT NULL`
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS credit_holds (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, amount INTEGER NOT NULL,
        status TEXT NOT NULL, ref_type TEXT NOT NULL, ref_id TEXT NOT NULL,
        ledger_hold_id TEXT, created_at INTEGER NOT NULL,
        settled_at INTEGER, released_at INTEGER
      )`
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS idempotency_keys (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, operation TEXT NOT NULL,
        idempotency_key TEXT NOT NULL, request_fingerprint TEXT NOT NULL,
        result_type TEXT NOT NULL, result_id TEXT NOT NULL, created_at INTEGER NOT NULL
      )`
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS mock_payments (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, pack TEXT NOT NULL,
        label TEXT NOT NULL, amount INTEGER NOT NULL,
        idempotency_key TEXT NOT NULL, ledger_entry_id TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )`
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS ai_tasks (
        id TEXT PRIMARY KEY, scene TEXT NOT NULL, provider TEXT NOT NULL,
        model TEXT NOT NULL, prompt TEXT NOT NULL, source_key TEXT,
        status TEXT NOT NULL DEFAULT 'accepted',
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
        user_id TEXT, hold_id TEXT, cost_credits INTEGER,
        expires_at INTEGER, expired_at INTEGER, provider_task_id TEXT,
        error_code TEXT, validation_attempts INTEGER DEFAULT 0, dispatched_at INTEGER
      )`
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS designs (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, project_id TEXT NOT NULL,
        scene TEXT NOT NULL, stage TEXT, provider TEXT NOT NULL, model TEXT NOT NULL,
        provider_scene TEXT NOT NULL, prompt TEXT NOT NULL, config_json TEXT NOT NULL,
        source_asset_id TEXT NOT NULL, output_asset_id TEXT,
        cost_credits INTEGER NOT NULL, idempotency_key TEXT NOT NULL,
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, completed_at INTEGER
      )`
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL,
        kind TEXT NOT NULL, visibility TEXT NOT NULL DEFAULT 'private',
        favorite INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
      )`
    ),
    db.prepare(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_designs_idempotency
       ON designs (user_id, idempotency_key)`
    ),
  ]);
}
