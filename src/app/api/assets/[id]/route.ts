import { getCloudflareContext } from "@opennextjs/cloudflare";
import { authorizeVerified } from "@/lib/ai/http";
import type { Env } from "@/lib/bindings";
import { countAssetProjectRefs, deleteOwnerAsset } from "@/lib/library/assets";

// `GET /api/assets/[id]` (ADR 0003 / Ticket 06 AC8 + Ticket 08 delete-warn).
// Authenticated (verified user only). Returns the Asset lifecycle + the number
// of Projects that reference it so the delete dialog can warn the user.
// Response: { code:0, data:{ id, lifecycle, name, mimeType, width, height, createdAt, refCount } }

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authorizeVerified(request);
  if (auth instanceof Response) return auth;

  const { id } = await ctx.params;

  const row = await auth.env.DB.prepare(
    `SELECT id, name, mime_type, lifecycle, width, height, created_at, user_id FROM assets WHERE id = ?1`
  )
    .bind(id)
    .first<{
      id: string;
      name: string;
      mime_type: string;
      lifecycle: string;
      width: number | null;
      height: number | null;
      created_at: number;
      user_id: string | null;
    }>();

  if (!row) {
    return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  if (row.user_id !== auth.userId) {
    return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const refCount = await countAssetProjectRefs(auth.env as unknown as Env, id);

  return Response.json({
    code: 0,
    data: {
      id: row.id,
      lifecycle: row.lifecycle,
      name: row.name,
      mimeType: row.mime_type,
      width: row.width,
      height: row.height,
      createdAt: row.created_at,
      refCount,
    },
  });
}

// `DELETE /api/assets/[id]` (ticket #08).
// Owner-only. Hides the Asset and starts the recovery window. Returns the
// number of Projects that referenced it so the UI can confirm the impact.
// Response: { code:0, data:{ id, refCount } }

export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authorizeVerified(request);
  if (auth instanceof Response) return auth;

  const { id } = await ctx.params;

  try {
    const result = await deleteOwnerAsset(auth.env as unknown as Env, auth.userId, id);
    return Response.json({ code: 0, data: result }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    const message = (err as Error).message;
    if (message === "NOT_FOUND") {
      return Response.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    if (message === "FORBIDDEN") {
      return Response.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    return Response.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
