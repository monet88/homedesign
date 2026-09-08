// Workers-runtime production policy tests (ticket #18).
// Public seams: HTTP 403/404 and grant no-op.

import { env } from "cloudflare:test";
import { describe, expect, it, beforeEach, vi } from "vitest";
import type { Env } from "@/lib/bindings";
import { createDesign, resolveSourceAccess } from "@/lib/ai/lifecycle";
import { ensureFreeCreditGrant, getAvailableCredits, recordAdminCreditAdjustment } from "@/lib/credits/ledger";
import { mockPurchase } from "@/lib/payments/core";
import { handleAuthRequest, createAuth } from "@/lib/auth/server";
import { validPngBytes } from "@/lib/fixtures/images";
import { getPrivateBucketName } from "@/lib/env/policy";
import { createUploadIntent } from "@/lib/intake/intake-service";
import { deliverShareAsset, createProjectShare } from "@/lib/library/share";
import { POST as handleUploadIntent } from "@/app/api/assets/upload-intent/route";
import { GET as handleDownload } from "@/app/api/assets/[id]/download/route";
import type { RouteSession } from "@/lib/ai/http";

// Mock the auth seam so these route handlers can be exercised through their real
// caller boundary (presign / bucket resolution) with an injected demo env.
let mockRouteSession: RouteSession | Response | null = null;

vi.mock("@/lib/ai/http", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/http")>();
  return {
    ...actual,
    authorizeVerified: vi.fn().mockImplementation(async () => {
      if (!mockRouteSession) return Response.json({ error: "UNAUTHENTICATED" }, { status: 401 });
      return mockRouteSession;
    }),
  };
});

function prodEnv(): Env {
  return { ...(env as unknown as Env), ENVIRONMENT: "production" };
}

function demoEnv(): Env {
  return { ...(env as unknown as Env), ENVIRONMENT: "demo", AI_API_KEY: "sk-live-demo-key" };
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

  it("enforces deterministic 0-credit workload gating in demo: upload intent and AI task fail with no billable state created", async () => {
    const d = demoEnv();
    // 1. Initial available credits is strictly 0
    expect(await getAvailableCredits(d, userId)).toBe(0);

    // 2. Upload intent fails closed with zero-credit quota exceeded error
    await expect(
      createUploadIntent(d, {
        userId,
        name: "test-room.png",
        mimeType: "image/png",
        size: 1024,
      })
    ).rejects.toThrow(/zero-credit workload gating in demo/);

    // 3. Verify no assets row was inserted
    const assetRow = await env.DB.prepare(
      `SELECT COUNT(*) AS cnt FROM assets WHERE user_id = ?1`
    ).bind(userId).first<{ cnt: number }>();
    expect(assetRow?.cnt).toBe(0);

    // Seed ready asset for task test to verify task creation gating
    const assetId = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO assets (id, name, mime_type, size, lifecycle, storage_key, user_id, created_at, updated_at)
       VALUES (?1, 'seed.png', 'image/png', 1024, 'ready', ?2, ?3, 1, 1)`
    ).bind(assetId, `ready/${assetId}`, userId).run();

    // 4. AI task creation fails closed with 402 INSUFFICIENT_CREDITS
    await expect(
      createDesign(d, userId, {
        sourceAssetId: assetId,
        scene: "interior",
        intent: { mode: "redesign", roomType: "living-room", style: "modern" },
        idempotencyKey: "demo-zero-credit-test-task",
      })
    ).rejects.toThrow(/INSUFFICIENT_CREDITS/);

    // 5. Verify no ai_tasks row or credit_holds row was created
    const taskRow = await env.DB.prepare(
      `SELECT COUNT(*) AS cnt FROM ai_tasks WHERE user_id = ?1`
    ).bind(userId).first<{ cnt: number }>();
    expect(taskRow?.cnt).toBe(0);

    const holdRow = await env.DB.prepare(
      `SELECT COUNT(*) AS cnt FROM credit_holds WHERE user_id = ?1`
    ).bind(userId).first<{ cnt: number }>();
    expect(holdRow?.cnt).toBe(0);

    // 6. Available credits remains strictly 0
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
  it("requires GOOGLE_CLIENT_ID and distinct GOOGLE_CLIENT_SECRET for demo, failing closed", () => {
    const baseDemo = {
      ...(env as unknown as Env),
      ENVIRONMENT: "demo",
      BETTER_AUTH_SECRET: "test-secret-that-is-long-enough-32-chars",
      BETTER_AUTH_URL: "https://homedesign.monet.uno",
    };

    // Missing GOOGLE_CLIENT_ID in demo must throw
    expect(() => createAuth(baseDemo)).toThrow("GOOGLE_CLIENT_ID is required in demo");
    expect(() => createAuth({ ...baseDemo, GOOGLE_CLIENT_ID: "   " })).toThrow("GOOGLE_CLIENT_ID is required in demo");

    // Missing GOOGLE_CLIENT_SECRET in demo must throw
    expect(() => createAuth({ ...baseDemo, GOOGLE_CLIENT_ID: "client-id-123" })).toThrow(
      "GOOGLE_CLIENT_SECRET is required and must be distinct from GOOGLE_CLIENT_ID in demo"
    );

    // GOOGLE_CLIENT_SECRET identical to GOOGLE_CLIENT_ID in demo must throw
    expect(() =>
      createAuth({ ...baseDemo, GOOGLE_CLIENT_ID: "client-id-123", GOOGLE_CLIENT_SECRET: "client-id-123" })
    ).toThrow("GOOGLE_CLIENT_SECRET is required and must be distinct from GOOGLE_CLIENT_ID in demo");

    // Valid distinct GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET succeeds and disables emailAndPassword
    const validAuth = createAuth({
      ...baseDemo,
      GOOGLE_CLIENT_ID: "client-id-123",
      GOOGLE_CLIENT_SECRET: "distinct-secret-456",
    });
    expect(validAuth).toBeDefined();
    expect(validAuth.options.emailAndPassword?.enabled).toBe(false);
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

  it("proves configured private bucket selection through real upload-intent and download route caller boundaries, plus provider-source and share delivery", async () => {
    const s3Creds = {
      R2_ACCOUNT_ID: "acct-test-456",
      R2_ACCESS_KEY_ID: "akid-test-789",
      R2_SECRET_ACCESS_KEY: "secret-test-012",
    };
    const demoRouteEnv = {
      ...(env as unknown as Env),
      ENVIRONMENT: "demo",
      ...s3Creds,
    } as unknown as Env;

    // Fund the operator so the real upload-intent route (which enforces
    // zero-credit gating in demo) proceeds past quota.
    await recordAdminCreditAdjustment(demoRouteEnv, userId, 10, "Caller seam credits", "admin-id");
    mockRouteSession = { env: demoRouteEnv, userId };

    // 1. Caller Seam: upload-intent route (POST /api/assets/upload-intent)
    const uploadReq = new Request("https://homedesign.monet.uno/api/assets/upload-intent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "demo-room.png", mimeType: "image/png", size: 1024 }),
    });
    const uploadRes = await handleUploadIntent(uploadReq);
    expect(uploadRes.status).toBe(200);
    const uploadJson = (await uploadRes.json()) as {
      code: number;
      data: { assetId: string; presignedUrl: string };
    };
    expect(uploadJson.code).toBe(0);
    expect(uploadJson.data.assetId).toBeTruthy();
    expect(uploadJson.data.presignedUrl).toContain(
      "https://hd-demo-private.acct-test-456.r2.cloudflarestorage.com/quarantine/"
    );

    // 2. Caller Seam: private download route (GET /api/assets/[id]/download)
    const dlAssetId = crypto.randomUUID();
    const dlStorageKey = `ready/${dlAssetId}.png`;
    await env.DB.prepare(
      `INSERT INTO assets (id, name, mime_type, size, lifecycle, storage_key, user_id, created_at, updated_at)
       VALUES (?1, 'download.png', 'image/png', 1024, 'ready', ?2, ?3, ?4, ?4)`
    ).bind(dlAssetId, dlStorageKey, userId, Date.now()).run();

    const downloadReq = new Request(`https://homedesign.monet.uno/api/assets/${dlAssetId}/download`);
    const downloadRes = await handleDownload(downloadReq, {
      params: Promise.resolve({ id: dlAssetId }),
    });
    expect(downloadRes.status).toBe(302);
    expect(downloadRes.headers.get("location")).toContain(
      `https://hd-demo-private.acct-test-456.r2.cloudflarestorage.com/ready/${dlAssetId}.png`
    );

    mockRouteSession = null;

    // 3. Caller Seam: provider-source access (resolveSourceAccess) — kept direct
    const demoSourceUrl = await resolveSourceAccess(
      { ...(env as unknown as Env), ENVIRONMENT: "demo", ...s3Creds },
      "quarantine/source-asset-1.png"
    );
    expect(demoSourceUrl).toContain("https://hd-demo-private.acct-test-456.r2.cloudflarestorage.com/quarantine/source-asset-1.png");

    const stagingSourceUrl = await resolveSourceAccess(
      { ...(env as unknown as Env), ENVIRONMENT: "staging", ...s3Creds },
      "quarantine/source-asset-1.png"
    );
    expect(stagingSourceUrl).toContain("https://hd-staging-private.acct-test-456.r2.cloudflarestorage.com/quarantine/source-asset-1.png");

    const customSourceUrl = await resolveSourceAccess(
      { ...(env as unknown as Env), ENVIRONMENT: "demo", HD_PRIVATE_BUCKET_NAME: "custom-source-bucket", ...s3Creds },
      "quarantine/source-asset-1.png"
    );
    expect(customSourceUrl).toContain("https://custom-source-bucket.acct-test-456.r2.cloudflarestorage.com/quarantine/source-asset-1.png");

    // 4. Caller Seam: Share Delivery (deliverShareAsset) — kept direct
    const now = Date.now();
    const shareAssetId = crypto.randomUUID();
    const shareProjectId = crypto.randomUUID();
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO assets (id, name, mime_type, size, lifecycle, storage_key, user_id, created_at, updated_at)
         VALUES (?1, 'shared.png', 'image/png', 1024, 'ready', ?2, ?3, ?4, ?4)`
      ).bind(shareAssetId, `ready/${shareAssetId}.png`, userId, now),
      env.DB.prepare(
        `INSERT INTO projects (id, user_id, name, kind, visibility, created_at, updated_at)
         VALUES (?1, ?2, 'Shared Proj', 'interior', 'private', ?3, ?3)`
      ).bind(shareProjectId, userId, now),
      env.DB.prepare(
        `INSERT INTO project_assets (project_id, asset_id, role, created_at)
         VALUES (?1, ?2, 'generated', ?3)`
      ).bind(shareProjectId, shareAssetId, now),
    ]);
    const { token: shareToken } = await createProjectShare(
      { ...(env as unknown as Env), ENVIRONMENT: "demo", ...s3Creds },
      userId,
      shareProjectId,
      { assetIds: [shareAssetId] }
    );

    const demoShareRes = await deliverShareAsset(
      { ...(env as unknown as Env), ENVIRONMENT: "demo", ...s3Creds },
      { token: shareToken, assetId: shareAssetId }
    );
    expect(demoShareRes).not.toBeNull();
    expect(demoShareRes?.status).toBe(302);
    expect(demoShareRes?.headers.get("location")).toContain("https://hd-demo-private.acct-test-456.r2.cloudflarestorage.com/ready/");

    const customShareRes = await deliverShareAsset(
      { ...(env as unknown as Env), ENVIRONMENT: "demo", HD_PRIVATE_BUCKET_NAME: "custom-share-bucket", ...s3Creds },
      { token: shareToken, assetId: shareAssetId }
    );
    expect(customShareRes?.status).toBe(302);
    expect(customShareRes?.headers.get("location")).toContain("https://custom-share-bucket.acct-test-456.r2.cloudflarestorage.com/ready/");
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
        width INTEGER, height INTEGER, created_by TEXT, purge_at INTEGER
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
        kind TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft', visibility TEXT NOT NULL DEFAULT 'private',
        favorite INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
      )`
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS project_assets (
        project_id TEXT NOT NULL, asset_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('source','generated','share-selected')),
        created_at INTEGER NOT NULL,
        PRIMARY KEY (project_id, asset_id, role)
      )`
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS project_shares (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        token_digest TEXT NOT NULL UNIQUE,
        expires_at INTEGER,
        revoked_at INTEGER,
        created_at INTEGER NOT NULL
      )`
    ),
    db.prepare(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_designs_idempotency
       ON designs (user_id, idempotency_key)`
    ),
  ]);
}
