// Mock Payment (ADR 0002).
//
// Provides:
//   1. Mock Payment — 4 packs Lite 80 / Plus 160 / Pro 320 / Max 640 credits,
//      labelled "Mock purchase — no charge", always succeeds via addCredits,
//      banned in production.

import type { Env } from "@/lib/bindings";
import { assertMockPaymentAllowed } from "@/lib/env/policy";
import { addCredits } from "@/lib/credits/ledger";
import { withIdempotency } from "@/lib/idempotency";
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

  const result = await withIdempotency(env, userId, "mock_purchase", idempotencyKey, payload, async () => {
    // Add credits to the ledger (idempotent by the mock payment key).
    const ledgerEntry = await addCredits(env, userId, packDef.credits, packDef.label, {
      entryType: "payment",
      idempotencyKey,
      refType: "mock_purchase",
      refId: idempotencyKey,
    });

    // Record the mock purchase.
    const purchaseId = crypto.randomUUID();
    const now = Date.now();
    await env.DB.prepare(
      `INSERT INTO mock_payments (id, user_id, pack, label, amount, idempotency_key, ledger_entry_id, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`
    ).bind(purchaseId, userId, pack, packDef.label, packDef.credits, idempotencyKey, ledgerEntry.id, now).run();

    return {
      resultType: "mock_purchase",
      resultId: purchaseId,
      data: {
        id: purchaseId,
        pack,
        label: packDef.label,
        amount: packDef.credits,
        idempotencyKey,
        ledgerEntryId: ledgerEntry.id,
        created_at: now,
        cached: false,
      },
    };
  });

  if (result.cached) {
    // Reconstruct from DB on cache hit.
    const row = await env.DB.prepare(
      `SELECT * FROM mock_payments WHERE id = ?1`
    ).bind(result.resultId).first<{
      id: string; pack: string; label: string; amount: number;
      idempotency_key: string; ledger_entry_id: string; created_at: number;
    }>();
    if (!row) throw new Error("IDEMPOTENCY_RECORD_MISSING");
    return {
      id: row.id, pack: row.pack as MockPack, label: row.label,
      amount: row.amount, idempotencyKey: row.idempotency_key,
      ledgerEntryId: row.ledger_entry_id, created_at: row.created_at,
      cached: true,
    };
  }
  return result.data;
}
