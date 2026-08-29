// Ticket 64 & 65 — Floor Plan lineage query boundary & batch resolution (ADR 0004 / Spec #63).

import type { Env } from "@/lib/bindings";

export interface FloorPlanOutputRef {
  projectId: string;
  assetId: string;
}

interface StageRunInfo {
  id: string;
  roomDesignId: string;
  stage: string;
  status: string;
  confirmedAt: number | null;
  configJson: string | null;
}

function parseUpstreamRunId(
  stage: string,
  configJson: string | null
): string | undefined {
  if (!configJson) return undefined;
  try {
    const parsed = JSON.parse(configJson) as {
      intent?: { layoutRunId?: string; renderRunId?: string };
    };
    if (stage === "render") {
      return parsed.intent?.layoutRunId;
    }
    if (stage === "panorama") {
      return parsed.intent?.renderRunId;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

/**
 * Resolves which candidate Floor Plan output Asset identifiers belong to the
 * active lineage of a Floor Plan project (ADR 0004 / Spec #63).
 *
 * Semantic contract:
 * - The Asset must resolve to a Floor Plan Stage Run belonging to the requested Project
 *   and Room Design with a confirmed Room Brief.
 * - Layout output is active iff its run status is 'confirmed' and it is the active confirmed Layout run.
 * - Render output is active iff its run status is 'confirmed', it is the active confirmed Render run,
 *   and it is not stale relative to upstream Layout lineage.
 * - Panorama output is active iff its run status is 'success' or 'confirmed', and it is not stale
 *   relative to upstream Render and Layout lineage.
 * - Unresolved, unsupported, or mismatched stages are inactive.
 */
export async function resolveActiveFloorPlanOutputAssetIds(
  env: Env,
  projectId: string,
  candidateAssetIds: string[]
): Promise<Set<string>> {
  const uniqueAssetIds = Array.from(
    new Set(candidateAssetIds.filter((id) => typeof id === "string" && id.length > 0))
  );
  if (uniqueAssetIds.length === 0) {
    return new Set<string>();
  }

  // 1. Fetch candidate designs and their associated stage runs for this project
  const inPlaceholders = uniqueAssetIds.map((_, idx) => `?${idx + 2}`).join(", ");
  const candidateRows = await env.DB.prepare(
    `SELECT d.id AS design_id, d.output_asset_id, d.stage AS design_stage, d.config_json,
            sr.id AS stage_run_id, sr.room_design_id, sr.stage AS run_stage,
            sr.status AS run_status
     FROM designs d
     LEFT JOIN floor_plan_stage_runs sr ON (sr.design_id = d.id OR sr.id = d.id)
     WHERE d.project_id = ?1 AND d.output_asset_id IN (${inPlaceholders})`
  )
    .bind(projectId, ...uniqueAssetIds)
    .all<{
      design_id: string;
      output_asset_id: string | null;
      design_stage: string | null;
      config_json: string | null;
      stage_run_id: string | null;
      room_design_id: string | null;
      run_stage: string | null;
      run_status: string | null;
    }>();

  const validCandidates = (candidateRows.results ?? []).filter(
    (row) => row.output_asset_id && row.stage_run_id && row.room_design_id
  );
  if (validCandidates.length === 0) {
    return new Set<string>();
  }

  // 2. Validate Room Designs (must belong to projectId and have brief_confirmed_at)
  const roomDesignIds = Array.from(
    new Set(validCandidates.map((r) => r.room_design_id as string))
  );
  const roomInPlaceholders = roomDesignIds.map((_, idx) => `?${idx + 2}`).join(", ");
  const roomRows = await env.DB.prepare(
    `SELECT id, project_id, brief_confirmed_at
     FROM room_designs
     WHERE project_id = ?1 AND id IN (${roomInPlaceholders})`
  )
    .bind(projectId, ...roomDesignIds)
    .all<{ id: string; project_id: string; brief_confirmed_at: number | null }>();

  const confirmedBriefRoomIds = new Set<string>();
  for (const row of roomRows.results ?? []) {
    if (row.project_id === projectId && row.brief_confirmed_at) {
      confirmedBriefRoomIds.add(row.id);
    }
  }
  if (confirmedBriefRoomIds.size === 0) {
    return new Set<string>();
  }

  // 3. Load all stage runs (and design config_json) for these valid room designs
  const validRoomIds = Array.from(confirmedBriefRoomIds);
  const validRoomInPlaceholders = validRoomIds.map((_, idx) => `?${idx + 1}`).join(", ");
  const allStageRuns = await env.DB.prepare(
    `SELECT sr.id, sr.room_design_id, sr.stage, sr.status, sr.design_id, sr.confirmed_at,
            d.config_json
     FROM floor_plan_stage_runs sr
     LEFT JOIN designs d ON (d.id = sr.design_id OR d.id = sr.id)
     WHERE sr.room_design_id IN (${validRoomInPlaceholders})`
  )
    .bind(...validRoomIds)
    .all<{
      id: string;
      room_design_id: string;
      stage: string;
      status: string;
      design_id: string | null;
      confirmed_at: number | null;
      config_json: string | null;
    }>();

  const runsById = new Map<string, StageRunInfo>();
  const activeConfirmedLayoutByRoom = new Map<string, StageRunInfo>();
  const activeConfirmedRenderByRoom = new Map<string, StageRunInfo>();

  for (const row of allStageRuns.results ?? []) {
    const info: StageRunInfo = {
      id: row.id,
      roomDesignId: row.room_design_id,
      stage: row.stage,
      status: row.status,
      confirmedAt: row.confirmed_at,
      configJson: row.config_json,
    };
    runsById.set(row.id, info);

    if (row.status === "confirmed" && row.confirmed_at !== null) {
      if (row.stage === "layout") {
        const current = activeConfirmedLayoutByRoom.get(row.room_design_id);
        if (!current || (current.confirmedAt ?? 0) < row.confirmed_at) {
          activeConfirmedLayoutByRoom.set(row.room_design_id, info);
        }
      } else if (row.stage === "render") {
        const current = activeConfirmedRenderByRoom.get(row.room_design_id);
        if (!current || (current.confirmedAt ?? 0) < row.confirmed_at) {
          activeConfirmedRenderByRoom.set(row.room_design_id, info);
        }
      }
    }
  }

  function isRenderRunStaleInMemory(renderRun: StageRunInfo): boolean {
    const activeLayout = activeConfirmedLayoutByRoom.get(renderRun.roomDesignId);
    if (!activeLayout) return true;
    const upstreamLayoutRunId = parseUpstreamRunId("render", renderRun.configJson);
    if (!upstreamLayoutRunId) return true;
    return activeLayout.id !== upstreamLayoutRunId;
  }

  function isPanoramaRunStaleInMemory(panoramaRun: StageRunInfo): boolean {
    const activeRender = activeConfirmedRenderByRoom.get(panoramaRun.roomDesignId);
    if (!activeRender) return true;
    const upstreamRenderRunId = parseUpstreamRunId("panorama", panoramaRun.configJson);
    if (!upstreamRenderRunId) return true;
    if (activeRender.id !== upstreamRenderRunId) return true;
    return isRenderRunStaleInMemory(activeRender);
  }

  const activeAssetIds = new Set<string>();

  for (const candidate of validCandidates) {
    const assetId = candidate.output_asset_id!;
    const roomDesignId = candidate.room_design_id!;
    if (!confirmedBriefRoomIds.has(roomDesignId)) continue;

    const stage = candidate.run_stage ?? candidate.design_stage;
    const runStatus = candidate.run_status;
    const stageRunId = candidate.stage_run_id!;

    if (stage === "layout") {
      if (runStatus !== "confirmed") continue;
      const activeLayout = activeConfirmedLayoutByRoom.get(roomDesignId);
      if (activeLayout && activeLayout.id === stageRunId) {
        activeAssetIds.add(assetId);
      }
    } else if (stage === "render") {
      if (runStatus !== "confirmed") continue;
      const activeRender = activeConfirmedRenderByRoom.get(roomDesignId);
      if (!activeRender || activeRender.id !== stageRunId) continue;
      const runInfo = runsById.get(stageRunId);
      if (runInfo && !isRenderRunStaleInMemory(runInfo)) {
        activeAssetIds.add(assetId);
      }
    } else if (stage === "panorama") {
      if (runStatus !== "success" && runStatus !== "confirmed") continue;
      const runInfo = runsById.get(stageRunId);
      if (runInfo && !isPanoramaRunStaleInMemory(runInfo)) {
        activeAssetIds.add(assetId);
      }
    }
  }

  return activeAssetIds;
}

/**
 * Single-output Floor Plan lineage query (ADR 0004 / Spec #63).
 */
export async function isFloorPlanOutputActive(
  env: Env,
  target: FloorPlanOutputRef | string,
  maybeAssetId?: string
): Promise<boolean> {
  const { projectId, assetId } =
    typeof target === "string" ? { projectId: target, assetId: maybeAssetId! } : target;
  if (!projectId || !assetId) return false;
  const activeSet = await resolveActiveFloorPlanOutputAssetIds(env, projectId, [assetId]);
  return activeSet.has(assetId);
}
