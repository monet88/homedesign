import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { Env } from "@/lib/bindings";
import { recordReferralClick } from "@/lib/referral/referral";

// POST /api/referral/track-click — Increment referral link click counter

export async function POST(request: Request) {
  const cf = await getCloudflareContext({ async: true });
  const env = cf.env as unknown as Env;

  try {
    const body = (await request.json().catch(() => ({}))) as { code?: string };
    const code = (body.code || "").trim();

    if (!code) {
      return Response.json({ error: "INVALID_CODE" }, { status: 400 });
    }

    await recordReferralClick(env.DB, code);

    return Response.json({ code: 0, success: true });
  } catch (err) {
    console.error("Track click error:", err);
    return Response.json({ code: 0, success: false }); // Soft-fail
  }
}
