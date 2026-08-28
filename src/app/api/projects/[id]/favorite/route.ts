import { getCloudflareContext } from "@opennextjs/cloudflare";
import { authorizeVerified, designErrorResponse } from "@/lib/ai/http";
import type { Env } from "@/lib/bindings";
import { toggleProjectFavorite } from "@/lib/library/projects";
import { ProjectFavoriteSchema } from "@/lib/validation/schemas";

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
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const parsed = ProjectFavoriteSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "INVALID_INPUT", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { favorite } = parsed.data;

  try {
    await toggleProjectFavorite(auth.env as unknown as Env, auth.userId, id, favorite);
    return Response.json({ code: 0, data: { id, favorite } }, { headers: { "cache-control": "no-store" } });
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
