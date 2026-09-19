import { authorizeVerified } from "@/lib/ai/http";
import { claimOnboardingFreeTrial, hasUserClaimedFreeTrial } from "@/lib/credits/claims";

// `GET /api/credits/claim-free`
// Check whether current user has already claimed the onboarding free trial.
export async function GET(request: Request) {
  const auth = await authorizeVerified(request);
  if (auth instanceof Response) return auth;

  const hasClaimed = await hasUserClaimedFreeTrial(auth.env, auth.userId);
  return Response.json(
    { code: 0, data: { hasClaimed } },
    { headers: { "cache-control": "no-store" } }
  );
}

// `POST /api/credits/claim-free`
// Claim 5 onboarding free trial credits with anti-abuse rate limits.
export async function POST(request: Request) {
  const auth = await authorizeVerified(request);
  if (auth instanceof Response) return auth;

  let fingerprint: string | undefined;
  try {
    const body = (await request.json()) as { fingerprint?: string };
    if (body && typeof body.fingerprint === "string") {
      fingerprint = body.fingerprint;
    }
  } catch {
    // Empty body is acceptable
  }

  // Extract IP from Cloudflare or reverse proxy headers
  const cfIp = request.headers.get("cf-connecting-ip");
  const xff = request.headers.get("x-forwarded-for");
  const clientIp = cfIp || (xff ? xff.split(",")[0].trim() : "127.0.0.1");

  const result = await claimOnboardingFreeTrial(auth.env, auth.userId, {
    fingerprint,
    ip: clientIp,
    userRole: auth.userRole,
  });

  if (!result.success) {
    const status =
      result.error === "ALREADY_CLAIMED"
        ? 409
        : result.error === "INTERNAL_ERROR"
          ? 500
          : 429;
    return Response.json(
      { error: result.error, message: result.message },
      { status, headers: { "cache-control": "no-store" } }
    );
  }

  return Response.json(
    {
      code: 0,
      data: {
        amount: result.amount,
        newBalance: result.newBalance,
        message: "Chúc mừng! Bạn đã nhận 5 Credits trải nghiệm thiết kế.",
      },
    },
    { headers: { "cache-control": "no-store" } }
  );
}
