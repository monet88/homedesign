import { getCloudflareContext } from "@opennextjs/cloudflare";
import { headers } from "next/headers";
import type { Env } from "@/lib/bindings";
import { resolveSession, type AuthEnv } from "@/lib/auth/server";
import { getOrCreateReferralCode, getReferralStats } from "@/lib/referral/referral";

// GET /api/referral/me — Get user's referral code and viral growth stats

export async function GET() {
  const cf = await getCloudflareContext({ async: true });
  const env = cf.env as unknown as Env;

  const hdrs = await headers();
  const session = await resolveSession(env as unknown as AuthEnv, hdrs);

  if (!session) {
    return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const code = await getOrCreateReferralCode(
      env.DB,
      session.user.id,
      session.user.name || session.user.email
    );
    const stats = await getReferralStats(env.DB, session.user.id);

    const origin = env.BETTER_AUTH_URL || "https://design.7app.online";
    const referralUrl = `${origin}?ref=${encodeURIComponent(code)}`;

    return Response.json({
      code: 0,
      data: {
        ...stats,
        referralCode: code,
        referralUrl,
      },
    });
  } catch (err) {
    console.error("Referral stats error:", err);
    return Response.json(
      { error: "INTERNAL_ERROR", message: "Failed to fetch referral info" },
      { status: 500 }
    );
  }
}
