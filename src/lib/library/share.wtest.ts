// Workers-runtime tests for ticket #09: unlisted read-only project sharing.
//
// Seams: createProjectShare, revokeProjectShare, setProjectVisibility,
//        getShareViewByToken, softDeleteProject, restoreProject,
//        restoreOwnerAsset, digestShareToken.

import { env } from "cloudflare:test";
import { describe, expect, it, beforeEach } from "vitest";
import {
  authorizeShareAssetDelivery,
  createProjectShare,
  deliverShareAsset,
  digestShareToken,
  generateShareToken,
  getShareViewByToken,
  restoreOwnerAsset,
  restoreProject,
  revokeProjectShare,
  setProjectVisibility,
  setShareSelectedAssets,
  softDeleteProject,
} from "@/lib/library/share";
import { deleteOwnerAsset } from "@/lib/library/assets";
import { confirmRoomLayout, isFloorPlanOutputActive, restoreStageRun } from "@/lib/floor-plan";
beforeEach(async () => {
  await applyMigrations(env.DB);
});

async function seedUser(): Promise<string> {
  const userId = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt)
     VALUES (?1, 'Test User', ?2, 1, ?3, ?3)`
  )
    .bind(userId, `${userId}@example.com`, Date.now())
    .run();
  return userId;
}

async function seedProject(userId: string, overrides: { name?: string; visibility?: string } = {}) {
  const id = crypto.randomUUID();
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO projects (id, user_id, kind, name, status, source_asset_id, favorite, visibility, created_at, updated_at)
     VALUES (?1, ?2, 'interior', ?3, 'draft', NULL, 0, ?4, ?5, ?5)`
  )
    .bind(id, userId, overrides.name ?? "Shared Room", overrides.visibility ?? "private", now)
    .run();
  return id;
}

async function seedReadyAsset(userId: string, storageKey: string) {
  const id = crypto.randomUUID();
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO assets (id, name, mime_type, size, lifecycle, storage_key, user_id,
       declared_size, actual_size, created_by, created_at, updated_at)
     VALUES (?1, 'output.png', 'image/png', 100, 'ready', ?2, ?3, 100, 100, 'test', ?4, ?4)`
  )
    .bind(id, storageKey, userId, now)
    .run();
  return id;
}

async function attachGenerated(projectId: string, assetId: string) {
  await env.DB.prepare(
    `INSERT INTO project_assets (project_id, asset_id, role, created_at) VALUES (?1, ?2, 'generated', ?3)`
  )
    .bind(projectId, assetId, Date.now())
    .run();
}

describe("project share tokens", () => {
  it("stores digest, never plaintext token", async () => {
    const userId = await seedUser();
    const projectId = await seedProject(userId);
    const { token, shareId } = await createProjectShare(env, userId, projectId);

    const row = await env.DB.prepare(`SELECT token_digest FROM project_shares WHERE id = ?1`)
      .bind(shareId)
      .first<{ token_digest: string }>();

    expect(row?.token_digest).toBe(await digestShareToken(token));
    expect(row?.token_digest).not.toBe(token);
    expect(row?.token_digest).toMatch(/^[0-9a-f]{64}$/);
  });

  it("generateShareToken produces high-entropy opaque values", () => {
    const a = generateShareToken();
    const b = generateShareToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(32);
  });
});

describe("anonymous share viewer", () => {
  it("returns minimal metadata and share-selected ready generated assets", async () => {
    const userId = await seedUser();
    const projectId = await seedProject(userId, { name: "Living Room" });
    const assetId = await seedReadyAsset(userId, `ready/${crypto.randomUUID()}.png`);
    await attachGenerated(projectId, assetId);

    const { token } = await createProjectShare(env, userId, projectId, { assetIds: [assetId] });
    const view = await getShareViewByToken(env, token);

    expect(view).toMatchObject({
      name: "Living Room",
      kind: "interior",
      assets: [{ id: assetId, mimeType: "image/png" }],
    });
    expect(view).not.toHaveProperty("ownerId");
    expect(view).not.toHaveProperty("storageKey");
  });

  it("excludes share-selected assets that are no longer the active generated output", async () => {
    const userId = await seedUser();
    const projectId = await seedProject(userId);
    const superseded = await seedReadyAsset(userId, `ready/old.png`);
    const newCurrent = await seedReadyAsset(userId, `ready/new.png`);
    await attachGenerated(projectId, superseded);
    await setShareSelectedAssets(env, userId, projectId, [superseded]);
    await env.DB.prepare(
      `DELETE FROM project_assets WHERE project_id = ?1 AND asset_id = ?2 AND role = 'generated'`
    )
      .bind(projectId, superseded)
      .run();
    await attachGenerated(projectId, newCurrent);

    const { token } = await createProjectShare(env, userId, projectId);
    const view = await getShareViewByToken(env, token);
    expect(view?.assets).toHaveLength(0);
  });
});

describe("share access control", () => {
  it("returns null after revoke", async () => {
    const userId = await seedUser();
    const projectId = await seedProject(userId);
    const { token } = await createProjectShare(env, userId, projectId);

    expect(await getShareViewByToken(env, token)).not.toBeNull();
    await revokeProjectShare(env, userId, projectId);
    expect(await getShareViewByToken(env, token)).toBeNull();
  });

  it("returns null after optional expiry", async () => {
    const userId = await seedUser();
    const projectId = await seedProject(userId);
    const past = Date.now() - 60_000;
    const { token } = await createProjectShare(env, userId, projectId, { expiresAt: past });
    expect(await getShareViewByToken(env, token)).toBeNull();
  });

  it("returns null when project is set private", async () => {
    const userId = await seedUser();
    const projectId = await seedProject(userId);
    const { token } = await createProjectShare(env, userId, projectId);

    await setProjectVisibility(env, userId, projectId, "private");
    expect(await getShareViewByToken(env, token)).toBeNull();
  });

  it("returns null when project is deleted", async () => {
    const userId = await seedUser();
    const projectId = await seedProject(userId);
    const { token } = await createProjectShare(env, userId, projectId);

    await softDeleteProject(env, userId, projectId);
    expect(await getShareViewByToken(env, token)).toBeNull();
  });

  it("unlisted visibility alone does not grant access without project_shares row", async () => {
    const userId = await seedUser();
    const projectId = await seedProject(userId, { visibility: "unlisted" });
    const fakeToken = generateShareToken();
    expect(await getShareViewByToken(env, fakeToken)).toBeNull();

    await env.DB.prepare(`UPDATE projects SET visibility = 'unlisted' WHERE id = ?1`).bind(projectId).run();
    expect(await getShareViewByToken(env, fakeToken)).toBeNull();
  });
});

describe("restore does not re-enable old share", () => {
  it("restore project keeps share revoked and selection cleared", async () => {
    const userId = await seedUser();
    const projectId = await seedProject(userId);
    const assetId = await seedReadyAsset(userId, `ready/${crypto.randomUUID()}.png`);
    await attachGenerated(projectId, assetId);

    const { token } = await createProjectShare(env, userId, projectId, { assetIds: [assetId] });
    await softDeleteProject(env, userId, projectId);
    expect(await getShareViewByToken(env, token)).toBeNull();

    await restoreProject(env, userId, projectId);
    expect(await getShareViewByToken(env, token)).toBeNull();

    const selection = await env.DB.prepare(
      `SELECT COUNT(*) AS cnt FROM project_assets WHERE project_id = ?1 AND role = 'share-selected'`
    )
      .bind(projectId)
      .first<{ cnt: number }>();
    expect(selection?.cnt).toBe(0);
  });

  it("restore asset does not restore share-selected role", async () => {
    const userId = await seedUser();
    const projectId = await seedProject(userId);
    const assetId = await seedReadyAsset(userId, `ready/${crypto.randomUUID()}.png`);
    await attachGenerated(projectId, assetId);

    const { token } = await createProjectShare(env, userId, projectId, { assetIds: [assetId] });
    await deleteOwnerAsset(env, userId, assetId);
    expect(await getShareViewByToken(env, token)).not.toBeNull();
    expect((await getShareViewByToken(env, token))?.assets).toHaveLength(0);

    await restoreOwnerAsset(env, userId, assetId);
    expect((await getShareViewByToken(env, token))?.assets).toHaveLength(0);
  });
});

async function seedFloorPlanProject(userId: string, sourceAssetId?: string) {
  const id = crypto.randomUUID();
  const sourceId = sourceAssetId ?? (await seedReadyAsset(userId, `source/${id}.png`));
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO projects (id, user_id, kind, name, status, source_asset_id, favorite, visibility, created_at, updated_at)
     VALUES (?1, ?2, 'floor-plan', 'Floor Plan Project', 'draft', ?3, 0, 'private', ?4, ?4)`
  )
    .bind(id, userId, sourceId, now)
    .run();
  await env.DB.prepare(
    `INSERT INTO project_assets (project_id, asset_id, role, created_at) VALUES (?1, ?2, 'source', ?3)`
  )
    .bind(id, sourceId, now)
    .run();
  return { projectId: id, sourceId };
}

async function seedRoomDesign(
  projectId: string,
  userId: string,
  briefConfirmed = true,
  markerId = "marker-1"
) {
  const id = crypto.randomUUID();
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO room_designs (id, project_id, user_id, marker_id, marker_x, marker_y, marker_locked, brief_confirmed_at, progress, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, 50, 50, ?5, ?6, ?7, ?8, ?8)`
  )
    .bind(
      id,
      projectId,
      userId,
      markerId,
      briefConfirmed ? 1 : 0,
      briefConfirmed ? now : null,
      briefConfirmed ? "analyzed" : "draft",
      now
    )
    .run();
  return id;
}

async function seedFloorPlanRun(
  projectId: string,
  userId: string,
  roomDesignId: string,
  stage: "layout" | "render" | "panorama",
  options: {
    status?: string;
    confirmedAt?: number | null;
    upstreamRunId?: string;
    assetLifecycle?: string;
    userIdOverride?: string;
    configJsonOverride?: string;
  } = {}
) {
  const designId = crypto.randomUUID();
  const outputAssetId = crypto.randomUUID();
  const now = Date.now();
  const status = options.status ?? "confirmed";
  const confirmedAt = options.confirmedAt ?? (status === "confirmed" ? now : null);
  const lifecycle = options.assetLifecycle ?? "ready";
  const owner = options.userIdOverride ?? userId;
  const storageKey = `ready/${outputAssetId}.png`;

  await env.DB.prepare(
    `INSERT INTO assets (id, name, mime_type, size, lifecycle, storage_key, user_id,
       declared_size, actual_size, created_by, created_at, updated_at)
     VALUES (?1, '${stage}.png', 'image/png', 100, ?2, ?3, ?4, 100, 100, 'test', ?5, ?5)`
  )
    .bind(outputAssetId, lifecycle, lifecycle === "ready" ? storageKey : null, owner, now)
    .run();

  await env.DB.prepare(
    `INSERT INTO project_assets (project_id, asset_id, role, created_at) VALUES (?1, ?2, 'generated', ?3)`
  )
    .bind(projectId, outputAssetId, now)
    .run();

  if (lifecycle === "ready") {
    await env.HD_PRIVATE.put(storageKey, new Uint8Array([1, 2, 3, 4]), {
      httpMetadata: { contentType: "image/png" },
    });
  }

  const config = {
    scene: "floor-plan",
    stage,
    intent: {
      stage,
      roomId: roomDesignId,
      ...(stage === "render" && options.upstreamRunId ? { layoutRunId: options.upstreamRunId } : {}),
      ...(stage === "panorama" && options.upstreamRunId ? { renderRunId: options.upstreamRunId } : {}),
    },
  };

  const configJson = options.configJsonOverride ?? JSON.stringify(config);
  await env.DB.prepare(
    `INSERT INTO designs (id, user_id, project_id, scene, stage, provider, model, provider_scene, prompt,
       config_json, source_asset_id, output_asset_id, cost_credits, idempotency_key, created_at, updated_at, completed_at)
     VALUES (?1, ?2, ?3, 'floor-plan', ?4, 'test', 'test', 'test', 'prompt', ?5, 'source-1', ?6, 1, ?7, ?8, ?8, ?8)`
  )
    .bind(designId, owner, projectId, stage, configJson, outputAssetId, `idem-${designId}`, now)
    .run();
  await env.DB.prepare(
    `INSERT INTO floor_plan_stage_runs (id, room_design_id, stage, status, design_id, confirmed_at, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)`
  )
    .bind(designId, roomDesignId, stage, status, designId, confirmedAt, now)
    .run();

  return { designId, stageRunId: designId, outputAssetId, storageKey };
}

describe("floor plan share selection validation (AC 1)", () => {
  it("rejects source assets with ASSET_NOT_SHAREABLE", async () => {
    const userId = await seedUser();
    const { projectId, sourceId } = await seedFloorPlanProject(userId);
    await expect(
      createProjectShare(env, userId, projectId, { assetIds: [sourceId] })
    ).rejects.toThrow("ASSET_NOT_SHAREABLE");
  });

  it("rejects non-ready outputs with ASSET_NOT_SHAREABLE", async () => {
    const userId = await seedUser();
    const { projectId } = await seedFloorPlanProject(userId);
    const roomId = await seedRoomDesign(projectId, userId);
    const layout = await seedFloorPlanRun(projectId, userId, roomId, "layout", {
      assetLifecycle: "quarantined",
    });
    await expect(
      createProjectShare(env, userId, projectId, { assetIds: [layout.outputAssetId] })
    ).rejects.toThrow("ASSET_NOT_SHAREABLE");
  });

  it("rejects outputs from another project with ASSET_NOT_SHAREABLE", async () => {
    const userId = await seedUser();
    const { projectId: proj1 } = await seedFloorPlanProject(userId);
    const { projectId: proj2 } = await seedFloorPlanProject(userId);
    const room2 = await seedRoomDesign(proj2, userId);
    const layout2 = await seedFloorPlanRun(proj2, userId, room2, "layout");

    await expect(
      createProjectShare(env, userId, proj1, { assetIds: [layout2.outputAssetId] })
    ).rejects.toThrow("ASSET_NOT_SHAREABLE");
  });

  it("rejects outputs from another user with FORBIDDEN", async () => {
    const user1 = await seedUser();
    const user2 = await seedUser();
    const { projectId } = await seedFloorPlanProject(user1);
    const roomId = await seedRoomDesign(projectId, user1);
    const layout = await seedFloorPlanRun(projectId, user1, roomId, "layout", {
      userIdOverride: user2,
    });

    await expect(
      createProjectShare(env, user1, projectId, { assetIds: [layout.outputAssetId] })
    ).rejects.toThrow("FORBIDDEN");
  });

  it("rejects unconfirmed layout run with ASSET_NOT_SHAREABLE", async () => {
    const userId = await seedUser();
    const { projectId } = await seedFloorPlanProject(userId);
    const roomId = await seedRoomDesign(projectId, userId);
    const layout = await seedFloorPlanRun(projectId, userId, roomId, "layout", {
      status: "success",
      confirmedAt: null,
    });

    await expect(
      createProjectShare(env, userId, projectId, { assetIds: [layout.outputAssetId] })
    ).rejects.toThrow("ASSET_NOT_SHAREABLE");
  });

  it("rejects unconfirmed render run with ASSET_NOT_SHAREABLE", async () => {
    const userId = await seedUser();
    const { projectId } = await seedFloorPlanProject(userId);
    const roomId = await seedRoomDesign(projectId, userId);
    const layout = await seedFloorPlanRun(projectId, userId, roomId, "layout");
    const render = await seedFloorPlanRun(projectId, userId, roomId, "render", {
      upstreamRunId: layout.stageRunId,
      status: "success",
      confirmedAt: null,
    });

    await expect(
      createProjectShare(env, userId, projectId, { assetIds: [render.outputAssetId] })
    ).rejects.toThrow("ASSET_NOT_SHAREABLE");
  });

  it("rejects superseded history layout run with ASSET_NOT_SHAREABLE", async () => {
    const userId = await seedUser();
    const { projectId } = await seedFloorPlanProject(userId);
    const roomId = await seedRoomDesign(projectId, userId);
    const layoutA = await seedFloorPlanRun(projectId, userId, roomId, "layout", {
      confirmedAt: 1000,
    });
    await seedFloorPlanRun(projectId, userId, roomId, "layout", {
      confirmedAt: 2000,
    });

    await expect(
      createProjectShare(env, userId, projectId, { assetIds: [layoutA.outputAssetId] })
    ).rejects.toThrow("ASSET_NOT_SHAREABLE");
  });

  it("rejects stale render output whose upstream layout was superseded", async () => {
    const userId = await seedUser();
    const { projectId } = await seedFloorPlanProject(userId);
    const roomId = await seedRoomDesign(projectId, userId);
    const layoutA = await seedFloorPlanRun(projectId, userId, roomId, "layout", {
      confirmedAt: 1000,
    });
    const renderA = await seedFloorPlanRun(projectId, userId, roomId, "render", {
      upstreamRunId: layoutA.stageRunId,
      confirmedAt: 1500,
    });
    // Confirm new layout B
    await seedFloorPlanRun(projectId, userId, roomId, "layout", {
      confirmedAt: 2000,
    });

    await expect(
      createProjectShare(env, userId, projectId, { assetIds: [renderA.outputAssetId] })
    ).rejects.toThrow("ASSET_NOT_SHAREABLE");
  });

  it("accepts valid active confirmed layout, render, and panorama outputs", async () => {
    const userId = await seedUser();
    const { projectId } = await seedFloorPlanProject(userId);
    const roomId = await seedRoomDesign(projectId, userId);
    const layout = await seedFloorPlanRun(projectId, userId, roomId, "layout");
    const render = await seedFloorPlanRun(projectId, userId, roomId, "render", {
      upstreamRunId: layout.stageRunId,
    });
    const panorama = await seedFloorPlanRun(projectId, userId, roomId, "panorama", {
      upstreamRunId: render.stageRunId,
      status: "success",
    });

    const { token } = await createProjectShare(env, userId, projectId, {
      assetIds: [layout.outputAssetId, render.outputAssetId, panorama.outputAssetId],
    });
    const view = await getShareViewByToken(env, token);
    expect(view?.assets).toHaveLength(3);
  });
});

describe("floor plan share read-time lineage and auto-hiding (AC 2 & AC 4)", () => {
  it("regenerating upstream stage does NOT invalidate existing share until replacement run is confirmed", async () => {
    const userId = await seedUser();
    const { projectId } = await seedFloorPlanProject(userId);
    const roomId = await seedRoomDesign(projectId, userId);
    const layoutA = await seedFloorPlanRun(projectId, userId, roomId, "layout", {
      confirmedAt: 1000,
    });
    const renderA = await seedFloorPlanRun(projectId, userId, roomId, "render", {
      upstreamRunId: layoutA.stageRunId,
      confirmedAt: 1500,
    });

    const { token } = await createProjectShare(env, userId, projectId, {
      assetIds: [renderA.outputAssetId],
    });

    // View shows renderA
    const view1 = await getShareViewByToken(env, token);
    expect(view1?.assets).toEqual([{ id: renderA.outputAssetId, mimeType: "image/png" }]);

    // Regenerate layout (layoutB) in success state, but NOT confirmed yet
    await seedFloorPlanRun(projectId, userId, roomId, "layout", {
      status: "success",
      confirmedAt: null,
    });

    // Share view STILL shows renderA because layoutB is unconfirmed
    const view2 = await getShareViewByToken(env, token);
    expect(view2?.assets).toEqual([{ id: renderA.outputAssetId, mimeType: "image/png" }]);

    const delivery = await authorizeShareAssetDelivery(env, token, renderA.outputAssetId);
    expect(delivery).not.toBeNull();
  });

  it("confirming replacement layout automatically hides old render and panorama from share view and delivery", async () => {
    const userId = await seedUser();
    const { projectId } = await seedFloorPlanProject(userId);
    const roomId = await seedRoomDesign(projectId, userId);
    const layoutA = await seedFloorPlanRun(projectId, userId, roomId, "layout", {
      confirmedAt: 1000,
    });
    const renderA = await seedFloorPlanRun(projectId, userId, roomId, "render", {
      upstreamRunId: layoutA.stageRunId,
      confirmedAt: 1500,
    });
    const panoramaA = await seedFloorPlanRun(projectId, userId, roomId, "panorama", {
      upstreamRunId: renderA.stageRunId,
      status: "success",
    });

    const { token } = await createProjectShare(env, userId, projectId, {
      assetIds: [renderA.outputAssetId, panoramaA.outputAssetId],
    });

    const view1 = await getShareViewByToken(env, token);
    expect(view1?.assets).toHaveLength(2);

    // Generate and confirm replacement layoutB
    const layoutB = await seedFloorPlanRun(projectId, userId, roomId, "layout", {
      status: "success",
      confirmedAt: null,
    });
    await confirmRoomLayout(env, userId, roomId, layoutB.designId);

    // Share view automatically hides renderA and panoramaA without modifying the share
    const view2 = await getShareViewByToken(env, token);
    expect(view2?.assets).toHaveLength(0);

    // Delivery routes reject stale assets
    const renderDelivery = await authorizeShareAssetDelivery(env, token, renderA.outputAssetId);
    expect(renderDelivery).toBeNull();
    const renderResponse = await deliverShareAsset(env, token, renderA.outputAssetId);
    expect(renderResponse).toBeNull();

    const panoDelivery = await authorizeShareAssetDelivery(env, token, panoramaA.outputAssetId);
    expect(panoDelivery).toBeNull();
  });

  it("restoring previous layout run restores visibility of old render and panorama", async () => {
    const userId = await seedUser();
    const { projectId } = await seedFloorPlanProject(userId);
    const roomId = await seedRoomDesign(projectId, userId);
    const layoutA = await seedFloorPlanRun(projectId, userId, roomId, "layout", {
      confirmedAt: 1000,
    });
    const renderA = await seedFloorPlanRun(projectId, userId, roomId, "render", {
      upstreamRunId: layoutA.stageRunId,
      confirmedAt: 1500,
    });

    const { token } = await createProjectShare(env, userId, projectId, {
      assetIds: [renderA.outputAssetId],
    });

    // Confirm layoutB -> renderA becomes stale
    const layoutB = await seedFloorPlanRun(projectId, userId, roomId, "layout", {
      status: "success",
      confirmedAt: null,
    });
    await confirmRoomLayout(env, userId, roomId, layoutB.designId);
    expect((await getShareViewByToken(env, token))?.assets).toHaveLength(0);

    // Restore layoutA -> renderA becomes active again
    await restoreStageRun(env, userId, layoutA.stageRunId);
    const view = await getShareViewByToken(env, token);
    expect(view?.assets).toEqual([{ id: renderA.outputAssetId, mimeType: "image/png" }]);

    const delivery = await deliverShareAsset(env, token, renderA.outputAssetId);
    expect(delivery).not.toBeNull();
    expect(delivery?.status).toBe(200);
    expect(delivery?.headers.get("Content-Type")).toBe("image/png");
    expect(delivery?.headers.get("Content-Disposition")).toBe("inline");
  });
});

describe("authorized share asset delivery security (AC 3)", () => {
  it("delivers asset binary inline without leaking R2 keys", async () => {
    const userId = await seedUser();
    const projectId = await seedProject(userId);
    const assetId = await seedReadyAsset(userId, `ready/${crypto.randomUUID()}.png`);
    await attachGenerated(projectId, assetId);

    await env.HD_PRIVATE.put(`ready/${assetId}.png`, new Uint8Array([1, 2, 3]), {
      httpMetadata: { contentType: "image/png" },
    });
    // Update storage_key to match
    await env.DB.prepare(`UPDATE assets SET storage_key = ?2 WHERE id = ?1`)
      .bind(assetId, `ready/${assetId}.png`)
      .run();

    const { token } = await createProjectShare(env, userId, projectId, { assetIds: [assetId] });
    const res = await deliverShareAsset(env, token, assetId);

    expect(res).not.toBeNull();
    expect(res?.status).toBe(200);
    expect(res?.headers.get("Content-Type")).toBe("image/png");
    expect(res?.headers.get("Content-Disposition")).toBe("inline");
    expect(res?.headers.get("Cache-Control")).toBe("private, no-store");
    expect(res?.headers.get("x-amz-request-id")).toBeNull();
  });

  it("denies delivery for non-selected asset or invalid token", async () => {
    const userId = await seedUser();
    const projectId = await seedProject(userId);
    const asset1 = await seedReadyAsset(userId, `ready/1.png`);
    const asset2 = await seedReadyAsset(userId, `ready/2.png`);
    await attachGenerated(projectId, asset1);
    await attachGenerated(projectId, asset2);

    const { token } = await createProjectShare(env, userId, projectId, { assetIds: [asset1] });

    // Non-selected asset
    expect(await deliverShareAsset(env, token, asset2)).toBeNull();
    // Invalid token
    expect(await deliverShareAsset(env, "test-invalid-token", asset1)).toBeNull();
    // ShareTokenAssetRef object cluster invocation
    expect(await deliverShareAsset(env, { token: "test-invalid-token", assetId: asset1 })).toBeNull();
    expect(await authorizeShareAssetDelivery(env, { token: "test-invalid-token", assetId: asset1 })).toBeNull();
  });
});
describe("multi-asset batch Floor Plan lineage resolution (Spec #63 / Ticket #65)", () => {
  it("resolves multi-room and multi-stage active lineage in batch and filters inactive outputs", async () => {
    const userId = await seedUser();
    const { projectId } = await seedFloorPlanProject(userId);
    const room1 = await seedRoomDesign(projectId, userId, true, "marker-1");
    const room2 = await seedRoomDesign(projectId, userId, true, "marker-2");

    // Room 1: superseded layout (layout1a), active layout (layout1b), active render (render1), active panorama (pano1)
    const layout1a = await seedFloorPlanRun(projectId, userId, room1, "layout", {
      confirmedAt: 1000,
    });
    const layout1b = await seedFloorPlanRun(projectId, userId, room1, "layout", {
      confirmedAt: 2000,
    });
    const render1 = await seedFloorPlanRun(projectId, userId, room1, "render", {
      upstreamRunId: layout1b.stageRunId,
      confirmedAt: 2500,
    });
    const pano1 = await seedFloorPlanRun(projectId, userId, room1, "panorama", {
      upstreamRunId: render1.stageRunId,
      status: "success",
    });

    // Room 2: active layout (layout2), stale render (render2 pointing to old layout), unconfirmed layout (layout2_unconfirmed)
    const layout2 = await seedFloorPlanRun(projectId, userId, room2, "layout", {
      confirmedAt: 1000,
    });
    const render2 = await seedFloorPlanRun(projectId, userId, room2, "render", {
      upstreamRunId: "non-existent-layout-id",
      confirmedAt: 1500,
    });
    const layout2Unconfirmed = await seedFloorPlanRun(projectId, userId, room2, "layout", {
      status: "success",
      confirmedAt: null,
    });

    // Selecting active assets succeeds in batch
    const { token } = await createProjectShare(env, userId, projectId, {
      assetIds: [layout1b.outputAssetId, render1.outputAssetId, pano1.outputAssetId, layout2.outputAssetId],
    });

    const view = await getShareViewByToken(env, token);
    expect(view?.assets).toHaveLength(4);
    const viewAssetIds = view?.assets.map((a) => a.id);
    expect(viewAssetIds).toContain(layout1b.outputAssetId);
    expect(viewAssetIds).toContain(render1.outputAssetId);
    expect(viewAssetIds).toContain(pano1.outputAssetId);
    expect(viewAssetIds).toContain(layout2.outputAssetId);

    // Reject selecting superseded layout1a
    await expect(
      createProjectShare(env, userId, projectId, { assetIds: [layout1a.outputAssetId] })
    ).rejects.toThrow("ASSET_NOT_SHAREABLE");

    // Reject selecting stale render2
    await expect(
      createProjectShare(env, userId, projectId, { assetIds: [render2.outputAssetId] })
    ).rejects.toThrow("ASSET_NOT_SHAREABLE");

    // Reject selecting unconfirmed layout2Unconfirmed
    await expect(
      createProjectShare(env, userId, projectId, { assetIds: [layout2Unconfirmed.outputAssetId] })
    ).rejects.toThrow("ASSET_NOT_SHAREABLE");
  });

  it("multi-asset share view excludes superseded and stale outputs in batch without mutating selection", async () => {
    const userId = await seedUser();
    const { projectId } = await seedFloorPlanProject(userId);
    const room1 = await seedRoomDesign(projectId, userId, true, "marker-1");
    const room2 = await seedRoomDesign(projectId, userId, true, "marker-2");
    const layout1 = await seedFloorPlanRun(projectId, userId, room1, "layout", { confirmedAt: 1000 });
    const render1 = await seedFloorPlanRun(projectId, userId, room1, "render", {
      upstreamRunId: layout1.stageRunId,
      confirmedAt: 1500,
    });
    const pano1 = await seedFloorPlanRun(projectId, userId, room1, "panorama", {
      upstreamRunId: render1.stageRunId,
      status: "success",
    });

    const layout2 = await seedFloorPlanRun(projectId, userId, room2, "layout", { confirmedAt: 1000 });
    const render2 = await seedFloorPlanRun(projectId, userId, room2, "render", {
      upstreamRunId: layout2.stageRunId,
      confirmedAt: 1500,
    });

    const { token } = await createProjectShare(env, userId, projectId, {
      assetIds: [layout1.outputAssetId, render1.outputAssetId, pano1.outputAssetId, layout2.outputAssetId, render2.outputAssetId],
    });

    const viewBefore = await getShareViewByToken(env, token);
    expect(viewBefore?.assets).toHaveLength(5);

    // Replace layout in room1 with layout1_new and confirm it
    const layout1New = await seedFloorPlanRun(projectId, userId, room1, "layout", {
      status: "success",
      confirmedAt: null,
    });
    await confirmRoomLayout(env, userId, room1, layout1New.designId);

    // Now in room1: layout1 is superseded, render1 is stale, pano1 is stale.
    // In room2: layout2 and render2 are still active.
    const viewAfter = await getShareViewByToken(env, token);
    expect(viewAfter?.assets).toHaveLength(2);
    const activeIds = viewAfter?.assets.map((a) => a.id);
    expect(activeIds).toEqual(expect.arrayContaining([layout2.outputAssetId, render2.outputAssetId]));
    expect(activeIds).not.toContain(layout1.outputAssetId);
    expect(activeIds).not.toContain(render1.outputAssetId);
    expect(activeIds).not.toContain(pano1.outputAssetId);
  });

  it("interior and exterior multi-asset share views are preserved without floor-plan lineage calls", async () => {
    const userId = await seedUser();
    const projectId = await seedProject(userId, { visibility: "private" });
    const asset1 = await seedReadyAsset(userId, `ready/${crypto.randomUUID()}.png`);
    const asset2 = await seedReadyAsset(userId, `ready/${crypto.randomUUID()}.png`);
    await attachGenerated(projectId, asset1);
    await attachGenerated(projectId, asset2);

    const { token } = await createProjectShare(env, userId, projectId, {
      assetIds: [asset1, asset2],
    });

    const view = await getShareViewByToken(env, token);
    expect(view?.kind).toBe("interior");
    expect(view?.assets).toHaveLength(2);
    expect(view?.assets.map((a) => a.id)).toEqual(expect.arrayContaining([asset1, asset2]));
  });
  it("treats render/panorama with missing/malformed config or missing upstream id as non-stale (exact semantic parity)", async () => {
    const userId = await seedUser();
    const { projectId } = await seedFloorPlanProject(userId);
    const room1 = await seedRoomDesign(projectId, userId, true, "marker-1");
    const room2 = await seedRoomDesign(projectId, userId, true, "marker-2");
    const room3 = await seedRoomDesign(projectId, userId, true, "marker-3");
    const room4 = await seedRoomDesign(projectId, userId, true, "marker-4");

    // 1. Render with missing upstream run id in intent (active confirmed run for room1)
    const renderNoUpstream = await seedFloorPlanRun(projectId, userId, room1, "render", {
      configJsonOverride: JSON.stringify({ scene: "floor-plan", stage: "render", intent: { stage: "render", roomId: room1 } }),
      confirmedAt: 1000,
    });

    // 2. Render with malformed JSON in config_json (active confirmed run for room2)
    const renderMalformed = await seedFloorPlanRun(projectId, userId, room2, "render", {
      configJsonOverride: "INVALID_JSON{",
      confirmedAt: 1100,
    });

    // 3. Panorama with missing upstream run id in intent
    const panoNoUpstream = await seedFloorPlanRun(projectId, userId, room3, "panorama", {
      configJsonOverride: JSON.stringify({ scene: "floor-plan", stage: "panorama", intent: { stage: "panorama", roomId: room3 } }),
      status: "success",
    });

    // 4. Panorama with malformed JSON in config_json
    const panoMalformed = await seedFloorPlanRun(projectId, userId, room4, "panorama", {
      configJsonOverride: "{malformed_json",
      status: "success",
    });

    // All should be considered active / shareable (exact parity with isStageRunStale returning false)
    const { token } = await createProjectShare(env, userId, projectId, {
      assetIds: [
        renderNoUpstream.outputAssetId,
        renderMalformed.outputAssetId,
        panoNoUpstream.outputAssetId,
        panoMalformed.outputAssetId,
      ],
    });
    const view = await getShareViewByToken(env, token);
    expect(view?.assets).toHaveLength(4);
    const activeIds = view?.assets.map((a) => a.id);
    expect(activeIds).toContain(renderNoUpstream.outputAssetId);
    expect(activeIds).toContain(renderMalformed.outputAssetId);
    expect(activeIds).toContain(panoNoUpstream.outputAssetId);
    expect(activeIds).toContain(panoMalformed.outputAssetId);

    // Verify single-output isFloorPlanOutputActive seam preserves the same non-stale semantics
    expect(await isFloorPlanOutputActive(env, projectId, renderNoUpstream.outputAssetId)).toBe(true);
    expect(await isFloorPlanOutputActive(env, projectId, renderMalformed.outputAssetId)).toBe(true);
    expect(await isFloorPlanOutputActive(env, projectId, panoNoUpstream.outputAssetId)).toBe(true);
    expect(await isFloorPlanOutputActive(env, projectId, panoMalformed.outputAssetId)).toBe(true);
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
    "DROP TABLE IF EXISTS assets",
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
        lifecycle TEXT NOT NULL DEFAULT 'pending-upload'
          CHECK (lifecycle IN ('pending-upload','quarantined','ready','rejected','deleted')),
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
  ]);
}
