import { getCloudflareContext } from "@opennextjs/cloudflare";
import { headers } from "next/headers";
import type { Env } from "@/lib/bindings";
import { resolveSession, type AuthEnv } from "@/lib/auth/server";
import { recordReferralSignup } from "@/lib/referral/referral";

// POST /api/referral/claim — Bind referee account with referral code

export async function POST(request: Request) {
  const cf = await getCloudflareContext({ async: true });
  const env = cf.env as unknown as Env;

  const hdrs = await headers();
  const session = await resolveSession(env as unknown as AuthEnv, hdrs);

  if (!session) {
    return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      code?: string;
      fingerprint?: string;
      ipHash?: string;
    };
    const code = (body.code || "").trim();

    if (!code) {
      return Response.json({ error: "INVALID_CODE" }, { status: 400 });
    }

    const result = await recordReferralSignup(
      env.DB,
      code,
      session.user.id,
      body.fingerprint,
      body.ipHash
    );

    if (!result.success) {
      return Response.json(
        { error: result.reason || "REFERRAL_FAILED", success: false },
        { status: 400 }
      );
    }

    // Safeguard: make sure referral code has at least 1 click recorded
    try {
      const { recordReferralClick } = await import("@/lib/referral/referral");
      await recordReferralClick(env.DB, code);
    } catch {
      // non-fatal
    }

    return Response.json({
      code: 0,
      success: true,
      referralId: result.referralId,
      activated: !!result.rewardedImmediately,
      isExisting: !!result.isExisting,
    });
  } catch (err) {
    console.error("Referral claim error:", err);
    return Response.json(
      { error: "INTERNAL_ERROR", message: "Failed to claim referral" },
      { status: 500 }
    );
  }
}
