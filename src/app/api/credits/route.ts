import { authorizeVerified } from "@/lib/ai/http";
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
  const auth = await authorizeVerified(request);
  if (auth instanceof Response) return auth;

  await ensureFreeCreditGrant(auth.env, auth.userId);
  const summary = await getLedgerSummary(auth.env, auth.userId);

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
