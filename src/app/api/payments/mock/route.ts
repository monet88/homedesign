import { authorizeVerified } from "@/lib/ai/http";
import { mockPurchase } from "@/lib/payments/core";
import { MockPaymentSchema } from "@/lib/validation/schemas";

// `POST /api/payments/mock` (ADR 0002, spec US 14–15, 18): Mock Payment.
//
// Body:  { pack: "lite"|"plus"|"pro"|"max", idempotencyKey: string }
//
// Behavior:
//   - Banned in production (ENVIRONMENT === "production") → 403 MOCK_PAYMENT_BANNED_IN_PRODUCTION
//   - Requires a verified session → 401 / 403 EMAIL_NOT_VERIFIED
//   - Invalid input → 400 INVALID_INPUT with details
//   - Same idempotency key + same payload → cached result (200, cached:true)
//   - Same idempotency key + different payload → 409 IDEMPOTENCY_KEY_REUSED
//   - Success → 200 { code:0, data:{ id, pack, label, amount, idempotencyKey, ledgerEntryId, cached } }
//
// The label is always "Mock purchase — no charge" per ADR 0002.

export async function POST(request: Request) {
  const auth = await authorizeVerified(request);
  if (auth instanceof Response) return auth;
  const env = auth.env;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  // ── Zod parse-or-400 (ticket #40 pattern) ──────────────────────────────
  const parsed = MockPaymentSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "INVALID_INPUT", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { pack, idempotencyKey } = parsed.data;

  try {
    const result = await mockPurchase(env, auth.userId, pack, idempotencyKey);
    return Response.json(
      { code: 0, data: result },
      { headers: { "cache-control": "no-store" } }
    );
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    const message = (err as Error).message;
    if (status === 409) {
      return Response.json({ error: message }, { status: 409 });
    }
    if (status === 403 && message === "MOCK_PAYMENT_BANNED_IN_PRODUCTION") {
      return Response.json({ error: message }, { status: 403 });
    }
    // INVALID_PACK etc.
    return Response.json({ error: message }, { status });
  }
}