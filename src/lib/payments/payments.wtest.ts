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
  MOCK_PACKS,
  type MockPack,
} from "@/lib/payments/core";
import { canonicalHash } from "@/lib/idempotency";
import {
  createTaskWithHold,
  settleHoldOnReady,
  releaseHoldOnTerminal,
  expireStaleTasks,
  TASK_EXPIRY_MS,
} from "@/lib/ai/task-lifecycle";
import {
  assertCreditInvariant,
  getAvailableCredits,
  getLedgerSummary,
  getActiveHoldByRef,
  ensureFreeCreditGrant,
  releaseHold,
} from "@/lib/credits/ledger";
import { MockPaymentSchema } from "@/lib/validation/schemas";

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

// ── Ticket #39: Fault-injection — Credit Hold integrity on terminal failures ─

describe("Ticket #39: Fault-injection — release failure keeps task non-terminal", () => {
  it("transient DB error during releaseHold re-throws; task stays non-terminal with active hold", async () => {
    const { taskId } = await createTaskWithHold(env, userId, {
      scene: "interior",
      provider: "fake",
      model: "m",
      prompt: "P",
      sourceKey: null,
      options: {},
    }, 2, "fi-transient-1");
    expect(await getAvailableCredits(env, userId)).toBe(8);
    expect(await getActiveHoldByRef(env, "task", taskId)).not.toBeNull();

    // Fault-inject: proxy env.DB so the batch() call inside releaseHold throws
    // a transient error. The hold is still active → task must NOT go terminal.
    const realDB = env.DB;
    const faultyDB = new Proxy(realDB, {
      get(target, prop, receiver) {
        if (prop === "batch") {
          return () => { throw new Error("D1_ERROR: database is temporarily unavailable"); };
        }
        return Reflect.get(target, prop, receiver);
      },
    });
    const faultyEnv = { ...env, DB: faultyDB } as unknown as typeof env;

    // releaseHoldOnTerminal must re-throw the transient error.
    await expect(
      releaseHoldOnTerminal(faultyEnv, taskId, "failed")
    ).rejects.toThrow("D1_ERROR");

    // Task must NOT be terminal — status unchanged from 'accepted'.
    const task = await env.DB.prepare(`SELECT status FROM ai_tasks WHERE id = ?1`)
      .bind(taskId).first<{ status: string }>();
    expect(task?.status).toBe("accepted");

    // Hold is still active, credits still held.
    expect(await getActiveHoldByRef(env, "task", taskId)).not.toBeNull();
    expect(await getAvailableCredits(env, userId)).toBe(8);
    await expect(assertCreditInvariant(env, userId)).resolves.toBe(true);
  });

  it("HOLD_NOT_ACTIVE (late callback) allows task to become terminal", async () => {
    const { taskId } = await createTaskWithHold(env, userId, {
      scene: "interior",
      provider: "fake",
      model: "m",
      prompt: "P",
      sourceKey: null,
      options: {},
    }, 2, "fi-late-1");
    expect(await getAvailableCredits(env, userId)).toBe(8);

    // Manually release the hold (simulates expiry already ran).
    const task = await env.DB.prepare(`SELECT hold_id FROM ai_tasks WHERE id = ?1`)
      .bind(taskId).first<{ hold_id: string }>();
    await releaseHold(env, task!.hold_id);
    expect(await getAvailableCredits(env, userId)).toBe(10);

    // Late releaseHoldOnTerminal sees HOLD_NOT_ACTIVE but still marks terminal.
    await releaseHoldOnTerminal(env, taskId, "failed");

    const taskAfter = await env.DB.prepare(`SELECT status FROM ai_tasks WHERE id = ?1`)
      .bind(taskId).first<{ status: string }>();
    expect(taskAfter?.status).toBe("failed");

    // Balance correct: no double-release.
    expect(await getAvailableCredits(env, userId)).toBe(10);
    await expect(assertCreditInvariant(env, userId)).resolves.toBe(true);
  });
});

describe("Ticket #39: Fault-injection — expiry with hold already released", () => {
  it("expiry on a task whose hold was already released succeeds and marks expired", async () => {
    const { taskId } = await createTaskWithHold(env, userId, {
      scene: "interior",
      provider: "fake",
      model: "m",
      prompt: "P",
      sourceKey: null,
      options: {},
    }, 3, "fi-exp-released-1");

    // Manually release the hold before expiry runs.
    const task = await env.DB.prepare(`SELECT hold_id FROM ai_tasks WHERE id = ?1`)
      .bind(taskId).first<{ hold_id: string }>();
    await releaseHold(env, task!.hold_id);
    expect(await getAvailableCredits(env, userId)).toBe(10);

    // Force past expiry.
    await env.DB.prepare(`UPDATE ai_tasks SET expires_at = ?1 WHERE id = ?2`)
      .bind(Date.now() - 1, taskId).run();

    const expired = await expireStaleTasks(env);
    expect(expired).toBe(1);

    const taskAfter = await env.DB.prepare(`SELECT status FROM ai_tasks WHERE id = ?1`)
      .bind(taskId).first<{ status: string }>();
    expect(taskAfter?.status).toBe("expired");

    // No double-release — balance still correct.
    expect(await getAvailableCredits(env, userId)).toBe(10);
    await expect(assertCreditInvariant(env, userId)).resolves.toBe(true);
  });

  it("transient DB error during expiry skips the task; next run retries", async () => {
    const { taskId } = await createTaskWithHold(env, userId, {
      scene: "interior",
      provider: "fake",
      model: "m",
      prompt: "P",
      sourceKey: null,
      options: {},
    }, 3, "fi-exp-transient-1");
    expect(await getAvailableCredits(env, userId)).toBe(7);

    // Force past expiry.
    await env.DB.prepare(`UPDATE ai_tasks SET expires_at = ?1 WHERE id = ?2`)
      .bind(Date.now() - 1, taskId).run();

    // Fault-inject: proxy env.DB.batch to throw on releaseHold's batch call.
    // We need batch() to fail only for the hold release, not the initial query.
    let batchCallCount = 0;
    const realDB = env.DB;
    const faultyDB = new Proxy(realDB, {
      get(target, prop, receiver) {
        if (prop === "batch") {
          return (...args: unknown[]) => {
            batchCallCount++;
            if (batchCallCount >= 1) {
              throw new Error("D1_ERROR: disk I/O error");
            }
            return (target.batch as Function)(...args);
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    });
    const faultyEnv = { ...env, DB: faultyDB } as unknown as typeof env;

    // expireStaleTasks should skip the faulted task (not throw, not mark expired).
    const expired = await expireStaleTasks(faultyEnv);
    expect(expired).toBe(0);

    // Task is NOT expired — still in non-terminal state.
    const taskAfter = await env.DB.prepare(`SELECT status FROM ai_tasks WHERE id = ?1`)
      .bind(taskId).first<{ status: string }>();
    expect(taskAfter?.status).toBe("accepted");

    // Hold is still active.
    expect(await getActiveHoldByRef(env, "task", taskId)).not.toBeNull();
    expect(await getAvailableCredits(env, userId)).toBe(7);
    await expect(assertCreditInvariant(env, userId)).resolves.toBe(true);

    // Retry with real env succeeds.
    const retryExpired = await expireStaleTasks(env);
    expect(retryExpired).toBe(1);
    expect(await getAvailableCredits(env, userId)).toBe(10);
    await expect(assertCreditInvariant(env, userId)).resolves.toBe(true);
  });
});

describe("Ticket #39: Fault-injection — DLQ path releases hold", () => {
  it("DLQ release + terminal status preserves invariant", async () => {
    const { taskId } = await createTaskWithHold(env, userId, {
      scene: "interior",
      provider: "fake",
      model: "m",
      prompt: "P",
      sourceKey: null,
      options: {},
    }, 2, "fi-dlq-1");
    expect(await getAvailableCredits(env, userId)).toBe(8);

    // Simulate DLQ via the same path as failGeneration with "dlq" reason.
    await releaseHoldOnTerminal(env, taskId, "dlq");

    const task = await env.DB.prepare(`SELECT status FROM ai_tasks WHERE id = ?1`)
      .bind(taskId).first<{ status: string }>();
    expect(task?.status).toBe("failed");

    expect(await getActiveHoldByRef(env, "task", taskId)).toBeNull();
    expect(await getAvailableCredits(env, userId)).toBe(10);
    await expect(assertCreditInvariant(env, userId)).resolves.toBe(true);
  });
});

describe("Ticket #39: Fault-injection — late completion after expiry", () => {
  it("settle throws HOLD_NOT_ACTIVE on already-expired task; task stays terminal", async () => {
    const { taskId } = await createTaskWithHold(env, userId, {
      scene: "interior",
      provider: "fake",
      model: "m",
      prompt: "P",
      sourceKey: null,
      options: {},
    }, 2, "fi-late-settle-1");

    // Force expiry.
    await env.DB.prepare(`UPDATE ai_tasks SET expires_at = ?1 WHERE id = ?2`)
      .bind(Date.now() - 1, taskId).run();
    await expireStaleTasks(env);

    const taskExpired = await env.DB.prepare(`SELECT status FROM ai_tasks WHERE id = ?1`)
      .bind(taskId).first<{ status: string }>();
    expect(taskExpired?.status).toBe("expired");
    expect(await getAvailableCredits(env, userId)).toBe(10);

    // Late settle attempt must throw HOLD_NOT_ACTIVE.
    await expect(
      settleHoldOnReady(env, taskId, true, true)
    ).rejects.toThrow(/HOLD_NOT_ACTIVE/);

    // Task stays expired — no resurrection, no usage, no double-release.
    const taskAfter = await env.DB.prepare(`SELECT status FROM ai_tasks WHERE id = ?1`)
      .bind(taskId).first<{ status: string }>();
    expect(taskAfter?.status).toBe("expired");

    expect(await getAvailableCredits(env, userId)).toBe(10);
    const summary = await getLedgerSummary(env, userId);
    expect(summary.totalUsage).toBe(0);
    expect(summary.activeHolds).toBe(0);
    await expect(assertCreditInvariant(env, userId)).resolves.toBe(true);
  });
});

// ── Ticket #46: Mock Payment Zod command validation & Credit Ledger integrity ─

describe("Ticket #46: Mock Payment Zod command validation & Credit Ledger integrity", () => {
  it("MockPaymentSchema accepts valid pack and non-empty key", () => {
    const valid = MockPaymentSchema.safeParse({ pack: "lite", idempotencyKey: "k-valid" });
    expect(valid.success).toBe(true);
    if (valid.success) {
      expect(valid.data.pack).toBe("lite");
      expect(valid.data.idempotencyKey).toBe("k-valid");
    }
  });

  it("MockPaymentSchema rejects malformed, unknown, fractional, non-positive, or empty inputs", () => {
    expect(MockPaymentSchema.safeParse({ pack: "ultra", idempotencyKey: "k1" }).success).toBe(false);
    expect(MockPaymentSchema.safeParse({ pack: -1, idempotencyKey: "k1" }).success).toBe(false);
    expect(MockPaymentSchema.safeParse({ pack: 0, idempotencyKey: "k1" }).success).toBe(false);
    expect(MockPaymentSchema.safeParse({ pack: 1.5, idempotencyKey: "k1" }).success).toBe(false);
    expect(MockPaymentSchema.safeParse({ pack: "lite", idempotencyKey: "" }).success).toBe(false);
    expect(MockPaymentSchema.safeParse({ pack: "lite", idempotencyKey: "   " }).success).toBe(false);
    expect(MockPaymentSchema.safeParse({ pack: "lite", idempotencyKey: 123 }).success).toBe(false);
    expect(MockPaymentSchema.safeParse({ pack: "lite", idempotencyKey: null }).success).toBe(false);
    expect(MockPaymentSchema.safeParse({}).success).toBe(false);
    expect(MockPaymentSchema.safeParse(null).success).toBe(false);
  });

  it("invalid requests create no payment record or Credit Ledger entry", async () => {
    const beforeBalance = await getAvailableCredits(env, userId);
    expect(beforeBalance).toBe(10);

    const invalidInputs = [
      { pack: "enterprise", idempotencyKey: "inv-1" },
      { pack: "lite", idempotencyKey: "" },
      { pack: "lite", idempotencyKey: "   " },
      { pack: null, idempotencyKey: "inv-4" },
    ];

    for (const input of invalidInputs) {
      const parsed = MockPaymentSchema.safeParse(input);
      expect(parsed.success).toBe(false);
    }

    const rows = await env.DB.prepare(
      `SELECT COUNT(*) AS cnt FROM mock_payments WHERE user_id = ?1`
    ).bind(userId).first<{ cnt: number }>();
    expect(rows?.cnt).toBe(0);

    const ledgerRows = await env.DB.prepare(
      `SELECT COUNT(*) AS cnt FROM credit_ledger WHERE user_id = ?1 AND entry_type = 'payment'`
    ).bind(userId).first<{ cnt: number }>();
    expect(ledgerRows?.cnt).toBe(0);

    expect(await getAvailableCredits(env, userId)).toBe(10);
    await expect(assertCreditInvariant(env, userId)).resolves.toBe(true);
  });

  it("valid request updates balance and writes append-only ledger entry", async () => {
    const input = { pack: "pro" as const, idempotencyKey: "valid-pack-pro" };
    const parsed = MockPaymentSchema.safeParse(input);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    const res = await mockPurchase(env, userId, parsed.data.pack, parsed.data.idempotencyKey);
    expect(res.amount).toBe(320);
    expect(res.cached).toBe(false);

    expect(await getAvailableCredits(env, userId)).toBe(330); // 10 + 320

    const ledgerEntry = await env.DB.prepare(
      `SELECT * FROM credit_ledger WHERE id = ?1`
    ).bind(res.ledgerEntryId).first<{
      user_id: string;
      entry_type: string;
      amount: number;
      ref_type: string;
      ref_id: string;
    }>();
    expect(ledgerEntry).not.toBeNull();
    expect(ledgerEntry?.user_id).toBe(userId);
    expect(ledgerEntry?.entry_type).toBe("payment");
    expect(ledgerEntry?.amount).toBe(320);
    expect(ledgerEntry?.ref_type).toBe("mock_purchase");
    expect(ledgerEntry?.ref_id).toBe("valid-pack-pro");

    await expect(assertCreditInvariant(env, userId)).resolves.toBe(true);
  });

  it("retry with same idempotency key returns cached result and cannot double-credit", async () => {
    const input = { pack: "max" as const, idempotencyKey: "retry-test-key-46" };
    const parsed = MockPaymentSchema.safeParse(input);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    const first = await mockPurchase(env, userId, parsed.data.pack, parsed.data.idempotencyKey);
    expect(first.cached).toBe(false);
    expect(first.amount).toBe(640);
    const balanceAfterFirst = await getAvailableCredits(env, userId);

    // Retry with exact same key
    const second = await mockPurchase(env, userId, parsed.data.pack, parsed.data.idempotencyKey);
    expect(second.cached).toBe(true);
    expect(second.id).toBe(first.id);
    expect(second.ledgerEntryId).toBe(first.ledgerEntryId);
    expect(second.amount).toBe(640);

    const balanceAfterSecond = await getAvailableCredits(env, userId);
    expect(balanceAfterSecond).toBe(balanceAfterFirst); // No double credit

    const paymentRows = await env.DB.prepare(
      `SELECT COUNT(*) AS cnt FROM mock_payments WHERE user_id = ?1 AND idempotency_key = ?2`
    ).bind(userId, "retry-test-key-46").first<{ cnt: number }>();
    expect(paymentRows?.cnt).toBe(1);

    await expect(assertCreditInvariant(env, userId)).resolves.toBe(true);
  });

  it("collision: same idempotency key with different payload throws 409 IDEMPOTENCY_KEY_REUSED", async () => {
    const key = "collision-test-key-46";
    await mockPurchase(env, userId, "lite", key);

    await expect(mockPurchase(env, userId, "plus", key)).rejects.toThrow("IDEMPOTENCY_KEY_REUSED");

    // Balance remains unchanged by rejected request
    await expect(assertCreditInvariant(env, userId)).resolves.toBe(true);
  });
});

// ── Spec #58: AI Task Lifecycle & Idempotency Concurrency Invariants ─────────

describe("Spec #58: AI Task Lifecycle & Idempotency Concurrency Invariants", () => {
  it("concurrent createTaskWithHold with identical key returns cached task and creates 1 hold", async () => {
    const key = "concurrent-task-same-key";
    const taskDef = {
      scene: "interior",
      provider: "fake",
      model: "model-x",
      prompt: "Modern living room",
      sourceKey: null,
      options: {},
    };

    // Fire two concurrent creations
    const [res1, res2] = await Promise.all([
      createTaskWithHold(env, userId, taskDef, 5, key),
      createTaskWithHold(env, userId, taskDef, 5, key),
    ]);

    expect(res1.taskId).toBe(res2.taskId);
    expect([res1.cached, res2.cached]).toContain(true);

    // Verify exactly 1 hold and 1 task in database
    const tasks = await env.DB.prepare(`SELECT COUNT(*) AS cnt FROM ai_tasks WHERE user_id = ?1`).bind(userId).first<{ cnt: number }>();
    expect(tasks?.cnt).toBe(1);

    const holds = await env.DB.prepare(`SELECT COUNT(*) AS cnt FROM credit_holds WHERE user_id = ?1 AND status = 'active'`).bind(userId).first<{ cnt: number }>();
    expect(holds?.cnt).toBe(1);

    expect(await getAvailableCredits(env, userId)).toBe(5);
    await expect(assertCreditInvariant(env, userId)).resolves.toBe(true);
  });

  it("concurrent createTaskWithHold with same key but different payload rejects with 409", async () => {
    const key = "concurrent-task-diff-payload";
    const taskDef1 = {
      scene: "interior",
      provider: "fake",
      model: "model-x",
      prompt: "Prompt A",
      sourceKey: null,
      options: {},
    };
    const taskDef2 = {
      scene: "interior",
      provider: "fake",
      model: "model-x",
      prompt: "Prompt B",
      sourceKey: null,
      options: {},
    };

    const results = await Promise.allSettled([
      createTaskWithHold(env, userId, taskDef1, 2, key),
      createTaskWithHold(env, userId, taskDef2, 2, key),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
    expect((rejected[0] as PromiseRejectedResult).reason.message).toContain("IDEMPOTENCY_KEY_REUSED");

    // Exactly 1 hold created
    const holds = await env.DB.prepare(`SELECT COUNT(*) AS cnt FROM credit_holds WHERE user_id = ?1 AND status = 'active'`).bind(userId).first<{ cnt: number }>();
    expect(holds?.cnt).toBe(1);

    await expect(assertCreditInvariant(env, userId)).resolves.toBe(true);
  });

  it("concurrent tasks competing for remaining credits: only winner gets hold, loser gets INSUFFICIENT_CREDITS", async () => {
    // User starts with 10 credits
    const taskDef = {
      scene: "interior",
      provider: "fake",
      model: "m",
      prompt: "P",
      sourceKey: null,
      options: {},
    };

    // Two concurrent requests for 10 credits each (total 20 > 10 available)
    const results = await Promise.allSettled([
      createTaskWithHold(env, userId, taskDef, 10, "race-credits-key-1"),
      createTaskWithHold(env, userId, taskDef, 10, "race-credits-key-2"),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
    expect((rejected[0] as PromiseRejectedResult).reason.message).toContain("INSUFFICIENT_CREDITS");

    // Available credits must be exactly 0, never negative
    expect(await getAvailableCredits(env, userId)).toBe(0);
    await expect(assertCreditInvariant(env, userId)).resolves.toBe(true);
  });

  it("settleHoldOnReady crash recovery: retried settle completes task transition without double usage", async () => {
    const { taskId } = await createTaskWithHold(env, userId, {
      scene: "interior", provider: "fake", model: "m", prompt: "P", sourceKey: null, options: {},
    }, 3, "settle-crash-key");

    const task = await env.DB.prepare(`SELECT hold_id FROM ai_tasks WHERE id = ?1`).bind(taskId).first<{ hold_id: string }>();

    // Simulate partial crash: hold is settled in D1, but ai_tasks status update was interrupted (remains 'accepted')
    await env.DB.prepare(`UPDATE credit_holds SET status = 'settled', settled_at = ?1 WHERE id = ?2`).bind(Date.now(), task?.hold_id).run();
    await env.DB.prepare(
      `INSERT INTO credit_ledger (id, user_id, entry_type, amount, reason, ref_type, ref_id, grant_key, created_at)
       VALUES (?1, ?2, 'usage', 3, 'task', 'task', ?3, NULL, ?4)`
    ).bind(crypto.randomUUID(), userId, taskId, Date.now()).run();

    // Retrying settleHoldOnReady should detect already settled hold and transition task to 'notified'
    await settleHoldOnReady(env, taskId, true, true);

    const updatedTask = await env.DB.prepare(`SELECT status FROM ai_tasks WHERE id = ?1`).bind(taskId).first<{ status: string }>();
    expect(updatedTask?.status).toBe("notified");

    // Verify usage entries count is exactly 1 (no duplicate usage added by retry)
    const usageCount = await env.DB.prepare(`SELECT COUNT(*) AS cnt FROM credit_ledger WHERE user_id = ?1 AND entry_type = 'usage'`).bind(userId).first<{ cnt: number }>();
    expect(usageCount?.cnt).toBe(1);

    await expect(assertCreditInvariant(env, userId)).resolves.toBe(true);
  });

  it("late failure callback after success settlement does not flip task to failed or release settled hold", async () => {
    const { taskId } = await createTaskWithHold(env, userId, {
      scene: "interior", provider: "fake", model: "m", prompt: "P", sourceKey: null, options: {},
    }, 4, "late-fail-race-key");

    // Settle success
    await settleHoldOnReady(env, taskId, true, true);

    const taskBefore = await env.DB.prepare(`SELECT status FROM ai_tasks WHERE id = ?1`).bind(taskId).first<{ status: string }>();
    expect(taskBefore?.status).toBe("notified");

    // Late failure callback arrives
    await releaseHoldOnTerminal(env, taskId, "failed");

    // Status MUST remain 'notified' (not overwritten to 'failed')
    const taskAfter = await env.DB.prepare(`SELECT status FROM ai_tasks WHERE id = ?1`).bind(taskId).first<{ status: string }>();
    expect(taskAfter?.status).toBe("notified");

    // Hold MUST remain 'settled' (not released)
    const hold = await env.DB.prepare(`SELECT status FROM credit_holds WHERE ref_id = ?1`).bind(taskId).first<{ status: string }>();
    expect(hold?.status).toBe("settled");

    // Usage remains 4, available remains 6
    expect(await getAvailableCredits(env, userId)).toBe(6);
    await expect(assertCreditInvariant(env, userId)).resolves.toBe(true);
  });

  it("concurrent mockPurchase same key: both fulfilled, same payment ID, exactly 1 payment row and 1 ledger entry", async () => {
    const key = "race-mock-pay-key";
    const [r1, r2] = await Promise.allSettled([
      mockPurchase(env, userId, "plus", key),
      mockPurchase(env, userId, "plus", key),
    ]);

    expect(r1.status).toBe("fulfilled");
    expect(r2.status).toBe("fulfilled");
    if (r1.status === "fulfilled" && r2.status === "fulfilled") {
      expect(r1.value.id).toBe(r2.value.id);
      expect(r1.value.amount).toBe(160);
      expect(r2.value.amount).toBe(160);
      expect([r1.value.cached, r2.value.cached]).toContain(true);
      expect([r1.value.cached, r2.value.cached]).toContain(false);
    }

    // Exactly 1 mock_payments row
    const payments = await env.DB.prepare(
      `SELECT COUNT(*) AS cnt FROM mock_payments WHERE user_id = ?1 AND idempotency_key = ?2`
    ).bind(userId, key).first<{ cnt: number }>();
    expect(payments?.cnt).toBe(1);

    // Exactly 1 payment ledger entry with this grant_key
    const ledgerEntries = await env.DB.prepare(
      `SELECT COUNT(*) AS cnt FROM credit_ledger WHERE user_id = ?1 AND entry_type = 'payment' AND grant_key = ?2`
    ).bind(userId, key).first<{ cnt: number }>();
    expect(ledgerEntries?.cnt).toBe(1);

    // Available credited exactly once: 10 free + 160 = 170
    expect(await getAvailableCredits(env, userId)).toBe(170);
    await expect(assertCreditInvariant(env, userId)).resolves.toBe(true);
  });

  it("concurrent settleHoldOnReady races produce exactly one usage entry", async () => {
    const { taskId } = await createTaskWithHold(env, userId, {
      scene: "interior", provider: "fake", model: "m", prompt: "P", sourceKey: null, options: {},
    }, 4, "race-settle-settle-key");

    await Promise.allSettled([
      settleHoldOnReady(env, taskId, true, true),
      settleHoldOnReady(env, taskId, true, true),
    ]);

    const hold = await env.DB.prepare(
      `SELECT status FROM credit_holds WHERE ref_id = ?1`
    ).bind(taskId).first<{ status: string }>();
    expect(hold?.status).toBe("settled");

    const usage = await env.DB.prepare(
      `SELECT COUNT(*) AS cnt FROM credit_ledger WHERE user_id = ?1 AND entry_type = 'usage'`
    ).bind(userId).first<{ cnt: number }>();
    expect(usage?.cnt).toBe(1);

    const task = await env.DB.prepare(
      `SELECT status FROM ai_tasks WHERE id = ?1`
    ).bind(taskId).first<{ status: string }>();
    expect(task?.status).toBe("notified");

    expect(await getAvailableCredits(env, userId)).toBe(6);
    await expect(assertCreditInvariant(env, userId)).resolves.toBe(true);
  });

  it("concurrent settle vs terminal failure: exactly one winning outcome, never failed+usage", async () => {
    const { taskId } = await createTaskWithHold(env, userId, {
      scene: "interior", provider: "fake", model: "m", prompt: "P", sourceKey: null, options: {},
    }, 5, "race-settle-fail-key");

    await Promise.allSettled([
      settleHoldOnReady(env, taskId, true, true),
      releaseHoldOnTerminal(env, taskId, "failed"),
    ]);

    const task = await env.DB.prepare(
      `SELECT status FROM ai_tasks WHERE id = ?1`
    ).bind(taskId).first<{ status: string }>();
    const hold = await env.DB.prepare(
      `SELECT status FROM credit_holds WHERE ref_id = ?1`
    ).bind(taskId).first<{ status: string }>();
    const usage = await env.DB.prepare(
      `SELECT COUNT(*) AS cnt FROM credit_ledger WHERE user_id = ?1 AND entry_type = 'usage'`
    ).bind(userId).first<{ cnt: number }>();
    const release = await env.DB.prepare(
      `SELECT COUNT(*) AS cnt FROM credit_ledger WHERE user_id = ?1 AND entry_type = 'release'`
    ).bind(userId).first<{ cnt: number }>();

    // Exactly one winning terminal outcome; never failed task with charged usage.
    if (task?.status === "notified") {
      expect(hold?.status).toBe("settled");
      expect(usage?.cnt).toBe(1);
      expect(release?.cnt).toBe(0);
      expect(await getAvailableCredits(env, userId)).toBe(5);
    } else {
      expect(task?.status).toBe("failed");
      expect(hold?.status).toBe("released");
      expect(usage?.cnt).toBe(0);
      expect(release?.cnt).toBe(1);
      expect(await getAvailableCredits(env, userId)).toBe(10);
    }
    await expect(assertCreditInvariant(env, userId)).resolves.toBe(true);
  });

  it("concurrent settle vs server expiry: exactly one settlement/release outcome", async () => {
    const { taskId } = await createTaskWithHold(env, userId, {
      scene: "interior", provider: "fake", model: "m", prompt: "P", sourceKey: null, options: {},
    }, 3, "race-settle-expire-key");

    // Force task past expiry so the reconciler will race with settlement
    await env.DB.prepare(`UPDATE ai_tasks SET expires_at = ?1 WHERE id = ?2`)
      .bind(Date.now() - 1, taskId).run();

    await Promise.allSettled([
      settleHoldOnReady(env, taskId, true, true),
      expireStaleTasks(env),
    ]);

    const task = await env.DB.prepare(
      `SELECT status FROM ai_tasks WHERE id = ?1`
    ).bind(taskId).first<{ status: string }>();
    const hold = await env.DB.prepare(
      `SELECT status FROM credit_holds WHERE ref_id = ?1`
    ).bind(taskId).first<{ status: string }>();
    const usage = await env.DB.prepare(
      `SELECT COUNT(*) AS cnt FROM credit_ledger WHERE user_id = ?1 AND entry_type = 'usage'`
    ).bind(userId).first<{ cnt: number }>();
    const release = await env.DB.prepare(
      `SELECT COUNT(*) AS cnt FROM credit_ledger WHERE user_id = ?1 AND entry_type = 'release'`
    ).bind(userId).first<{ cnt: number }>();

    if (task?.status === "notified") {
      expect(hold?.status).toBe("settled");
      expect(usage?.cnt).toBe(1);
      expect(release?.cnt).toBe(0);
      expect(await getAvailableCredits(env, userId)).toBe(7);
    } else {
      expect(task?.status).toBe("expired");
      expect(hold?.status).toBe("released");
      expect(usage?.cnt).toBe(0);
      expect(release?.cnt).toBe(1);
      expect(await getAvailableCredits(env, userId)).toBe(10);
    }
    await expect(assertCreditInvariant(env, userId)).resolves.toBe(true);
  });

  it("late failure callback after server expiry does NOT overwrite task status to failed or add duplicate release entry", async () => {
    const { taskId } = await createTaskWithHold(env, userId, {
      scene: "interior", provider: "fake", model: "m", prompt: "P", sourceKey: null, options: {},
    }, 2, "late-fail-after-exp-key");

    // Force task past expiry
    await env.DB.prepare(`UPDATE ai_tasks SET expires_at = ?1 WHERE id = ?2`)
      .bind(Date.now() - 1, taskId).run();

    // Reconciler runs first and expires the task
    const expired = await expireStaleTasks(env);
    expect(expired).toBe(1);

    const taskBefore = await env.DB.prepare(
      `SELECT status FROM ai_tasks WHERE id = ?1`
    ).bind(taskId).first<{ status: string }>();
    expect(taskBefore?.status).toBe("expired");

    // Late failure callback arrives after expiry
    await releaseHoldOnTerminal(env, taskId, "failed");

    const taskAfter = await env.DB.prepare(
      `SELECT status FROM ai_tasks WHERE id = ?1`
    ).bind(taskId).first<{ status: string }>();
    // Task status MUST remain 'expired', NOT overwritten to 'failed'
    expect(taskAfter?.status).toBe("expired");

    const hold = await env.DB.prepare(
      `SELECT status FROM credit_holds WHERE ref_id = ?1`
    ).bind(taskId).first<{ status: string }>();
    expect(hold?.status).toBe("released");

    // Exactly 1 release ledger entry (from expiry, not duplicated by late failure)
    const release = await env.DB.prepare(
      `SELECT COUNT(*) AS cnt FROM credit_ledger WHERE user_id = ?1 AND entry_type = 'release'`
    ).bind(userId).first<{ cnt: number }>();
    expect(release?.cnt).toBe(1);

    expect(await getAvailableCredits(env, userId)).toBe(10);
    await expect(assertCreditInvariant(env, userId)).resolves.toBe(true);
  });

  it("concurrent releaseHoldOnTerminal(failed) vs server expiry: exactly one release entry, terminal status never overwritten", async () => {
    const { taskId } = await createTaskWithHold(env, userId, {
      scene: "interior", provider: "fake", model: "m", prompt: "P", sourceKey: null, options: {},
    }, 3, "race-release-expire-key");

    // Force task past expiry so the reconciler races with the failure callback
    await env.DB.prepare(`UPDATE ai_tasks SET expires_at = ?1 WHERE id = ?2`)
      .bind(Date.now() - 1, taskId).run();

    await Promise.allSettled([
      releaseHoldOnTerminal(env, taskId, "failed"),
      expireStaleTasks(env),
    ]);

    const task = await env.DB.prepare(
      `SELECT status FROM ai_tasks WHERE id = ?1`
    ).bind(taskId).first<{ status: string }>();
    const hold = await env.DB.prepare(
      `SELECT status FROM credit_holds WHERE ref_id = ?1`
    ).bind(taskId).first<{ status: string }>();
    const release = await env.DB.prepare(
      `SELECT COUNT(*) AS cnt FROM credit_ledger WHERE user_id = ?1 AND entry_type = 'release'`
    ).bind(userId).first<{ cnt: number }>();

    // Whichever terminal transition wins (failed or expired) must hold:
    // the loser cannot overwrite it (CAS guard) and only one release entry exists.
    expect(["failed", "expired"]).toContain(task?.status);
    expect(hold?.status).toBe("released");
    expect(release?.cnt).toBe(1);
    expect(await getAvailableCredits(env, userId)).toBe(10);
    await expect(assertCreditInvariant(env, userId)).resolves.toBe(true);
  });

  it("expireStaleTasks expires stale tasks even with null hold_id or missing hold record", async () => {
    const taskIdNoHold = crypto.randomUUID();
    const taskIdMissingHold = crypto.randomUUID();
    const now = Date.now();

    // Task 1: hold_id is null
    await env.DB.prepare(
      `INSERT INTO ai_tasks (id, scene, provider, model, prompt, status, created_at, updated_at, user_id, hold_id, cost_credits, expires_at)
       VALUES (?1, 'interior', 'fake', 'm', 'P', 'accepted', ?2, ?2, ?3, NULL, 0, ?4)`
    ).bind(taskIdNoHold, now, userId, now - 1000).run();

    // Task 2: hold_id points to non-existent hold
    await env.DB.prepare(
      `INSERT INTO ai_tasks (id, scene, provider, model, prompt, status, created_at, updated_at, user_id, hold_id, cost_credits, expires_at)
       VALUES (?1, 'interior', 'fake', 'm', 'P', 'accepted', ?2, ?2, ?3, 'non-existent-hold', 1, ?4)`
    ).bind(taskIdMissingHold, now, userId, now - 1000).run();

    const expired = await expireStaleTasks(env);
    expect(expired).toBe(2);

    const task1 = await env.DB.prepare(`SELECT status, expired_at FROM ai_tasks WHERE id = ?1`).bind(taskIdNoHold).first<{ status: string; expired_at: number }>();
    expect(task1?.status).toBe("expired");
    expect(task1?.expired_at).toBeTruthy();

    const task2 = await env.DB.prepare(`SELECT status, expired_at FROM ai_tasks WHERE id = ?1`).bind(taskIdMissingHold).first<{ status: string; expired_at: number }>();
    expect(task2?.status).toBe("expired");
    expect(task2?.expired_at).toBeTruthy();
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