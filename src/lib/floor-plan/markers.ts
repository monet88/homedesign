// Ticket 10 — Room Marker placement and updates (ADR 0004).

import type { Env } from "@/lib/bindings";
import { FloorPlanError } from "@/lib/floor-plan/errors";
import { rowToView, type RoomDesignRow } from "@/lib/floor-plan/rows";
import type { MarkerPosition, RoomDesignView } from "@/lib/floor-plan/types";

function assertMarker(marker: MarkerPosition): void {
  const { x, y } = marker;
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 100 || y < 0 || y > 100) {
    throw new FloorPlanError("INVALID_MARKER", 400, "marker {x,y} must be within 0..100");
  }
}

async function loadOwnedProject(
  env: Env,
  userId: string,
  projectId: string
): Promise<{ id: string; source_asset_id: string | null }> {
  const project = await env.DB.prepare(
    `SELECT id, user_id, kind, source_asset_id FROM projects WHERE id = ?1`
  )
    .bind(projectId)
    .first<{ id: string; user_id: string; kind: string; source_asset_id: string | null }>();

  if (!project) throw new FloorPlanError("NOT_FOUND", 404, "project not found");
  if (project.user_id !== userId) throw new FloorPlanError("FORBIDDEN", 403);
  if (project.kind !== "floor-plan") {
    throw new FloorPlanError("NOT_FOUND", 404, "not a floor-plan project");
  }
  return project;
}

async function loadOwnedRoomDesign(env: Env, userId: string, roomDesignId: string): Promise<RoomDesignRow> {
  const row = await env.DB.prepare(`SELECT * FROM room_designs WHERE id = ?1`)
    .bind(roomDesignId)
    .first<RoomDesignRow>();
  if (!row) throw new FloorPlanError("NOT_FOUND", 404, "room design not found");
  if (row.user_id !== userId) throw new FloorPlanError("FORBIDDEN", 403);
  return row;
}

/** Place a new Room Marker — always creates a new Room Design. */
export async function placeRoomMarker(
  env: Env,
  userId: string,
  projectId: string,
  marker: MarkerPosition
): Promise<RoomDesignView> {
  assertMarker(marker);
  await loadOwnedProject(env, userId, projectId);

  const id = crypto.randomUUID();
  const markerId = crypto.randomUUID();
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO room_designs (
       id, project_id, user_id, marker_id, marker_x, marker_y, marker_locked,
       brief_confirmed_at, progress, recognition_json, proposal_json, created_at, updated_at
     ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, NULL, 'draft', NULL, NULL, ?7, ?7)`
  )
    .bind(id, projectId, userId, markerId, marker.x, marker.y, now)
    .run();

  const row = await loadOwnedRoomDesign(env, userId, id);
  return rowToView(row);
}

/** Update marker position — only before Room Brief is confirmed. */
export async function updateRoomMarker(
  env: Env,
  userId: string,
  roomDesignId: string,
  marker: MarkerPosition
): Promise<RoomDesignView> {
  assertMarker(marker);
  const existing = await loadOwnedRoomDesign(env, userId, roomDesignId);
  if (existing.marker_locked) {
    throw new FloorPlanError("MARKER_LOCKED", 409, "marker locked after brief confirm");
  }

  const now = Date.now();
  await env.DB.prepare(
    `UPDATE room_designs SET marker_x = ?2, marker_y = ?3, updated_at = ?4 WHERE id = ?1`
  )
    .bind(roomDesignId, marker.x, marker.y, now)
    .run();

  return rowToView(await loadOwnedRoomDesign(env, userId, roomDesignId));
}

export async function getRoomDesign(
  env: Env,
  userId: string,
  roomDesignId: string
): Promise<RoomDesignView> {
  return rowToView(await loadOwnedRoomDesign(env, userId, roomDesignId));
}

/** After brief confirm, a new position requires a new Room Design (new marker identity). */
export async function addNextRoomMarker(
  env: Env,
  userId: string,
  projectId: string,
  marker: MarkerPosition
): Promise<RoomDesignView> {
  return placeRoomMarker(env, userId, projectId, marker);
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

export function assertLayoutAllowed(row: RoomDesignRow): void {
  if (!row.brief_confirmed_at) {
    throw new FloorPlanError("BRIEF_NOT_CONFIRMED", 409, "confirm room brief before layout");
  }
}
