// Ticket 15 — Layout/Render stage runs, gating, confirm, and derived lineage.

import type { Env } from "@/lib/bindings";
import { FloorPlanError } from "@/lib/floor-plan/errors";
import { assertLayoutAllowed } from "@/lib/floor-plan/markers";
import { rowToView, type RoomDesignRow } from "@/lib/floor-plan/rows";
import type { MarkerPosition, RoomBriefProposal, RoomDesignView } from "@/lib/floor-plan/types";
import type { FloorPlanStage } from "@/lib/ai/types";

export interface StageRunRow {
  id: string;
  room_design_id: string;
  stage: FloorPlanStage;
  status: string;
  design_id: string | null;
  confirmed_at: number | null;
  created_at: number;
  updated_at: number;
}

function assertMarker(marker: MarkerPosition): void {
  const { x, y } = marker;
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 100 || y < 0 || y > 100) {
    throw new FloorPlanError("INVALID_MARKER", 400, "marker {x,y} must be within 0..100");
  }
}

async function loadOwnedRoomDesign(env: Env, userId: string, roomDesignId: string): Promise<RoomDesignRow> {
  const row = await env.DB.prepare(`SELECT * FROM room_designs WHERE id = ?1`)
    .bind(roomDesignId)
    .first<RoomDesignRow>();
  if (!row) throw new FloorPlanError("NOT_FOUND", 404, "room design not found");
  if (row.user_id !== userId) throw new FloorPlanError("FORBIDDEN", 403);
  return row;
}

async function loadProjectSource(env: Env, projectId: string): Promise<string> {
  const project = await env.DB.prepare(`SELECT source_asset_id FROM projects WHERE id = ?1`)
    .bind(projectId)
    .first<{ source_asset_id: string | null }>();
  if (!project?.source_asset_id) {
    throw new FloorPlanError("NOT_FOUND", 404, "floor plan project has no source asset");
  }
  return project.source_asset_id;
}

export async function getStageRunByDesignId(env: Env, designId: string): Promise<StageRunRow | null> {
  const row = await env.DB.prepare(`SELECT * FROM floor_plan_stage_runs WHERE design_id = ?1`)
    .bind(designId)
    .first<StageRunRow>();
  return row ?? null;
}

/** Active confirmed run — latest confirm wins (ADR 0004 lineage). */
export async function getActiveConfirmedStageRun(
  env: Env,
  roomDesignId: string,
  stage: FloorPlanStage
): Promise<StageRunRow | null> {
  const row = await env.DB.prepare(
    `SELECT * FROM floor_plan_stage_runs
     WHERE room_design_id = ?1 AND stage = ?2 AND status = 'confirmed'
     ORDER BY confirmed_at DESC LIMIT 1`
  )
    .bind(roomDesignId, stage)
    .first<StageRunRow>();
  return row ?? null;
}

export async function assertNoProcessingRun(
  env: Env,
  roomDesignId: string,
  stage: FloorPlanStage
): Promise<void> {
  const busy = await env.DB.prepare(
    `SELECT 1 AS ok FROM floor_plan_stage_runs
     WHERE room_design_id = ?1 AND stage = ?2 AND status = 'processing' LIMIT 1`
  )
    .bind(roomDesignId, stage)
    .first<{ ok: number }>();
  if (busy?.ok) {
    throw new FloorPlanError("STAGE_PROCESSING", 409, `a ${stage} run is already processing`);
  }
}

export async function createStageRun(
  env: Env,
  roomDesignId: string,
  stage: FloorPlanStage,
  designId: string
): Promise<void> {
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO floor_plan_stage_runs (id, room_design_id, stage, status, design_id, confirmed_at, created_at, updated_at)
     VALUES (?1, ?2, ?3, 'processing', ?4, NULL, ?5, ?5)`
  )
    .bind(designId, roomDesignId, stage, designId, now)
    .run();
}

export async function completeStageRun(env: Env, designId: string): Promise<void> {
  const now = Date.now();
  await env.DB.prepare(
    `UPDATE floor_plan_stage_runs SET status = 'success', updated_at = ?2 WHERE design_id = ?1`
  )
    .bind(designId, now)
    .run();
}

export async function failStageRun(env: Env, designId: string): Promise<void> {
  const now = Date.now();
  await env.DB.prepare(
    `UPDATE floor_plan_stage_runs SET status = 'failed', updated_at = ?2
     WHERE design_id = ?1 AND status IN ('processing', 'draft')`
  )
    .bind(designId, now)
    .run();
}

/** Derived lineage — downstream stale after upstream replacement is confirmed (ADR 0004). */
export async function isStageRunStale(env: Env, stageRunId: string): Promise<boolean> {
  const run = await env.DB.prepare(`SELECT * FROM floor_plan_stage_runs WHERE id = ?1`)
    .bind(stageRunId)
    .first<StageRunRow>();
  if (!run || run.stage !== "render") return false;

  const design = await env.DB.prepare(`SELECT config_json FROM designs WHERE id = ?1`)
    .bind(run.design_id)
    .first<{ config_json: string }>();
  if (!design) return false;

  let layoutRunId: string | undefined;
  try {
    const config = JSON.parse(design.config_json) as { intent?: { layoutRunId?: string } };
    layoutRunId = config.intent?.layoutRunId;
  } catch {
    return false;
  }
  if (!layoutRunId) return false;

  const activeLayout = await getActiveConfirmedStageRun(env, run.room_design_id, "layout");
  if (!activeLayout) return false;
  return activeLayout.id !== layoutRunId;
}

export async function assertRenderStageAllowed(
  env: Env,
  userId: string,
  roomDesignId: string
): Promise<StageRunRow> {
  const row = await loadOwnedRoomDesign(env, userId, roomDesignId);
  assertLayoutAllowed(row);
  const layout = await getActiveConfirmedStageRun(env, roomDesignId, "layout");
  if (!layout) {
    throw new FloorPlanError("LAYOUT_NOT_CONFIRMED", 409, "confirm room layout before render");
  }
  return layout;
}

async function assertRoomDesignForStage(
  env: Env,
  userId: string,
  roomDesignId: string,
  sourceAssetId: string,
  marker: MarkerPosition
): Promise<RoomDesignRow> {
  assertMarker(marker);
  const row = await loadOwnedRoomDesign(env, userId, roomDesignId);
  const projectSource = await loadProjectSource(env, row.project_id);
  if (projectSource !== sourceAssetId) {
    throw new FloorPlanError("PROJECT_SOURCE_MISMATCH", 409);
  }
  if (Math.abs(row.marker_x - marker.x) > 0.001 || Math.abs(row.marker_y - marker.y) > 0.001) {
    throw new FloorPlanError("INVALID_MARKER", 409, "marker must match the locked room design");
  }
  return row;
}

export async function assertRoomDesignForLayout(
  env: Env,
  userId: string,
  roomDesignId: string,
  sourceAssetId: string,
  marker: MarkerPosition
): Promise<RoomDesignRow> {
  const row = await assertRoomDesignForStage(env, userId, roomDesignId, sourceAssetId, marker);
  assertLayoutAllowed(row);
  return row;
}

export async function assertRoomDesignForRender(
  env: Env,
  userId: string,
  roomDesignId: string,
  sourceAssetId: string,
  marker: MarkerPosition
): Promise<{ row: RoomDesignRow; layoutRun: StageRunRow }> {
  const row = await assertRoomDesignForStage(env, userId, roomDesignId, sourceAssetId, marker);
  const layoutRun = await assertRenderStageAllowed(env, userId, roomDesignId);
  return { row, layoutRun };
}

export function parseRoomProposal(row: RoomDesignRow): RoomBriefProposal | null {
  if (!row.proposal_json) return null;
  try {
    return JSON.parse(row.proposal_json) as RoomBriefProposal;
  } catch {
    return null;
  }
}

async function confirmStageRun(
  env: Env,
  userId: string,
  roomDesignId: string,
  stage: "layout" | "render",
  designId?: string
): Promise<RoomDesignView> {
  const row = await loadOwnedRoomDesign(env, userId, roomDesignId);

  let run: StageRunRow | null;
  if (designId) {
    run = await env.DB.prepare(
      `SELECT * FROM floor_plan_stage_runs WHERE design_id = ?1 AND room_design_id = ?2 AND stage = ?3`
    )
      .bind(designId, roomDesignId, stage)
      .first<StageRunRow>();
  } else {
    run = await env.DB.prepare(
      `SELECT * FROM floor_plan_stage_runs
       WHERE room_design_id = ?1 AND stage = ?2 AND status = 'success'
       ORDER BY updated_at DESC LIMIT 1`
    )
      .bind(roomDesignId, stage)
      .first<StageRunRow>();
  }

  if (!run) throw new FloorPlanError("NOT_FOUND", 404, `${stage} run not found`);
  if (run.status !== "success") {
    throw new FloorPlanError("STAGE_NOT_READY", 409, `${stage} run is not successful`);
  }

  const now = Date.now();
  const progress = stage === "layout" ? "layout-ready" : "render-ready";
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE floor_plan_stage_runs SET status = 'confirmed', confirmed_at = ?2, updated_at = ?2 WHERE id = ?1`
    ).bind(run.id, now),
    env.DB.prepare(`UPDATE room_designs SET progress = ?2, updated_at = ?3 WHERE id = ?1`).bind(
      roomDesignId,
      progress,
      now
    ),
  ]);

  return rowToView(await loadOwnedRoomDesign(env, userId, roomDesignId));
}

export async function confirmRoomLayout(
  env: Env,
  userId: string,
  roomDesignId: string,
  designId?: string
): Promise<RoomDesignView> {
  return confirmStageRun(env, userId, roomDesignId, "layout", designId);
}

export async function confirmRoomRender(
  env: Env,
  userId: string,
  roomDesignId: string,
  designId?: string
): Promise<RoomDesignView> {
  return confirmStageRun(env, userId, roomDesignId, "render", designId);
}

/** Restore a previous successful run as current lineage (ADR 0004 US 43). Old runs stay in history. */
export async function restoreStageRun(
  env: Env,
  userId: string,
  stageRunId: string
): Promise<RoomDesignView> {
  const run = await env.DB.prepare(`SELECT * FROM floor_plan_stage_runs WHERE id = ?1`)
    .bind(stageRunId)
    .first<StageRunRow>();
  if (!run) throw new FloorPlanError("NOT_FOUND", 404, "stage run not found");
  if (run.stage !== "layout" && run.stage !== "render") {
    throw new FloorPlanError("STAGE_NOT_READY", 409, "only layout and render runs can be restored");
  }
  if (run.status !== "success" && run.status !== "confirmed") {
    throw new FloorPlanError("STAGE_NOT_READY", 409, "only successful runs can be restored");
  }

  await loadOwnedRoomDesign(env, userId, run.room_design_id);

  const now = Date.now();
  const progress = run.stage === "layout" ? "layout-ready" : "render-ready";
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE floor_plan_stage_runs SET status = 'confirmed', confirmed_at = ?2, updated_at = ?2 WHERE id = ?1`
    ).bind(run.id, now),
    env.DB.prepare(`UPDATE room_designs SET progress = ?2, updated_at = ?3 WHERE id = ?1`).bind(
      run.room_design_id,
      progress,
      now
    ),
  ]);

  return rowToView(await loadOwnedRoomDesign(env, userId, run.room_design_id));
}
