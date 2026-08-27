// Ticket 09 — Unlisted read-only project sharing (ADR 0005).

import type { Env } from "@/lib/bindings";
import { presignGetUrl, type PresignCredentials } from "@/lib/intake/presign";
import { getActiveConfirmedStageRun, isStageRunStale } from "@/lib/floor-plan/stages";

const PRIVATE_BUCKET = "homedesign-private";
const SHARE_DELIVERY_TTL_SEC = 600;

export interface ShareViewAsset {
  id: string;
  mimeType: string;
}

export interface ShareView {
  name: string;
  kind: string;
  updatedAt: number;
  assets: ShareViewAsset[];
}

export interface CreateShareResult {
  shareId: string;
  token: string;
  expiresAt: number | null;
}

/** Opaque high-entropy share token (returned once at creation). */
export function generateShareToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const binary = Array.from(bytes, (b) => String.fromCharCode(b)).join("");
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** SHA-256 hex digest — stored server-side instead of the plaintext secret. */
export async function digestShareToken(token: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function requireOwnedProject(env: Env, userId: string, projectId: string) {
  const row = await env.DB.prepare(
    `SELECT id, user_id, status, kind FROM projects WHERE id = ?1`
  )
    .bind(projectId)
    .first<{ id: string; user_id: string; status: string; kind: string }>();
  if (!row) throw new Error("NOT_FOUND");
  if (row.user_id !== userId) throw new Error("FORBIDDEN");
  return row;
}

export async function createProjectShare(
  env: Env,
  userId: string,
  projectId: string,
  options: { expiresAt?: number | null; assetIds?: string[] } = {}
): Promise<CreateShareResult> {
  await requireOwnedProject(env, userId, projectId);

  const token = generateShareToken();
  const tokenDigest = await digestShareToken(token);
  const shareId = crypto.randomUUID();
  const now = Date.now();

  await env.DB.batch([
    env.DB.prepare(
      `UPDATE project_shares SET revoked_at = ?2 WHERE project_id = ?1 AND revoked_at IS NULL`
    ).bind(projectId, now),
    env.DB.prepare(
      `UPDATE projects SET visibility = 'unlisted', updated_at = ?2 WHERE id = ?1 AND user_id = ?3`
    ).bind(projectId, now, userId),
    env.DB.prepare(
      `INSERT INTO project_shares (id, project_id, token_digest, expires_at, revoked_at, created_at)
       VALUES (?1, ?2, ?3, ?4, NULL, ?5)`
    ).bind(shareId, projectId, tokenDigest, options.expiresAt ?? null, now),
  ]);

  if (options.assetIds?.length) {
    await setShareSelectedAssets(env, userId, projectId, options.assetIds);
  }

  return { shareId, token, expiresAt: options.expiresAt ?? null };
}

export async function revokeProjectShare(env: Env, userId: string, projectId: string): Promise<void> {
  await requireOwnedProject(env, userId, projectId);
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE project_shares SET revoked_at = ?2 WHERE project_id = ?1 AND revoked_at IS NULL`
    ).bind(projectId, now),
    env.DB.prepare(
      `UPDATE projects SET visibility = 'private', updated_at = ?2 WHERE id = ?1 AND user_id = ?3`
    ).bind(projectId, now, userId),
  ]);
}

export async function setProjectVisibility(
  env: Env,
  userId: string,
  projectId: string,
  visibility: "private" | "unlisted"
): Promise<void> {
  await requireOwnedProject(env, userId, projectId);
  const now = Date.now();
  if (visibility === "private") {
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE project_shares SET revoked_at = ?2 WHERE project_id = ?1 AND revoked_at IS NULL`
      ).bind(projectId, now),
      env.DB.prepare(
        `UPDATE projects SET visibility = 'private', updated_at = ?2 WHERE id = ?1 AND user_id = ?3`
      ).bind(projectId, now, userId),
    ]);
    return;
  }
  await env.DB.prepare(
    `UPDATE projects SET visibility = ?3, updated_at = ?4 WHERE id = ?1 AND user_id = ?2`
  )
    .bind(projectId, userId, visibility, now)
    .run();
}

export async function isFloorPlanAssetActive(
  env: Env,
  projectId: string,
  assetId: string
): Promise<boolean> {
  const design = await env.DB.prepare(
    `SELECT d.id AS design_id, d.stage AS design_stage,
            sr.id AS stage_run_id, sr.room_design_id, sr.stage AS run_stage,
            sr.status AS run_status
     FROM designs d
     LEFT JOIN floor_plan_stage_runs sr ON (sr.design_id = d.id OR sr.id = d.id)
     WHERE d.project_id = ?1 AND d.output_asset_id = ?2`
  )
    .bind(projectId, assetId)
    .first<{
      design_id: string;
      design_stage: string | null;
      stage_run_id: string | null;
      room_design_id: string | null;
      run_stage: string | null;
      run_status: string | null;
    }>();

  if (!design || !design.stage_run_id || !design.room_design_id) {
    return false;
  }

  const roomDesign = await env.DB.prepare(
    `SELECT id, project_id, brief_confirmed_at FROM room_designs WHERE id = ?1`
  )
    .bind(design.room_design_id)
    .first<{ id: string; project_id: string; brief_confirmed_at: number | null }>();

  if (!roomDesign || roomDesign.project_id !== projectId || !roomDesign.brief_confirmed_at) {
    return false;
  }

  const stage = design.run_stage ?? design.design_stage;

  if (stage === "layout") {
    if (design.run_status !== "confirmed") return false;
    const activeLayout = await getActiveConfirmedStageRun(env, design.room_design_id, "layout");
    return activeLayout !== null && activeLayout.id === design.stage_run_id;
  }

  if (stage === "render") {
    if (design.run_status !== "confirmed") return false;
    const activeRender = await getActiveConfirmedStageRun(env, design.room_design_id, "render");
    if (!activeRender || activeRender.id !== design.stage_run_id) return false;
    const stale = await isStageRunStale(env, design.stage_run_id);
    return !stale;
  }

  if (stage === "panorama") {
    if (design.run_status !== "success" && design.run_status !== "confirmed") return false;
    const stale = await isStageRunStale(env, design.stage_run_id);
    return !stale;
  }

  return false;
}

export async function setShareSelectedAssets(
  env: Env,
  userId: string,
  projectId: string,
  assetIds: string[]
): Promise<void> {
  const project = await requireOwnedProject(env, userId, projectId);

  const uniqueAssetIds = Array.from(new Set(assetIds));

  for (const assetId of uniqueAssetIds) {
    const asset = await env.DB.prepare(
      `SELECT a.id, a.lifecycle, a.user_id, a.storage_key,
              EXISTS (
                SELECT 1 FROM project_assets pa
                WHERE pa.project_id = ?2 AND pa.asset_id = a.id AND pa.role = 'generated'
              ) AS is_generated
       FROM assets a WHERE a.id = ?1`
    )
      .bind(assetId, projectId)
      .first<{ id: string; lifecycle: string; user_id: string | null; storage_key: string | null; is_generated: number }>();

    if (!asset || asset.user_id !== userId) throw new Error("FORBIDDEN");
    if (asset.lifecycle !== "ready" || !asset.storage_key || !asset.is_generated) {
      throw new Error("ASSET_NOT_SHAREABLE");
    }

    if (project.kind === "floor-plan") {
      const active = await isFloorPlanAssetActive(env, projectId, assetId);
      if (!active) {
        throw new Error("ASSET_NOT_SHAREABLE");
      }
    }
  }

  const now = Date.now();
  await env.DB.prepare(
    `DELETE FROM project_assets WHERE project_id = ?1 AND role = 'share-selected'`
  )
    .bind(projectId)
    .run();

  for (const assetId of uniqueAssetIds) {
    await env.DB.prepare(
      `INSERT INTO project_assets (project_id, asset_id, role, created_at)
       VALUES (?1, ?2, 'share-selected', ?3)`
    )
      .bind(projectId, assetId, now)
      .run();
  }
}

export async function clearShareSelectedForAsset(env: Env, assetId: string): Promise<void> {
  await env.DB.prepare(`DELETE FROM project_assets WHERE asset_id = ?1 AND role = 'share-selected'`)
    .bind(assetId)
    .run();
}

export async function softDeleteProject(env: Env, userId: string, projectId: string): Promise<void> {
  await requireOwnedProject(env, userId, projectId);
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE project_shares SET revoked_at = ?2 WHERE project_id = ?1 AND revoked_at IS NULL`
    ).bind(projectId, now),
    env.DB.prepare(
      `DELETE FROM project_assets WHERE project_id = ?1 AND role = 'share-selected'`
    ).bind(projectId),
    env.DB.prepare(
      `UPDATE projects SET status = 'deleted', visibility = 'private', updated_at = ?2 WHERE id = ?1 AND user_id = ?3`
    ).bind(projectId, now, userId),
  ]);
}

export async function restoreProject(env: Env, userId: string, projectId: string): Promise<void> {
  const row = await env.DB.prepare(`SELECT id, user_id, status FROM projects WHERE id = ?1`)
    .bind(projectId)
    .first<{ id: string; user_id: string; status: string }>();
  if (!row) throw new Error("NOT_FOUND");
  if (row.user_id !== userId) throw new Error("FORBIDDEN");
  if (row.status !== "deleted") return;

  const now = Date.now();
  await env.DB.prepare(
    `UPDATE projects SET status = 'draft', visibility = 'private', updated_at = ?2 WHERE id = ?1`
  )
    .bind(projectId, now)
    .run();
}

export async function restoreOwnerAsset(env: Env, userId: string, assetId: string): Promise<void> {
  const row = await env.DB.prepare(`SELECT id, user_id, lifecycle FROM assets WHERE id = ?1`)
    .bind(assetId)
    .first<{ id: string; user_id: string | null; lifecycle: string }>();
  if (!row) throw new Error("NOT_FOUND");
  if (row.user_id !== userId) throw new Error("FORBIDDEN");
  if (row.lifecycle !== "deleted") return;

  const now = Date.now();
  await env.DB.prepare(
    `UPDATE assets SET lifecycle = 'ready', deleted_at = NULL, recovery_until = NULL, updated_at = ?2 WHERE id = ?1`
  )
    .bind(assetId, now)
    .run();
}

interface ResolvedShare {
  shareId: string;
  projectId: string;
  projectName: string;
  projectKind: string;
  projectUpdatedAt: number;
}

async function resolveActiveShare(env: Env, token: string): Promise<ResolvedShare | null> {
  const digest = await digestShareToken(token);
  const now = Date.now();
  const row = await env.DB.prepare(
    `SELECT ps.id AS share_id, p.id AS project_id, p.name, p.kind, p.updated_at, p.visibility, p.status
     FROM project_shares ps
     JOIN projects p ON p.id = ps.project_id
     WHERE ps.token_digest = ?1
       AND ps.revoked_at IS NULL
       AND (ps.expires_at IS NULL OR ps.expires_at > ?2)
       AND p.visibility = 'unlisted'
       AND p.status != 'deleted'`
  )
    .bind(digest, now)
    .first<{
      share_id: string;
      project_id: string;
      name: string;
      kind: string;
      updated_at: number;
      visibility: string;
      status: string;
    }>();

  if (!row) return null;
  return {
    shareId: row.share_id,
    projectId: row.project_id,
    projectName: row.name,
    projectKind: row.kind,
    projectUpdatedAt: row.updated_at,
  };
}

export async function getShareViewByToken(env: Env, token: string): Promise<ShareView | null> {
  const share = await resolveActiveShare(env, token);
  if (!share) return null;

  const assetsResult = await env.DB.prepare(
    `SELECT a.id, a.mime_type
     FROM project_assets pa_share
     JOIN project_assets pa_gen
       ON pa_gen.project_id = pa_share.project_id
      AND pa_gen.role = 'generated'
      AND pa_gen.asset_id = pa_share.asset_id
     JOIN assets a ON a.id = pa_share.asset_id
     WHERE pa_share.project_id = ?1
       AND pa_share.role = 'share-selected'
       AND a.lifecycle = 'ready'
       AND a.storage_key IS NOT NULL`
  )
    .bind(share.projectId)
    .all<{ id: string; mime_type: string }>();

  const rawAssets = assetsResult.results ?? [];
  const validAssets: ShareViewAsset[] = [];

  for (const row of rawAssets) {
    if (share.projectKind === "floor-plan") {
      const active = await isFloorPlanAssetActive(env, share.projectId, row.id);
      if (!active) continue;
    }
    validAssets.push({
      id: row.id,
      mimeType: row.mime_type,
    });
  }

  return {
    name: share.projectName,
    kind: share.projectKind,
    updatedAt: share.projectUpdatedAt,
    assets: validAssets,
  };
}

export async function authorizeShareAssetDelivery(
  env: Env,
  token: string,
  assetId: string
): Promise<{ storageKey: string; mimeType: string } | null> {
  const share = await resolveActiveShare(env, token);
  if (!share) return null;

  const row = await env.DB.prepare(
    `SELECT a.storage_key, a.mime_type
     FROM project_assets pa_share
     JOIN project_assets pa_gen
       ON pa_gen.project_id = pa_share.project_id
      AND pa_gen.role = 'generated'
      AND pa_gen.asset_id = pa_share.asset_id
     JOIN assets a ON a.id = pa_share.asset_id
     WHERE pa_share.project_id = ?1
       AND pa_share.asset_id = ?2
       AND pa_share.role = 'share-selected'
       AND a.lifecycle = 'ready'
       AND a.storage_key IS NOT NULL`
  )
    .bind(share.projectId, assetId)
    .first<{ storage_key: string; mime_type: string }>();

  if (!row?.storage_key) return null;

  if (share.projectKind === "floor-plan") {
    const active = await isFloorPlanAssetActive(env, share.projectId, assetId);
    if (!active) return null;
  }

  return { storageKey: row.storage_key, mimeType: row.mime_type };
}

export async function deliverShareAsset(
  env: Env,
  token: string,
  assetId: string
): Promise<Response | null> {
  const authorized = await authorizeShareAssetDelivery(env, token, assetId);
  if (!authorized) return null;

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
      bucket: PRIVATE_BUCKET,
      key: authorized.storageKey,
      expiresInSec: SHARE_DELIVERY_TTL_SEC,
    });
    return Response.redirect(signed.url, 302);
  }

  const obj = await env.HD_PRIVATE.get(authorized.storageKey);
  if (!obj) return null;
  const bytes = await obj.arrayBuffer();
  return new Response(bytes, {
    headers: {
      "Content-Type": authorized.mimeType,
      "Content-Disposition": "inline",
      "Cache-Control": "private, no-store",
    },
  });
}
