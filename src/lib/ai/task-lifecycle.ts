import type { Env } from "@/lib/bindings";
import {
  getAvailableCredits,
  type CreditHold,
} from "@/lib/credits/ledger";
import {
  canonicalHash,
  type IdempotencyRecord,
} from "@/lib/idempotency";

// ── Task + hold atomic contract ───────────────────────────────────────────────

export const TASK_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes server expiry

export interface TaskCreateDefinition {
  scene: string;
  provider: string;
  model: string;
  prompt: string;
  sourceKey: string | null;
  options: Record<string, unknown>;
}

function taskCreatePayload(taskDef: TaskCreateDefinition, cost: number) {
  return {
    scene: taskDef.scene,
    provider: taskDef.provider,
    model: taskDef.model,
    prompt: taskDef.prompt,
    sourceKey: taskDef.sourceKey,
    options: taskDef.options,
    cost,
  };
}

/**
 * Read-only task-create idempotency check. Returns the existing task when the
 * key/fingerprint already exists, returns null when creation may proceed, and
 * preserves the same-key/different-payload conflict used by createTaskWithHold.
 */
export async function preflightTaskCreateIdempotency(
  env: Env,
  userId: string,
  taskDef: TaskCreateDefinition,
  cost: number,
  idempotencyKey: string
): Promise<{ taskId: string; cached: true } | null> {
  const fingerprint = await canonicalHash(taskCreatePayload(taskDef, cost));
  const existing = await env.DB.prepare(
    `SELECT * FROM idempotency_keys WHERE user_id = ?1 AND operation = 'task_create' AND idempotency_key = ?2`
  )
    .bind(userId, idempotencyKey)
    .first<IdempotencyRecord>();

  if (!existing) return null;
  if (existing.request_fingerprint !== fingerprint) {
    const err = new Error("IDEMPOTENCY_KEY_REUSED") as Error & { status?: number };
    err.status = 409;
    throw err;
  }

  const row = await env.DB.prepare(`SELECT id FROM ai_tasks WHERE id = ?1`)
    .bind(existing.result_id)
    .first<{ id: string }>();
  if (!row) throw new Error("IDEMPOTENCY_RECORD_MISSING");
  return { taskId: row.id, cached: true };
}

/**
 * Atomically create a task row + credit hold.
 *
 * The task's `user_id`, `hold_id`, `cost_credits`, and `expires_at` are set so
 * the reconciler and settle/release paths can find them.
 *
 * Idempotent by `(user_id, "task_create", idempotencyKey)`. Returns the task id
 * (new or cached).
 *
 * Throws:
 *   - `INSUFFICIENT_CREDITS` if available < cost
 *   - `HOLD_ALREADY_ACTIVE` if the ref already has an active hold
 *   - `409 IDEMPOTENCY_KEY_REUSED` if key reused with different payload
 */
export async function createTaskWithHold(
  env: Env,
  userId: string,
  taskDef: TaskCreateDefinition,
  cost: number,
  idempotencyKey: string
): Promise<{ taskId: string; cached: boolean }> {
  const payload = taskCreatePayload(taskDef, cost);
  const fingerprint = await canonicalHash(payload);

  // 1. Check existing idempotency key before attempting creation.
  const existing = await env.DB.prepare(
    `SELECT * FROM idempotency_keys WHERE user_id = ?1 AND operation = 'task_create' AND idempotency_key = ?2`
  ).bind(userId, idempotencyKey).first<IdempotencyRecord>();

  if (existing) {
    if (existing.request_fingerprint !== fingerprint) {
      const err = new Error("IDEMPOTENCY_KEY_REUSED") as Error & { status?: number };
      err.status = 409;
      throw err;
    }
    const row = await env.DB.prepare(`SELECT id FROM ai_tasks WHERE id = ?1`).bind(existing.result_id).first<{ id: string }>();
    if (!row) throw new Error("IDEMPOTENCY_RECORD_MISSING");
    return { taskId: row.id, cached: true };
  }

  // 2. Preflight balance check.
  const available = await getAvailableCredits(env, userId);
  if (available < cost) {
    throw new Error("INSUFFICIENT_CREDITS");
  }

  // 3. Atomically execute idempotency reservation + credit ledger hold + credit_holds row + ai_tasks row.
  const taskId = crypto.randomUUID();
  const holdId = crypto.randomUUID();
  const ledgerEntryId = crypto.randomUUID();
  const idempotencyId = crypto.randomUUID();
  const now = Date.now();
  const expiresAt = now + TASK_EXPIRY_MS;

  try {
    await env.DB.batch([
      // A. Idempotency key (unique constraint prevents concurrent double-creation)
      env.DB.prepare(
        `INSERT INTO idempotency_keys (id, user_id, operation, idempotency_key, request_fingerprint, result_type, result_id, created_at)
         VALUES (?1, ?2, 'task_create', ?3, ?4, 'task', ?5, ?6)`
      ).bind(idempotencyId, userId, idempotencyKey, fingerprint, taskId, now),

      // B. Credit ledger hold entry
      env.DB.prepare(
        `INSERT INTO credit_ledger (id, user_id, amount, entry_type, reason, ref_type, ref_id, created_at)
         VALUES (?1, ?2, ?3, 'hold', ?4, 'task', ?5, ?6)`
      ).bind(ledgerEntryId, userId, cost, `Task: ${taskDef.scene}`, taskId, now),

      // C. Credit hold row (atomic available balance gate in SQLite: fails CHECK (amount > 0) if insufficient).
      // Evaluates the canonical Credit Ledger balance invariant (grants+payments - usage - active holds >= cost)
      // identical to getAvailableCredits() in src/lib/credits/ledger.ts.
      env.DB.prepare(
        `INSERT INTO credit_holds (id, user_id, amount, status, ref_type, ref_id, ledger_hold_id, created_at)
         SELECT
           ?1,
           ?2,
           CASE
             WHEN (
               (SELECT COALESCE(SUM(CASE WHEN entry_type IN ('grant', 'payment') THEN amount ELSE 0 END) - SUM(CASE WHEN entry_type = 'usage' THEN amount ELSE 0 END), 0)
                FROM credit_ledger WHERE user_id = ?2)
               - (SELECT COALESCE(SUM(amount), 0) FROM credit_holds WHERE user_id = ?2 AND status = 'active')
             ) >= ?3 THEN ?3
             ELSE -1
           END,
           'active', 'task', ?4, ?5, ?6`
      ).bind(holdId, userId, cost, taskId, ledgerEntryId, now),

      // D. AI Task row
      env.DB.prepare(
        `INSERT INTO ai_tasks (id, scene, provider, model, prompt, source_key, status, created_at, updated_at, user_id, hold_id, cost_credits, expires_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'accepted', ?7, ?7, ?8, ?9, ?10, ?11)`
      ).bind(taskId, taskDef.scene, taskDef.provider, taskDef.model, taskDef.prompt, taskDef.sourceKey ?? null, now, userId, holdId, cost, expiresAt),
    ]);

    return { taskId, cached: false };
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);

    // If available credits constraint failed inside the atomic batch:
    if (errMsg.includes("CHECK constraint failed") || errMsg.includes("amount > 0") || errMsg.includes("credit_holds.amount")) {
      throw new Error("INSUFFICIENT_CREDITS", { cause: err });
    }
    // Check if error was due to concurrent idempotency race
    const existingAfterRace = await env.DB.prepare(
      `SELECT * FROM idempotency_keys WHERE user_id = ?1 AND operation = 'task_create' AND idempotency_key = ?2`
    ).bind(userId, idempotencyKey).first<IdempotencyRecord>();

    if (existingAfterRace) {
      if (existingAfterRace.request_fingerprint !== fingerprint) {
        const err409 = new Error("IDEMPOTENCY_KEY_REUSED") as Error & { status?: number };
        err409.status = 409;
        throw err409;
      }
      const row = await env.DB.prepare(`SELECT id FROM ai_tasks WHERE id = ?1`).bind(existingAfterRace.result_id).first<{ id: string }>();
      if (!row) throw new Error("IDEMPOTENCY_RECORD_MISSING", { cause: err });
      return { taskId: row.id, cached: true };
    }

    // If ref unique constraint failed on credit_holds:
    if (errMsg.includes("credit_holds") && errMsg.includes("UNIQUE")) {
      throw new Error("HOLD_ALREADY_ACTIVE", { cause: err });
    }

    // Do not swallow unexpected database errors.
    throw err;
  }
}

/**
 * Settle a hold when the Generated Asset is ready + attached to Project.
 *
 * Checks BOTH conditions (assetReady && assetAttached) before settling.
 * If either is false, the hold is NOT settled — the caller must re-check
 * when conditions change.
 *
 * Idempotent and atomic: executed in a single batch to eliminate crash windows.
 */
export async function settleHoldOnReady(
  env: Env,
  taskId: string,
  assetReady: boolean,
  assetAttached: boolean
): Promise<void> {
  if (!assetReady || !assetAttached) {
    return; // Not ready to settle — no-op, caller retries later.
  }

  const task = await env.DB.prepare(
    `SELECT * FROM ai_tasks WHERE id = ?1`
  ).bind(taskId).first<{ hold_id: string | null; user_id: string | null; status: string }>();

  if (!task || !task.hold_id) {
    throw new Error("TASK_NOT_FOUND_OR_NO_HOLD");
  }

  const hold = await env.DB.prepare(
    `SELECT * FROM credit_holds WHERE id = ?1`
  ).bind(task.hold_id).first<CreditHold>();

  if (!hold) throw new Error("HOLD_NOT_FOUND");

  const now = Date.now();

  // If hold was already settled:
  if (hold.status === "settled") {
    if (task.status !== "ready" && task.status !== "notified") {
      // Prior partial failure between hold settle and task update: complete task transition
      await env.DB.prepare(
        `UPDATE ai_tasks SET status = 'notified', updated_at = ?1 WHERE id = ?2 AND status NOT IN ('ready', 'failed', 'expired')`
      ).bind(now, taskId).run();
      return;
    }
    // Both already settled
    throw new Error("HOLD_NOT_ACTIVE");
  }

  if (hold.status !== "active") {
    throw new Error("HOLD_NOT_ACTIVE");
  }
  // Atomically: 1. insert usage ledger entry (only if hold still active),
  // 2. settle hold, 3. advance task to notified.
  // Side effects are conditional on hold state and task non-terminal state,
  // making concurrent settle/release/expire safe against double-usage or resurrecting terminal failures.
  const usageEntryId = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO credit_ledger (id, user_id, entry_type, amount, reason, ref_type, ref_id, grant_key, created_at)
       SELECT ?1, user_id, 'usage', amount, ref_type, ref_type, ref_id, NULL, ?2
       FROM credit_holds WHERE id = ?3 AND status = 'active'`
    ).bind(usageEntryId, now, hold.id),
    env.DB.prepare(
      `UPDATE credit_holds SET status = 'settled', settled_at = ?1 WHERE id = ?2 AND status = 'active'`
    ).bind(now, hold.id),
    env.DB.prepare(
      `UPDATE ai_tasks SET status = 'notified', updated_at = ?1 WHERE id = ?2 AND status NOT IN ('ready', 'failed', 'expired')`
    ).bind(now, taskId),
  ]);
}
const TERMINAL_TASK_STATUSES: Record<string, string> = {
  failed: "failed",
  canceled: "failed",
  "validation-exhausted": "failed",
  dlq: "failed",
};

/**
 * Release a hold on terminal failure: failed, canceled, validation exhausted,
 * DLQ, or server expiry. The hold is released and the task is marked terminal.
 *
 * Invariants:
 *   - If task is already in terminal success ('ready' or 'notified'), late failure callbacks are ignored.
 *   - If hold is already settled, late failure callbacks are ignored.
 *   - Active hold release and task status update are executed in a single atomic batch.
 */
export async function releaseHoldOnTerminal(
  env: Env,
  taskId: string,
  terminalStatus: string
): Promise<void> {
  const task = await env.DB.prepare(
    `SELECT * FROM ai_tasks WHERE id = ?1`
  ).bind(taskId).first<{ hold_id: string | null; status: string; user_id: string | null }>();

  if (!task) throw new Error("TASK_NOT_FOUND");
  if (!task.hold_id) throw new Error("TASK_HAS_NO_HOLD");

  // If task is already in terminal success, late failure callback MUST NOT flip it to failed.
  if (task.status === "ready" || task.status === "notified") {
    return;
  }

  // If task is already in terminal failure/expired, no-op.
  if (task.status === "failed" || task.status === "expired") {
    return;
  }

  const hold = await env.DB.prepare(
    `SELECT * FROM credit_holds WHERE id = ?1`
  ).bind(task.hold_id).first<CreditHold>();

  if (!hold) throw new Error("HOLD_NOT_FOUND");

  // If hold was settled, success occurred: late failure cannot fail the task.
  if (hold.status === "settled") {
    return;
  }

  const now = Date.now();
  const taskStatus = TERMINAL_TASK_STATUSES[terminalStatus] ?? "failed";

  // If hold was already released (e.g. earlier expiry), ensure task is terminal without duplicate ledger entry.
  if (hold.status === "released") {
    await env.DB.prepare(
      `UPDATE ai_tasks SET status = ?1, updated_at = ?2 WHERE id = ?3 AND status NOT IN ('ready', 'notified')`
    ).bind(taskStatus, now, taskId).run();
    return;
  }

  if (hold.status !== "active") {
    return;
  }

  // Atomically: 1. insert release ledger entry (only if hold still active),
  // 2. release hold, 3. mark task failed. Conditional on hold state inside the
  // batch so a concurrent settle/expire makes this batch a complete no-op.
  const releaseEntryId = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO credit_ledger (id, user_id, entry_type, amount, reason, ref_type, ref_id, grant_key, created_at)
       SELECT ?1, user_id, 'release', amount, ref_type, ref_type, ref_id, NULL, ?2
       FROM credit_holds WHERE id = ?3 AND status = 'active'`
    ).bind(releaseEntryId, now, hold.id),
    env.DB.prepare(
      `UPDATE credit_holds SET status = 'released', released_at = ?1 WHERE id = ?2 AND status = 'active'`
    ).bind(now, hold.id),
    env.DB.prepare(
      `UPDATE ai_tasks SET status = ?1, updated_at = ?2 WHERE id = ?3 AND status NOT IN ('ready', 'notified')`
    ).bind(taskStatus, now, taskId),
  ]);
}

/**
 * Reconciler: expire all non-terminal tasks past their 30-minute server expiry.
 *
 * Atomically transitions each task to 'expired' and releases its hold in a batch.
 * Late callbacks after expiry do NOT resurrect the task.
 *
 * Safe to call on a schedule (e.g. every minute via cron or queue).
 */
export async function expireStaleTasks(env: Env): Promise<number> {
  const now = Date.now();

  const stale = await env.DB.prepare(
    `SELECT id, hold_id, user_id FROM ai_tasks
     WHERE status NOT IN ('ready', 'notified', 'failed', 'expired')
       AND expires_at IS NOT NULL AND expires_at < ?1`
  ).bind(now).all<{ id: string; hold_id: string | null; user_id: string | null }>();

  let expiredCount = 0;
  for (const task of stale.results ?? []) {
    if (!task.hold_id) continue;
    try {
      const hold = await env.DB.prepare(
        `SELECT * FROM credit_holds WHERE id = ?1`
      ).bind(task.hold_id).first<CreditHold>();

      if (!hold) continue;

      // If hold was settled, task completed success: do not expire
      if (hold.status === "settled") continue;

      if (hold.status === "active") {
        const releaseEntryId = crypto.randomUUID();
        const results = await env.DB.batch([
          env.DB.prepare(
            `INSERT INTO credit_ledger (id, user_id, entry_type, amount, reason, ref_type, ref_id, grant_key, created_at)
             SELECT ?1, user_id, 'release', amount, ref_type, ref_type, ref_id, NULL, ?2
             FROM credit_holds WHERE id = ?3 AND status = 'active'`
          ).bind(releaseEntryId, now, hold.id),
          env.DB.prepare(
            `UPDATE credit_holds SET status = 'released', released_at = ?1 WHERE id = ?2 AND status = 'active'`
          ).bind(now, hold.id),
          env.DB.prepare(
            `UPDATE ai_tasks SET status = 'expired', expired_at = ?1, updated_at = ?1 WHERE id = ?2 AND status NOT IN ('ready', 'notified', 'failed', 'expired')`
          ).bind(now, task.id),
        ]);
        if ((results[2].meta.changes ?? 0) > 0) {
          expiredCount++;
        }
      } else if (hold.status === "released") {
        await env.DB.prepare(
          `UPDATE ai_tasks SET status = 'expired', expired_at = ?1, updated_at = ?1 WHERE id = ?2 AND status NOT IN ('ready', 'notified', 'failed', 'expired')`
        ).bind(now, task.id).run();
        expiredCount++;
      }
    } catch {
      // Transient DB error: skip this task so next reconciler run retries
      continue;
    }
  }

  return expiredCount;
}

/**
 * Dispatch an admitted task to the queue worker.
 */
export async function dispatchTask(env: Env, taskId: string): Promise<void> {
  await env.DB.prepare(`UPDATE ai_tasks SET dispatched_at = ?2 WHERE id = ?1`)
    .bind(taskId, Date.now())
    .run();
  await env.PROVIDER_NOTIFY.send({ type: "task-dispatch", taskId });
}
