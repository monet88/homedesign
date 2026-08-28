import { getCloudflareContext } from "@opennextjs/cloudflare";
import { authorizeVerified, designErrorResponse, readJson } from "@/lib/ai/http";
import type { Env } from "@/lib/bindings";
import {
  createProjectShare,
  revokeProjectShare,
  setShareSelectedAssets,
} from "@/lib/library/share";

// `POST /api/projects/[id]/share` — create unlisted share (returns token once).
// `DELETE /api/projects/[id]/share` — revoke active share.

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authorizeVerified(request);
  if (auth instanceof Response) return auth;

  const body = await readJson(request);
  if (body instanceof Response) return body;

  const { id: projectId } = await ctx.params;
  const payload = body as { expiresAt?: number | null; assetIds?: string[] };

  try {
    const result = await createProjectShare(auth.env as unknown as Env, auth.userId, projectId, {
      expiresAt: payload.expiresAt ?? null,
      assetIds: payload.assetIds,
    });
    return Response.json(
      { code: 0, data: { shareId: result.shareId, token: result.token, expiresAt: result.expiresAt } },
      { headers: { "cache-control": "no-store" } }
    );
  } catch (err) {
    return shareErrorResponse(err);
  }
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authorizeVerified(_request);
  if (auth instanceof Response) return auth;

  const { id: projectId } = await ctx.params;
  try {
    await revokeProjectShare(auth.env as unknown as Env, auth.userId, projectId);
    return Response.json({ code: 0, data: { ok: true } }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return shareErrorResponse(err);
  }
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authorizeVerified(request);
  if (auth instanceof Response) return auth;

  const body = await readJson(request);
  if (body instanceof Response) return body;

  const { id: projectId } = await ctx.params;
  const payload = body as { assetIds?: string[] };
  if (!Array.isArray(payload.assetIds)) {
    return Response.json({ error: "INVALID_REQUEST" }, { status: 400 });
  }

  try {
    await setShareSelectedAssets(auth.env as unknown as Env, auth.userId, projectId, payload.assetIds);
    return Response.json({ code: 0, data: { ok: true } }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return shareErrorResponse(err);
  }
}

function shareErrorResponse(err: unknown): Response {
  const message = (err as Error)?.message ?? "INTERNAL_ERROR";
  if (message === "NOT_FOUND") return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  if (message === "FORBIDDEN") return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  if (message === "ASSET_NOT_SHAREABLE") {
    return Response.json({ error: "ASSET_NOT_SHAREABLE" }, { status: 409 });
  }
  return designErrorResponse(err);
}
