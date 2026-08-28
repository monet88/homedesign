import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { Env } from "@/lib/bindings";
import { createProjectShare, setShareSelectedAssets } from "@/lib/library/share";

// Non-production fixture for Playwright share tests (ticket #09 seam 4).
// Seeds a project, ready generated asset (1×1 PNG in R2), share-selected row,
// and an active share token.

const PNG_1X1 = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
]);

export async function POST() {
  const cf = await getCloudflareContext({ async: true });
  const env = cf.env as unknown as Env;

  if (env.ENVIRONMENT === "production") {
    return Response.json({ error: "not found" }, { status: 404 });
  }

  const userId = crypto.randomUUID();
  const projectId = crypto.randomUUID();
  const assetId = crypto.randomUUID();
  const storageKey = `ready/e2e-share-${assetId}.png`;
  const now = Date.now();

  await env.HD_PRIVATE.put(storageKey, PNG_1X1, {
    httpMetadata: { contentType: "image/png" },
  });

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt)
       VALUES (?1, 'Share Fixture', ?2, 1, ?3, ?3)`
    ).bind(userId, `${userId}@fixture.local`, now),
    env.DB.prepare(
      `INSERT INTO projects (id, user_id, kind, name, status, source_asset_id, favorite, visibility, created_at, updated_at)
       VALUES (?1, ?2, 'interior', 'Fixture Living Room', 'draft', NULL, 0, 'private', ?3, ?3)`
    ).bind(projectId, userId, now),
    env.DB.prepare(
      `INSERT INTO assets (id, name, mime_type, size, lifecycle, storage_key, user_id,
         declared_size, actual_size, created_by, created_at, updated_at)
       VALUES (?1, 'fixture.png', 'image/png', ?2, 'ready', ?3, ?4, ?2, ?2, 'fixture', ?5, ?5)`
    ).bind(assetId, PNG_1X1.byteLength, storageKey, userId, now),
    env.DB.prepare(
      `INSERT INTO project_assets (project_id, asset_id, role, created_at) VALUES (?1, ?2, 'generated', ?3)`
    ).bind(projectId, assetId, now),
  ]);

  await setShareSelectedAssets(env, userId, projectId, [assetId]);
  const share = await createProjectShare(env, userId, projectId, { assetIds: [assetId] });

  return Response.json(
    { token: share.token, projectId, assetId },
    { headers: { "cache-control": "no-store" } }
  );
}
