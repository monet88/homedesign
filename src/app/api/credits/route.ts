import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createAuth, requireVerifiedUser, type AuthEnv } from "@/lib/auth/server";
import {
  ensureFreeCreditGrant,
  getLedgerSummary,
} from "@/lib/credits/ledger";

// `GET /api/credits` (ADR 0002, spec US 12): the header badge reads Available
// Credits here. Requires a verified session (ADR 0001 gate) — anonymous users
// get 401, and the endpoint ensures the one-time free grant (idempotent by
// (user_id, "free-credit-grant-v1")) so email verify / Google login /
// reconnect never double-grant.
//
// Response follows the origin envelope convention:
//   200 { code: 0, data: { available, activeHolds, totalGrants, totalPayments, totalUsage } }
//   401 { error: "UNAUTHENTICATED" }
//   403 { error: "EMAIL_NOT_VERIFIED" }
export async function GET(request: Request) {
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

  const userId = session.user.id;

  // Ensure the one-time free grant on this verified path. Idempotent — if a
  // concurrent email-verify/Google-login already granted, this is a no-op.
  await ensureFreeCreditGrant(env, userId);

  const summary = await getLedgerSummary(env, userId);

  return Response.json(
    {
      code: 0,
      data: {
        available: summary.available,
        activeHolds: summary.activeHolds,
        totalGrants: summary.totalGrants,
        totalPayments: summary.totalPayments,
        totalUsage: summary.totalUsage,
      },
    },
    { headers: { "cache-control": "no-store" } }
  );
}
