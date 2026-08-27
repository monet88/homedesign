import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { Env } from "@/lib/bindings";
import { deliverShareAsset } from "@/lib/library/share";

// Token-authorized short-lived delivery for share-selected ready generated assets.
// Inline disposition only — no owner download / attachment affordance.

export async function GET(_request: Request, ctx: { params: Promise<{ token: string; assetId: string }> }) {
  const cf = await getCloudflareContext({ async: true });
  const env = cf.env as unknown as Env;
  const { token, assetId } = await ctx.params;

  const response = await deliverShareAsset(env, token, assetId);
  if (!response) {
    return Response.json({ error: "NOT_FOUND" }, { status: 404, headers: { "cache-control": "no-store" } });
  }
  return response;
}
