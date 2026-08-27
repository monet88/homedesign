import type { Env } from "@/lib/bindings";
import { FloorPlanError } from "@/lib/floor-plan/errors";
import type { FloorPlanProjectView } from "@/lib/floor-plan/types";

async function authorizeReadySource(
  env: Env,
  userId: string,
  sourceAssetId: string
): Promise<void> {
  const asset = await env.DB.prepare(
    `SELECT id, user_id, lifecycle, storage_key FROM assets WHERE id = ?1`
  ).bind(sourceAssetId).first<{
    id: string;
    user_id: string | null;
    lifecycle: string;
    storage_key: string | null;
  }>();

  if (!asset) throw new FloorPlanError("ASSET_NOT_FOUND", 404);
  if (asset.user_id !== userId) throw new FloorPlanError("FORBIDDEN", 403);
  if (asset.lifecycle !== "ready" || !asset.storage_key) {
    throw new FloorPlanError("SOURCE_ASSET_NOT_READY", 409, `asset lifecycle is ${asset.lifecycle}`);
  }
}

/** Create or return FloorPlanProject bound to exactly one ready source. */
export async function createFloorPlanProject(
  env: Env,
  userId: string,
  sourceAssetId: string
): Promise<FloorPlanProjectView> {
  await authorizeReadySource(env, userId, sourceAssetId);

  const existing = await env.DB.prepare(
    `SELECT id FROM projects WHERE user_id = ?1 AND kind = 'floor-plan' AND source_asset_id = ?2`
  ).bind(userId, sourceAssetId).first<{ id: string }>();

  if (existing) {
    return { id: existing.id, sourceAssetId, created: false };
  }

  const projectId = crypto.randomUUID();
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO projects (id, user_id, kind, name, status, source_asset_id, created_at, updated_at)
     VALUES (?1, ?2, 'floor-plan', 'Floor plan', 'draft', ?3, ?4, ?4)`
  ).bind(projectId, userId, sourceAssetId, now).run();

  await env.DB.prepare(
    `INSERT OR IGNORE INTO project_assets (project_id, asset_id, role, created_at)
     VALUES (?1, ?2, 'source', ?3)`
  ).bind(projectId, sourceAssetId, now).run();

  return { id: projectId, sourceAssetId, created: true };
}
