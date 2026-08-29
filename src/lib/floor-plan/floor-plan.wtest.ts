// Workers-runtime tests for ticket #10: Floor Plan project + Room Marker + Brief.

import { env } from "cloudflare:test";
import { describe, expect, it, beforeEach } from "vitest";
import { createDesign } from "@/lib/ai/lifecycle";
import { handleProviderNotify } from "@/lib/ai/notify-consumer";
import {
  buildFloorPlanBriefPrompt,
  buildFloorPlanLayoutPrompt,
  buildFloorPlanPanoramaPrompt,
} from "@/lib/ai/prompt";
import {
  FloorPlanError,
  assertLayoutStageAllowed,
  assertNoProcessingRun,
  confirmRoomBrief,
  confirmRoomLayout,
  confirmRoomRender,
  completeBriefStageRun,
  createBriefStageRun,
  createFloorPlanProject,
  createStageRun,
  getActiveConfirmedStageRun,
  getFloorPlanProjectDetail,
  getStageRunByDesignId,
  handleFloorPlanTerminal,
  isRoomDesignComplete,
  isStageRunStale,
  placeRoomMarker,
  proposeRoomBrief,
  restoreStageRun,
  updateRoomMarker,
  addNextRoomMarker,
  recognizeRoomRegion,
} from "@/lib/floor-plan";
import {
  assertCreditInvariant,
  ensureFreeCreditGrant,
  getAvailableCredits,
} from "@/lib/credits/ledger";
import { validPngBytes } from "@/lib/fixtures/images";
import { resetProviders } from "@/lib/ai/provider-adapter";

beforeEach(async () => {
  await applyMigrations(env.DB);
  resetProviders();
});

async function seedUser(): Promise<string> {
  const userId = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt)
     VALUES (?1, 'Test User', ?2, 1, ?3, ?3)`
  )
    .bind(userId, `${userId}@example.com`, Date.now())
    .run();
  await ensureFreeCreditGrant(env, userId);
  return userId;
}

async function seedReadyAsset(userId: string, width?: number, height?: number): Promise<string> {
  const assetId = crypto.randomUUID();
  const key = `ready/${assetId}`;
  const bytes = validPngBytes();
  await env.HD_PRIVATE.put(key, bytes, { httpMetadata: { contentType: "image/png" } });
  await env.DB.prepare(
    `INSERT INTO assets (
       id, name, mime_type, size, lifecycle, storage_key, user_id,
       declared_size, actual_size, width, height, created_by, created_at, updated_at
     ) VALUES (?1, 'floor.png', 'image/png', ?2, 'ready', ?3, ?4, ?2, ?2, ?5, ?6, 'test', ?7, ?7)`
  )
    .bind(assetId, bytes.length, key, userId, width ?? null, height ?? null, Date.now())
    .run();
  return assetId;
}

function stagePayload(
  stage: "brief" | "layout" | "render" | "panorama",
  sourceAssetId: string,
  roomId: string,
  marker: { x: number; y: number },
  idempotencyKey: string
) {
  return {
    sourceAssetId,
    scene: "floor-plan",
    intent: { stage, marker, roomId },
    idempotencyKey,
  };
}

async function runDesignToReady(taskId: string): Promise<void> {
  const dispatch = await handleProviderNotify(env, { type: "task-dispatch", taskId });
  expect(dispatch.status).toBe("quarantined");
  const complete = await handleProviderNotify(env, { type: "provider-complete", taskId });
  expect(complete.status).toBe("ready");
}

async function setupConfirmedBrief(userId: string): Promise<{
  sourceId: string;
  projectId: string;
  roomId: string;
  marker: { x: number; y: number };
}> {
  const sourceId = await seedReadyAsset(userId);
  const { id: projectId } = await createFloorPlanProject(env, userId, sourceId);
  const room = await placeRoomMarker(env, userId, projectId, { x: 50, y: 50 });
  await proposeRoomBrief(env, userId, room.id);
  const brief = await createDesign(
    env,
    userId,
    stagePayload("brief", sourceId, room.id, { x: 50, y: 50 }, `brief-${room.id}`)
  );
  await runDesignToReady(brief.id);
  await confirmRoomBrief(env, userId, room.id);
  return { sourceId, projectId, roomId: room.id, marker: { x: 50, y: 50 } };
}

describe("FloorPlanProject", () => {
  it("binds to one ready source; a second source creates a new project", async () => {
    const userId = await seedUser();
    const sourceA = await seedReadyAsset(userId);
    const sourceB = await seedReadyAsset(userId);

    const first = await createFloorPlanProject(env, userId, sourceA);
    expect(first.created).toBe(true);

    const same = await createFloorPlanProject(env, userId, sourceA);
    expect(same.created).toBe(false);
    expect(same.id).toBe(first.id);

    const second = await createFloorPlanProject(env, userId, sourceB);
    expect(second.created).toBe(true);
    expect(second.id).not.toBe(first.id);
  });
});

describe("Room Marker", () => {
  it("enforces marker bounds and lock after brief confirm", async () => {
    const userId = await seedUser();
    const sourceId = await seedReadyAsset(userId);
    const { id: projectId } = await createFloorPlanProject(env, userId, sourceId);
    const room = await placeRoomMarker(env, userId, projectId, { x: 40, y: 60 });

    await expect(updateRoomMarker(env, userId, room.id, { x: 101, y: 1 })).rejects.toMatchObject({
      code: "INVALID_MARKER",
    });

    await proposeRoomBrief(env, userId, room.id, { style: "Modern" });
    await confirmRoomBrief(env, userId, room.id);

    await expect(updateRoomMarker(env, userId, room.id, { x: 41, y: 61 })).rejects.toMatchObject({
      code: "MARKER_LOCKED",
    });
  });

  it("creates a new Room Design when placing a marker after confirm", async () => {
    const userId = await seedUser();
    const sourceId = await seedReadyAsset(userId);
    const { id: projectId } = await createFloorPlanProject(env, userId, sourceId);
    const first = await placeRoomMarker(env, userId, projectId, { x: 10, y: 10 });
    await proposeRoomBrief(env, userId, first.id);
    await confirmRoomBrief(env, userId, first.id);

    const next = await addNextRoomMarker(env, userId, projectId, { x: 80, y: 80 });
    expect(next.id).not.toBe(first.id);
    expect(next.markerId).not.toBe(first.markerId);
    expect(next.markerLocked).toBe(false);
  });
});

describe("Recognition", () => {
  it("does not fabricate dimensions when source metadata is absent", async () => {
    const userId = await seedUser();
    const sourceId = await seedReadyAsset(userId);
    const recognition = await recognizeRoomRegion(env, sourceId, { x: 10, y: 10 });
    expect(recognition.dimensions).toBeUndefined();
    expect(recognition.roomType).toBe("bedroom");
  });

  it("includes pixel dimensions only when readable from asset metadata", async () => {
    const userId = await seedUser();
    const sourceId = await seedReadyAsset(userId, 1200, 800);
    const recognition = await recognizeRoomRegion(env, sourceId, { x: 90, y: 90 });
    expect(recognition.dimensions).toEqual({
      widthPx: 1200,
      heightPx: 800,
      source: "asset-metadata",
    });
  });
});

describe("Brief confirm gates Layout", () => {
  it("records confirm and allows layout after brief confirm", async () => {
    const userId = await seedUser();
    const sourceId = await seedReadyAsset(userId);
    const { id: projectId } = await createFloorPlanProject(env, userId, sourceId);
    const room = await placeRoomMarker(env, userId, projectId, { x: 50, y: 50 });
    await proposeRoomBrief(env, userId, room.id);
    const confirmed = await confirmRoomBrief(env, userId, room.id);
    expect(confirmed.markerLocked).toBe(true);
    expect(confirmed.briefConfirmedAt).toBeTruthy();
    await expect(assertLayoutStageAllowed(env, userId, room.id)).resolves.toBeUndefined();

    const layout = await createDesign(
      env,
      userId,
      stagePayload("layout", sourceId, room.id, { x: 50, y: 50 }, "idem-layout-gate")
    );
    expect(layout.cost).toBe(2);
  });

  it("rejects layout before brief confirm", async () => {
    const userId = await seedUser();
    const sourceId = await seedReadyAsset(userId);
    const { id: projectId } = await createFloorPlanProject(env, userId, sourceId);
    const room = await placeRoomMarker(env, userId, projectId, { x: 50, y: 50 });
    await expect(
      createDesign(env, userId, stagePayload("layout", sourceId, room.id, { x: 50, y: 50 }, "idem-no-brief"))
    ).rejects.toMatchObject({ code: "INVALID_INTENT", status: 409 });
  });
});

describe("Brief stage lifecycle", () => {
  it("runs brief through fake provider and settles 1 credit", async () => {
    const userId = await seedUser();
    const sourceId = await seedReadyAsset(userId);
    const { id: projectId } = await createFloorPlanProject(env, userId, sourceId);
    const room = await placeRoomMarker(env, userId, projectId, { x: 25, y: 75 });

    const result = await createDesign(
      env,
      userId,
      stagePayload("brief", sourceId, room.id, { x: 25, y: 75 }, "idem-brief-run")
    );
    expect(result.cost).toBe(1);
    expect(await getAvailableCredits(env, userId)).toBe(9);

    const dispatch = await handleProviderNotify(env, { type: "task-dispatch", taskId: result.id });
    expect(dispatch.status).toBe("quarantined");

    const complete = await handleProviderNotify(env, { type: "provider-complete", taskId: result.id });
    expect(complete.status).toBe("ready");
    expect(await getAvailableCredits(env, userId)).toBe(9);
    await expect(assertCreditInvariant(env, userId)).resolves.toBe(true);

    const proposal = await env.DB.prepare(`SELECT proposal_json FROM room_designs WHERE id = ?1`)
      .bind(room.id)
      .first<{ proposal_json: string | null }>();
    expect(proposal?.proposal_json).toBeTruthy();
  });
  it("preserves Brief idempotency while rejecting a second processing run", async () => {
    const userId = await seedUser();
    const sourceId = await seedReadyAsset(userId);
    const { id: projectId } = await createFloorPlanProject(env, userId, sourceId);
    const room = await placeRoomMarker(env, userId, projectId, { x: 25, y: 75 });
    const payload = stagePayload("brief", sourceId, room.id, { x: 25, y: 75 }, "idem-brief-a");

    const first = await createDesign(env, userId, payload);
    const cached = await createDesign(env, userId, payload);
    expect(cached).toMatchObject({ id: first.id, cached: true, status: "accepted" });
    await expect(
      createDesign(env, userId, { ...payload, options: { num_outputs: 2 } })
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED", status: 409 });

    await expect(assertNoProcessingRun(env, room.id, "brief")).rejects.toMatchObject({
      code: "STAGE_PROCESSING",
    });
    await expect(
      createDesign(env, userId, stagePayload("brief", sourceId, room.id, { x: 25, y: 75 }, "idem-brief-b"))
    ).rejects.toMatchObject({ code: "INVALID_INTENT", status: 409 });

    const holds = await env.DB.prepare(`SELECT COUNT(*) AS c FROM credit_holds WHERE user_id = ?1`)
      .bind(userId)
      .first<{ c: number }>();
    const runs = await env.DB.prepare(
      `SELECT COUNT(*) AS c FROM floor_plan_stage_runs WHERE room_design_id = ?1 AND stage = 'brief'`
    )
      .bind(room.id)
      .first<{ c: number }>();
    expect(holds?.c).toBe(1);
    expect(runs?.c).toBe(1);
  });
  it("maps unique conflict directly to STAGE_PROCESSING/409 even if winner terminalizes before error classification", async () => {
    const userId = await seedUser();
    const sourceId = await seedReadyAsset(userId);
    const { id: projectId } = await createFloorPlanProject(env, userId, sourceId);
    const room = await placeRoomMarker(env, userId, projectId, { x: 25, y: 75 });

    const first = await createDesign(
      env,
      userId,
      stagePayload("brief", sourceId, room.id, { x: 25, y: 75 }, "idem-winner")
    );

    let caughtErr: unknown = null;
    try {
      await createBriefStageRun(env, room.id, "task-loser");
    } catch (err) {
      caughtErr = err;
    }

    await handleFloorPlanTerminal(env, first.id, "ready");
    await expect(assertNoProcessingRun(env, room.id, "brief")).resolves.toBeUndefined();

    expect(caughtErr).toBeInstanceOf(FloorPlanError);
    expect((caughtErr as FloorPlanError).code).toBe("STAGE_PROCESSING");
    expect((caughtErr as FloorPlanError).status).toBe(409);
  });
  it("maps layout stage run unique conflict directly to STAGE_PROCESSING/409", async () => {
    const userId = await seedUser();
    const sourceId = await seedReadyAsset(userId);
    const { id: projectId } = await createFloorPlanProject(env, userId, sourceId);
    const room = await placeRoomMarker(env, userId, projectId, { x: 25, y: 75 });
    await createStageRun(env, room.id, "layout", "task-layout-winner");

    await expect(createStageRun(env, room.id, "layout", "task-layout-loser")).rejects.toMatchObject({
      code: "STAGE_PROCESSING",
      status: 409,
    });
  });
  it("rolls back admission on race conflict so loser idempotency key can retry after winner completes", async () => {
    const userId = await seedUser();
    const sourceId = await seedReadyAsset(userId);
    const { id: projectId } = await createFloorPlanProject(env, userId, sourceId);
    const room = await placeRoomMarker(env, userId, projectId, { x: 25, y: 75 });

    const winner = await createDesign(
      env,
      userId,
      stagePayload("brief", sourceId, room.id, { x: 25, y: 75 }, "idem-winner-race")
    );
    expect(winner.status).toBe("accepted");

    await expect(
      createDesign(
        env,
        userId,
        stagePayload("brief", sourceId, room.id, { x: 25, y: 75 }, "idem-loser-race")
      )
    ).rejects.toMatchObject({ code: "INVALID_INTENT", status: 409 });

    const activeHolds = await env.DB.prepare(
      `SELECT COUNT(*) AS c FROM credit_holds WHERE user_id = ?1 AND status = 'active'`
    )
      .bind(userId)
      .first<{ c: number }>();
    expect(activeHolds?.c).toBe(1);

    const taskRows = await env.DB.prepare(`SELECT COUNT(*) AS c FROM ai_tasks WHERE user_id = ?1`)
      .bind(userId)
      .first<{ c: number }>();
    expect(taskRows?.c).toBe(1);

    const loserKeyRow = await env.DB.prepare(
      `SELECT * FROM idempotency_keys WHERE user_id = ?1 AND idempotency_key = 'idem-loser-race'`
    )
      .bind(userId)
      .first();
    expect(loserKeyRow).toBeNull();
    await completeBriefStageRun(env, winner.id);
    await proposeRoomBrief(env, userId, room.id);
    await confirmRoomBrief(env, userId, room.id);
    const retry = await createDesign(
      env,
      userId,
      stagePayload("layout", sourceId, room.id, { x: 25, y: 75 }, "idem-loser-race")
    );
    expect(retry.cached).toBe(false);
    expect(retry.status).toBe("accepted");
  });
});
describe("Floor plan prompt builders", () => {
  it("builds brief, layout, render, and panorama prompts", () => {
    const prompt = buildFloorPlanBriefPrompt({
      stage: "brief",
      marker: { x: 5, y: 95 },
      roomId: "room-1",
    });
    expect(prompt).toContain("marker (5%, 95%)");
    expect(prompt).toContain("Do not fabricate measurements");

    const layoutPrompt = buildFloorPlanLayoutPrompt({
      stage: "layout",
      marker: { x: 1, y: 1 },
      roomId: "room-1",
    });
    expect(layoutPrompt).toContain("2D furniture layout");

    const panoramaPrompt = buildFloorPlanPanoramaPrompt({
      stage: "panorama",
      marker: { x: 1, y: 1 },
      roomId: "room-1",
      panoramaOrientation: { yaw: 0, pitch: 0, hfov: 100 },
    });
    expect(panoramaPrompt).toContain("equirectangular");
    expect(panoramaPrompt).toContain("4096×2048");
  });
});

describe("Layout stage lifecycle", () => {
  it("runs layout through fake provider and settles 2 credits", async () => {
    const userId = await seedUser();
    const { sourceId, roomId, marker } = await setupConfirmedBrief(userId);

    const layout = await createDesign(
      env,
      userId,
      stagePayload("layout", sourceId, roomId, marker, "idem-layout-run")
    );
    expect(layout.cost).toBe(2);
    expect(await getAvailableCredits(env, userId)).toBe(7);

    await runDesignToReady(layout.id);

    const run = await getStageRunByDesignId(env, layout.id);
    expect(run?.status).toBe("success");
    expect(await getAvailableCredits(env, userId)).toBe(7);
    await expect(assertCreditInvariant(env, userId)).resolves.toBe(true);
  });

  it("max one processing layout run per room design", async () => {
    const userId = await seedUser();
    const { sourceId, roomId, marker } = await setupConfirmedBrief(userId);

    await createDesign(env, userId, stagePayload("layout", sourceId, roomId, marker, "layout-a"));
    await expect(assertNoProcessingRun(env, roomId, "layout")).rejects.toMatchObject({
      code: "STAGE_PROCESSING",
    });
    await expect(
      createDesign(env, userId, stagePayload("layout", sourceId, roomId, marker, "layout-b"))
    ).rejects.toMatchObject({ code: "INVALID_INTENT", status: 409 });
  });
});

describe("Render stage lifecycle", () => {
  it("gates render on layout confirm and settles 3 credits", async () => {
    const userId = await seedUser();
    const { sourceId, roomId, marker } = await setupConfirmedBrief(userId);

    await expect(
      createDesign(env, userId, stagePayload("render", sourceId, roomId, marker, "render-no-layout"))
    ).rejects.toMatchObject({ code: "INVALID_INTENT", status: 409 });

    const layout = await createDesign(
      env,
      userId,
      stagePayload("layout", sourceId, roomId, marker, "layout-for-render")
    );
    await runDesignToReady(layout.id);
    await confirmRoomLayout(env, userId, roomId, layout.id);

    const render = await createDesign(
      env,
      userId,
      stagePayload("render", sourceId, roomId, marker, "render-run")
    );
    expect(render.cost).toBe(3);
    expect(await getAvailableCredits(env, userId)).toBe(4);

    await runDesignToReady(render.id);
    const run = await getStageRunByDesignId(env, render.id);
    expect(run?.status).toBe("success");
    await expect(assertCreditInvariant(env, userId)).resolves.toBe(true);
  });
});

describe("Retry and regenerate lineage", () => {
  it("retry failed layout only reruns that stage; successful layout keeps usage", async () => {
    const userId = await seedUser();
    const { sourceId, roomId, marker } = await setupConfirmedBrief(userId);

    const failed = await createDesign(env, userId, {
      ...stagePayload("layout", sourceId, roomId, marker, "layout-fail"),
      intent: { stage: "layout", marker, roomId, feedback: "FAIL:PROVIDER_FAIL" },
    });
    await handleProviderNotify(env, { type: "task-dispatch", taskId: failed.id });
    expect(await getAvailableCredits(env, userId)).toBe(9);

    const failedRun = await getStageRunByDesignId(env, failed.id);
    expect(failedRun?.status).toBe("failed");

    const retry = await createDesign(
      env,
      userId,
      stagePayload("layout", sourceId, roomId, marker, "layout-retry")
    );
    expect(retry.cost).toBe(2);
    expect(await getAvailableCredits(env, userId)).toBe(7);
    await runDesignToReady(retry.id);
    expect((await getStageRunByDesignId(env, retry.id))?.status).toBe("success");
  });

  it("regenerate layout stale downstream render only after new layout confirm", async () => {
    const userId = await seedUser();
    const { sourceId, roomId, marker } = await setupConfirmedBrief(userId);

    const layoutA = await createDesign(
      env,
      userId,
      stagePayload("layout", sourceId, roomId, marker, "layout-a")
    );
    await runDesignToReady(layoutA.id);
    await confirmRoomLayout(env, userId, roomId, layoutA.id);

    const renderA = await createDesign(
      env,
      userId,
      stagePayload("render", sourceId, roomId, marker, "render-a")
    );
    await runDesignToReady(renderA.id);
    const renderRunA = await getStageRunByDesignId(env, renderA.id);
    expect(await isStageRunStale(env, renderRunA!.id)).toBe(false);

    const layoutB = await createDesign(
      env,
      userId,
      stagePayload("layout", sourceId, roomId, marker, "layout-b-regen")
    );
    await runDesignToReady(layoutB.id);
    expect(await isStageRunStale(env, renderRunA!.id)).toBe(false);

    await confirmRoomLayout(env, userId, roomId, layoutB.id);
    expect(await isStageRunStale(env, renderRunA!.id)).toBe(true);
  });
});

async function setupConfirmedRender(userId: string): Promise<{
  sourceId: string;
  projectId: string;
  roomId: string;
  marker: { x: number; y: number };
  renderDesignId: string;
  renderOutputAssetId: string;
}> {
  const { sourceId, projectId, roomId, marker } = await setupConfirmedBrief(userId);

  const layout = await createDesign(
    env,
    userId,
    stagePayload("layout", sourceId, roomId, marker, `layout-${roomId}-pano`)
  );
  await runDesignToReady(layout.id);
  await confirmRoomLayout(env, userId, roomId, layout.id);

  const render = await createDesign(
    env,
    userId,
    stagePayload("render", sourceId, roomId, marker, `render-${roomId}-pano`)
  );
  await runDesignToReady(render.id);
  await confirmRoomRender(env, userId, roomId, render.id);

  const design = await env.DB.prepare(`SELECT output_asset_id FROM designs WHERE id = ?1`)
    .bind(render.id)
    .first<{ output_asset_id: string }>();

  return {
    sourceId,
    projectId,
    roomId,
    marker,
    renderDesignId: render.id,
    renderOutputAssetId: design!.output_asset_id!,
  };
}

describe("Panorama stage lifecycle", () => {
  it("gates panorama on confirmed render and settles 4 credits", async () => {
    const userId = await seedUser();
    const { sourceId, roomId, marker } = await setupConfirmedBrief(userId);

    await expect(
      createDesign(env, userId, stagePayload("panorama", sourceId, roomId, marker, "panorama-no-render"))
    ).rejects.toMatchObject({ code: "INVALID_INTENT", status: 409 });

    const billUser = await seedUser();
    const { sourceId: src, roomId: rid, marker: m, projectId } = await setupConfirmedRender(billUser);
    expect(await isRoomDesignComplete(env, rid)).toBe(true);

    const panorama = await createDesign(
      env,
      billUser,
      stagePayload("panorama", src, rid, m, "panorama-run")
    );
    expect(panorama.cost).toBe(4);
    expect(panorama.projectId).toBe(projectId);
    expect(await getAvailableCredits(env, billUser)).toBe(0);

    await runDesignToReady(panorama.id);
    const run = await getStageRunByDesignId(env, panorama.id);
    expect(run?.status).toBe("success");

    const room = await env.DB.prepare(`SELECT progress FROM room_designs WHERE id = ?1`)
      .bind(rid)
      .first<{ progress: string }>();
    expect(room?.progress).toBe("panorama-ready");

    const detail = await getFloorPlanProjectDetail(env, billUser, projectId);
    const panoramaView = detail.rooms
      .find((r) => r.id === rid)
      ?.stageRuns.find((r) => r.stage === "panorama" && r.status === "success");
    expect(panoramaView?.outputAssetId).toBeTruthy();
    expect(panoramaView?.panoramaOrientation).toEqual({ yaw: 0, pitch: 0, hfov: 100 });

    await expect(assertCreditInvariant(env, billUser)).resolves.toBe(true);
  });

  it("skip panorama still completes room from confirmed render", async () => {
    const userId = await seedUser();
    const { roomId } = await setupConfirmedRender(userId);
    expect(await isRoomDesignComplete(env, roomId)).toBe(true);
  });

  it("max one processing panorama run per room design", async () => {
    const userId = await seedUser();
    const { sourceId, roomId, marker } = await setupConfirmedRender(userId);

    await createDesign(env, userId, stagePayload("panorama", sourceId, roomId, marker, "panorama-a"));
    await expect(assertNoProcessingRun(env, roomId, "panorama")).rejects.toMatchObject({
      code: "STAGE_PROCESSING",
    });
    await expect(
      createDesign(env, userId, stagePayload("panorama", sourceId, roomId, marker, "panorama-b"))
    ).rejects.toMatchObject({ code: "INVALID_INTENT", status: 409 });
  });
});

describe("Project Overview", () => {
  it("derives markedAreas, completeRooms, and currentRoom from Room Designs", async () => {
    const userId = await seedUser();
    const sourceId = await seedReadyAsset(userId);
    const { id: projectId } = await createFloorPlanProject(env, userId, sourceId);

    const roomA = await placeRoomMarker(env, userId, projectId, { x: 10, y: 10 });
    await proposeRoomBrief(env, userId, roomA.id);
    await confirmRoomBrief(env, userId, roomA.id);

    const layoutA = await createDesign(
      env,
      userId,
      stagePayload("layout", sourceId, roomA.id, { x: 10, y: 10 }, "ov-layout-a")
    );
    await runDesignToReady(layoutA.id);
    await confirmRoomLayout(env, userId, roomA.id, layoutA.id);

    const renderA = await createDesign(
      env,
      userId,
      stagePayload("render", sourceId, roomA.id, { x: 10, y: 10 }, "ov-render-a")
    );
    await runDesignToReady(renderA.id);
    await confirmRoomRender(env, userId, roomA.id, renderA.id);

    const roomB = await addNextRoomMarker(env, userId, projectId, { x: 80, y: 80 });

    const overview = (await getFloorPlanProjectDetail(env, userId, projectId)).overview;

    expect(overview.markedAreas).toBe(2);
    expect(overview.completeRooms).toBe(1);
    expect(overview.currentRoomId).toBe(roomB.id);
    expect(await isRoomDesignComplete(env, roomA.id)).toBe(true);
    expect(await isRoomDesignComplete(env, roomB.id)).toBe(false);
  });
});

describe("Stage run restore", () => {
  it("restores a previous successful layout as current lineage without deleting runs", async () => {
    const userId = await seedUser();
    const { sourceId, roomId, marker } = await setupConfirmedBrief(userId);

    const layoutA = await createDesign(
      env,
      userId,
      stagePayload("layout", sourceId, roomId, marker, "restore-layout-a")
    );
    await runDesignToReady(layoutA.id);
    await confirmRoomLayout(env, userId, roomId, layoutA.id);
    const runA = await getStageRunByDesignId(env, layoutA.id);

    const layoutB = await createDesign(
      env,
      userId,
      stagePayload("layout", sourceId, roomId, marker, "restore-layout-b")
    );
    await runDesignToReady(layoutB.id);
    await confirmRoomLayout(env, userId, roomId, layoutB.id);
    expect((await getActiveConfirmedStageRun(env, roomId, "layout"))?.id).toBe(
      (await getStageRunByDesignId(env, layoutB.id))?.id
    );

    await restoreStageRun(env, userId, runA!.id);
    expect((await getActiveConfirmedStageRun(env, roomId, "layout"))?.id).toBe(runA!.id);

    const { results: allRuns } = await env.DB.prepare(
      `SELECT id FROM floor_plan_stage_runs WHERE room_design_id = ?1 AND stage = 'layout'`
    )
      .bind(roomId)
      .all<{ id: string }>();
    expect(allRuns?.length).toBe(2);
  });

  it("restoring layout makes downstream render stale when layout lineage changes", async () => {
    const userId = await seedUser();
    const { sourceId, roomId, marker } = await setupConfirmedBrief(userId);

    const layoutA = await createDesign(
      env,
      userId,
      stagePayload("layout", sourceId, roomId, marker, "restore-stale-a")
    );
    await runDesignToReady(layoutA.id);
    await confirmRoomLayout(env, userId, roomId, layoutA.id);
    const runA = (await getStageRunByDesignId(env, layoutA.id))!;

    const renderA = await createDesign(
      env,
      userId,
      stagePayload("render", sourceId, roomId, marker, "restore-stale-render")
    );
    await runDesignToReady(renderA.id);
    const renderRun = (await getStageRunByDesignId(env, renderA.id))!;
    expect(await isStageRunStale(env, renderRun.id)).toBe(false);

    const layoutB = await createDesign(
      env,
      userId,
      stagePayload("layout", sourceId, roomId, marker, "restore-stale-b")
    );
    await runDesignToReady(layoutB.id);
    await confirmRoomLayout(env, userId, roomId, layoutB.id);
    expect(await isStageRunStale(env, renderRun.id)).toBe(true);

    await restoreStageRun(env, userId, runA.id);
    expect(await isStageRunStale(env, renderRun.id)).toBe(false);
  });
});

describe("Resume from server", () => {
  it("GET project detail returns processing tasks for mid-run resume", async () => {
    const userId = await seedUser();
    const { sourceId, projectId, roomId, marker } = await setupConfirmedBrief(userId);

    const layout = await createDesign(
      env,
      userId,
      stagePayload("layout", sourceId, roomId, marker, "resume-layout")
    );
    expect((await getStageRunByDesignId(env, layout.id))?.status).toBe("processing");

    const detail = await getFloorPlanProjectDetail(env, userId, projectId);
    expect(detail.sourceAssetId).toBe(sourceId);
    expect(detail.overview.markedAreas).toBe(1);
    expect(detail.overview.currentRoomId).toBe(roomId);
    expect(detail.processingTasks).toEqual([
      { designId: layout.id, stage: "layout", roomDesignId: roomId },
    ]);
    expect(detail.rooms[0]?.stageRuns.some((r) => r.status === "processing")).toBe(true);
  });
});

describe("Add Next Room isolation", () => {
  it("new marker does not change completed room marker or progress", async () => {
    const userId = await seedUser();
    const { sourceId, projectId, roomId, marker } = await setupConfirmedBrief(userId);

    const layout = await createDesign(
      env,
      userId,
      stagePayload("layout", sourceId, roomId, marker, "next-room-layout")
    );
    await runDesignToReady(layout.id);
    await confirmRoomLayout(env, userId, roomId, layout.id);

    const render = await createDesign(
      env,
      userId,
      stagePayload("render", sourceId, roomId, marker, "next-room-render")
    );
    await runDesignToReady(render.id);
    await confirmRoomRender(env, userId, roomId, render.id);

    const before = await env.DB.prepare(`SELECT * FROM room_designs WHERE id = ?1`)
      .bind(roomId)
      .first<{ marker_x: number; marker_y: number; progress: string; marker_locked: number }>();

    const next = await addNextRoomMarker(env, userId, projectId, { x: 70, y: 30 });

    const after = await env.DB.prepare(`SELECT * FROM room_designs WHERE id = ?1`)
      .bind(roomId)
      .first<{ marker_x: number; marker_y: number; progress: string; marker_locked: number }>();

    expect(after?.marker_x).toBe(before?.marker_x);
    expect(after?.marker_y).toBe(before?.marker_y);
    expect(after?.progress).toBe("render-ready");
    expect(after?.marker_locked).toBe(1);
    expect(next.markerLocked).toBe(false);
    expect(next.id).not.toBe(roomId);
  });
});

describe("Floor Plan stage commands validation & safety (Ticket #47)", () => {
  it("invalid commands leave Room Brief, active lineage, stage runs, assets, and credits unchanged", async () => {
    const userId = await seedUser();
    const { sourceId, roomId } = await setupConfirmedBrief(userId);

    const creditsBefore = await getAvailableCredits(env, userId);
    const roomBefore = await env.DB.prepare(`SELECT * FROM room_designs WHERE id = ?1`)
      .bind(roomId)
      .first<{ progress: string; proposal_json: string; brief_confirmed_at: number }>();
    const runsBefore = await env.DB.prepare(`SELECT COUNT(*) as c FROM floor_plan_stage_runs WHERE room_design_id = ?1`)
      .bind(roomId)
      .first<{ c: number }>();

    // 1. Attempting confirm layout when no layout run exists
    await expect(confirmRoomLayout(env, userId, roomId)).rejects.toMatchObject({
      code: "NOT_FOUND",
      status: 404,
    });

    // 2. Attempting confirm render when no render run exists
    await expect(confirmRoomRender(env, userId, roomId)).rejects.toMatchObject({
      code: "NOT_FOUND",
      status: 404,
    });

    // 3. Attempting invalid stage creation with malformed intent
    await expect(
      createDesign(env, userId, {
        sourceAssetId: sourceId,
        scene: "floor-plan",
        intent: { stage: "layout", marker: { x: -5, y: 50 }, roomId },
        idempotencyKey: "invalid-marker-intent",
      })
    ).rejects.toMatchObject({
      code: "INVALID_INTENT",
      status: 400,
    });

    // Verify invariants: credits, room design, runs, ledger untouched
    const creditsAfter = await getAvailableCredits(env, userId);
    expect(creditsAfter).toBe(creditsBefore);

    const roomAfter = await env.DB.prepare(`SELECT * FROM room_designs WHERE id = ?1`)
      .bind(roomId)
      .first<{ progress: string; proposal_json: string; brief_confirmed_at: number }>();
    expect(roomAfter?.progress).toBe(roomBefore?.progress);
    expect(roomAfter?.proposal_json).toBe(roomBefore?.proposal_json);
    expect(roomAfter?.brief_confirmed_at).toBe(roomBefore?.brief_confirmed_at);

    const runsAfter = await env.DB.prepare(`SELECT COUNT(*) as c FROM floor_plan_stage_runs WHERE room_design_id = ?1`)
      .bind(roomId)
      .first<{ c: number }>();
    expect(runsAfter?.c).toBe(runsBefore?.c);

    await expect(assertCreditInvariant(env, userId)).resolves.toBe(true);
  });

  it("enforces strict ownership across stage confirmations", async () => {
    const ownerId = await seedUser();
    const intruderId = await seedUser();
    const { roomId, sourceId, marker } = await setupConfirmedBrief(ownerId);

    // Other user cannot propose brief or confirm brief on owner's room
    await expect(proposeRoomBrief(env, intruderId, roomId)).rejects.toMatchObject({
      code: "FORBIDDEN",
      status: 403,
    });
    await expect(confirmRoomBrief(env, intruderId, roomId)).rejects.toMatchObject({
      code: "FORBIDDEN",
      status: 403,
    });

    // Owner creates layout
    const layout = await createDesign(
      env,
      ownerId,
      stagePayload("layout", sourceId, roomId, marker, "owner-layout")
    );
    await runDesignToReady(layout.id);

    // Intruder cannot confirm owner's layout
    await expect(confirmRoomLayout(env, intruderId, roomId, layout.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
      status: 403,
    });

    // Owner confirms layout
    await confirmRoomLayout(env, ownerId, roomId, layout.id);

    // Owner creates render
    const render = await createDesign(
      env,
      ownerId,
      stagePayload("render", sourceId, roomId, marker, "owner-render")
    );
    await runDesignToReady(render.id);

    // Intruder cannot confirm owner's render
    await expect(confirmRoomRender(env, intruderId, roomId, render.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
      status: 403,
    });

    // Intruder cannot restore owner's runs
    await expect(restoreStageRun(env, intruderId, layout.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
      status: 403,
    });
  });

  it("enforces stage prerequisites and gates transitions", async () => {
    const userId = await seedUser();
    const sourceId = await seedReadyAsset(userId);
    const { id: projectId } = await createFloorPlanProject(env, userId, sourceId);
    const room = await placeRoomMarker(env, userId, projectId, { x: 30, y: 30 });

    // Cannot confirm brief before brief proposal is generated
    await expect(confirmRoomBrief(env, userId, room.id)).rejects.toMatchObject({
      code: "BRIEF_NOT_READY",
      status: 409,
    });

    // Cannot run layout before brief confirmation
    await expect(
      createDesign(env, userId, stagePayload("layout", sourceId, room.id, { x: 30, y: 30 }, "no-brief-layout"))
    ).rejects.toMatchObject({
      code: "INVALID_INTENT",
      status: 409,
    });

    // Propose & confirm brief
    await proposeRoomBrief(env, userId, room.id);
    await confirmRoomBrief(env, userId, room.id);

    // Cannot run render before layout confirmation
    await expect(
      createDesign(env, userId, stagePayload("render", sourceId, room.id, { x: 30, y: 30 }, "no-layout-render"))
    ).rejects.toMatchObject({
      code: "INVALID_INTENT",
      status: 409,
    });
  });
});


async function applyMigrations(db: D1Database) {
  const drops = [
    "DROP TABLE IF EXISTS floor_plan_stage_runs",
    "DROP TABLE IF EXISTS room_designs",
    "DROP TABLE IF EXISTS project_shares",
    "DROP TABLE IF EXISTS project_assets",
    "DROP TABLE IF EXISTS designs",
    "DROP TABLE IF EXISTS projects",
    "DROP TABLE IF EXISTS ai_tasks",
    "DROP TABLE IF EXISTS idempotency_keys",
    "DROP TABLE IF EXISTS mock_payments",
    "DROP TABLE IF EXISTS credit_holds",
    "DROP TABLE IF EXISTS credit_ledger",
    "DROP TABLE IF EXISTS queue_events",
    "DROP TABLE IF EXISTS assets",
    "DROP TABLE IF EXISTS email_outbox",
    "DROP TABLE IF EXISTS verification",
    "DROP TABLE IF EXISTS account",
    "DROP TABLE IF EXISTS session",
    "DROP TABLE IF EXISTS user",
  ];
  for (const sql of drops) await db.prepare(sql).run();

  await db.batch([
    db.prepare(
      `CREATE TABLE user (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
        emailVerified INTEGER NOT NULL DEFAULT 0, image TEXT,
        createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL
      )`
    ),
    db.prepare(
      `CREATE TABLE assets (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, mime_type TEXT NOT NULL, size INTEGER NOT NULL,
        lifecycle TEXT NOT NULL DEFAULT 'pending-upload',
        storage_key TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
        user_id TEXT, declared_size INTEGER, actual_size INTEGER, width INTEGER, height INTEGER,
        created_by TEXT, deleted_at INTEGER, purge_at INTEGER, recovery_until INTEGER
      )`
    ),
    db.prepare(
      `CREATE TABLE projects (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('interior','exterior','floor-plan')),
        name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft', source_asset_id TEXT,
        favorite INTEGER NOT NULL DEFAULT 0, visibility TEXT NOT NULL DEFAULT 'private',
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
      )`
    ),
    db.prepare(
      `CREATE TABLE project_assets (
        project_id TEXT NOT NULL, asset_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('source','generated','share-selected')),
        created_at INTEGER NOT NULL,
        PRIMARY KEY (project_id, asset_id, role)
      )`
    ),
    db.prepare(
      `CREATE TABLE designs (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, project_id TEXT NOT NULL,
        scene TEXT NOT NULL CHECK (scene IN ('interior','exterior','floor-plan')),
        stage TEXT, provider TEXT NOT NULL, model TEXT NOT NULL, provider_scene TEXT NOT NULL,
        prompt TEXT NOT NULL, config_json TEXT NOT NULL, source_asset_id TEXT NOT NULL,
        output_asset_id TEXT, cost_credits INTEGER NOT NULL, idempotency_key TEXT NOT NULL,
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, completed_at INTEGER
      )`
    ),
    db.prepare(
      `CREATE TABLE room_designs (
        id TEXT PRIMARY KEY, project_id TEXT NOT NULL, user_id TEXT NOT NULL,
        marker_id TEXT NOT NULL, marker_x REAL NOT NULL, marker_y REAL NOT NULL,
        marker_locked INTEGER NOT NULL DEFAULT 0, brief_confirmed_at INTEGER,
        progress TEXT NOT NULL DEFAULT 'draft',
        recognition_json TEXT, proposal_json TEXT,
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
        UNIQUE (project_id, marker_id)
      )`
    ),
    db.prepare(
      `CREATE TABLE floor_plan_stage_runs (
        id TEXT PRIMARY KEY, room_design_id TEXT NOT NULL,
        stage TEXT NOT NULL CHECK (stage IN ('brief','layout','render','panorama')),
        status TEXT NOT NULL DEFAULT 'draft',
        design_id TEXT, confirmed_at INTEGER,
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
      )`
    ),
    db.prepare(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_fp_stage_runs_processing
        ON floor_plan_stage_runs(room_design_id, stage) WHERE status = 'processing'`
    ),
    db.prepare(
      `CREATE TABLE project_shares (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        token_digest TEXT NOT NULL,
        expires_at INTEGER,
        revoked_at INTEGER,
        created_at INTEGER NOT NULL,
        UNIQUE (token_digest)
      )`
    ),
    db.prepare(
      `CREATE TABLE credit_ledger (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL,
        entry_type TEXT NOT NULL CHECK (entry_type IN ('grant','payment','usage','hold','release')),
        amount INTEGER NOT NULL, reason TEXT NOT NULL, ref_type TEXT, ref_id TEXT, grant_key TEXT,
        created_at INTEGER NOT NULL
      )`
    ),
    db.prepare(
      `CREATE UNIQUE INDEX idx_credit_ledger_grant_key
        ON credit_ledger(user_id, grant_key) WHERE grant_key IS NOT NULL`
    ),
    db.prepare(
      `CREATE TABLE credit_holds (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL,
        amount INTEGER NOT NULL CHECK (amount > 0),
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','settled','released')),
        ref_type TEXT NOT NULL, ref_id TEXT NOT NULL, ledger_hold_id TEXT,
        created_at INTEGER NOT NULL, settled_at INTEGER, released_at INTEGER
      )`
    ),
    db.prepare(
      `CREATE UNIQUE INDEX idx_credit_holds_ref_active
        ON credit_holds(ref_type, ref_id) WHERE status = 'active'`
    ),
    db.prepare(
      `CREATE TABLE mock_payments (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL,
        pack TEXT NOT NULL, label TEXT NOT NULL, amount INTEGER NOT NULL,
        idempotency_key TEXT NOT NULL, ledger_entry_id TEXT NOT NULL, created_at INTEGER NOT NULL
      )`
    ),
    db.prepare(
      `CREATE TABLE idempotency_keys (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL,
        operation TEXT NOT NULL, idempotency_key TEXT NOT NULL,
        request_fingerprint TEXT NOT NULL, result_type TEXT NOT NULL, result_id TEXT NOT NULL,
        created_at INTEGER NOT NULL, UNIQUE (user_id, operation, idempotency_key)
      )`
    ),
    db.prepare(
      `CREATE TABLE ai_tasks (
        id TEXT PRIMARY KEY, scene TEXT NOT NULL, provider TEXT NOT NULL,
        model TEXT NOT NULL, prompt TEXT NOT NULL, source_key TEXT,
        status TEXT NOT NULL DEFAULT 'accepted',
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
        user_id TEXT, hold_id TEXT, cost_credits INTEGER, expires_at INTEGER, expired_at INTEGER,
        provider_task_id TEXT, error_code TEXT, validation_attempts INTEGER NOT NULL DEFAULT 0,
        dispatched_at INTEGER
      )`
    ),
    db.prepare(
      `CREATE TABLE queue_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT, queue TEXT NOT NULL,
        body TEXT NOT NULL, received_at INTEGER NOT NULL
      )`
    ),
  ]);
}
