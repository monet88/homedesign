import { getCloudflareContext } from "@opennextjs/cloudflare";
import { authorizeVerified, readJson } from "@/lib/ai/http";
import type { Env } from "@/lib/bindings";
import { setProjectVisibility } from "@/lib/library/share";

// `PATCH /api/projects/[id]/visibility` body `{ visibility: "private" | "unlisted" }`.

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authorizeVerified(request);
  if (auth instanceof Response) return auth;

  const body = await readJson(request);
  if (body instanceof Response) return body;

  const { id: projectId } = await ctx.params;
  const visibility = (body as { visibility?: string }).visibility;
  if (visibility !== "private" && visibility !== "unlisted") {
    return Response.json({ error: "INVALID_REQUEST" }, { status: 400 });
  }

  try {
    await setProjectVisibility(auth.env as unknown as Env, auth.userId, projectId, visibility);
    return Response.json({ code: 0, data: { ok: true } }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    const message = (err as Error)?.message ?? "INTERNAL_ERROR";
    if (message === "NOT_FOUND") return Response.json({ error: "NOT_FOUND" }, { status: 404 });
    if (message === "FORBIDDEN") return Response.json({ error: "FORBIDDEN" }, { status: 403 });
    return Response.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
