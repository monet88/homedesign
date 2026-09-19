import { env } from "cloudflare:test";
import { describe, expect, it, beforeEach } from "vitest";
import type { Env } from "@/lib/bindings";
import {
  createDesign,
  getDesignStatus,
  getTask,
  getDesign,
} from "@/lib/ai/lifecycle";
import { handleProviderNotify } from "@/lib/ai/notify-consumer";
import {
  ensureFreeCreditGrant,
  getAvailableCredits,
  getLedgerSummary,
  assertCreditInvariant,
  getActiveHoldByRef,
} from "@/lib/credits/ledger";
import { validPngBytes } from "@/lib/fixtures/images";
import { resetProviders } from "@/lib/ai/provider-adapter";

beforeEach(async () => {
  await applyMigrations(env.DB);
  resetProviders();
});

async function applyMigrations(db: D1Database) {
  await db.batch([
    db.prepare(
      `CREATE TABLE IF NOT EXISTS user (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
        emailVerified INTEGER NOT NULL DEFAULT 0, role TEXT NOT NULL DEFAULT 'user',
        image TEXT, createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL
      )`
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS assets (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, mime_type TEXT NOT NULL,
        size INTEGER NOT NULL, lifecycle TEXT NOT NULL
          CHECK (lifecycle IN ('pending-upload','quarantined','ready','rejected','deleted')),
        storage_key TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
        sha256 TEXT, width INTEGER, height INTEGER, declared_size INTEGER, actual_size INTEGER,
        rejection_reason TEXT, intake_attempts INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, quarantined_at INTEGER,
        promoted_at INTEGER, rejected_at INTEGER, last_scanned_at INTEGER,
        created_by TEXT, deleted_at INTEGER, purge_at INTEGER, recovery_until INTEGER
      )`
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('interior','exterior','floor-plan')),
        name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft', source_asset_id TEXT,
        favorite INTEGER NOT NULL DEFAULT 0, visibility TEXT NOT NULL DEFAULT 'private',
        workspace_id TEXT,
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
      )`
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS project_assets (
        project_id TEXT NOT NULL, asset_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('source','generated','share-selected')),
        created_at INTEGER NOT NULL,
        PRIMARY KEY (project_id, asset_id, role)
      )`
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS designs (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, project_id TEXT NOT NULL,
        scene TEXT NOT NULL CHECK (scene IN ('interior','exterior','floor-plan')),
        stage TEXT, provider TEXT NOT NULL, model TEXT NOT NULL, provider_scene TEXT NOT NULL,
        prompt TEXT NOT NULL, config_json TEXT NOT NULL, source_asset_id TEXT NOT NULL,
        output_asset_id TEXT, cost_credits INTEGER NOT NULL, idempotency_key TEXT NOT NULL,
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, completed_at INTEGER
      )`
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS credit_ledger (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
        entry_type TEXT NOT NULL CHECK (entry_type IN ('grant','payment','usage','hold','release')),
        amount INTEGER NOT NULL, reason TEXT NOT NULL, ref_type TEXT, ref_id TEXT, grant_key TEXT,
        workspace_id TEXT,
        created_at INTEGER NOT NULL
      )`
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_credit_ledger_user_created ON credit_ledger(user_id, created_at)`
    ),
    db.prepare(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_ledger_grant_key
        ON credit_ledger(user_id, grant_key) WHERE grant_key IS NOT NULL`
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS credit_holds (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
        amount INTEGER NOT NULL CHECK (amount > 0),
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','settled','released')),
        ref_type TEXT NOT NULL, ref_id TEXT NOT NULL, ledger_hold_id TEXT,
        workspace_id TEXT,
        created_at INTEGER NOT NULL, settled_at INTEGER, released_at INTEGER
      )`
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_credit_holds_user_status ON credit_holds(user_id, status)`
    ),
    db.prepare(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_holds_ref_active
        ON credit_holds(ref_type, ref_id) WHERE status = 'active'`
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS idempotency_keys (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
        operation TEXT NOT NULL, idempotency_key TEXT NOT NULL,
        request_fingerprint TEXT NOT NULL, result_type TEXT NOT NULL, result_id TEXT NOT NULL,
        created_at INTEGER NOT NULL, UNIQUE (user_id, operation, idempotency_key)
      )`
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_idempotency_keys_user_created ON idempotency_keys(user_id, created_at)`
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS ai_tasks (
        id TEXT PRIMARY KEY, scene TEXT NOT NULL, provider TEXT NOT NULL,
        model TEXT NOT NULL, prompt TEXT NOT NULL, source_key TEXT,
        status TEXT NOT NULL DEFAULT 'accepted'
          CHECK (status IN ('accepted','processing','output','quarantined','notified','ready','failed','expired')),
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
        user_id TEXT, hold_id TEXT, cost_credits INTEGER, expires_at INTEGER, expired_at INTEGER,
        provider_task_id TEXT, error_code TEXT, validation_attempts INTEGER NOT NULL DEFAULT 0,
        dispatched_at INTEGER
      )`
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_ai_tasks_expiry ON ai_tasks(status, expires_at)`
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_ai_tasks_user_created ON ai_tasks(user_id, created_at)`
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS activity_log (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
        action TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
        metadata TEXT, created_at INTEGER NOT NULL
      )`
    ),
  ]);
}

async function seedUser(): Promise<string> {
  const userId = crypto.randomUUID();
  const email = `${userId}@example.com`;
  await env.DB.prepare(
    `INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt)
     VALUES (?1, 'Test Realtor', ?2, 1, ?3, ?3)`
  )
    .bind(userId, email, Date.now())
    .run();
  await ensureFreeCreditGrant(env, userId);
  return userId;
}

async function seedReadyAsset(userId: string): Promise<string> {
  const assetId = crypto.randomUUID();
  const key = `ready/${assetId}`;
  const bytes = validPngBytes();
  await env.HD_PRIVATE.put(key, bytes, { httpMetadata: { contentType: "image/png" } });
  await env.DB.prepare(
    `INSERT INTO assets (
       id, name, mime_type, size, lifecycle, storage_key, user_id,
       declared_size, actual_size, created_by, created_at, updated_at
     ) VALUES (?1, 'empty-room.png', 'image/png', ?2, 'ready', ?3, ?4, ?2, ?2, 'test', ?5, ?5)`
  )
    .bind(assetId, bytes.length, key, userId, Date.now())
    .run();
  return assetId;
}

describe("B2B Virtual Staging Engine Workers Integration (Ticket 3.3)", () => {
  it("executes full virtual staging lifecycle with Living Room Luxury preset at 1 credit", async () => {
    const userId = await seedUser();
    const sourceAssetId = await seedReadyAsset(userId);
    const initialCredits = await getAvailableCredits(env, userId);
    expect(initialCredits).toBe(10);

    const idempotencyKey = crypto.randomUUID();
    const payload = {
      sourceAssetId,
      scene: "interior",
      intent: {
        mode: "virtual-staging",
        stagingPreset: "living-room-luxury",
        roomType: "Living Room",
        style: "Modern Warm",
        colorScheme: "Warm",
      },
      options: { aspect_ratio: "16:9", num_outputs: 1 },
      idempotencyKey,
    };

    // 1. Create Design
    const { id: taskId, status, cost } = await createDesign(env, userId, payload);
    expect(taskId).toBeTruthy();
    expect(status).toBe("accepted");
    expect(cost).toBe(1);

    // 2. Available credits drop by 1 due to active hold
    const creditsDuringTask = await getAvailableCredits(env, userId);
    expect(creditsDuringTask).toBe(9);

    const activeHold = await getActiveHoldByRef(env, "task", taskId);
    expect(activeHold).not.toBeNull();
    expect(activeHold?.amount).toBe(1);

    // 3. Verify server-built prompt stored on design row
    const designRow = await getDesign(env, taskId);
    expect(designRow?.prompt).toContain("TASK: High-end B2B commercial real estate virtual staging");
    expect(designRow?.prompt).toContain("turnkey Living Room Luxury");
    expect(designRow?.prompt).toContain("Italian leather or textured boucle sectional sofa");
    expect(designRow?.prompt).toContain("PRESERVED ARCHITECTURAL ENCLOSURE & STRUCTURAL INTEGRITY (LOCK INVARIANTS)");

    // 4. Run provider pipeline: writes quarantine object
    const dispatch = await handleProviderNotify(env, { type: "task-dispatch", taskId });
    expect(dispatch.status).toBe("quarantined");

    // 5. Complete generation: validate output, attach to project, settle hold
    const complete = await handleProviderNotify(env, { type: "provider-complete", taskId });
    expect(complete.status).toBe("ready");

    // 6. Verify task settled and credits deducted permanently
    const pollStatus = await getDesignStatus(env, userId, taskId);
    expect(pollStatus.status).toBe("success");
    expect(pollStatus.outputAssetId).toBeTruthy();

    const summary = await getLedgerSummary(env, userId);
    expect(summary.available).toBe(9);
    expect(summary.totalUsage).toBe(1);
    expect(summary.activeHolds).toBe(0);

    const settledHold = await getActiveHoldByRef(env, "task", taskId);
    expect(settledHold).toBeNull();

    await assertCreditInvariant(env, userId);
  });

  it("supports Modern Bedroom and Executive Office presets seamlessly", async () => {
    const userId = await seedUser();
    const sourceAssetId = await seedReadyAsset(userId);

    // Test Modern Bedroom
    const bedroomDesign = await createDesign(env, userId, {
      sourceAssetId,
      scene: "interior",
      intent: {
        mode: "virtual-staging",
        stagingPreset: "modern-bedroom",
      },
      idempotencyKey: crypto.randomUUID(),
    });
    const bedroomRow = await getDesign(env, bedroomDesign.id);
    expect(bedroomRow?.prompt).toContain("turnkey Modern Bedroom");
    expect(bedroomRow?.prompt).toContain("Upholstered king-size platform bed");

    // Test Executive Office
    const officeDesign = await createDesign(env, userId, {
      sourceAssetId,
      scene: "interior",
      intent: {
        mode: "virtual-staging",
        stagingPreset: "executive-office",
      },
      idempotencyKey: crypto.randomUUID(),
    });
    const officeRow = await getDesign(env, officeDesign.id);
    expect(officeRow?.prompt).toContain("turnkey Executive Office");
    expect(officeRow?.prompt).toContain("executive desk with integrated cable management");
  });
});
