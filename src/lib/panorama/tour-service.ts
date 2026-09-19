import type { Env } from "@/lib/bindings";
import { DEMO_PENTHOUSE_TOKEN, getDemoPenthouseTour } from "./demo-tour";
import type {
  PanoramaTour,
  PanoramaScene,
  PanoramaHotspot,
  CreateTourInput,
  UpdateTourInput,
  CreateSceneInput,
  CreateHotspotInput,
} from "./types";

interface TourRow {
  id: string;
  workspace_id: string | null;
  project_id: string | null;
  user_id: string;
  title: string;
  description: string | null;
  first_scene_id: string | null;
  is_public: number;
  share_token: string;
  created_at: number;
  updated_at: number;
}

interface SceneRow {
  id: string;
  tour_id: string;
  name: string;
  asset_id: string;
  initial_yaw: number;
  initial_pitch: number;
  initial_hfov: number;
  order_index: number;
  created_at: number;
}

interface HotspotRow {
  id: string;
  scene_id: string;
  target_scene_id: string | null;
  type: string;
  pitch: number;
  yaw: number;
  title: string;
  description: string | null;
  created_at: number;
}

function mapTourRow(row: TourRow): PanoramaTour {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    userId: row.user_id,
    title: row.title,
    description: row.description,
    firstSceneId: row.first_scene_id,
    isPublic: Boolean(row.is_public),
    shareToken: row.share_token,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSceneRow(row: SceneRow): PanoramaScene {
  return {
    id: row.id,
    tourId: row.tour_id,
    name: row.name,
    assetId: row.asset_id,
    initialYaw: row.initial_yaw,
    initialPitch: row.initial_pitch,
    initialHfov: row.initial_hfov,
    orderIndex: row.order_index,
    createdAt: row.created_at,
  };
}

function mapHotspotRow(row: HotspotRow): PanoramaHotspot {
  return {
    id: row.id,
    sceneId: row.scene_id,
    targetSceneId: row.target_scene_id,
    type: row.type as "scene" | "info",
    pitch: row.pitch,
    yaw: row.yaw,
    title: row.title,
    description: row.description,
    createdAt: row.created_at,
  };
}

export async function createTour(
  db: D1Database,
  userId: string,
  input: CreateTourInput
): Promise<PanoramaTour> {
  const now = Date.now();
  const id = `tour_${crypto.randomUUID()}`;
  const shareToken = crypto.randomUUID().replace(/-/g, "").slice(0, 16);

  await db
    .prepare(
      `INSERT INTO panorama_tours (id, workspace_id, project_id, user_id, title, description, first_scene_id, is_public, share_token, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL, ?7, ?8, ?9, ?9)`
    )
    .bind(
      id,
      input.workspaceId ?? null,
      input.projectId ?? null,
      userId,
      input.title,
      input.description ?? null,
      input.isPublic ? 1 : 0,
      shareToken,
      now
    )
    .run();

  return {
    id,
    workspaceId: input.workspaceId ?? null,
    projectId: input.projectId ?? null,
    userId,
    title: input.title,
    description: input.description ?? null,
    firstSceneId: null,
    isPublic: input.isPublic ?? false,
    shareToken,
    createdAt: now,
    updatedAt: now,
    scenes: [],
  };
}

export async function getTourById(
  db: D1Database,
  tourId: string,
  options: { includeScenes?: boolean } = { includeScenes: true }
): Promise<PanoramaTour | null> {
  const row = await db
    .prepare(`SELECT * FROM panorama_tours WHERE id = ?1 LIMIT 1`)
    .bind(tourId)
    .first<TourRow>();

  if (!row) return null;
  const tour = mapTourRow(row);

  if (options.includeScenes) {
    const sceneRows = await db
      .prepare(`SELECT * FROM panorama_scenes WHERE tour_id = ?1 ORDER BY order_index ASC, created_at ASC`)
      .bind(tourId)
      .all<SceneRow>();

    const scenes: PanoramaScene[] = (sceneRows.results || []).map(mapSceneRow);

    if (scenes.length > 0) {
      const sceneIds = scenes.map((s) => s.id);
      const placeholders = sceneIds.map((_, i) => `?${i + 1}`).join(", ");
      const hotspotRows = await db
        .prepare(`SELECT * FROM panorama_hotspots WHERE scene_id IN (${placeholders})`)
        .bind(...sceneIds)
        .all<HotspotRow>();

      const hotspotsByScene = new Map<string, PanoramaHotspot[]>();
      for (const h of (hotspotRows.results || []).map(mapHotspotRow)) {
        const list = hotspotsByScene.get(h.sceneId) ?? [];
        list.push(h);
        hotspotsByScene.set(h.sceneId, list);
      }

      for (const scene of scenes) {
        scene.hotspots = hotspotsByScene.get(scene.id) ?? [];
      }
    }

    tour.scenes = scenes;
  }

  return tour;
}

export async function getTourByShareToken(
  db: D1Database,
  shareToken: string
): Promise<PanoramaTour | null> {
  if (shareToken === DEMO_PENTHOUSE_TOKEN) {
    return getDemoPenthouseTour();
  }

  const row = await db
    .prepare(`SELECT * FROM panorama_tours WHERE share_token = ?1 AND is_public = 1 LIMIT 1`)
    .bind(shareToken)
    .first<TourRow>();

  if (!row) return null;
  return getTourById(db, row.id, { includeScenes: true });
}

export async function listUserTours(
  db: D1Database,
  userId: string,
  workspaceId?: string | null,
  options?: { includeScenes?: boolean }
): Promise<PanoramaTour[]> {
  let query = `SELECT * FROM panorama_tours WHERE user_id = ?1`;
  const params: unknown[] = [userId];

  if (workspaceId) {
    query += ` AND workspace_id = ?2`;
    params.push(workspaceId);
  }

  query += ` ORDER BY created_at DESC`;

  const rows = await db.prepare(query).bind(...params).all<TourRow>();
  const tours = (rows.results || []).map(mapTourRow);

  if (options?.includeScenes !== false && tours.length > 0) {
    const tourIds = tours.map((t) => t.id);
    const placeholders = tourIds.map((_, i) => `?${i + 1}`).join(", ");
    const sceneRows = await db
      .prepare(
        `SELECT * FROM panorama_scenes WHERE tour_id IN (${placeholders}) ORDER BY order_index ASC, created_at ASC`
      )
      .bind(...tourIds)
      .all<SceneRow>();

    const scenesByTour = new Map<string, PanoramaScene[]>();
    const allSceneIds: string[] = [];
    for (const row of sceneRows.results || []) {
      const scene = mapSceneRow(row);
      allSceneIds.push(scene.id);
      const list = scenesByTour.get(scene.tourId) ?? [];
      list.push(scene);
      scenesByTour.set(scene.tourId, list);
    }

    if (allSceneIds.length > 0) {
      const hsPlaceholders = allSceneIds.map((_, i) => `?${i + 1}`).join(", ");
      const hsRows = await db
        .prepare(`SELECT * FROM panorama_hotspots WHERE scene_id IN (${hsPlaceholders})`)
        .bind(...allSceneIds)
        .all<HotspotRow>();

      const hsByScene = new Map<string, PanoramaHotspot[]>();
      for (const h of (hsRows.results || []).map(mapHotspotRow)) {
        const list = hsByScene.get(h.sceneId) ?? [];
        list.push(h);
        hsByScene.set(h.sceneId, list);
      }

      for (const scenes of scenesByTour.values()) {
        for (const s of scenes) {
          s.hotspots = hsByScene.get(s.id) ?? [];
        }
      }
    }

    for (const t of tours) {
      t.scenes = scenesByTour.get(t.id) ?? [];
    }
  }

  return tours;
}

export async function updateTour(
  db: D1Database,
  tourId: string,
  userId: string,
  input: UpdateTourInput
): Promise<boolean> {
  const existing = await db
    .prepare(`SELECT id FROM panorama_tours WHERE id = ?1 AND user_id = ?2 LIMIT 1`)
    .bind(tourId, userId)
    .first<{ id: string }>();

  if (!existing) return false;

  const updates: string[] = ["updated_at = ?3"];
  const params: unknown[] = [tourId, userId, Date.now()];

  if (input.title !== undefined) {
    params.push(input.title);
    updates.push(`title = ?${params.length}`);
  }
  if (input.description !== undefined) {
    params.push(input.description);
    updates.push(`description = ?${params.length}`);
  }
  if (input.firstSceneId !== undefined) {
    params.push(input.firstSceneId);
    updates.push(`first_scene_id = ?${params.length}`);
  }
  if (input.isPublic !== undefined) {
    params.push(input.isPublic ? 1 : 0);
    updates.push(`is_public = ?${params.length}`);
  }

  await db
    .prepare(`UPDATE panorama_tours SET ${updates.join(", ")} WHERE id = ?1 AND user_id = ?2`)
    .bind(...params)
    .run();

  return true;
}

export async function deleteTour(
  db: D1Database,
  tourId: string,
  userId: string
): Promise<boolean> {
  const result = await db
    .prepare(`DELETE FROM panorama_tours WHERE id = ?1 AND user_id = ?2`)
    .bind(tourId, userId)
    .run();

  return Boolean(result.meta.changes && result.meta.changes > 0);
}

export async function addSceneToTour(
  db: D1Database,
  tourId: string,
  userId: string,
  input: CreateSceneInput
): Promise<PanoramaScene | null> {
  const tour = await db
    .prepare(`SELECT id, workspace_id, first_scene_id FROM panorama_tours WHERE id = ?1 AND user_id = ?2 LIMIT 1`)
    .bind(tourId, userId)
    .first<{ id: string; workspace_id: string | null; first_scene_id: string | null }>();

  if (!tour) return null;

  // Verify asset existence and ownership/workspace authorization (BOLA defense)
  const asset = await db
    .prepare(`SELECT id, user_id, lifecycle FROM assets WHERE id = ?1 LIMIT 1`)
    .bind(input.assetId)
    .first<{ id: string; user_id: string | null; lifecycle: string }>();

  if (!asset || asset.lifecycle === "deleted" || asset.lifecycle === "rejected") {
    return null;
  }

  let isAuthorized = asset.user_id === userId;
  if (!isAuthorized && tour.workspace_id && asset.user_id) {
    const member = await db
      .prepare(`SELECT role FROM workspace_members WHERE workspace_id = ?1 AND user_id = ?2 LIMIT 1`)
      .bind(tour.workspace_id, asset.user_id)
      .first<{ role: string }>();
    if (member) {
      isAuthorized = true;
    }
  }

  if (!isAuthorized) {
    return null;
  }

  const now = Date.now();
  const id = `scene_${crypto.randomUUID()}`;
  const orderIndex = input.orderIndex ?? 0;
  const initialYaw = input.initialYaw ?? 0;
  const initialPitch = input.initialPitch ?? 0;
  const initialHfov = input.initialHfov ?? 100;

  await db
    .prepare(
      `INSERT INTO panorama_scenes (id, tour_id, name, asset_id, initial_yaw, initial_pitch, initial_hfov, order_index, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`
    )
    .bind(
      id,
      tourId,
      input.name,
      input.assetId,
      initialYaw,
      initialPitch,
      initialHfov,
      orderIndex,
      now
    )
    .run();

  // If tour has no firstSceneId yet, set this first scene
  if (!tour.first_scene_id) {
    await db
      .prepare(`UPDATE panorama_tours SET first_scene_id = ?1, updated_at = ?2 WHERE id = ?3`)
      .bind(id, now, tourId)
      .run();
  }

  return {
    id,
    tourId,
    name: input.name,
    assetId: input.assetId,
    initialYaw,
    initialPitch,
    initialHfov,
    orderIndex,
    createdAt: now,
    hotspots: [],
  };
}

export async function deleteScene(
  db: D1Database,
  sceneId: string,
  userId: string
): Promise<boolean> {
  const scene = await db
    .prepare(
      `SELECT s.id, s.tour_id FROM panorama_scenes s
       JOIN panorama_tours t ON s.tour_id = t.id
       WHERE s.id = ?1 AND t.user_id = ?2 LIMIT 1`
    )
    .bind(sceneId, userId)
    .first<{ id: string; tour_id: string }>();

  if (!scene) return false;

  await db.prepare(`DELETE FROM panorama_scenes WHERE id = ?1`).bind(sceneId).run();

  // Check if this was first_scene_id, fallback to next scene
  const nextScene = await db
    .prepare(`SELECT id FROM panorama_scenes WHERE tour_id = ?1 ORDER BY order_index ASC LIMIT 1`)
    .bind(scene.tour_id)
    .first<{ id: string }>();

  await db
    .prepare(`UPDATE panorama_tours SET first_scene_id = ?1 WHERE id = ?2 AND first_scene_id = ?3`)
    .bind(nextScene?.id ?? null, scene.tour_id, sceneId)
    .run();

  return true;
}

export async function addHotspot(
  db: D1Database,
  userId: string,
  input: CreateHotspotInput
): Promise<PanoramaHotspot | null> {
  // Authorize user owns the tour that owns this scene
  const authorized = await db
    .prepare(
      `SELECT s.id FROM panorama_scenes s
       JOIN panorama_tours t ON s.tour_id = t.id
       WHERE s.id = ?1 AND t.user_id = ?2 LIMIT 1`
    )
    .bind(input.sceneId, userId)
    .first<{ id: string }>();

  if (!authorized) return null;

  const now = Date.now();
  const id = `hotspot_${crypto.randomUUID()}`;

  await db
    .prepare(
      `INSERT INTO panorama_hotspots (id, scene_id, target_scene_id, type, pitch, yaw, title, description, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`
    )
    .bind(
      id,
      input.sceneId,
      input.targetSceneId ?? null,
      input.type,
      input.pitch,
      input.yaw,
      input.title,
      input.description ?? null,
      now
    )
    .run();

  return {
    id,
    sceneId: input.sceneId,
    targetSceneId: input.targetSceneId ?? null,
    type: input.type,
    pitch: input.pitch,
    yaw: input.yaw,
    title: input.title,
    description: input.description ?? null,
    createdAt: now,
  };
}

export async function deleteHotspot(
  db: D1Database,
  hotspotId: string,
  userId: string
): Promise<boolean> {
  const hotspot = await db
    .prepare(
      `SELECT h.id FROM panorama_hotspots h
       JOIN panorama_scenes s ON h.scene_id = s.id
       JOIN panorama_tours t ON s.tour_id = t.id
       WHERE h.id = ?1 AND t.user_id = ?2 LIMIT 1`
    )
    .bind(hotspotId, userId)
    .first<{ id: string }>();

  if (!hotspot) return false;

  await db.prepare(`DELETE FROM panorama_hotspots WHERE id = ?1`).bind(hotspotId).run();
  return true;
}

export async function deliverTourSceneAsset(
  env: Env,
  shareToken: string,
  assetId: string
): Promise<Response | null> {
  const row = await env.DB.prepare(
    `SELECT a.storage_key, a.mime_type
     FROM panorama_tours t
     JOIN panorama_scenes s ON s.tour_id = t.id
     JOIN assets a ON a.id = s.asset_id
     WHERE t.share_token = ?1
       AND t.is_public = 1
       AND s.asset_id = ?2
       AND a.lifecycle = 'ready'
       AND a.storage_key IS NOT NULL
     LIMIT 1`
  )
    .bind(shareToken, assetId)
    .first<{ storage_key: string; mime_type: string }>();

  if (!row?.storage_key) return null;

  const obj = await env.HD_PRIVATE.get(row.storage_key);
  if (!obj) return null;

  return new Response(obj.body as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": row.mime_type,
      "Content-Disposition": "inline",
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
    },
  });
}
