// Workers-runtime tests for ticket #05: Mock Payment + Hold/settle/release
// (ADR 0002). Run via `npm run wrangler:test` (vitest-pool-workers, real D1).
//
// Covers every AC of issue #5:
//   AC1  Mock Payment 4 packs 80/160/320/640, labelled as mock, only non-production
//   AC2  Idempotency: same key+payload -> cached; same key+diff payload -> 409
//   AC3  Hold created atomically with task row; settle only when ready+attached
//   AC4  Hold released on failed/canceled/validation-exhausted/DLQ/expiry (30min),
//        late callback doesn't resurrect
//   AC5  Client polling timeout 120s does NOT settle or release the hold
//   AC6  Invariant grants+payments = usage+available+active holds after every
//        terminal transition

import { env } from "cloudflare:test";
import { describe, expect, it, beforeEach } from "vitest";
import type { Env } from "@/lib/bindings";
import {
  mockPurchase,
  createTaskWithHold,
  settleHoldOnReady,
  releaseHoldOnTerminal,
  expireStaleTasks,
  MOCK_PACKS,
  TASK_EXPIRY_MS,
  canonicalHash,
  type MockPack,
} from "@/lib/payments/core";
import {
  assertCreditInvariant,
  getAvailableCredits,
  getLedgerSummary,
  getActiveHoldByRef,
  ensureFreeCreditGrant,
} from "@/lib/credits/ledger";

let userId: string;
let email: string;

beforeEach(async () => {
  await applyMigrations(env.DB);
  userId = "user-" + crypto.randomUUID();
  email = userId + "@example.com";
  await env.DB.prepare(
    `INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt)
     VALUES (?1, 'Test User', ?2, 1, 1, 1)`
  ).bind(userId, email).run();
  await ensureFreeCreditGrant(env, userId); // 10 free credits
});

describe("Mock Payment 4 packs (AC1)", () => {
  it("credits the ledger for each pack, labelled as mock", async () => {
    const before = await getAvailableCredits(env, userId);
    expect(before).toBe(10); // free grant

    let cumulative = before; // 10 (free grant)
    for (const [pack, def] of Object.entries(MOCK_PACKS) as [MockPack, { credits: number; label: string }][]) {
      const result = await mockPurchase(env, userId, pack, `mock-${pack}`);
      expect(result.cached).toBe(false);
      expect(result.amount).toBe(def.credits);
      expect(result.label).toContain("Mock purchase — no charge");
      cumulative += def.credits;
      expect(await getAvailableCredits(env, userId)).toBe(cumulative);
    }

    const summary = await getLedgerSummary(env, userId);
    expect(summary.totalPayments).toBe(80 + 160 + 320 + 640);
    expect(summary.available).toBe(10 + 80 + 160 + 320 + 640);
    await expect(assertCreditInvariant(env, userId)).resolves.toBe(true);
  });

  it("banned in production (ENVIRONMENT === 'production')", async () => {
    const prodEnv = { ...env, ENVIRONMENT: "production" } as unknown as Env;
    await expect(mockPurchase(prodEnv, userId, "lite", "k1")).rejects.toThrow(
      "MOCK_PAYMENT_BANNED_IN_PRODUCTION"
    );
    // No credits added, no payment row.
    expect(await getAvailableCredits(env, userId)).toBe(10);
    const rows = await env.DB.prepare(`SELECT COUNT(*) AS cnt FROM mock_payments WHERE user_id = ?1`).bind(userId).first<{ cnt: number }>();
    expect(rows?.cnt).toBe(0);
  });

  it("rejects unknown packs", async () => {
    await expect(mockPurchase(env, userId, "ultra" as MockPack, "k1")).rejects.toThrow(
      "INVALID_PACK"
    );
  });
});

describe("Idempotency key system (AC2)", () => {
  it("same key + same payload -> cached record, no double-credit", async () => {
    const first = await mockPurchase(env, userId, "plus", "pay-key-1");
    expect(first.cached).toBe(false);
    expect(await getAvailableCredits(env, userId)).toBe(170); // 10 + 160

    const second = await mockPurchase(env, userId, "plus", "pay-key-1");
    expect(second.cached).toBe(true);
    expect(second.id).toBe(first.id);
    expect(await getAvailableCredits(env, userId)).toBe(170); // not double-added

    // Exactly one mock_payments row.
    const rows = await env.DB.prepare(`SELECT COUNT(*) AS cnt FROM mock_payments WHERE user_id = ?1 AND idempotency_key = 'pay-key-1'`).bind(userId).first<{ cnt: number }>();
    expect(rows?.cnt).toBe(1);

    await expect(assertCreditInvariant(env, userId)).resolves.toBe(true);
  });

  it("same key + different payload -> 409 IDEMPOTENCY_KEY_REUSED", async () => {
    await mockPurchase(env, userId, "lite", "pay-key-2");
    await expect(mockPurchase(env, userId, "max", "pay-key-2")).rejects.toThrow(
      "IDEMPOTENCY_KEY_REUSED"
    );
    // Balance unchanged by the rejected request.
    expect(await getAvailableCredits(env, userId)).toBe(90); // 10 + 80
    await expect(assertCreditInvariant(env, userId)).resolves.toBe(true);
  });

  it("same key, different user -> independent (key is per-user)", async () => {
    await mockPurchase(env, userId, "lite", "shared-key");
    const otherId = "user-other-" + crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt)
       VALUES (?1, 'Other', ?2, 1, 1, 1)`
    ).bind(otherId, otherId + "@example.com").run();
    await ensureFreeCreditGrant(env, otherId);
    const r = await mockPurchase(env, otherId, "lite", "shared-key");
    expect(r.cached).toBe(false);
    expect(await getAvailableCredits(env, otherId)).toBe(90);
  });

  it("canonical fingerprint ignores key order but not values", async () => {
    const h1 = await canonicalHash({ pack: "lite", a: 1, b: 2 });
    const h2 = await canonicalHash({ b: 2, a: 1, pack: "lite" });
    const h3 = await canonicalHash({ pack: "lite", a: 1, b: 3 });
    expect(h1).toBe(h2); // same object, reordered keys
    expect(h1).not.toBe(h3); // different value
  });
});

describe("Credit Hold: atomic task + hold, settle on ready+attached (AC3)", () => {
  it("createTaskWithHold creates a task row + active hold atomically", async () => {
    const { taskId, cached } = await createTaskWithHold(
      env,
      userId,
      {
        scene: "interior",
        provider: "fake",
        model: "gemini-2.5-flash-image",
        prompt: "Redesign this room",
        sourceKey: "quarantine/source.png",
        options: { aspect_ratio: "1:1" },
      },
      1,
      "task-key-1"
    );
    expect(cached).toBe(false);
    expect(taskId).toBeTruthy();

    // Available dropped by the hold.
    expect(await getAvailableCredits(env, userId)).toBe(9);

    // Task row exists with hold_id, user_id, cost, expiry.
    const task = await env.DB.prepare(`SELECT * FROM ai_tasks WHERE id = ?1`).bind(taskId).first<{
      hold_id: string | null;
      user_id: string | null;
      cost_credits: number | null;
      expires_at: number | null;
      status: string;
    }>();
    expect(task).not.toBeNull();
    expect(task?.hold_id).toBeTruthy();
    expect(task?.user_id).toBe(userId);
    expect(task?.cost_credits).toBe(1);
    expect(task?.expires_at).toBeGreaterThan(Date.now());
    expect(task?.expires_at).toBeLessThanOrEqual(Date.now() + TASK_EXPIRY_MS);
    expect(task?.status).toBe("accepted");

    // Active hold exists on the task ref.
    expect(await getActiveHoldByRef(env, "task", taskId)).not.toBeNull();

    await expect(assertCreditInvariant(env, userId)).resolves.toBe(true);
  });

  it("idempotent: same task key + same payload -> cached task, no double-hold", async () => {
    const taskDef = {
      scene: "interior",
      provider: "fake",
      model: "gemini-2.5-flash-image",
      prompt: "Redesign",
      sourceKey: null,
      options: {},
    };
    const first = await createTaskWithHold(env, userId, taskDef, 1, "task-key-2");
    const second = await createTaskWithHold(env, userId, taskDef, 1, "task-key-2");
    expect(second.cached).toBe(true);
    expect(second.taskId).toBe(first.taskId);

    // Only one hold on that task, and only one task row.
    expect(await getAvailableCredits(env, userId)).toBe(9);
    const tasks = await env.DB.prepare(`SELECT COUNT(*) AS cnt FROM ai_tasks WHERE id = ?1`).bind(first.taskId).first<{ cnt: number }>();
    expect(tasks?.cnt).toBe(1);

    await expect(assertCreditInvariant(env, userId)).resolves.toBe(true);
  });

  it("same task key + different payload -> 409", async () => {
    await createTaskWithHold(env, userId, {
      scene: "interior",
      provider: "fake",
      model: "m1",
      prompt: "A",
      sourceKey: null,
      options: {},
    }, 1, "task-key-3");
    await expect(
      createTaskWithHold(env, userId, {
        scene: "interior",
        provider: "fake",
        model: "m1",
        prompt: "DIFFERENT",
        sourceKey: null,
        options: {},
      }, 1, "task-key-3")
    ).rejects.toThrow("IDEMPOTENCY_KEY_REUSED");
    expect(await getAvailableCredits(env, userId)).toBe(9);
    await expect(assertCreditInvariant(env, userId)).resolves.toBe(true);
  });

  it("settle only when asset ready AND attached to Project (AC3)", async () => {
    const { taskId } = await createTaskWithHold(env, userId, {
      scene: "interior",
      provider: "fake",
      model: "gemini-2.5-flash-image",
      prompt: "Redesign",
      sourceKey: null,
      options: {},
    }, 1, "task-key-4");
    expect(await getAvailableCredits(env, userId)).toBe(9);

    // Not ready, not attached -> no settle, hold stays active.
    await settleHoldOnReady(env, taskId, false, false);
    expect(await getAvailableCredits(env, userId)).toBe(9);
    expect(await getActiveHoldByRef(env, "task", taskId)).not.toBeNull();

    // Ready but not attached -> still no settle.
    await settleHoldOnReady(env, taskId, true, false);
    expect(await getAvailableCredits(env, userId)).toBe(9);
    expect(await getActiveHoldByRef(env, "task", taskId)).not.toBeNull();

    // Attached but not ready -> still no settle.
    await settleHoldOnReady(env, taskId, false, true);
    expect(await getAvailableCredits(env, userId)).toBe(9);
    expect(await getActiveHoldByRef(env, "task", taskId)).not.toBeNull();

    // Both true -> settle converts hold to usage.
    await settleHoldOnReady(env, taskId, true, true);
    expect(await getAvailableCredits(env, userId)).toBe(9); // used, not restored
    expect(await getActiveHoldByRef(env, "task", taskId)).toBeNull();

    const summary = await getLedgerSummary(env, userId);
    expect(summary.totalUsage).toBe(1);
    expect(summary.activeHolds).toBe(0);

    // Task status terminal success.
    const task = await env.DB.prepare(`SELECT status FROM ai_tasks WHERE id = ?1`).bind(taskId).first<{ status: string }>();
    expect(task?.status).toBe("notified");

    await expect(assertCreditInvariant(env, userId)).resolves.toBe(true);
  });
});

describe("Hold released on terminal failures + expiry, no resurrect (AC4)", () => {
  it("release on failed restores the hold to available", async () => {
    const { taskId } = await createTaskWithHold(env, userId, {
      scene: "interior",
      provider: "fake",
      model: "m",
      prompt: "P",
      sourceKey: null,
      options: {},
    }, 2, "task-rel-1");
    expect(await getAvailableCredits(env, userId)).toBe(8);

    await releaseHoldOnTerminal(env, taskId, "failed");
    expect(await getAvailableCredits(env, userId)).toBe(10);
    expect(await getActiveHoldByRef(env, "task", taskId)).toBeNull();

    const task = await env.DB.prepare(`SELECT status FROM ai_tasks WHERE id = ?1`).bind(taskId).first<{ status: string }>();
    expect(task?.status).toBe("failed");

    // Late settle after release must NOT resurrect (no usage, no available drop).
    await expect(settleHoldOnReady(env, taskId, true, true)).rejects.toThrow(/HOLD_NOT_ACTIVE|TASK_NOT_FOUND_OR_NO_HOLD/);
    expect(await getAvailableCredits(env, userId)).toBe(10);
    expect(await getLedgerSummary(env, userId)).toMatchObject({ totalUsage: 0, activeHolds: 0 });

    await expect(assertCreditInvariant(env, userId)).resolves.toBe(true);
  });

  it("release on canceled / validation-exhausted / DLQ also restores (AC4)", async () => {
    for (const status of ["failed", "canceled", "validation-exhausted", "dlq"]) {
      // Fresh task + user per status to keep isolated.
      const { taskId } = await createTaskWithHold(env, userId, {
        scene: "interior",
        provider: "fake",
        model: "m",
        prompt: "P",
        sourceKey: null,
        options: {},
      }, 1, `task-rel-${status}`);
      expect(await getAvailableCredits(env, userId)).toBe(9);
      await releaseHoldOnTerminal(env, taskId, status);
      expect(await getAvailableCredits(env, userId)).toBe(10);
      expect(await getActiveHoldByRef(env, "task", taskId)).toBeNull();
      await expect(assertCreditInvariant(env, userId)).resolves.toBe(true);
    }
  });

  it("server expiry 30min: stale non-terminal tasks are expired and hold released (AC4)", async () => {
    const { taskId } = await createTaskWithHold(env, userId, {
      scene: "interior",
      provider: "fake",
      model: "m",
      prompt: "P",
      sourceKey: null,
      options: {},
    }, 3, "task-exp-1");
    expect(await getAvailableCredits(env, userId)).toBe(7);

    // Force the task past its 30-minute expiry by rewriting expires_at.
    await env.DB.prepare(`UPDATE ai_tasks SET expires_at = ?1 WHERE id = ?2`).bind(Date.now() - 1, taskId).run();

    const expired = await expireStaleTasks(env);
    expect(expired).toBe(1);

    // Hold released, available restored.
    expect(await getAvailableCredits(env, userId)).toBe(10);
    expect(await getActiveHoldByRef(env, "task", taskId)).toBeNull();

    const task = await env.DB.prepare(`SELECT status, expired_at FROM ai_tasks WHERE id = ?1`).bind(taskId).first<{ status: string; expired_at: number | null }>();
    expect(task?.status).toBe("expired");
    expect(task?.expired_at).toBeTruthy();

    // Late callback after expiry does NOT resurrect: settle fails, no usage.
    await expect(settleHoldOnReady(env, taskId, true, true)).rejects.toThrow(/HOLD_NOT_ACTIVE|TASK_NOT_FOUND_OR_NO_HOLD/);
    expect(await getAvailableCredits(env, userId)).toBe(10);
    expect(await getLedgerSummary(env, userId)).toMatchObject({ totalUsage: 0, activeHolds: 0 });

    await expect(assertCreditInvariant(env, userId)).resolves.toBe(true);
  });

  it("fresh non-terminal tasks are NOT expired by the reconciler", async () => {
    const { taskId } = await createTaskWithHold(env, userId, {
      scene: "interior",
      provider: "fake",
      model: "m",
      prompt: "P",
      sourceKey: null,
      options: {},
    }, 1, "task-fresh-1");
    // expires_at is in the future — reconciler must not touch it.
    const expired = await expireStaleTasks(env);
    expect(expired).toBe(0);
    expect(await getAvailableCredits(env, userId)).toBe(9);
    expect(await getActiveHoldByRef(env, "task", taskId)).not.toBeNull();
    await expect(assertCreditInvariant(env, userId)).resolves.toBe(true);
  });
});

describe("Client polling timeout 120s is NOT terminal (AC5)", () => {
  it("a late completion after the 120s poll window still settles exactly once", async () => {
    const { taskId } = await createTaskWithHold(env, userId, {
      scene: "interior",
      provider: "fake",
      model: "m",
      prompt: "P",
      sourceKey: null,
      options: {},
    }, 1, "task-late-1");
    expect(await getAvailableCredits(env, userId)).toBe(9);

    // The client poll window (120s) passes with no server-side effect.
    // The hold is still active and the task still non-terminal.
    expect(await getActiveHoldByRef(env, "task", taskId)).not.toBeNull();
    expect(await getAvailableCredits(env, userId)).toBe(9);

    // A late provider completion arrives AFTER the 120s client timeout.
    // It must settle exactly once (usage) — the server never tracked the
    // client timeout, so nothing released the hold in the meantime.
    await settleHoldOnReady(env, taskId, true, true);
    expect(await getAvailableCredits(env, userId)).toBe(9); // used, not restored
    expect(await getActiveHoldByRef(env, "task", taskId)).toBeNull();

    // Second settle attempt must not double-settle.
    await expect(settleHoldOnReady(env, taskId, true, true)).rejects.toThrow(/HOLD_NOT_ACTIVE|TASK_NOT_FOUND_OR_NO_HOLD/);
    const summary = await getLedgerSummary(env, userId);
    expect(summary.totalUsage).toBe(1);
    expect(summary.available).toBe(9);
    await expect(assertCreditInvariant(env, userId)).resolves.toBe(true);
  });
});

describe("Invariant after every terminal transition (AC6)", () => {
  it("grant + mock payment + hold + settle + release all keep grants+payments = usage+available+activeHolds", async () => {
    // 10 free grant.
    await mockPurchase(env, userId, "lite", "inv-pay-1"); // +80
    await expect(assertCreditInvariant(env, userId)).resolves.toBe(true);

    const { taskId } = await createTaskWithHold(env, userId, {
      scene: "interior",
      provider: "fake",
      model: "m",
      prompt: "P",
      sourceKey: null,
      options: {},
    }, 2, "inv-task-1");
    await expect(assertCreditInvariant(env, userId)).resolves.toBe(true);

    await settleHoldOnReady(env, taskId, true, true);
    await expect(assertCreditInvariant(env, userId)).resolves.toBe(true);

    const { taskId: t2 } = await createTaskWithHold(env, userId, {
      scene: "interior",
      provider: "fake",
      model: "m",
      prompt: "P",
      sourceKey: null,
      options: {},
    }, 1, "inv-task-2");
    await releaseHoldOnTerminal(env, t2, "failed");
    await expect(assertCreditInvariant(env, userId)).resolves.toBe(true);

    const summary = await getLedgerSummary(env, userId);
    expect(summary.totalGrants).toBe(10);
    expect(summary.totalPayments).toBe(80);
    expect(summary.totalUsage).toBe(2);
    expect(summary.activeHolds).toBe(0);
    expect(summary.available).toBe(10 + 80 - 2);
    expect(summary.totalGrants + summary.totalPayments).toBe(
      summary.totalUsage + summary.available + summary.activeHolds
    );
  });
});

// ── Schema recreation for the workers-runtime harness ────────────────────────
// The vitest-pool-workers harness starts from an empty DB, so tests must
// provision the same tables the real migrations would create (0001..0004).
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
      `CREATE TABLE IF NOT EXISTS mock_payments (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
        pack TEXT NOT NULL CHECK (pack IN ('lite','plus','pro','max')),
        label TEXT NOT NULL,
        amount INTEGER NOT NULL CHECK (amount > 0),
        idempotency_key TEXT NOT NULL,
        ledger_entry_id TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )`
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_mock_payments_user_created ON mock_payments(user_id, created_at)`
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS idempotency_keys (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
        operation TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        request_fingerprint TEXT NOT NULL,
        result_type TEXT NOT NULL,
        result_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        UNIQUE (user_id, operation, idempotency_key)
      )`
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_idempotency_keys_user_created ON idempotency_keys(user_id, created_at)`
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS ai_tasks (
        id TEXT PRIMARY KEY,
        scene TEXT NOT NULL,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        prompt TEXT NOT NULL,
        source_key TEXT,
        status TEXT NOT NULL DEFAULT 'accepted'
          CHECK (status IN ('accepted','processing','output','quarantined','notified','failed','expired')),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        user_id TEXT,
        hold_id TEXT,
        cost_credits INTEGER,
        expires_at INTEGER,
        expired_at INTEGER
      )`
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_ai_tasks_expiry ON ai_tasks(status, expires_at)`
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_ai_tasks_user_created ON ai_tasks(user_id, created_at)`
    ),
  ]);
}