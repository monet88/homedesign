import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { Env } from "@/lib/bindings";
import { deliverTourSceneAsset } from "@/lib/panorama/tour-service";

// Token-authorized public streaming for 360 panorama scene assets in VR Tours.
// Serves image bytes directly through HD_PRIVATE with inline disposition and public caching.

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ token: string; assetId: string }> }
) {
  const cf = await getCloudflareContext({ async: true });
  const env = cf.env as unknown as Env;
  const { token, assetId } = await ctx.params;

  const response = await deliverTourSceneAsset(env, token, assetId);
  if (!response) {
    return Response.json(
      { error: "NOT_FOUND", message: "Hình ảnh không gian 360 không tồn tại hoặc không thuộc tour này" },
      { status: 404, headers: { "cache-control": "no-store" } }
    );
  }
  return response;
}
