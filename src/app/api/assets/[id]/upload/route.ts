import { authorizeVerified } from "@/lib/ai/http";

// Local development direct upload endpoint for R2 storage (when presigned S3 URLs are unavailable locally).
export async function PUT(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await authorizeVerified(request);
  if (auth instanceof Response) return auth;

  const { id } = await ctx.params;
  const row = await auth.env.DB.prepare(
    `SELECT id, storage_key, user_id FROM assets WHERE id = ?1`
  )
    .bind(id)
    .first<{ id: string; storage_key: string; user_id: string }>();

  if (!row) {
    return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  if (row.user_id !== auth.userId) {
    return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const bytes = await request.arrayBuffer();
  await auth.env.HD_PRIVATE.put(row.storage_key, bytes);

  return new Response(null, { status: 200 });
}
