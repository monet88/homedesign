// Concrete Floor Plan Stage lifecycle façade (ADR 0004 / Spec #50).
// Encapsulates Floor Plan prerequisite validation, lineage, prompt resolution,
// Stage Run recording, and stage-specific terminal transitions.

import type { Env } from "@/lib/bindings";
import type { DesignConfig, FloorPlanIntent } from "@/lib/ai/types";
import { DEFAULT_PANORAMA_ORIENTATION, DesignError } from "@/lib/ai/types";
import {
  buildFloorPlanBriefPrompt,
  buildFloorPlanLayoutPrompt,
  buildFloorPlanPanoramaPrompt,
  buildFloorPlanRenderPrompt,
} from "@/lib/ai/prompts/floor-plan";
import {
  assertRoomDesignForBrief,
  completeBriefStageRun,
  createBriefStageRun,
} from "@/lib/floor-plan/brief";
import {
  assertNoProcessingRun,
  assertRoomDesignForLayout,
  assertRoomDesignForPanorama,
  assertRoomDesignForRender,
  completeStageRun,
  createStageRun,
  failStageRun,
  getStageRunByDesignId,
  parseRoomProposal,
} from "@/lib/floor-plan/stages";
import { FloorPlanError } from "@/lib/floor-plan/errors";

export interface ResolvedFloorPlanStagePlan {
  projectId: string;
  effectiveSourceAssetId: string;
  prompt: string;
  finalizedConfig: DesignConfig;
  assertCanStart(): Promise<void>;
  recordStageRun(env: Env, taskId: string): Promise<void>;
}

export function mapFloorPlanError(err: FloorPlanError): DesignError {
  const codeMap: Partial<Record<FloorPlanError["code"], DesignError["code"]>> = {
    ASSET_NOT_FOUND: "ASSET_NOT_FOUND",
    FORBIDDEN: "FORBIDDEN",
    SOURCE_ASSET_NOT_READY: "SOURCE_ASSET_NOT_READY",
    INVALID_MARKER: "INVALID_INTENT",
    MARKER_LOCKED: "INVALID_INTENT",
    PROJECT_SOURCE_MISMATCH: "INVALID_INTENT",
    BRIEF_NOT_CONFIRMED: "INVALID_INTENT",
    LAYOUT_NOT_CONFIRMED: "INVALID_INTENT",
    RENDER_NOT_CONFIRMED: "INVALID_INTENT",
    STAGE_NOT_READY: "INVALID_INTENT",
    STAGE_PROCESSING: "INVALID_INTENT",
    NOT_FOUND: "ASSET_NOT_FOUND",
  };
  return new DesignError(codeMap[err.code] ?? "INVALID_INTENT", err.status, err.reason);
}

export async function resolveFloorPlanStagePlan(
  env: Env,
  userId: string,
  config: DesignConfig
): Promise<ResolvedFloorPlanStagePlan> {
  const fp = config.intent as FloorPlanIntent;
  const stage = config.stage ?? fp.stage;
  if (!stage) {
    throw new DesignError("INVALID_INTENT", 400, "floor-plan stage is required");
  }

  if (!fp?.roomId?.trim()) {
    throw new DesignError("INVALID_INTENT", 400, `roomId is required for floor-plan ${stage}`);
  }

  const roomId = fp.roomId;
  let effectiveSourceAssetId = config.sourceAssetId;
  const finalizedConfig: DesignConfig = {
    ...config,
    intent: { ...(config.intent as FloorPlanIntent) },
    options: config.options ? { ...config.options } : config.options,
  };
  const finalizedIntent = finalizedConfig.intent as FloorPlanIntent;

  let projectId: string;
  let prompt: string;

  try {
    if (stage === "brief") {
      const row = await assertRoomDesignForBrief(env, userId, roomId, config.sourceAssetId, fp.marker);
      projectId = row.project_id;
      prompt = buildFloorPlanBriefPrompt(finalizedIntent);
    } else if (stage === "layout") {
      const row = await assertRoomDesignForLayout(env, userId, roomId, config.sourceAssetId, fp.marker);
      projectId = row.project_id;
      const proposal = parseRoomProposal(row);
      prompt = buildFloorPlanLayoutPrompt(finalizedIntent, proposal);
    } else if (stage === "render") {
      const { row, layoutRun } = await assertRoomDesignForRender(
        env,
        userId,
        roomId,
        config.sourceAssetId,
        fp.marker
      );
      projectId = row.project_id;
      finalizedIntent.layoutRunId = layoutRun.id;
      const proposal = parseRoomProposal(row);
      prompt = buildFloorPlanRenderPrompt(finalizedIntent, proposal);
    } else if (stage === "panorama") {
      const { row, renderRun, renderOutputAssetId } = await assertRoomDesignForPanorama(
        env,
        userId,
        roomId,
        config.sourceAssetId,
        fp.marker
      );
      projectId = row.project_id;
      finalizedIntent.renderRunId = renderRun.id;
      finalizedIntent.panoramaOrientation = DEFAULT_PANORAMA_ORIENTATION;
      finalizedConfig.options = {
        ...finalizedConfig.options,
        aspect_ratio: "2:1",
        resolution: "4096x2048",
      };
      effectiveSourceAssetId = renderOutputAssetId;
      const proposal = parseRoomProposal(row);
      prompt = buildFloorPlanPanoramaPrompt(finalizedIntent, proposal);
    } else {
      throw new DesignError("SCENE_NOT_IMPLEMENTED", 501, "unknown floor-plan stage");
    }
  } catch (err) {
    if (err instanceof FloorPlanError) {
      throw mapFloorPlanError(err);
    }
    throw err;
  }

  return {
    projectId,
    effectiveSourceAssetId,
    prompt,
    finalizedConfig,
    async assertCanStart(): Promise<void> {
      try {
        await assertNoProcessingRun(env, roomId, stage);
      } catch (err) {
        if (err instanceof FloorPlanError) {
          throw mapFloorPlanError(err);
        }
        throw err;
      }
    },
    async recordStageRun(env: Env, taskId: string): Promise<void> {
      try {
        if (stage === "brief") {
          await createBriefStageRun(env, roomId, taskId);
        } else {
          await createStageRun(env, roomId, stage, taskId);
        }
      } catch (err) {
        if (err instanceof FloorPlanError) {
          throw mapFloorPlanError(err);
        }
        throw err;
      }
    },
  };
}

export async function handleFloorPlanTerminal(
  env: Env,
  taskId: string,
  outcome: "ready" | "failed"
): Promise<void> {
  const design = await env.DB.prepare(
    `SELECT id, scene, stage FROM designs WHERE id = ?1`
  )
    .bind(taskId)
    .first<{ id: string; scene: string; stage: string | null }>();

  if (!design || design.scene !== "floor-plan" || !design.stage) {
    return;
  }

  if (outcome === "failed") {
    await failStageRun(env, taskId);
    return;
  }

  if (outcome === "ready") {
    const stage = design.stage;
    if (stage === "brief") {
      await completeBriefStageRun(env, taskId);
    } else if (stage === "layout" || stage === "render" || stage === "panorama") {
      await completeStageRun(env, taskId);
      if (stage === "panorama") {
        const run = await getStageRunByDesignId(env, taskId);
        if (run) {
          await env.DB.prepare(
            `UPDATE room_designs SET progress = 'panorama-ready', updated_at = ?2 WHERE id = ?1`
          )
            .bind(run.room_design_id, Date.now())
            .run();
        }
      }
    }
  }
}
