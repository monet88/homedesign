// Ticket 05: Idempotency system + Mock Payment + task/hold contract (ADR 0002).
//
// Provides:
//   1. Claim-first idempotency for Mock Payment and task creation.
//      Unique (user_id, operation, key) + canonical request fingerprint serializes
//      concurrent first attempts before domain side effects can commit. Same key
//      + same fingerprint returns cached; different fingerprint throws 409.
//   2. Mock Payment — 4 packs Lite 80 / Plus 160 / Pro 320 / Max 640 credits,
//      labelled "Mock purchase - no charge", atomically records ledger + audit rows,
//      banned in production.
//   3. Task+hold atomic contract — createTaskWithHold(), settleHoldOnReady(),
//      releaseHoldOnTerminal(), expireStaleTasks() — all built on ledger
//      primitives from #4.

import type { Env } from "@/lib/bindings";
import { assertMockPaymentAllowed } from "@/lib/env/policy";
import {
  prepareCreditAddition,
  prepareCreditHold,
  settleHold,
  releaseHold,
} from "@/lib/credits/ledger";

// ── Canonical fingerprint ────────────────────────────────────────────────────
// Deterministic JSON hash: keys sorted lexicographically, no whitespace, SHA-256.

function canonicalStringify(obj: unknown): string {
  if (obj === null || obj === undefined) return "null";
  if (typeof obj === "string") return JSON.stringify(obj);
  if (typeof obj === "number" || typeof obj === "boolean") return String(obj);
  if (Array.isArray(obj)) return "[" + obj.map(canonicalStringify).join(",") + "]";
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  const pairs = keys.map((k) => JSON.stringify(k) + ":" + canonicalStringify((obj as Record<string, unknown>)[k]));
  return "{" + pairs.join(",") + "}";
}

export async function canonicalHash(obj: unknown): Promise<string> {
  const canonical = canonicalStringify(obj);
  const encoder = new TextEncoder();
  const data = encoder.encode(canonical);
  const hash = await crypto.subtle.digest("SHA-256", data);
  const hex = Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex;
}

// ── Idempotency record type ─────────────────────────────────────────────────

export interface IdempotencyRecord {
  id: string;
  user_id: string;
  operation: string;
  idempotency_key: string;
  request_fingerprint: string;
  result_type: string;
  result_id: string;
  created_at: number;
}

// ── Idempotency lookup ──────────────────────────────────────────────────────

/** Return a matching idempotency record, or reject same-key/different-payload reuse. */
async function getMatchingIdempotencyRecord(
  env: Env,
  userId: string,
  operation: string,
  idempotencyKey: string,
  fingerprint: string
): Promise<IdempotencyRecord | null> {
  const existing = await env.DB.prepare(
    `SELECT * FROM idempotency_keys WHERE user_id = ?1 AND operation = ?2 AND idempotency_key = ?3`
  ).bind(userId, operation, idempotencyKey).first<IdempotencyRecord>();

  if (!existing) return null;
  if (existing.request_fingerprint !== fingerprint) {
    const err = new Error("IDEMPOTENCY_KEY_REUSED") as Error & { status?: number };
    err.status = 409;
    throw err;
  }
  return existing;
}
// ── Mock Payment ─────────────────────────────────────────────────────────────

export const MOCK_PACKS = {
  lite: { label: "Mock purchase — no charge (Lite 80)", credits: 80 },
  plus: { label: "Mock purchase — no charge (Plus 160)", credits: 160 },
  pro: { label: "Mock purchase — no charge (Pro 320)", credits: 320 },
  max: { label: "Mock purchase — no charge (Max 640)", credits: 640 },
} as const;

export type MockPack = keyof typeof MOCK_PACKS;

export interface MockPurchaseResult {
  id: string;
  pack: MockPack;
  label: string;
  amount: number;
  idempotencyKey: string;
  ledgerEntryId: string;
  created_at: number;
  cached: boolean;
}

/**
 * Execute a Mock Payment.
 *
 * Idempotent by `(user_id, "mock_purchase", idempotencyKey)`. Same key + same
 * payload → returns cached result. Same key + different payload → 409.
 *
 * BANNED in production (ENVIRONMENT === "production").
 */
async function loadMockPurchase(
  env: Env,
  purchaseId: string,
  cached: boolean
): Promise<MockPurchaseResult> {
  const row = await env.DB.prepare(
    `SELECT * FROM mock_payments WHERE id = ?1`
  ).bind(purchaseId).first<{
    id: string;
    pack: string;
    label: string;
    amount: number;
    idempotency_key: string;
    ledger_entry_id: string;
    created_at: number;
  }>();
  if (!row) throw new Error("IDEMPOTENCY_RECORD_MISSING");
  return {
    id: row.id,
    pack: row.pack as MockPack,
    label: row.label,
    amount: row.amount,
    idempotencyKey: row.idempotency_key,
    ledgerEntryId: row.ledger_entry_id,
    created_at: row.created_at,
    cached,
  };
}

export async function mockPurchase(
  env: Env,
  userId: string,
  pack: MockPack,
  idempotencyKey: string
): Promise<MockPurchaseResult> {
  assertMockPaymentAllowed(env);

  const packDef = MOCK_PACKS[pack];
  if (!packDef) {
    throw new Error(`INVALID_PACK: ${pack}`);
  }

  const fingerprint = await canonicalHash({ pack, idempotencyKey });
  const existing = await getMatchingIdempotencyRecord(
    env,
    userId,
    "mock_purchase",
    idempotencyKey,
    fingerprint
  );
  if (existing) {
    return loadMockPurchase(env, existing.result_id, true);
  }

  const purchaseId = crypto.randomUUID();
  const idempotencyId = crypto.randomUUID();
  const now = Date.now();
  const preparedCredit = prepareCreditAddition(
    env,
    userId,
    packDef.credits,
    packDef.label,
    {
      entryType: "payment",
      idempotencyKey,
      refType: "mock_purchase",
      refId: idempotencyKey,
    },
    now
  );

  try {
    await env.DB.batch([
      // Claim first: a concurrent loser rolls back its ledger/payment rows.
      env.DB.prepare(
        `INSERT INTO idempotency_keys (
           id, user_id, operation, idempotency_key, request_fingerprint,
           result_type, result_id, created_at
         ) VALUES (?1, ?2, 'mock_purchase', ?3, ?4, 'mock_purchase', ?5, ?6)`
      ).bind(idempotencyId, userId, idempotencyKey, fingerprint, purchaseId, now),
      preparedCredit.statement,
      env.DB.prepare(
        `INSERT INTO mock_payments (
           id, user_id, pack, label, amount, idempotency_key, ledger_entry_id, created_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`
      ).bind(
        purchaseId,
        userId,
        pack,
        packDef.label,
        packDef.credits,
        idempotencyKey,
        preparedCredit.entry.id,
        now
      ),
    ]);
  } catch (err) {
    const winner = await getMatchingIdempotencyRecord(
      env,
      userId,
      "mock_purchase",
      idempotencyKey,
      fingerprint
    );
    if (winner) {
      return loadMockPurchase(env, winner.result_id, true);
    }
    throw err;
  }

  return {
    id: purchaseId,
    pack,
    label: packDef.label,
    amount: packDef.credits,
    idempotencyKey,
    ledgerEntryId: preparedCredit.entry.id,
    created_at: now,
    cached: false,
  };
}
// ── Task + hold atomic contract (seam for #7) ────────────────────────────────

export const TASK_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes server expiry

export interface TaskCreateDefinition {
  scene: string;
  provider: string;
  model: string;
  prompt: string;
  sourceKey: string | null;
  options: Record<string, unknown>;
}

export interface TaskAcceptanceContext {
  taskId: string;
  now: number;
}

export type TaskAcceptanceStatements = (
  context: TaskAcceptanceContext
) => D1PreparedStatement[];

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
  const existing = await getMatchingIdempotencyRecord(
    env,
    userId,
    "task_create",
    idempotencyKey,
    fingerprint
  );
  if (!existing) return null;

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
  idempotencyKey: string,
  acceptanceStatements?: TaskAcceptanceStatements
): Promise<{ taskId: string; cached: boolean }> {
  const cached = await preflightTaskCreateIdempotency(
    env,
    userId,
    taskDef,
    cost,
    idempotencyKey
  );
  if (cached) return cached;

  const taskId = crypto.randomUUID();
  const idempotencyId = crypto.randomUUID();
  const now = Date.now();
  const preparedHold = prepareCreditHold(
    env,
    userId,
    cost,
    "task",
    taskId,
    `Task: ${taskDef.scene}`,
    now
  );
  const holdId = preparedHold.holdId;
  const expiresAt = now + TASK_EXPIRY_MS;
  const fingerprint = await canonicalHash(taskCreatePayload(taskDef, cost));

  const statements: D1PreparedStatement[] = [
    // The conditional Credit Hold reservation is first and acts as the
    // transaction-wide acceptance token for every later write.
    ...preparedHold.statements,
    env.DB.prepare(
      `INSERT INTO idempotency_keys (
         id, user_id, operation, idempotency_key, request_fingerprint,
         result_type, result_id, created_at
       )
       SELECT ?1, ?2, 'task_create', ?3, ?4, 'task', ?5, ?6
       FROM credit_holds
       WHERE id = ?7 AND status = 'active'`
    ).bind(idempotencyId, userId, idempotencyKey, fingerprint, taskId, now, holdId),
    env.DB.prepare(
      `INSERT INTO ai_tasks (
         id, scene, provider, model, prompt, source_key, status, created_at,
         updated_at, user_id, hold_id, cost_credits, expires_at
       )
       SELECT ?1, ?2, ?3, ?4, ?5, ?6, 'accepted', ?7, ?7, ?8, ?9, ?10, ?11
       FROM credit_holds
       WHERE id = ?12 AND status = 'active'`
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
      expiresAt,
      holdId
    ),
  ];

  if (acceptanceStatements) {
    statements.push(...acceptanceStatements({ taskId, now }));
  }

  try {
    const results = await env.DB.batch(statements);
    if ((results[0]?.meta.changes ?? 0) === 0) {
      // A concurrent same-key winner can consume the balance before this
      // reservation executes. Preserve cache semantics before treating the
      // request as a distinct insufficient-credit attempt.
      const winner = await preflightTaskCreateIdempotency(
        env,
        userId,
        taskDef,
        cost,
        idempotencyKey
      );
      if (winner) return winner;
      throw new Error("INSUFFICIENT_CREDITS");
    }
    return { taskId, cached: false };
  } catch (err) {
    if ((err as Error).message === "INSUFFICIENT_CREDITS") throw err;

    // Any later constraint failure rolls the reservation back. A same-key
    // concurrent winner is the only failure that resolves as a cache hit.
    const winner = await preflightTaskCreateIdempotency(
      env,
      userId,
      taskDef,
      cost,
      idempotencyKey
    );
    if (winner) return winner;
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
