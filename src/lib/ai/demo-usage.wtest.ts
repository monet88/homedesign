// Tests for Public Demo provider usage rate limiting and Bangkok-time calculation (ADR 0008, Issue #72).

import { env } from "cloudflare:test";
import { describe, expect, it, beforeEach, vi } from "vitest";
import type { Env } from "@/lib/bindings";
import {
  claimDemoProviderSubmission,
  getBangkokDateString,
  getDemoProviderUsage,
  getDemoDailyProviderLimit,
} from "@/lib/ai/demo-usage";
import {
  createDesign,
  runGeneration,
  getTask,
} from "@/lib/ai/lifecycle";
import {
  getAvailableCredits,
  getActiveHoldByRef,
  recordAdminCreditAdjustment,
  assertCreditInvariant,
} from "@/lib/credits/ledger";
import {
  registerProvider,
  resetProviders,
  type ProviderAdapter,
} from "@/lib/ai/provider-adapter";
import type { ProviderRequest, ProviderSubmitResult } from "@/lib/ai/types";
import {
  createFloorPlanProject,
  placeRoomMarker,
  proposeRoomBrief,
  getStageRunByDesignId,
} from "@/lib/floor-plan";
import { validPngBytes } from "@/lib/fixtures/images";

async function applyMigrations(db: D1Database) {
  const drops = [
    "DROP TABLE IF EXISTS floor_plan_stage_runs",
    "DROP TABLE IF EXISTS room_designs",
    "DROP TABLE IF EXISTS project_shares",
    "DROP TABLE IF EXISTS project_assets",
    "DROP TABLE IF EXISTS designs",
    "DROP TABLE IF EXISTS projects",
    "DROP TABLE IF EXISTS ai_tasks",
    "DROP TABLE IF EXISTS idempotency_keys",
    "DROP TABLE IF EXISTS mock_payments",
    "DROP TABLE IF EXISTS credit_holds",
    "DROP TABLE IF EXISTS credit_ledger",
    "DROP TABLE IF EXISTS queue_events",
    "DROP TABLE IF EXISTS assets",
    "DROP TABLE IF EXISTS demo_provider_usage",
    "DROP TABLE IF EXISTS user",
  ];
  for (const sql of drops) {
    await db.prepare(sql).run();
  }

  await db.batch([
    db.prepare(
      `CREATE TABLE IF NOT EXISTS demo_provider_usage (
        usage_date TEXT PRIMARY KEY,
        usage_count INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL
      )`
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS user (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
        emailVerified INTEGER NOT NULL DEFAULT 1, role TEXT NOT NULL DEFAULT 'user',
        createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL
      )`
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS credit_ledger (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
        entry_type TEXT NOT NULL CHECK (entry_type IN ('grant','payment','usage','hold','release')),
        amount INTEGER NOT NULL, reason TEXT NOT NULL, ref_type TEXT, ref_id TEXT, grant_key TEXT,
        created_at INTEGER NOT NULL
      )`
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS credit_holds (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
        amount INTEGER NOT NULL CHECK (amount > 0),
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','settled','released')),
        ref_type TEXT NOT NULL, ref_id TEXT NOT NULL, ledger_hold_id TEXT,
        created_at INTEGER NOT NULL, settled_at INTEGER, released_at INTEGER
      )`
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS assets (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, mime_type TEXT NOT NULL, size INTEGER NOT NULL,
        lifecycle TEXT NOT NULL DEFAULT 'pending-upload'
          CHECK (lifecycle IN ('pending-upload','quarantined','ready','rejected','deleted')),
        storage_key TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
        user_id TEXT, declared_size INTEGER, actual_size INTEGER, width INTEGER, height INTEGER,
        created_by TEXT, deleted_at INTEGER, purge_at INTEGER, recovery_until INTEGER
      )`
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('interior','exterior','floor-plan')),
        name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft', source_asset_id TEXT,
        favorite INTEGER NOT NULL DEFAULT 0, visibility TEXT NOT NULL DEFAULT 'private',
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
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
      `CREATE TABLE IF NOT EXISTS designs (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        scene TEXT NOT NULL CHECK (scene IN ('interior','exterior','floor-plan')),
        stage TEXT, provider TEXT NOT NULL, model TEXT NOT NULL, provider_scene TEXT NOT NULL,
        prompt TEXT NOT NULL, config_json TEXT NOT NULL, source_asset_id TEXT NOT NULL,
        output_asset_id TEXT, cost_credits INTEGER NOT NULL, idempotency_key TEXT NOT NULL,
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, completed_at INTEGER
      )`
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS room_designs (
        id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
        marker_id TEXT NOT NULL, marker_x REAL NOT NULL, marker_y REAL NOT NULL,
        marker_locked INTEGER NOT NULL DEFAULT 0, brief_confirmed_at INTEGER,
        progress TEXT NOT NULL DEFAULT 'draft',
        recognition_json TEXT, proposal_json TEXT,
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
        UNIQUE (project_id, marker_id)
      )`
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS floor_plan_stage_runs (
        id TEXT PRIMARY KEY, room_design_id TEXT NOT NULL REFERENCES room_designs(id) ON DELETE CASCADE,
        stage TEXT NOT NULL CHECK (stage IN ('brief','layout','render','panorama')),
        status TEXT NOT NULL DEFAULT 'draft',
        design_id TEXT, confirmed_at INTEGER,
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
      )`
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS ai_tasks (
        id TEXT PRIMARY KEY, scene TEXT NOT NULL, provider TEXT NOT NULL,
        model TEXT NOT NULL, prompt TEXT NOT NULL, source_key TEXT,
        status TEXT NOT NULL DEFAULT 'accepted'
          CHECK (status IN ('accepted','processing','output','quarantined','notified','ready','failed','expired')),
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
        user_id TEXT, hold_id TEXT, cost_credits INTEGER, expires_at INTEGER, expired_at INTEGER,
        provider_task_id TEXT, error_code TEXT, validation_attempts INTEGER NOT NULL DEFAULT 0,
        dispatched_at INTEGER
      )`
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS idempotency_keys (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
        operation TEXT NOT NULL, idempotency_key TEXT NOT NULL,
        request_fingerprint TEXT NOT NULL, result_type TEXT NOT NULL, result_id TEXT NOT NULL,
        created_at INTEGER NOT NULL, UNIQUE (user_id, operation, idempotency_key)
      )`
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS queue_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT, queue TEXT NOT NULL,
        body TEXT NOT NULL, received_at INTEGER NOT NULL
      )`
    ),
  ]);
}

beforeEach(async () => {
  await applyMigrations(env.DB);
  resetProviders();
});

describe("getDemoDailyProviderLimit", () => {
  it("defaults to 50 when env var is missing or empty", () => {
    expect(getDemoDailyProviderLimit({})).toBe(50);
    expect(getDemoDailyProviderLimit(null)).toBe(50);
    expect(getDemoDailyProviderLimit({ DEMO_DAILY_PROVIDER_LIMIT: "" })).toBe(50);
    expect(getDemoDailyProviderLimit({ DEMO_DAILY_PROVIDER_LIMIT: "  " })).toBe(50);
  });

  it("parses valid positive integer", () => {
    expect(getDemoDailyProviderLimit({ DEMO_DAILY_PROVIDER_LIMIT: "100" })).toBe(100);
    expect(getDemoDailyProviderLimit({ DEMO_DAILY_PROVIDER_LIMIT: "5" })).toBe(5);
    expect(getDemoDailyProviderLimit({ DEMO_DAILY_PROVIDER_LIMIT: 42 })).toBe(42);
  });

  it("fails safe to 50 on invalid/negative/non-numeric/malformed values and never disables cap", () => {
    expect(getDemoDailyProviderLimit({ DEMO_DAILY_PROVIDER_LIMIT: "0" })).toBe(50);
    expect(getDemoDailyProviderLimit({ DEMO_DAILY_PROVIDER_LIMIT: "-10" })).toBe(50);
    expect(getDemoDailyProviderLimit({ DEMO_DAILY_PROVIDER_LIMIT: "invalid" })).toBe(50);
    expect(getDemoDailyProviderLimit({ DEMO_DAILY_PROVIDER_LIMIT: "NaN" })).toBe(50);
    expect(getDemoDailyProviderLimit({ DEMO_DAILY_PROVIDER_LIMIT: "500oops" })).toBe(50);
    expect(getDemoDailyProviderLimit({ DEMO_DAILY_PROVIDER_LIMIT: "50.5" })).toBe(50);
    expect(getDemoDailyProviderLimit({ DEMO_DAILY_PROVIDER_LIMIT: 50.5 })).toBe(50);
    expect(getDemoDailyProviderLimit({ DEMO_DAILY_PROVIDER_LIMIT: -5 })).toBe(50);
    expect(getDemoDailyProviderLimit({ DEMO_DAILY_PROVIDER_LIMIT: 0 })).toBe(50);
  });
});

describe("getBangkokDateString", () => {
  it("computes Bangkok date correctly across UTC boundary", () => {
    const t1 = new Date("2026-09-07T16:59:00.000Z"); // 23:59 in UTC+7
    expect(getBangkokDateString(t1)).toBe("2026-09-07");

    const t2 = new Date("2026-09-07T17:00:00.000Z"); // 00:00 next day in UTC+7
    expect(getBangkokDateString(t2)).toBe("2026-09-08");
  });
});

describe("claimDemoProviderSubmission", () => {
  it("is a no-op / returns true in non-demo environment", async () => {
    const devEnv = { ...env, ENVIRONMENT: "development" } as unknown as Env;
    const res = await claimDemoProviderSubmission(devEnv);
    expect(res).toBe(true);

    const check = await getDemoProviderUsage(devEnv);
    expect(check.currentUsage).toBe(0);
  });

  it("respects custom configured limit and fails closed at limit", async () => {
    const customLimitEnv = {
      ...env,
      ENVIRONMENT: "demo",
      DEMO_DAILY_PROVIDER_LIMIT: "3",
    } as unknown as Env;
    const now = new Date("2026-09-07T10:00:00.000Z");

    expect(await claimDemoProviderSubmission(customLimitEnv, now)).toBe(true);
    expect(await claimDemoProviderSubmission(customLimitEnv, now)).toBe(true);
    expect(await claimDemoProviderSubmission(customLimitEnv, now)).toBe(true);

    // 4th must fail
    expect(await claimDemoProviderSubmission(customLimitEnv, now)).toBe(false);

    const usage = await getDemoProviderUsage(customLimitEnv, now);
    expect(usage.currentUsage).toBe(3);
    expect(usage.limit).toBe(3);
    expect(usage.allowed).toBe(false);
  });

  it("concurrent claims cannot overshoot the cap", async () => {
    const capEnv = {
      ...env,
      ENVIRONMENT: "demo",
      DEMO_DAILY_PROVIDER_LIMIT: "5",
    } as unknown as Env;
    const now = new Date("2026-09-07T10:00:00.000Z");

    // Launch 15 concurrent claims simultaneously
    const results = await Promise.all(
      Array.from({ length: 15 }, () => claimDemoProviderSubmission(capEnv, now))
    );
    const successfulClaims = results.filter(Boolean);
    const failedClaims = results.filter((r) => !r);
    expect(successfulClaims).toHaveLength(5);
    expect(failedClaims).toHaveLength(10);

    const usage = await getDemoProviderUsage(capEnv, now);
    expect(usage.currentUsage).toBe(5);
  });
});

describe("Deterministic Lifecycle & Boundary under Provider Cap (ADR 0008, Issue #72)", () => {
  async function setupUserAndAsset(userId: string, assetId: string): Promise<void> {
    const now = Date.now();
    await env.DB.prepare(
      `INSERT INTO user (id, name, email, emailVerified, role, createdAt, updatedAt)
       VALUES (?1, 'Demo User', ?2, 1, 'user', ?3, ?3)`
    ).bind(userId, `${userId}@example.com`, now).run();

    await env.DB.prepare(
      `INSERT INTO assets (id, name, mime_type, size, lifecycle, storage_key, user_id, created_at, updated_at)
       VALUES (?1, 'test.png', 'image/png', 1024, 'ready', ?2, ?3, ?4, ?4)`
    ).bind(assetId, `ready/${assetId}`, userId, now).run();

    await env.HD_PRIVATE.put(`ready/${assetId}`, validPngBytes());
  }

  it("proves 49 -> 50 -> 51 cap boundary: 50th succeeds, 51st fails closed with DEMO_DAILY_LIMIT_REACHED and releases hold exactly once", async () => {
    const demoEnv = {
      ...env,
      ENVIRONMENT: "demo",
      DEMO_DAILY_PROVIDER_LIMIT: "50",
    } as unknown as Env;

    const userId = "user-cap-test";
    const assetId = "asset-cap-test";
    await setupUserAndAsset(userId, assetId);

    // Admin grants 100 credits to user
    await recordAdminCreditAdjustment(demoEnv, userId, 100, "Demo testing credits", "admin-id");
    expect(await getAvailableCredits(demoEnv, userId)).toBe(100);

    // Seed usage table directly to 49
    const now = new Date();
    const today = getBangkokDateString(now);
    await env.DB.prepare(
      `INSERT INTO demo_provider_usage (usage_date, usage_count, updated_at)
       VALUES (?1, 49, ?2)`
    ).bind(today, now.getTime()).run();

    let usage = await getDemoProviderUsage(demoEnv, now);
    expect(usage.currentUsage).toBe(49);
    expect(usage.allowed).toBe(true);

    // Spy on provider.submit to count actual network calls
    let submitCallCount = 0;
    const mockProvider: ProviderAdapter = {
      name: "fake",
      submit: vi.fn(async (_req: ProviderRequest): Promise<ProviderSubmitResult> => {
        submitCallCount++;
        return { ok: true, providerTaskId: `p-${submitCallCount}` };
      }),
      fetchOutput: vi.fn(async () => null),
      healthCheck: vi.fn(async () => ({ status: "healthy" as const, latencyMs: 0, models: ["fake-model"], endpoint: "fake://health" })),
    };
    registerProvider(mockProvider);
    // ── 50th attempt (should SUCCEED) ──
    const design50 = await createDesign(demoEnv, userId, {
      sourceAssetId: assetId,
      scene: "interior",
      intent: { mode: "redesign", roomType: "living-room", style: "modern" },
      idempotencyKey: "idem-50",
    });
    expect(await getAvailableCredits(demoEnv, userId)).toBe(99); // 1 credit held

    const res50 = await runGeneration(demoEnv, design50.id);
    expect(["processing", "quarantined"]).toContain(res50.status);
    expect(submitCallCount).toBe(1);

    usage = await getDemoProviderUsage(demoEnv, now);
    expect(usage.currentUsage).toBe(50);
    expect(usage.allowed).toBe(false); // Cap now reached!

    // ── 51st attempt (should FAIL at boundary before provider.submit) ──
    const design51 = await createDesign(demoEnv, userId, {
      sourceAssetId: assetId,
      scene: "interior",
      intent: { mode: "redesign", roomType: "bedroom", style: "minimalist" },
      idempotencyKey: "idem-51",
    });
    const res51 = await runGeneration(demoEnv, design51.id);
    expect(res51.status).toBe("failed");

    // NO additional provider.submit call occurred after exhaustion!
    expect(submitCallCount).toBe(1);

    // Verify task is terminal failed with DEMO_DAILY_LIMIT_REACHED
    const task51 = await getTask(demoEnv, design51.id);
    expect(task51?.status).toBe("failed");
    expect(task51?.error_code).toBe("DEMO_DAILY_LIMIT_REACHED");
    // Verify Credit Hold is released exactly once and balance is restored
    const hold51 = await getActiveHoldByRef(demoEnv, "ai_task", design51.id);
    expect(hold51).toBeNull(); // no active hold remaining

    // Explicitly verify exactly one release entry in credit_ledger for design51 hold
    const releaseEntries = await env.DB.prepare(
      `SELECT * FROM credit_ledger WHERE user_id = ?1 AND ref_id = ?2 AND entry_type = 'release'`
    ).bind(userId, design51.id).all();
    expect(releaseEntries.results).toHaveLength(1);
    expect(releaseEntries.results[0]?.amount).toBe(1);
    expect(releaseEntries.results[0]?.reason).toBe("task");
    expect(releaseEntries.results[0]?.ref_type).toBe("task");
    expect(await getAvailableCredits(demoEnv, userId)).toBe(99);
    await expect(assertCreditInvariant(demoEnv, userId)).resolves.toBe(true);

    // Usage count remains at 50 (does not overshoot)
    usage = await getDemoProviderUsage(demoEnv, now);
    expect(usage.currentUsage).toBe(50);
  });

  it("preserves Floor Plan stage run terminal invariants when cap is reached", async () => {
    const demoEnv = {
      ...env,
      ENVIRONMENT: "demo",
      DEMO_DAILY_PROVIDER_LIMIT: "1", // limit = 1
    } as unknown as Env;

    const userId = "user-fp-test";
    const assetId = "asset-fp-test";
    await setupUserAndAsset(userId, assetId);
    await recordAdminCreditAdjustment(demoEnv, userId, 50, "FP credits", "admin-id");

    const now = new Date();
    const today = getBangkokDateString(now);

    // Cap already reached (1/1)
    await env.DB.prepare(
      `INSERT INTO demo_provider_usage (usage_date, usage_count, updated_at)
       VALUES (?1, 1, ?2)`
    ).bind(today, now.getTime()).run();

    // Create Floor Plan project and place room marker
    const fpProj = await createFloorPlanProject(demoEnv, userId, assetId);
    const room = await placeRoomMarker(demoEnv, userId, fpProj.id, { x: 40, y: 60 });
    await proposeRoomBrief(demoEnv, userId, room.id);

    const briefDesign = await createDesign(demoEnv, userId, {
      sourceAssetId: assetId,
      scene: "floor-plan",
      intent: { stage: "brief", roomId: room.id, marker: { x: 40, y: 60 } },
      options: { aspect_ratio: "1:1", num_outputs: 1 },
      idempotencyKey: `fp-cap-${room.id}`,
    });

    const taskId = briefDesign.id;
    const stageRunBefore = await getStageRunByDesignId(demoEnv, taskId);
    expect(stageRunBefore?.status).toBe("processing");

    // Run generation when cap is exhausted
    const genRes = await runGeneration(demoEnv, taskId);
    expect(genRes.status).toBe("failed");

    // Verify task failed with DEMO_DAILY_LIMIT_REACHED
    const task = await getTask(demoEnv, taskId);
    expect(task?.status).toBe("failed");
    expect(task?.error_code).toBe("DEMO_DAILY_LIMIT_REACHED");

    // Verify Floor Plan stage run is properly marked 'failed'
    const stageRunAfter = await getStageRunByDesignId(demoEnv, taskId);
    expect(stageRunAfter?.status).toBe("failed");

    // Credit hold released and credits restored (50 - 1 + 1 = 50)
    const hold = await getActiveHoldByRef(demoEnv, "ai_task", taskId);
    expect(hold).toBeNull();
    expect(await getAvailableCredits(demoEnv, userId)).toBe(50);
    await expect(assertCreditInvariant(demoEnv, userId)).resolves.toBe(true);
  });

  it("proves each outbound submit retry attempt consumes a separate slot towards daily cap", async () => {
    const demoEnv = {
      ...env,
      ENVIRONMENT: "demo",
      DEMO_DAILY_PROVIDER_LIMIT: "3", // limit = 3
    } as unknown as Env;

    const userId = "user-retry-test";
    const assetId = "asset-retry-test";
    await setupUserAndAsset(userId, assetId);
    await recordAdminCreditAdjustment(demoEnv, userId, 10, "Testing credits", "admin-id");

    const now = new Date();
    // Initial usage is 0
    let usage = await getDemoProviderUsage(demoEnv, now);
    expect(usage.currentUsage).toBe(0);

    let submitAttempts = 0;
    const mockProvider: ProviderAdapter = {
      name: "fake",
      submit: vi.fn(async (): Promise<ProviderSubmitResult> => {
        submitAttempts++;
        if (submitAttempts === 1) {
          // First attempt fails transiently at provider API level
          return { ok: false, error: "PROVIDER_TRANSIENT_ERROR" };
        }
        return { ok: true, providerTaskId: `retry-task-${submitAttempts}` };
      }),
      fetchOutput: vi.fn(async () => null),
      healthCheck: vi.fn(async () => ({
        status: "healthy" as const,
        latencyMs: 0,
        models: ["fake-model"],
        endpoint: "fake://health",
      })),
    };
    registerProvider(mockProvider);

    // 1. First task attempt: runs generation, claims 1 slot, provider.submit returns transient error
    const design1 = await createDesign(demoEnv, userId, {
      sourceAssetId: assetId,
      scene: "interior",
      intent: { mode: "redesign", roomType: "living-room", style: "modern" },
      idempotencyKey: "retry-idem-1",
    });

    const res1 = await runGeneration(demoEnv, design1.id);
    expect(res1.status).toBe("failed");
    expect(submitAttempts).toBe(1);

    // Even though provider returned error, 1 actual outbound submission attempt was consumed
    usage = await getDemoProviderUsage(demoEnv, now);
    expect(usage.currentUsage).toBe(1);

    // 2. Retry / re-dispatch attempt: a new or re-dispatched runGeneration claims a 2nd slot
    // Reset task to processing to simulate reconciler / queue retry
    await env.DB.prepare(`UPDATE ai_tasks SET status = 'accepted' WHERE id = ?1`).bind(design1.id).run();
    // Re-hold credits if needed or test with second design
    const design2 = await createDesign(demoEnv, userId, {
      sourceAssetId: assetId,
      scene: "interior",
      intent: { mode: "redesign", roomType: "living-room", style: "modern" },
      idempotencyKey: "retry-idem-2",
    });

    const res2 = await runGeneration(demoEnv, design2.id);
    expect(["processing", "quarantined"]).toContain(res2.status);
    expect(submitAttempts).toBe(2);

    // 2 slots now consumed
    usage = await getDemoProviderUsage(demoEnv, now);
    expect(usage.currentUsage).toBe(2);

    // 3. Third submit attempt consumes slot 3 (reaching 3/3 cap)
    const design3 = await createDesign(demoEnv, userId, {
      sourceAssetId: assetId,
      scene: "interior",
      intent: { mode: "redesign", roomType: "bedroom", style: "modern" },
      idempotencyKey: "retry-idem-3",
    });
    const res3 = await runGeneration(demoEnv, design3.id);
    expect(["processing", "quarantined"]).toContain(res3.status);
    expect(submitAttempts).toBe(3);

    usage = await getDemoProviderUsage(demoEnv, now);
    expect(usage.currentUsage).toBe(3);
    expect(usage.allowed).toBe(false);

    // 4. Fourth attempt blocked by cap before provider.submit
    const design4 = await createDesign(demoEnv, userId, {
      sourceAssetId: assetId,
      scene: "interior",
      intent: { mode: "redesign", roomType: "kitchen", style: "modern" },
      idempotencyKey: "retry-idem-4",
    });
    const res4 = await runGeneration(demoEnv, design4.id);
    expect(res4.status).toBe("failed");
    expect(submitAttempts).toBe(3); // No extra submit call!

    usage = await getDemoProviderUsage(demoEnv, now);
    expect(usage.currentUsage).toBe(3);
  });
});
