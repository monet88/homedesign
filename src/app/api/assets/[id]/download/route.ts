import { authorizeVerified } from "@/lib/ai/http";
import { presignGetUrl, type PresignCredentials } from "@/lib/intake/presign";
import { getPrivateBucketName } from "@/lib/env/policy";
// `GET /api/assets/[id]/download` (ticket #14 AC5).
// Authenticated (verified user only). Authorizes ownership, then either:
//   1. Redirects to a short-lived R2 S3 presigned GET URL when credentials exist.
//   2. Streams the object bytes directly through the App Worker when running
//      without S3 credentials (local/dev), so the authorized download still works.
//
// The browser never receives a raw object key or an arbitrary URL.

const SIGNED_TTL_SEC = 600;

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authorizeVerified(request);
  if (auth instanceof Response) return auth;
  const env = auth.env;

  const { id } = await ctx.params;
  const userId = auth.userId;

  const row = await env.DB.prepare(
    `SELECT id, storage_key, mime_type, lifecycle, user_id FROM assets WHERE id = ?1`
  )
    .bind(id)
    .first<{ id: string; storage_key: string | null; mime_type: string; lifecycle: string; user_id: string | null }>();

  if (!row) {
    return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  if (row.user_id !== userId) {
    return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  if (row.lifecycle !== "ready" || !row.storage_key) {
    return Response.json(
      { error: "ASSET_NOT_READY", lifecycle: row.lifecycle },
      { status: 409 }
    );
  }

  const creds: PresignCredentials = {
    accountId: env.R2_ACCOUNT_ID ?? "",
    accessKeyId: env.R2_ACCESS_KEY_ID ?? "",
    secretAccessKey: env.R2_SECRET_ACCESS_KEY ?? "",
  };

  if (
    env.ENVIRONMENT !== "local" &&
    env.R2_ACCOUNT_ID !== "local-dev-account" &&
    creds.accountId &&
    creds.accessKeyId &&
    creds.secretAccessKey
  ) {
    const signed = await presignGetUrl(creds, {
      bucket: getPrivateBucketName(env),
      key: row.storage_key,
      expiresInSec: SIGNED_TTL_SEC,
    });
    return Response.redirect(signed.url, 302);
  }

  // Local/dev fallback: stream through the Worker so tests without S3
  // credentials still get an authorized download.
  const obj = await env.HD_PRIVATE.get(row.storage_key);
  if (!obj) {
    return Response.json({ error: "OBJECT_NOT_FOUND" }, { status: 404 });
  }
  const bytes = await obj.arrayBuffer();
  return new Response(bytes, {
    headers: {
      "Content-Type": row.mime_type,
      "Content-Disposition": `attachment; filename="${row.id}.png"`,
      "Cache-Control": "private, no-store",
    },
  });
}
