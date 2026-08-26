import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createAuth, requireVerifiedUser, type AuthEnv } from "@/lib/auth/server";
import type { AssetLifecycle } from "@/lib/fixtures/images";

// `GET /api/assets/[id]` (ADR 0003 / Ticket 06 AC8).
// Authenticated (verified user only). Returns the Asset lifecycle so the
// `pending-upload → quarantined → ready | rejected` state machine is
// observable through the API.
//
// Response: { code:0, data:{ id, lifecycle, name, mimeType, width, height, createdAt } }

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const cf = await getCloudflareContext({ async: true });
  const env = cf.env as unknown as AuthEnv;
  const auth = createAuth(env);

  const session = await auth.api.getSession({ headers: request.headers });
  try {
    requireVerifiedUser(session);
  } catch (err) {
    return Response.json(
      { error: "EMAIL_NOT_VERIFIED" },
      { status: (err as { status?: number }).status ?? 403 }
    );
  }

  const { id } = await ctx.params;

  const row = await env.DB.prepare(
    `SELECT id, name, mime_type, lifecycle, width, height, created_at, user_id FROM assets WHERE id = ?1`
  ).bind(id).first<{
    id: string;
    name: string;
    mime_type: string;
    lifecycle: AssetLifecycle;
    width: number | null;
    height: number | null;
    created_at: number;
    user_id: string | null;
  }>();

  if (!row) {
    return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  if (row.user_id !== session!.user.id) {
    return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  }

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
    },
  });
}