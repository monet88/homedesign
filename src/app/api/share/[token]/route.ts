import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { Env } from "@/lib/bindings";
import { getShareViewByToken } from "@/lib/library/share";

// Anonymous `GET /api/share/[token]` — minimal project metadata + share-selected assets.
// Never logs or echoes the token secret beyond this handler boundary.

export async function GET(_request: Request, ctx: { params: Promise<{ token: string }> }) {
  const cf = await getCloudflareContext({ async: true });
  const env = cf.env as unknown as Env;
  const { token } = await ctx.params;

  const view = await getShareViewByToken(env, token);
  if (!view) {
    return Response.json({ error: "NOT_FOUND" }, { status: 404, headers: { "cache-control": "no-store" } });
  }

  return Response.json({ code: 0, data: view }, { headers: { "cache-control": "no-store" } });
}
