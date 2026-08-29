import type { Env } from "@/lib/bindings";
import {
  holdCredits,
  settleHold,
  releaseHold,
} from "@/lib/credits/ledger";
import {
  canonicalHash,
  withIdempotency,
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
  // Full canonical payload: scene + prompt + source + options + cost. Any
  // change (including prompt) makes the fingerprint differ -> 409 on reuse.
  const payload = taskCreatePayload(taskDef, cost);

  const result = await withIdempotency(env, userId, "task_create", idempotencyKey, payload, async () => {
    const taskId = crypto.randomUUID();
    const now = Date.now();
    const expiresAt = now + TASK_EXPIRY_MS;

    // Hold credits atomically. The unique ref index prevents double-hold.
    const holdId = await holdCredits(env, userId, cost, "task", taskId, `Task: ${taskDef.scene}`);

    // Create the task row. User_id, hold_id, cost_credits, expires_at are set.
    await env.DB.prepare(
      `INSERT INTO ai_tasks (id, scene, provider, model, prompt, source_key, status, created_at, updated_at, user_id, hold_id, cost_credits, expires_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'accepted', ?7, ?7, ?8, ?9, ?10, ?11)`
    ).bind(
      taskId,
      taskDef.scene,
      taskDef.provider,
      taskDef.model,
      taskDef.prompt,
      taskDef.sourceKey ?? null,
      now,
      userId,
      holdId,
      cost,
      expiresAt
    ).run();

    return {
      resultType: "task",
      resultId: taskId,
      data: { taskId, cached: false },
    };
  });

  if (result.cached) {
    // Reconstruct from DB on cache hit.
    const row = await env.DB.prepare(`SELECT id FROM ai_tasks WHERE id = ?1`).bind(result.resultId).first<{ id: string }>();
    if (!row) throw new Error("IDEMPOTENCY_RECORD_MISSING");
    return { taskId: row.id, cached: true };
  }
  return result.data;
}

/**
 * Settle a hold when the Generated Asset is ready + attached to Project.
 *
 * Checks BOTH conditions (assetReady && assetAttached) before settling.
 * If either is false, the hold is NOT settled — the caller must re-check
 * when conditions change.
 *
 * Idempotent: calling settle on an already-settled hold throws HOLD_NOT_ACTIVE.
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
  ).bind(taskId).first<{ hold_id: string | null; user_id: string | null }>();

  if (!task || !task.hold_id) {
    throw new Error("TASK_NOT_FOUND_OR_NO_HOLD");
  }

  // Settle the hold (converts to usage).
  await settleHold(env, task.hold_id);

  // Update task status to terminal success.
  const now = Date.now();
  await env.DB.prepare(
    `UPDATE ai_tasks SET status = 'notified', updated_at = ?1 WHERE id = ?2`
  ).bind(now, taskId).run();
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
 * The `reason` is a domain release reason; it is recorded via the ledger
 * `release` entry (reason column) and the task row is transitioned to the
 * canonical terminal `failed` status. Late callback after expiry: the hold is
 * already released, so settleHold throws HOLD_NOT_ACTIVE — the task does NOT
 * resurrect.
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

  // Only release if the hold is still active.
  try {
    await releaseHold(env, task.hold_id);
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg === 'HOLD_NOT_ACTIVE' || msg === 'HOLD_NOT_FOUND') {
      // Expected: hold already released/settled (late callback after expiry).
      // The task is still marked terminal but the balance is already correct.
    } else {
      // Transient/unexpected failure: do NOT mark task terminal while an
      // active hold may still be in place — re-throw so the caller retries.
      throw err;
    }
  }

  const now = Date.now();
  // Map domain release reasons to the canonical ai_tasks terminal status.
  const taskStatus = TERMINAL_TASK_STATUSES[terminalStatus] ?? "failed";
  await env.DB.prepare(
    `UPDATE ai_tasks SET status = ?1, updated_at = ?2 WHERE id = ?3`
  ).bind(taskStatus, now, taskId).run();
}

/**
 * Reconciler: expire all non-terminal tasks past their 30-minute server expiry.
 *
 * Atomically transitions each task to 'expired' and releases its hold.
 * Late callbacks after expiry do NOT resurrect the task (settleHold would
 * throw HOLD_NOT_ACTIVE on the already-released hold).
 *
 * Safe to call on a schedule (e.g. every minute via cron or queue).
 */
export async function expireStaleTasks(env: Env): Promise<number> {
  const now = Date.now();

  // Find all non-terminal, non-expired tasks past their expiry.
  // Terminal statuses: 'ready' (#7 settled success), 'notified' (settle point
  // recorded by settleHoldOnReady), 'failed', 'expired'.
  const stale = await env.DB.prepare(
    `SELECT id, hold_id FROM ai_tasks
     WHERE status NOT IN ('ready', 'notified', 'failed', 'expired')
       AND expires_at IS NOT NULL AND expires_at < ?1`
  ).bind(now).all<{ id: string; hold_id: string | null }>();

  let expiredCount = 0;
  for (const task of stale.results ?? []) {
    // Atomically release hold and expire task.
    if (task.hold_id) {
      try {
        await releaseHold(env, task.hold_id);
      } catch (err) {
        const msg = err instanceof Error ? err.message : '';
        if (msg === 'HOLD_NOT_ACTIVE' || msg === 'HOLD_NOT_FOUND') {
          // Expected: hold already released/settled — safe to expire.
        } else {
          // Transient failure: skip this task so the next reconciler run
          // retries it. Do NOT mark expired while the hold may still be active.
          continue;
        }
      }
    }
    await env.DB.prepare(
      `UPDATE ai_tasks SET status = 'expired', expired_at = ?1, updated_at = ?1 WHERE id = ?2 AND status NOT IN ('ready', 'notified', 'failed', 'expired')`
    ).bind(now, task.id).run();
    expiredCount++;
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
