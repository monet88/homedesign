import type { Env } from "@/lib/bindings";
import { createTour, getTourById } from "./tour-service";
import type { PanoramaTour, PanoramaHotspot } from "./types";
import { createTaskWithHold } from "@/lib/ai/task-lifecycle";
import { getAvailableCredits, getWorkspaceAvailableCredits } from "@/lib/credits/ledger";
import { recordWorkspaceAuditLog } from "@/lib/audit/audit-logger";
import { MAX_BATCH_ITEMS } from "@/lib/batch/batch-service";

export interface BatchPanoramaRoomInput {
  name: string;
  roomType: string;
  customPrompt?: string;
  initialYaw?: number;
}

export interface CreateBatchPanoramaTourParams {
  userId: string;
  workspaceId?: string | null;
  projectId?: string | null;
  tourTitle: string;
  style: string;
  palette?: string;
  rooms: BatchPanoramaRoomInput[];
  autoLinkPortals?: boolean;
  provider?: string;
}

export interface AutoLinkResult {
  success: boolean;
  linkedCount: number;
  message?: string;
  hotspots?: PanoramaHotspot[];
}

/**
 * Builds high-precision 360° Equirectangular panoramic prompt
 * for AI image generator models (Flux, Gemini Flash Image, SDXL).
 */
export function buildBatchPanoramaPrompt(
  room: BatchPanoramaRoomInput,
  style: string,
  palette?: string
): string {
  const roomTypeName = room.roomType.replace(/_/g, " ");
  const lines: string[] = [
    `Seamless 360° equirectangular spherical panorama of a luxury ${room.name} (${roomTypeName}).`,
    `Architectural style: ${style}.`,
  ];

  if (palette && palette.trim()) {
    lines.push(`Color palette and material finishes: ${palette.trim()}.`);
  } else {
    lines.push("Color palette: Warm natural luxury tones, refined architectural materials, balanced lighting.");
  }

  if (room.customPrompt && room.customPrompt.trim()) {
    lines.push(`Room-specific design requirements: ${room.customPrompt.trim()}.`);
  }

  lines.push(
    "Output projection: Strict 2:1 ratio full spherical 360x180 equirectangular projection (4096×2048 pixels), continuous seamless horizontal wrap (-180° to +180°).",
    "Photography & optics: Architectural interior photography, crisp eye-level vantage point, straight verticals, zero distortion at horizon.",
    "Lighting & materials: Physically based rendering (PBR), realistic global illumination, soft diffused daylight, natural shadows, 8K ultra-detailed photorealistic."
  );

  return lines.join("\n");
}

/**
 * Automatically computes and links portal hotspots between all scenes in a tour.
 * Default strategy: 'hub_and_spoke' where scene[0] is the main living hub
 * and all other rooms link to/from scene[0].
 */
export async function autoLinkTourScenes(
  db: D1Database,
  tourId: string,
  userId: string,
  strategy: "hub_and_spoke" | "sequential" = "hub_and_spoke"
): Promise<AutoLinkResult> {
  const tour = await getTourById(db, tourId, { includeScenes: true });
  if (!tour) {
    return { success: false, linkedCount: 0, message: "Tour không tồn tại hoặc không có quyền truy cập" };
  }

  const isOwner = tour.userId === userId;
  let isAuthorizedMember = false;
  if (!isOwner && tour.workspaceId) {
    const member = await db
      .prepare(`SELECT role FROM workspace_members WHERE workspace_id = ?1 AND user_id = ?2 LIMIT 1`)
      .bind(tour.workspaceId, userId)
      .first<{ role: string }>();
    if (member && member.role !== "viewer") {
      isAuthorizedMember = true;
    }
  }

  if (!isOwner && !isAuthorizedMember) {
    return { success: false, linkedCount: 0, message: "Tour không tồn tại hoặc không có quyền truy cập" };
  }

  const scenes = tour.scenes || [];
  if (scenes.length < 2) {
    return {
      success: false,
      linkedCount: 0,
      message: "Tour cần ít nhất 2 phòng để tự động tạo liên kết chuyển phòng",
    };
  }

  // Delete existing portal hotspots ('scene' type) to avoid duplicates, keeping 'info' notes
  const sceneIds = scenes.map((s) => s.id);
  const placeholders = sceneIds.map((_, i) => `?${i + 1}`).join(", ");
  await db
    .prepare(`DELETE FROM panorama_hotspots WHERE scene_id IN (${placeholders}) AND type = 'scene'`)
    .bind(...sceneIds)
    .run();

  const now = Date.now();
  const createdHotspots: PanoramaHotspot[] = [];

  if (strategy === "hub_and_spoke") {
    const hubScene = scenes[0];
    const otherScenes = scenes.slice(1);
    const numOthers = otherScenes.length;

    for (let i = 0; i < numOthers; i++) {
      const targetScene = otherScenes[i];
      // Distribute portals evenly across the spherical horizon [-150° to +150°]
      const spreadStep = numOthers === 1 ? 0 : 300 / (numOthers - 1);
      const hubYaw = Math.round(numOthers === 1 ? 0 : -150 + i * spreadStep);
      const hubPitch = -6; // Slightly below eye level for natural doorway viewing

      const hubHotspotId = `hotspot_${crypto.randomUUID()}`;
      await db
        .prepare(
          `INSERT INTO panorama_hotspots (id, scene_id, target_scene_id, type, pitch, yaw, title, description, created_at)
           VALUES (?1, ?2, ?3, 'scene', ?4, ?5, ?6, ?7, ?8)`
        )
        .bind(
          hubHotspotId,
          hubScene.id,
          targetScene.id,
          hubPitch,
          hubYaw,
          `Đến ${targetScene.name}`,
          `Chuyển góc nhìn 360° sang ${targetScene.name}`,
          now
        )
        .run();

      createdHotspots.push({
        id: hubHotspotId,
        sceneId: hubScene.id,
        targetSceneId: targetScene.id,
        type: "scene",
        pitch: hubPitch,
        yaw: hubYaw,
        title: `Đến ${targetScene.name}`,
        description: `Chuyển góc nhìn 360° sang ${targetScene.name}`,
        createdAt: now,
      });

      // Return portal from targetScene back to hubScene
      const returnHotspotId = `hotspot_${crypto.randomUUID()}`;
      const returnYaw = 0;
      const returnPitch = -6;

      await db
        .prepare(
          `INSERT INTO panorama_hotspots (id, scene_id, target_scene_id, type, pitch, yaw, title, description, created_at)
           VALUES (?1, ?2, ?3, 'scene', ?4, ?5, ?6, ?7, ?8)`
        )
        .bind(
          returnHotspotId,
          targetScene.id,
          hubScene.id,
          returnPitch,
          returnYaw,
          `Về ${hubScene.name}`,
          `Quay trở lại không gian ${hubScene.name}`,
          now
        )
        .run();

      createdHotspots.push({
        id: returnHotspotId,
        sceneId: targetScene.id,
        targetSceneId: hubScene.id,
        type: "scene",
        pitch: returnPitch,
        yaw: returnYaw,
        title: `Về ${hubScene.name}`,
        description: `Quay trở lại không gian ${hubScene.name}`,
        createdAt: now,
      });
    }
  } else {
    // Sequential loop
    for (let i = 0; i < scenes.length; i++) {
      const current = scenes[i];
      const next = scenes[(i + 1) % scenes.length];
      const prev = scenes[(i - 1 + scenes.length) % scenes.length];

      const nextId = `hotspot_${crypto.randomUUID()}`;
      await db
        .prepare(
          `INSERT INTO panorama_hotspots (id, scene_id, target_scene_id, type, pitch, yaw, title, description, created_at)
           VALUES (?1, ?2, ?3, 'scene', -6, 45, ?4, ?5, ?6)`
        )
        .bind(
          nextId,
          current.id,
          next.id,
          `Đến ${next.name}`,
          `Tiếp tục di chuyển sang ${next.name}`,
          now
        )
        .run();

      createdHotspots.push({
        id: nextId,
        sceneId: current.id,
        targetSceneId: next.id,
        type: "scene",
        pitch: -6,
        yaw: 45,
        title: `Đến ${next.name}`,
        description: `Tiếp tục di chuyển sang ${next.name}`,
        createdAt: now,
      });

      if (scenes.length > 2) {
        const prevId = `hotspot_${crypto.randomUUID()}`;
        await db
          .prepare(
            `INSERT INTO panorama_hotspots (id, scene_id, target_scene_id, type, pitch, yaw, title, description, created_at)
             VALUES (?1, ?2, ?3, 'scene', -6, -135, ?4, ?5, ?6)`
          )
          .bind(
            prevId,
            current.id,
            prev.id,
            `Về ${prev.name}`,
            `Quay lại ${prev.name}`,
            now
          )
          .run();

        createdHotspots.push({
          id: prevId,
          sceneId: current.id,
          targetSceneId: prev.id,
          type: "scene",
          pitch: -6,
          yaw: -135,
          title: `Về ${prev.name}`,
          description: `Quay lại ${prev.name}`,
          createdAt: now,
        });
      }
    }
  }

  return {
    success: true,
    linkedCount: createdHotspots.length,
    hotspots: createdHotspots,
  };
}

/**
 * Creates a complete Batch Panorama Tour with linked AI tasks and atomic credits hold.
 */
export async function createBatchPanoramaTour(
  env: Env,
  params: CreateBatchPanoramaTourParams
): Promise<{ tour: PanoramaTour; batchJobId: string; totalCreditsCost: number; tasksCount: number }> {
  const rooms = params.rooms;
  if (!rooms || !Array.isArray(rooms) || rooms.length === 0) {
    throw new Error("BATCH_EMPTY_ROOMS: Vui lòng chọn ít nhất 1 phòng");
  }

  if (rooms.length > MAX_BATCH_ITEMS) {
    throw new Error(`BATCH_MAX_ITEMS_EXCEEDED: Tối đa ${MAX_BATCH_ITEMS} phòng cho một lần tạo batch`);
  }

  const totalCredits = rooms.length;
  const wsId = params.workspaceId ?? null;

  // 1. Balance and workspace membership verification
  if (wsId) {
    const member = await env.DB.prepare(
      `SELECT role FROM workspace_members WHERE workspace_id = ?1 AND user_id = ?2`
    )
      .bind(wsId, params.userId)
      .first<{ role: string }>();
    if (!member) {
      throw new Error("FORBIDDEN: Not a member of this workspace");
    }
    if (member.role === "viewer") {
      throw new Error("ROLE_CANNOT_GENERATE: Viewers cannot create batch panorama tours");
    }
    const wsCredits = await getWorkspaceAvailableCredits(env, wsId);
    if (wsCredits < totalCredits) {
      throw new Error("INSUFFICIENT_CREDITS");
    }
  } else {
    const userCredits = await getAvailableCredits(env, params.userId);
    if (userCredits < totalCredits) {
      throw new Error("INSUFFICIENT_CREDITS");
    }
  }

  // 2. Create the Panorama Tour record in D1 (private by default, user must explicitly share)
  const tour = await createTour(env.DB, params.userId, {
    title: params.tourTitle.trim(),
    description: `AI Batch 360° Panorama Tour — Phong cách ${params.style}`,
    workspaceId: wsId,
    projectId: params.projectId ?? null,
    isPublic: false,
  });

  const batchId = crypto.randomUUID();
  const now = Date.now();
  const provider = params.provider ?? "fal";
  const model = provider === "fal" ? "fal-ai/flux/schnell" : "gemini-2.5-flash-image";

  // 3. Insert Batch Job entry in batch_render_jobs
  await env.DB.prepare(
    `INSERT INTO batch_render_jobs (
      id, workspace_id, user_id, name, status, total_items, completed_items, failed_items, total_credits_cost, created_at, updated_at
    ) VALUES (?1, ?2, ?3, ?4, 'pending', ?5, 0, 0, ?6, ?7, ?7)`
  )
    .bind(
      batchId,
      wsId,
      params.userId,
      params.tourTitle || `Batch Tour 360 (${rooms.length} phòng)`,
      rooms.length,
      totalCredits,
      now
    )
    .run();

  // 4. Create AI tasks with hold for each room
  for (let i = 0; i < rooms.length; i++) {
    const room = rooms[i];
    const prompt = buildBatchPanoramaPrompt(room, params.style, params.palette);
    const idempotencyKey = `batch-pano-${batchId}-item-${i}-${now}`;

    const taskDef = {
      scene: "panorama",
      provider,
      model,
      prompt,
      sourceKey: null,
      options: {
        isPanorama: true,
        tourId: tour.id,
        roomName: room.name,
        roomType: room.roomType,
        batchIndex: i,
        batchId,
        autoLinkPortals: params.autoLinkPortals !== false,
      },
    };

    const { taskId } = await createTaskWithHold(
      env,
      params.userId,
      taskDef,
      1,
      idempotencyKey,
      wsId
    );

    await env.DB.prepare(`UPDATE ai_tasks SET batch_id = ?1 WHERE id = ?2`)
      .bind(batchId, taskId)
      .run();
  }

  // Mark batch job processing
  await env.DB.prepare(`UPDATE batch_render_jobs SET status = 'processing', updated_at = ?1 WHERE id = ?2`)
    .bind(Date.now(), batchId)
    .run();

  if (wsId) {
    await recordWorkspaceAuditLog(env, {
      workspaceId: wsId,
      actorId: params.userId,
      action: "RENDER_TRIGGERED",
      targetType: "task",
      targetId: batchId,
      details: {
        tourId: tour.id,
        tourTitle: params.tourTitle,
        totalRooms: rooms.length,
        style: params.style,
      },
    });
  }

  return {
    tour,
    batchJobId: batchId,
    totalCreditsCost: totalCredits,
    tasksCount: rooms.length,
  };
}
