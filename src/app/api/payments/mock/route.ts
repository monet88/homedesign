import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createAuth, requireVerifiedUser, type AuthEnv } from "@/lib/auth/server";
import { mockPurchase, MOCK_PACKS, type MockPack } from "@/lib/payments/core";

// `POST /api/payments/mock` (ADR 0002, spec US 14–15, 18): Mock Payment.
//
// Body:  { pack: "lite"|"plus"|"pro"|"max", idempotencyKey: string }
//
// Behavior:
//   - Banned in production (ENVIRONMENT === "production") → 403 MOCK_PAYMENT_BANNED_IN_PRODUCTION
//   - Requires a verified session → 401 / 403 EMAIL_NOT_VERIFIED
//   - Invalid pack → 400
//   - Same idempotency key + same payload → cached result (200, cached:true)
//   - Same idempotency key + different payload → 409 IDEMPOTENCY_KEY_REUSED
//   - Success → 200 { code:0, data:{ id, pack, label, amount, idempotencyKey, ledgerEntryId, cached } }
//
// The label is always "Mock purchase — no charge" per ADR 0002.

export async function POST(request: Request) {
  const cf = await getCloudflareContext({ async: true });
  const env = cf.env as unknown as AuthEnv;
  const auth = createAuth(env);

  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return Response.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  try {
    requireVerifiedUser(session);
  } catch (err) {
    const status = (err as { status?: number }).status ?? 403;
    return Response.json({ error: "EMAIL_NOT_VERIFIED" }, { status });
  }

  let body: { pack?: unknown; idempotencyKey?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const pack = body.pack as MockPack;
  const idempotencyKey = body.idempotencyKey as string;

  if (typeof idempotencyKey !== "string" || idempotencyKey.length === 0) {
    return Response.json({ error: "IDEMPOTENCY_KEY_REQUIRED" }, { status: 400 });
  }
  if (typeof pack !== "string" || !(pack in MOCK_PACKS)) {
    return Response.json({ error: "INVALID_PACK" }, { status: 400 });
  }

  try {
    const result = await mockPurchase(env, session.user.id, pack, idempotencyKey);
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