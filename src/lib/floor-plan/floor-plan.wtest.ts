// Workers-runtime tests for ticket #10: Floor Plan project + Room Marker + Brief.

import { env } from "cloudflare:test";
import { describe, expect, it, beforeEach } from "vitest";
import { createDesign } from "@/lib/ai/lifecycle";
import { handleProviderNotify } from "@/lib/ai/notify-consumer";
import { buildPrompt } from "@/lib/ai/lifecycle";
import { DesignError } from "@/lib/ai/types";
import {
  assertLayoutStageAllowed,
  confirmRoomBrief,
  createFloorPlanProject,
  placeRoomMarker,
  proposeRoomBrief,
  updateRoomMarker,
  addNextRoomMarker,
} from "@/lib/floor-plan";
import { recognizeRoomRegion } from "@/lib/floor-plan/recognition";
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

function briefPayload(
  sourceAssetId: string,
  roomId: string,
  marker: { x: number; y: number },
  idempotencyKey: string
) {
  return {
    sourceAssetId,
    scene: "floor-plan",
    intent: { stage: "brief", marker, roomId },
    idempotencyKey,
  };
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
  it("records confirm and rejects layout stage with 501", async () => {
    const userId = await seedUser();
    const sourceId = await seedReadyAsset(userId);
    const { id: projectId } = await createFloorPlanProject(env, userId, sourceId);
    const room = await placeRoomMarker(env, userId, projectId, { x: 50, y: 50 });
    await proposeRoomBrief(env, userId, room.id);
    const confirmed = await confirmRoomBrief(env, userId, room.id);
    expect(confirmed.markerLocked).toBe(true);
    expect(confirmed.briefConfirmedAt).toBeTruthy();
    await expect(assertLayoutStageAllowed(env, userId, room.id)).resolves.toBeUndefined();

    await expect(
      createDesign(env, userId, {
        sourceAssetId: sourceId,
        scene: "floor-plan",
        intent: { stage: "layout", marker: { x: 50, y: 50 }, roomId: room.id },
        idempotencyKey: "idem-layout",
      })
    ).rejects.toMatchObject({ code: "SCENE_NOT_IMPLEMENTED", status: 501 });
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
      briefPayload(sourceId, room.id, { x: 25, y: 75 }, "idem-brief-run")
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
});

describe("buildPrompt floor-plan", () => {
  it("builds brief prompt and rejects layout", () => {
    const prompt = buildPrompt({
      sourceAssetId: "a1",
      mediaType: "image",
      scene: "floor-plan",
      stage: "brief",
      provider: "fake",
      model: "gemini-2.5-flash-image",
      providerScene: "room-design-brief",
      intent: { stage: "brief", marker: { x: 5, y: 95 }, roomId: "room-1" },
      options: {},
      cost: 1,
      idempotencyKey: "k",
    });
    expect(prompt).toContain("marker (5%, 95%)");
    expect(prompt).toContain("Do not fabricate measurements");

    expect(() =>
      buildPrompt({
        sourceAssetId: "a1",
        mediaType: "image",
        scene: "floor-plan",
        stage: "layout",
        provider: "fake",
        model: "gemini-2.5-flash-image",
        providerScene: "room-design-layout",
        intent: { stage: "layout", marker: { x: 1, y: 1 } },
        options: {},
        cost: 2,
        idempotencyKey: "k2",
      })
    ).toThrow(DesignError);
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
