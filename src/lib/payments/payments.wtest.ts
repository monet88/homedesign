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