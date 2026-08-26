import { getCloudflareContext } from "@opennextjs/cloudflare";
import { authorizeVerified, designErrorResponse } from "@/lib/ai/http";
import type { Env } from "@/lib/bindings";
import { toggleProjectFavorite } from "@/lib/library/projects";

// `PATCH /api/projects/[id]/favorite` (ticket #08).
// Body: { favorite: boolean }
// Toggles the Project favorite flag without touching visibility.

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await authorizeVerified(request);
  if (auth instanceof Response) return auth;

  const { id } = await ctx.params;
  let body: { favorite?: unknown };
  try {
    body = (await request.json()) as { favorite?: unknown };
  } catch {
    return Response.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  if (typeof body.favorite !== "boolean") {
    return Response.json({ error: "INVALID_FAVORITE_VALUE" }, { status: 400 });
  }

  try {
    await toggleProjectFavorite(auth.env as unknown as Env, auth.userId, id, body.favorite);
    return Response.json({ code: 0, data: { id, favorite: body.favorite } }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    const message = (err as Error).message;
    if (message === "NOT_FOUND") {
      return Response.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    if (message === "FORBIDDEN") {
      return Response.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    return designErrorResponse(err);
  }
}
