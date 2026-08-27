// Ticket 10 — Room Brief propose + confirm + stage run linkage.

import type { Env } from "@/lib/bindings";
import { FloorPlanError } from "@/lib/floor-plan/errors";
import { getRoomDesign, updateRoomMarker } from "@/lib/floor-plan/markers";
import {
  buildDesignProposal,
  questionnaireForRoomType,
  recognizeRoomRegion,
} from "@/lib/floor-plan/recognition";
import { rowToView, type RoomDesignRow } from "@/lib/floor-plan/rows";
import type { MarkerPosition, RoomBriefProposal, RoomDesignView } from "@/lib/floor-plan/types";

async function loadProjectSource(env: Env, projectId: string): Promise<string> {
  const project = await env.DB.prepare(`SELECT source_asset_id FROM projects WHERE id = ?1`)
    .bind(projectId)
    .first<{ source_asset_id: string | null }>();
  if (!project?.source_asset_id) {
    throw new FloorPlanError("NOT_FOUND", 404, "floor plan project has no source asset");
  }
  return project.source_asset_id;
}

/** Recognition proposes a Room Brief — free, not billed separately. */
export async function proposeRoomBrief(
  env: Env,
  userId: string,
  roomDesignId: string,
  options: { style?: string; stylePreference?: string; freeformRequirements?: string } = {}
): Promise<RoomBriefProposal> {
  const view = await getRoomDesign(env, userId, roomDesignId);
  const sourceAssetId = await loadProjectSource(env, view.projectId);
  const recognition = await recognizeRoomRegion(env, sourceAssetId, view.marker);

  const proposal: RoomBriefProposal = {
    recognition,
    style: options.style,
    stylePreference: options.stylePreference,
    questionnaire: questionnaireForRoomType(recognition.roomType),
    freeformRequirements: options.freeformRequirements,
    designProposal: buildDesignProposal(recognition, options.style),
  };

  const now = Date.now();
  await env.DB.prepare(
    `UPDATE room_designs
     SET recognition_json = ?2, proposal_json = ?3, updated_at = ?4
     WHERE id = ?1`
  )
    .bind(roomDesignId, JSON.stringify(recognition), JSON.stringify(proposal), now)
    .run();

  return proposal;
}

/** Confirm Room Brief — locks marker and gates Layout. */
export async function confirmRoomBrief(
  env: Env,
  userId: string,
  roomDesignId: string
): Promise<RoomDesignView> {
  const row = await env.DB.prepare(`SELECT * FROM room_designs WHERE id = ?1`)
    .bind(roomDesignId)
    .first<RoomDesignRow>();

  if (!row) throw new FloorPlanError("NOT_FOUND", 404);
  if (row.user_id !== userId) throw new FloorPlanError("FORBIDDEN", 403);
  if (!row.proposal_json) {
    throw new FloorPlanError("BRIEF_NOT_READY", 409, "propose or generate a room brief first");
  }

  const now = Date.now();
  await env.DB.prepare(
    `UPDATE room_designs
     SET marker_locked = 1, brief_confirmed_at = ?2, progress = 'analyzed', updated_at = ?2
     WHERE id = ?1`
  )
    .bind(roomDesignId, now)
    .run();

  await env.DB.prepare(
    `UPDATE floor_plan_stage_runs
     SET status = 'confirmed', confirmed_at = ?2, updated_at = ?2
     WHERE room_design_id = ?1 AND stage = 'brief' AND status = 'success'`
  )
    .bind(roomDesignId, now)
    .run();

  const updated = await env.DB.prepare(`SELECT * FROM room_designs WHERE id = ?1`)
    .bind(roomDesignId)
    .first<RoomDesignRow>();
  return rowToView(updated!);
}

export async function createBriefStageRun(
  env: Env,
  roomDesignId: string,
  designId: string
): Promise<void> {
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO floor_plan_stage_runs (id, room_design_id, stage, status, design_id, confirmed_at, created_at, updated_at)
     VALUES (?1, ?2, 'brief', 'processing', ?3, NULL, ?4, ?4)`
  )
    .bind(designId, roomDesignId, designId, now)
    .run();
}

export async function completeBriefStageRun(env: Env, designId: string): Promise<void> {
  const design = await env.DB.prepare(
    `SELECT id, config_json FROM designs WHERE id = ?1`
  )
    .bind(designId)
    .first<{ id: string; config_json: string }>();
  if (!design) return;

  let roomDesignId: string | undefined;
  try {
    const config = JSON.parse(design.config_json) as { intent?: { roomId?: string } };
    roomDesignId = config.intent?.roomId;
  } catch {
    return;
  }
  if (!roomDesignId) return;

  const row = await env.DB.prepare(`SELECT * FROM room_designs WHERE id = ?1`)
    .bind(roomDesignId)
    .first<RoomDesignRow>();
  if (!row) return;

  const sourceAssetId = await loadProjectSource(env, row.project_id);
  const marker: MarkerPosition = { x: row.marker_x, y: row.marker_y };
  const recognition = await recognizeRoomRegion(env, sourceAssetId, marker);
  const proposal: RoomBriefProposal = {
    recognition,
    questionnaire: questionnaireForRoomType(recognition.roomType),
    designProposal: buildDesignProposal(recognition),
  };

  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE floor_plan_stage_runs SET status = 'success', updated_at = ?2 WHERE design_id = ?1`
    ).bind(designId, now),
    env.DB.prepare(
      `UPDATE room_designs
       SET recognition_json = ?2, proposal_json = ?3, updated_at = ?4
       WHERE id = ?1`
    ).bind(roomDesignId, JSON.stringify(recognition), JSON.stringify(proposal), now),
  ]);
}

export async function assertLayoutStageAllowed(
  env: Env,
  userId: string,
  roomDesignId: string
): Promise<void> {
  const row = await env.DB.prepare(`SELECT user_id, brief_confirmed_at FROM room_designs WHERE id = ?1`)
    .bind(roomDesignId)
    .first<{ user_id: string; brief_confirmed_at: number | null }>();
  if (!row) throw new FloorPlanError("NOT_FOUND", 404);
  if (row.user_id !== userId) throw new FloorPlanError("FORBIDDEN", 403);
  if (!row.brief_confirmed_at) {
    throw new FloorPlanError("BRIEF_NOT_CONFIRMED", 409);
  }
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

export async function assertRoomDesignForBrief(
  env: Env,
  userId: string,
  roomDesignId: string,
  sourceAssetId: string,
  marker: MarkerPosition
): Promise<RoomDesignRow> {
  assertMarker(marker);
  const row = await loadOwnedRoomDesign(env, userId, roomDesignId);

  const project = await env.DB.prepare(`SELECT source_asset_id FROM projects WHERE id = ?1`)
    .bind(row.project_id)
    .first<{ source_asset_id: string | null }>();

  if (project?.source_asset_id !== sourceAssetId) {
    throw new FloorPlanError("PROJECT_SOURCE_MISMATCH", 409);
  }

  if (row.marker_locked) {
    throw new FloorPlanError("MARKER_LOCKED", 409, "brief already confirmed for this room design");
  }

  if (Math.abs(row.marker_x - marker.x) > 0.001 || Math.abs(row.marker_y - marker.y) > 0.001) {
    await updateRoomMarker(env, userId, roomDesignId, marker);
    return loadOwnedRoomDesign(env, userId, roomDesignId);
  }

  return row;
}
