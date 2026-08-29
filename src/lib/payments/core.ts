// Mock Payment (ADR 0002).
//
// Provides:
//   1. Mock Payment — 4 packs Lite 80 / Plus 160 / Pro 320 / Max 640 credits,
//      labelled "Mock purchase — no charge", always succeeds via addCredits,
//      banned in production.

import type { Env } from "@/lib/bindings";
import { assertMockPaymentAllowed } from "@/lib/env/policy";
import { canonicalHash, type IdempotencyRecord } from "@/lib/idempotency";
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

  const payload = { pack, idempotencyKey };

  const fingerprint = await canonicalHash(payload);

  // 1. Preflight read-only idempotency check.
  const existing = await env.DB.prepare(
    `SELECT * FROM idempotency_keys WHERE user_id = ?1 AND operation = 'mock_purchase' AND idempotency_key = ?2`
  ).bind(userId, idempotencyKey).first<IdempotencyRecord>();

  if (existing) {
    if (existing.request_fingerprint !== fingerprint) {
      const err = new Error("IDEMPOTENCY_KEY_REUSED") as Error & { status?: number };
      err.status = 409;
      throw err;
    }
    return loadMockPayment(env, existing.result_id);
  }

  // 2. Atomic batch: idempotency reservation + credit ledger payment + mock_payments row.
  const purchaseId = crypto.randomUUID();
  const ledgerEntryId = crypto.randomUUID();
  const idempotencyId = crypto.randomUUID();
  const now = Date.now();

  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO idempotency_keys (id, user_id, operation, idempotency_key, request_fingerprint, result_type, result_id, created_at)
         VALUES (?1, ?2, 'mock_purchase', ?3, ?4, 'mock_purchase', ?5, ?6)`
      ).bind(idempotencyId, userId, idempotencyKey, fingerprint, purchaseId, now),
      env.DB.prepare(
        `INSERT INTO credit_ledger (id, user_id, entry_type, amount, reason, ref_type, ref_id, grant_key, created_at)
         VALUES (?1, ?2, 'payment', ?3, ?4, 'mock_purchase', ?5, ?6, ?7)`
      ).bind(ledgerEntryId, userId, packDef.credits, packDef.label, idempotencyKey, idempotencyKey, now),
      env.DB.prepare(
        `INSERT INTO mock_payments (id, user_id, pack, label, amount, idempotency_key, ledger_entry_id, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`
      ).bind(purchaseId, userId, pack, packDef.label, packDef.credits, idempotencyKey, ledgerEntryId, now),
    ]);

    return {
      id: purchaseId,
      pack,
      label: packDef.label,
      amount: packDef.credits,
      idempotencyKey,
      ledgerEntryId,
      created_at: now,
      cached: false,
    };
  } catch (err: unknown) {
    // Unique constraint race on idempotency_keys — another concurrent request won.
    const existingAfterRace = await env.DB.prepare(
      `SELECT * FROM idempotency_keys WHERE user_id = ?1 AND operation = 'mock_purchase' AND idempotency_key = ?2`
    ).bind(userId, idempotencyKey).first<IdempotencyRecord>();

    if (existingAfterRace) {
      if (existingAfterRace.request_fingerprint !== fingerprint) {
        const err409 = new Error("IDEMPOTENCY_KEY_REUSED", { cause: err }) as Error & { status?: number };
        err409.status = 409;
        throw err409;
      }
      return loadMockPayment(env, existingAfterRace.result_id);
    }

    // Not an idempotency race — do not swallow unexpected database errors.
    throw err;
  }
}

async function loadMockPayment(env: Env, resultId: string): Promise<MockPurchaseResult> {
  const row = await env.DB.prepare(
    `SELECT * FROM mock_payments WHERE id = ?1`
  ).bind(resultId).first<{
    id: string; pack: string; label: string; amount: number;
    idempotency_key: string; ledger_entry_id: string; created_at: number;
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
    cached: true,
  };
}
