// Ticket 16 — Project Overview + resume payload derived from Room Designs (ADR 0004).

import type { Env } from "@/lib/bindings";
import { FloorPlanError } from "@/lib/floor-plan/errors";
import { rowToView, type RoomDesignRow } from "@/lib/floor-plan/rows";
import {
  getActiveConfirmedStageRun,
  isStageRunStale,
  type StageRunRow,
} from "@/lib/floor-plan/stages";
import type {
  FloorPlanProjectDetailView,
  PanoramaOrientationView,
  ProjectOverview,
  RoomDesignDetailView,
  StageRunView,
} from "@/lib/floor-plan/types";
import type { FloorPlanIntent } from "@/lib/ai/types";

async function loadOwnedFloorPlanProject(
  env: Env,
  userId: string,
  projectId: string
): Promise<{ id: string; source_asset_id: string }> {
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
  if (!project.source_asset_id) {
    throw new FloorPlanError("NOT_FOUND", 404, "floor plan project has no source asset");
  }
  return { id: project.id, source_asset_id: project.source_asset_id };
}

async function loadRoomDesignRows(env: Env, projectId: string): Promise<RoomDesignRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT * FROM room_designs WHERE project_id = ?1 ORDER BY updated_at DESC`
  )
    .bind(projectId)
    .all<RoomDesignRow>();
  return results ?? [];
}

async function loadStageRunRows(env: Env, roomDesignId: string): Promise<StageRunRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT * FROM floor_plan_stage_runs
     WHERE room_design_id = ?1
     ORDER BY created_at DESC`
  )
    .bind(roomDesignId)
    .all<StageRunRow>();
  return results ?? [];
}

async function rowToStageRunView(env: Env, row: StageRunRow): Promise<StageRunView> {
  const stale =
    row.stage === "render" || row.stage === "panorama"
      ? await isStageRunStale(env, row.id)
      : false;

  let outputAssetId: string | null = null;
  let panoramaOrientation: PanoramaOrientationView | null = null;

  if (row.design_id) {
    const design = await env.DB.prepare(
      `SELECT output_asset_id, config_json FROM designs WHERE id = ?1`
    )
      .bind(row.design_id)
      .first<{ output_asset_id: string | null; config_json: string }>();

    if (design?.output_asset_id) {
      const asset = await env.DB.prepare(`SELECT lifecycle FROM assets WHERE id = ?1`)
        .bind(design.output_asset_id)
        .first<{ lifecycle: string }>();
      if (asset?.lifecycle === "ready") outputAssetId = design.output_asset_id;
    }

    if (row.stage === "panorama" && design?.config_json) {
      try {
        const config = JSON.parse(design.config_json) as { intent?: FloorPlanIntent };
        const o = config.intent?.panoramaOrientation;
        if (o) panoramaOrientation = { yaw: o.yaw, pitch: o.pitch, hfov: o.hfov };
      } catch {
        /* ignore malformed config */
      }
    }
  }

  return {
    id: row.id,
    stage: row.stage,
    status: row.status as StageRunView["status"],
    designId: row.design_id,
    outputAssetId,
    panoramaOrientation,
    confirmedAt: row.confirmed_at,
    stale,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Room complete when active confirmed render exists (panorama optional / #11). */
export async function isRoomDesignComplete(env: Env, roomDesignId: string): Promise<boolean> {
  const render = await getActiveConfirmedStageRun(env, roomDesignId, "render");
  return render !== null;
}

/** Derive overview counters from Room Designs — no global state machine (ADR 0004). */
export async function deriveProjectOverview(
  env: Env,
  rooms: RoomDesignRow[]
): Promise<ProjectOverview> {
  const markedAreas = rooms.length;
  let completeRooms = 0;
  let currentRoomId: string | null = null;

  for (const room of rooms) {
    if (await isRoomDesignComplete(env, room.id)) {
      completeRooms += 1;
    }
  }

  for (const room of rooms) {
    if (!(await isRoomDesignComplete(env, room.id))) {
      currentRoomId = room.id;
      break;
    }
  }

  return { markedAreas, completeRooms, currentRoomId };
}

export async function getFloorPlanProjectDetail(
  env: Env,
  userId: string,
  projectId: string
): Promise<FloorPlanProjectDetailView> {
  const project = await loadOwnedFloorPlanProject(env, userId, projectId);
  const roomRows = await loadRoomDesignRows(env, projectId);
  const overview = await deriveProjectOverview(env, roomRows);

  const rooms: RoomDesignDetailView[] = [];
  const processingTasks: FloorPlanProjectDetailView["processingTasks"] = [];

  for (const row of roomRows) {
    const runRows = await loadStageRunRows(env, row.id);
    const stageRuns: StageRunView[] = [];
    for (const runRow of runRows) {
      stageRuns.push(await rowToStageRunView(env, runRow));
      if (runRow.status === "processing" && runRow.design_id) {
        processingTasks.push({
          designId: runRow.design_id,
          stage: runRow.stage,
          roomDesignId: row.id,
        });
      }
    }
    rooms.push({
      ...rowToView(row),
      stageRuns,
      complete: await isRoomDesignComplete(env, row.id),
    });
  }

  return {
    id: project.id,
    sourceAssetId: project.source_asset_id,
    overview,
    rooms,
    processingTasks,
  };
}
