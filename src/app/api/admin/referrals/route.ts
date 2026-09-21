import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAdminSession } from "@/lib/auth/admin";
import type { Env } from "@/lib/bindings";
import type { AuthEnv } from "@/lib/auth/server";

// Ticket 7.4: Admin Viral Growth & Referral Funnel Analytics
// GET /api/admin/referrals — Protected endpoint for role: admin

export async function GET(request: Request) {
  const cf = await getCloudflareContext({ async: true });
  const env = cf.env as unknown as Env;

  const auth = await requireAdminSession(request, env as unknown as AuthEnv);
  if (!auth.authorized) {
    return Response.json(
      { error: auth.error },
      { status: auth.status, headers: { "cache-control": "no-store" } }
    );
  }

  try {
    // 1. Overview metrics
    const metricsRes = await env.DB.prepare(
      `SELECT
         (SELECT COUNT(*) FROM referral_codes) as total_codes,
         (SELECT COALESCE(SUM(clicks), 0) FROM referral_codes) as total_clicks,
         (SELECT COUNT(*) FROM referrals) as total_referrals,
         (SELECT COUNT(*) FROM referrals WHERE status = 'rewarded') as activated_referrals,
         (SELECT COALESCE(SUM(reward_credits), 0) FROM referrals WHERE status = 'rewarded') as total_reward_credits`
    ).first<any>();

    // 2. Top Referrers Leaderboard
    const topReferrersRes = await env.DB.prepare(
      `SELECT
         rc.user_id,
         rc.code,
         rc.clicks,
         u.email,
         u.name,
         COUNT(r.id) as referred_count,
         SUM(CASE WHEN r.status = 'rewarded' THEN 1 ELSE 0 END) as activated_count,
         SUM(CASE WHEN r.status = 'rewarded' THEN r.reward_credits ELSE 0 END) as credits_earned
       FROM referral_codes rc
       JOIN user u ON rc.user_id = u.id
       LEFT JOIN referrals r ON rc.user_id = r.referrer_id
       GROUP BY rc.user_id
       ORDER BY activated_count DESC, rc.clicks DESC
       LIMIT 20`
    ).all();

    return Response.json(
      {
        code: 0,
        data: {
          metrics: {
            totalCodes: metricsRes?.total_codes || 0,
            totalClicks: metricsRes?.total_clicks || 0,
            totalReferrals: metricsRes?.total_referrals || 0,
            activatedReferrals: metricsRes?.activated_referrals || 0,
            totalRewardCredits: metricsRes?.total_reward_credits || 0,
          },
          topReferrers: topReferrersRes.results || [],
        },
      },
      { headers: { "cache-control": "no-store" } }
    );
  } catch (err) {
    console.error("Admin referrals query error:", err);
    return Response.json(
      { error: "INTERNAL_ERROR", message: "Failed to query referrals." },
      { status: 500 }
    );
  }
}
