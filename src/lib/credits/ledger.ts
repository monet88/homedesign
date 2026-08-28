// Ticket 04: immutable Credit Ledger primitives (ADR 0002).
//
// The Ledger is the append-only source of truth for balance. Balance is always
// DERIVED, never stored or edited directly.
//
//   Available = Σ(grants + payments) − Σ(usage) − Σ(active holds)
//
// Signed amounts: grant/payment are positive additions; usage is a positive
// deduction; holds are tracked in `credit_holds` and deducted from available;
// releases restore the held amount.
//
// Primitives exposed for later tickets:
//   #5 (Mock Payment): addCredits(…, "payment", …)
//   #7 (Generate):      holdCredits → settleHold | releaseHold
//   #7 (Idempotency):   getActiveHoldByRef → guard against double-hold
//
// Idempotent grant: unique constraint ON (user_id, grant_key) WHERE grant_key
// IS NOT NULL makes concurrent INSERT … ON CONFLICT DO NOTHING atomic.

import type { Env } from "@/lib/bindings";
import { isFreeGrantAllowed } from "@/lib/env/policy";

// ── Types ──────────────────────────────────────────────────────────────────

export interface CreditLedgerEntry {
  id: string;
  user_id: string;
  entry_type: "grant" | "payment" | "usage" | "hold" | "release";
  amount: number;
  reason: string;
  ref_type?: string | null;
  ref_id?: string | null;
  grant_key?: string | null;
  created_at: number;
}

export interface CreditHold {
  id: string;
  user_id: string;
  amount: number;
  status: "active" | "settled" | "released";
  ref_type: string;
  ref_id: string;
  ledger_hold_id?: string | null;
  created_at: number;
  settled_at?: number | null;
  released_at?: number | null;
}

export interface LedgerSummary {
  /** Credits available for use (grants + payments − usage − active holds). */
  available: number;
  /** Sum of active hold amounts. */
  activeHolds: number;
  /** Total lifetime grants. */
  totalGrants: number;
  /** Total lifetime payments. */
  totalPayments: number;
  /** Total lifetime usage. */
  totalUsage: number;
}

// ── ID generation ──────────────────────────────────────────────────────────

function uid(): string {
  return crypto.randomUUID();
}

// ── Low-level append ───────────────────────────────────────────────────────

/**
 * Append an entry to the credit ledger. All higher-level operations (grant,
 * hold, usage, release) call this internally.
 */
export async function addLedgerEntry(
  env: Env,
  entry: Omit<CreditLedgerEntry, "id" | "created_at">
): Promise<CreditLedgerEntry> {
  const id = uid();
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO credit_ledger (id, user_id, entry_type, amount, reason, ref_type, ref_id, grant_key, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`
  ).bind(
    id,
    entry.user_id,
    entry.entry_type,
    entry.amount,
    entry.reason,
    entry.ref_type ?? null,
    entry.ref_id ?? null,
    entry.grant_key ?? null,
    now
  ).run();
  return { id, ...entry, created_at: now };
}

// ── Grant (idempotent) ─────────────────────────────────────────────────────

const FREE_GRANT_KEY = "free-credit-grant-v1";
const FREE_GRANT_AMOUNT = 10;

/**
 * Ensure the one-time free credit grant exists for this user. Idempotent by
 * unique `(user_id, grant_key)`: concurrent calls from email verify, Google
 * login, or reconnect only create one ledger entry.
 *
 * Safe to call on every verified path — the unique partial index guarantees
 * the grant fires at most once.
 */
export async function ensureFreeCreditGrant(
  env: Env,
  userId: string
): Promise<boolean> {
  // Banned in production (ADR 0006 / ticket #18).
  if (!isFreeGrantAllowed(env)) {
    return false;
  }

  const id = uid();
  const now = Date.now();
  try {
    await env.DB.prepare(
      `INSERT INTO credit_ledger (id, user_id, entry_type, amount, reason, ref_type, ref_id, grant_key, created_at)
       VALUES (?1, ?2, 'grant', ?3, ?4, NULL, NULL, ?5, ?6)`
    ).bind(id, userId, FREE_GRANT_AMOUNT, "Free Credit Grant (10 credits)", FREE_GRANT_KEY, now).run();
    return true; // grant applied
  } catch {
    // Unique constraint violation (idx_credit_ledger_grant_key) — grant already exists.
    return false;
  }
}

// ── Payment, admin & usage primitives (for #5 / #7 / #22) ─────────────────────────

/**
 * Record an administrative credit adjustment (grant or deduction).
 * Positive amount is recorded as a 'grant', negative amount is recorded as 'usage'.
 *
 * @param env Cloudflare Env binding
 * @param userId Target user ID
 * @param amount Positive for credit addition, negative for credit deduction
 * @param reason Audit reason for adjustment
 * @param adminId Admin user ID performing the adjustment
 * @returns The created CreditLedgerEntry
 */
export async function recordAdminCreditAdjustment(
  env: Env,
  userId: string,
  amount: number,
  reason: string,
  adminId?: string
): Promise<CreditLedgerEntry> {
  const id = uid();
  const now = Date.now();
  const entryType: "grant" | "usage" = amount >= 0 ? "grant" : "usage";
  const absAmount = Math.abs(amount);

  await env.DB.prepare(
    `INSERT INTO credit_ledger (id, user_id, entry_type, amount, reason, ref_type, ref_id, grant_key, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, 'admin_adjustment', ?6, NULL, ?7)`
  ).bind(
    id,
    userId,
    entryType,
    absAmount,
    reason,
    adminId ?? null,
    now
  ).run();

  return {
    id,
    user_id: userId,
    entry_type: entryType,
    amount: absAmount,
    reason,
    ref_type: "admin_adjustment",
    ref_id: adminId ?? null,
    grant_key: null,
    created_at: now,
  };
}

/**
 * Add credits (grant or successful Mock Payment). Callers MUST provide a
 * caller-unique key for idempotency (e.g. the Mock Payment idempotency key,
 * or the free grant key). Throws when the key collides with an existing row
 * (`ON CONFLICT DO NOTHING` returns the existing grant instead of duping).
 *
 * #5 (Mock Payment) calls this with entry_type 'payment'.
 */
export async function addCredits(
  env: Env,
  userId: string,
  amount: number,
  reason: string,
  opts: {
    entryType?: "grant" | "payment";
    idempotencyKey?: string;
    refType?: string;
    refId?: string;
  } = {}
): Promise<CreditLedgerEntry> {
  const id = uid();
  const now = Date.now();
  const key = opts.idempotencyKey ?? null;

  // Idempotent by (user_id, grant_key) when a key is supplied.
  try {
    await env.DB.prepare(
      `INSERT INTO credit_ledger (id, user_id, entry_type, amount, reason, ref_type, ref_id, grant_key, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`
    ).bind(id, userId, opts.entryType ?? "payment", amount, reason, opts.refType ?? null, opts.refId ?? null, key, now).run();
    return { id, user_id: userId, entry_type: opts.entryType ?? "payment", amount, reason, ref_type: opts.refType ?? null, ref_id: opts.refId ?? null, grant_key: key, created_at: now };
  } catch {
    // Duplicate key — return the existing grant/payment instead of throwing.
    const existing = await env.DB.prepare(
      `SELECT * FROM credit_ledger WHERE user_id = ?1 AND grant_key = ?2`
    ).bind(userId, key).first<CreditLedgerEntry>();
    if (existing) return existing;
    throw new Error("IDEMPOTENCY_KEY_CONFLICT");
  }
}

/**
 * Deduct credits as usage (a terminal successful operation). #7 settles a hold
 * (usage) instead of calling this directly; this is exposed for any direct
 * spending that is not hold-backed. Returns the usage entry.
 */
export async function useCredits(
  env: Env,
  userId: string,
  amount: number,
  reason: string,
  refType?: string,
  refId?: string
): Promise<CreditLedgerEntry> {
  const id = uid();
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO credit_ledger (id, user_id, entry_type, amount, reason, ref_type, ref_id, grant_key, created_at)
     VALUES (?1, ?2, 'usage', ?3, ?4, ?5, ?6, NULL, ?7)`
  ).bind(id, userId, amount, reason, refType ?? null, refId ?? null, now).run();
  return { id, user_id: userId, entry_type: "usage", amount, reason, ref_type: refType ?? null, ref_id: refId ?? null, grant_key: null, created_at: now };
}

// ── Hold ───────────────────────────────────────────────────────────────────

/**
 * Create a credit hold atomically: append a 'hold' ledger entry + insert a
 * `credit_holds` row. The unique ref index prevents double-hold on the same
 * task/run.
 *
 * Returns the hold id, or throws if `(ref_type, ref_id)` already has an active
 * hold.
 *
 * Called by #7 (Generate) on task acceptance.
 */
export async function holdCredits(
  env: Env,
  userId: string,
  amount: number,
  refType: string,
  refId: string,
  reason: string
): Promise<string> {
  const holdId = uid();
  const ledgerEntryId = uid();
  const now = Date.now();

  // Atomic batch: hold ledger entry (negative amount) + active hold row.
  // The unique ref index rejects a second active hold for the same task/run;
  // because batch() is transactional, a conflict rolls the ledger entry back too.
  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO credit_ledger (id, user_id, entry_type, amount, reason, ref_type, ref_id, grant_key, created_at)
         VALUES (?1, ?2, 'hold', ?3, ?4, ?5, ?6, NULL, ?7)`
      ).bind(ledgerEntryId, userId, amount, reason, refType, refId, now),
      env.DB.prepare(
        `INSERT INTO credit_holds (id, user_id, amount, status, ref_type, ref_id, ledger_hold_id, created_at)
         VALUES (?1, ?2, ?3, 'active', ?4, ?5, ?6, ?7)`
      ).bind(holdId, userId, amount, refType, refId, ledgerEntryId, now),
    ]);
  } catch {
    // Unique constraint violation — a hold already exists for this ref.
    throw new Error("HOLD_ALREADY_ACTIVE");
  }

  return holdId;
}

/**
 * Settle a hold: mark the credit_holds row as 'settled' and append a 'usage'
 * ledger entry. Called by #7 when Generated Assets are ready + attached.
 */
export async function settleHold(
  env: Env,
  holdId: string
): Promise<void> {
  const hold = await env.DB.prepare(
    `SELECT * FROM credit_holds WHERE id = ?1`
  ).bind(holdId).first<CreditHold>();

  if (!hold) throw new Error("HOLD_NOT_FOUND");
  if (hold.status !== "active") throw new Error("HOLD_NOT_ACTIVE");

  const now = Date.now();
  const usageEntryId = uid();

  // Batch: update hold + append usage ledger entry.
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE credit_holds SET status = 'settled', settled_at = ?1 WHERE id = ?2 AND status = 'active'`
    ).bind(now, holdId),
    env.DB.prepare(
      `INSERT INTO credit_ledger (id, user_id, entry_type, amount, reason, ref_type, ref_id, grant_key, created_at)
       VALUES (?1, ?2, 'usage', ?3, ?4, ?5, ?6, NULL, ?7)`
    ).bind(usageEntryId, hold.user_id, hold.amount, hold.ref_type, hold.ref_type, hold.ref_id, now),
  ]);
}

/**
 * Release a hold: mark the credit_holds row as 'released' and append a
 * 'release' ledger entry (restoring the held amount to available). Called by
 * #7 on failed/canceled/expired/exhausted/DLQ.
 */
export async function releaseHold(
  env: Env,
  holdId: string
): Promise<void> {
  const hold = await env.DB.prepare(
    `SELECT * FROM credit_holds WHERE id = ?1`
  ).bind(holdId).first<CreditHold>();

  if (!hold) throw new Error("HOLD_NOT_FOUND");
  if (hold.status !== "active") throw new Error("HOLD_NOT_ACTIVE");

  const now = Date.now();
  const releaseEntryId = uid();

  await env.DB.batch([
    env.DB.prepare(
      `UPDATE credit_holds SET status = 'released', released_at = ?1 WHERE id = ?2 AND status = 'active'`
    ).bind(now, holdId),
    env.DB.prepare(
      `INSERT INTO credit_ledger (id, user_id, entry_type, amount, reason, ref_type, ref_id, grant_key, created_at)
       VALUES (?1, ?2, 'release', ?3, ?4, ?5, ?6, NULL, ?7)`
    ).bind(releaseEntryId, hold.user_id, hold.amount, hold.ref_type, hold.ref_type, hold.ref_id, now),
  ]);
}

// ── Query ──────────────────────────────────────────────────────────────────

/**
 * Get the available credits for a user: Σ(grants + payments) − Σ(usage) − Σ(active holds).
 * Available is always >= 0 (a negative result would be a bug, indicating
 * overspend or a missing hold release).
 */
export async function getAvailableCredits(
  env: Env,
  userId: string
): Promise<number> {
  const result = await env.DB.prepare(
    `SELECT
       COALESCE((
         SELECT COALESCE(SUM(amount), 0) FROM credit_ledger
         WHERE user_id = ?1 AND entry_type IN ('grant', 'payment')
       ), 0) - (
         SELECT COALESCE(SUM(amount), 0) FROM credit_ledger
         WHERE user_id = ?1 AND entry_type = 'usage'
       ) - (
         SELECT COALESCE(SUM(amount), 0) FROM credit_holds
         WHERE user_id = ?1 AND status = 'active'
       ) AS available`
  ).bind(userId).first<{ available: number }>();

  return Math.max(0, result?.available ?? 0);
}

/**
 * Return a full LedgerSummary for the user.
 */
export async function getLedgerSummary(
  env: Env,
  userId: string
): Promise<LedgerSummary> {
  const row = await env.DB.prepare(
    `SELECT
       (SELECT COALESCE(SUM(amount), 0) FROM credit_ledger WHERE user_id = ?1 AND entry_type = 'grant') AS totalGrants,
       (SELECT COALESCE(SUM(amount), 0) FROM credit_ledger WHERE user_id = ?1 AND entry_type = 'payment') AS totalPayments,
       (SELECT COALESCE(SUM(amount), 0) FROM credit_ledger WHERE user_id = ?1 AND entry_type = 'usage') AS totalUsage,
       (SELECT COALESCE(SUM(amount), 0) FROM credit_holds WHERE user_id = ?1 AND status = 'active') AS activeHolds`
  ).bind(userId).first<{
    totalGrants: number;
    totalPayments: number;
    totalUsage: number;
    activeHolds: number;
  }>();

  const totalGrants = row?.totalGrants ?? 0;
  const totalPayments = row?.totalPayments ?? 0;
  const totalUsage = row?.totalUsage ?? 0;
  const activeHolds = row?.activeHolds ?? 0;
  const available = Math.max(0, totalGrants + totalPayments - totalUsage - activeHolds);

  return { available, activeHolds, totalGrants, totalPayments, totalUsage };
}

/**
 * List ledger entries for a user (most recent first).
 */
export async function getCreditLedger(
  env: Env,
  userId: string,
  limit = 50
): Promise<CreditLedgerEntry[]> {
  const result = await env.DB.prepare(
    `SELECT * FROM credit_ledger WHERE user_id = ?1 ORDER BY created_at DESC LIMIT ?2`
  ).bind(userId, limit).all<CreditLedgerEntry>();
  return result.results ?? [];
}

/**
 * List active holds for a user.
 */
export async function getActiveHolds(
  env: Env,
  userId: string
): Promise<CreditHold[]> {
  const result = await env.DB.prepare(
    `SELECT * FROM credit_holds WHERE user_id = ?1 AND status = 'active' ORDER BY created_at DESC`
  ).bind(userId).all<CreditHold>();
  return result.results ?? [];
}

/**
 * Get the active hold for a (ref_type, ref_id), or null. Used by #7
 * idempotency to prevent double-hold on retry/reconnect.
 */
export async function getActiveHoldByRef(
  env: Env,
  refType: string,
  refId: string
): Promise<CreditHold | null> {
  const row = await env.DB.prepare(
    `SELECT * FROM credit_holds WHERE ref_type = ?1 AND ref_id = ?2 AND status = 'active'`
  ).bind(refType, refId).first<CreditHold>();
  return row ?? null;
}

// ── Invariant ──────────────────────────────────────────────────────────────

/**
 * Assert the credit ledger invariant: grants + payments = usage + available + active holds.
 * Returns true if the invariant holds; throws descriptive error if not.
 *
 * AC: "Ledger invariant test: grants = usage + available + active holds after
 * every transition" — extended to include payments for completeness (#5).
 */
export async function assertCreditInvariant(
  env: Env,
  userId: string
): Promise<boolean> {
  const summary = await getLedgerSummary(env, userId);
  const lhs = summary.totalGrants + summary.totalPayments;
  const rhs = summary.totalUsage + summary.available + summary.activeHolds;

  if (lhs !== rhs) {
    throw new Error(
      `Credit invariant violated for user ${userId}: ` +
      `grants(${summary.totalGrants}) + payments(${summary.totalPayments}) = ${lhs}, ` +
      `usage(${summary.totalUsage}) + available(${summary.available}) + activeHolds(${summary.activeHolds}) = ${rhs}`
    );
  }

  return true;
}