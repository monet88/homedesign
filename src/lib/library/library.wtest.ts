// Workers-runtime tests for ticket #08: Project / Asset / Activity library.
//
// Seams: listProjects, toggleProjectFavorite, listAssets, deleteOwnerAsset,
//        listActivity. These are the modules behind the /api/* route handlers.

import { env } from "cloudflare:test";
import { describe, expect, it, beforeEach } from "vitest";
import { listProjects, toggleProjectFavorite } from "@/lib/library/projects";
import { listAssets, deleteOwnerAsset } from "@/lib/library/assets";
import { listActivity } from "@/lib/library/activity";
import { ensureFreeCreditGrant } from "@/lib/credits/ledger";
import { ProjectFavoriteSchema } from "@/lib/validation/schemas";

beforeEach(async () => {
  await applyMigrations(env.DB);
});

// ── Helpers ──────────────────────────────────────────────────────────────────

async function seedUser(emailVerified = 1): Promise<string> {
  const userId = crypto.randomUUID();
  const email = `${userId}@example.com`;
  await env.DB.prepare(
    `INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt)
     VALUES (?1, 'Test User', ?2, ?3, ?4, ?4)`
  )
    .bind(userId, email, emailVerified, Date.now())
    .run();
  if (emailVerified === 1) {
    await ensureFreeCreditGrant(env, userId);
  }
  return userId;
}

async function seedProject(
  userId: string,
  overrides: { name?: string; kind?: string; favorite?: number; visibility?: string } = {}
): Promise<string> {
  const id = crypto.randomUUID();
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO projects (id, user_id, kind, name, status, source_asset_id, favorite, visibility, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, 'draft', NULL, ?5, ?6, ?7, ?7)`
  )
    .bind(
      id,
      userId,
      overrides.kind ?? "interior",
      overrides.name ?? "Test Project",
      overrides.favorite ?? 0,
      overrides.visibility ?? "private",
      now
    )
    .run();
  return id;
}

async function seedAsset(
  userId: string,
  overrides: { name?: string; lifecycle?: string; createdBy?: string } = {}
): Promise<string> {
  const id = crypto.randomUUID();
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO assets (id, name, mime_type, size, lifecycle, storage_key, user_id,
       declared_size, actual_size, created_by, created_at, updated_at)
     VALUES (?1, ?2, 'image/png', 100, ?3, NULL, ?4, 100, 100, ?5, ?6, ?6)`
  )
    .bind(id, overrides.name ?? "asset.png", overrides.lifecycle ?? "ready", userId, overrides.createdBy ?? "test", now)
    .run();
  return id;
}

async function attachAsset(projectId: string, assetId: string, role: "source" | "generated" | "share-selected") {
  await env.DB.prepare(
    `INSERT INTO project_assets (project_id, asset_id, role, created_at) VALUES (?1, ?2, ?3, ?4)`
  )
    .bind(projectId, assetId, role, Date.now())
    .run();
}

async function seedPayment(userId: string, pack: string, amount: number): Promise<string> {
  const id = crypto.randomUUID();
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO mock_payments (id, user_id, pack, label, amount, idempotency_key, ledger_entry_id, created_at)
     VALUES (?1, ?2, ?3, 'Mock', ?4, ?5, ?6, ?7)`
  )
    .bind(id, userId, pack, amount, `idem-${id}`, `ledger-${id}`, now)
    .run();
  return id;
}

// ── Projects ───────────────────────────────────────────────────────────────────

describe("listProjects", () => {
  it("returns an empty list for a user with no projects", async () => {
    const userId = await seedUser();
    const result = await listProjects(env, userId);
    expect(result.items).toHaveLength(0);
    expect(result.nextCursor).toBeNull();
  });

  it("lists projects with default updated-desc sort", async () => {
    const userId = await seedUser();
    const p1 = await seedProject(userId, { name: "Older", kind: "interior" });
    const p2 = await seedProject(userId, { name: "Newer", kind: "exterior" });

    const result = await listProjects(env, userId);
    expect(result.items.map((p) => p.id)).toEqual([p2, p1]);
    expect(result.items[0]).toMatchObject({ name: "Newer", kind: "exterior", favorite: false, visibility: "private" });
  });

  it("filters by kind, favorite, visibility, and search", async () => {
    const userId = await seedUser();
    await seedProject(userId, { name: "Interior A", kind: "interior", favorite: 1, visibility: "private" });
    await seedProject(userId, { name: "Exterior B", kind: "exterior", favorite: 0, visibility: "private" });
    await seedProject(userId, { name: "Floor C", kind: "floor-plan", favorite: 0, visibility: "unlisted" });

    const byKind = await listProjects(env, userId, { kind: "interior" });
    expect(byKind.items).toHaveLength(1);
    expect(byKind.items[0].name).toBe("Interior A");

    const byFav = await listProjects(env, userId, { favorite: true });
    expect(byFav.items).toHaveLength(1);
    expect(byFav.items[0].favorite).toBe(true);

    const byVis = await listProjects(env, userId, { visibility: "unlisted" });
    expect(byVis.items).toHaveLength(1);
    expect(byVis.items[0].name).toBe("Floor C");

    const bySearch = await listProjects(env, userId, { search: "B" });
    expect(bySearch.items).toHaveLength(1);
    expect(bySearch.items[0].name).toBe("Exterior B");
  });

  it("supports name-asc sort and cursor pagination", async () => {
    const userId = await seedUser();
    // Create 25 projects to exceed the 24-item page size.
    const ids: string[] = [];
    for (let i = 0; i < 25; i++) {
      ids.push(await seedProject(userId, { name: `Project ${String(i).padStart(2, "0")}` }));
    }

    const first = await listProjects(env, userId, { sort: "name-asc" });
    expect(first.items).toHaveLength(24);
    expect(first.items[0].name).toBe("Project 00");
    expect(first.nextCursor).toBeTruthy();

    const second = await listProjects(env, userId, { sort: "name-asc" }, first.nextCursor);
    expect(second.items).toHaveLength(1);
    expect(second.items[0].name).toBe("Project 24");
    expect(second.nextCursor).toBeNull();
  });
});

describe("toggleProjectFavorite", () => {
  it("toggles favorite without changing visibility", async () => {
    const userId = await seedUser();
    const projectId = await seedProject(userId, { favorite: 0, visibility: "private" });

    await toggleProjectFavorite(env, userId, projectId, true);
    const updated = await env.DB.prepare(
      `SELECT favorite, visibility FROM projects WHERE id = ?1`
    )
      .bind(projectId)
      .first<{ favorite: number; visibility: string }>();
    expect(updated?.favorite).toBe(1);
    expect(updated?.visibility).toBe("private");

    await expect(toggleProjectFavorite(env, crypto.randomUUID(), projectId, false)).rejects.toThrow("FORBIDDEN");
    await expect(toggleProjectFavorite(env, userId, crypto.randomUUID(), false)).rejects.toThrow("NOT_FOUND");
  });

  it("malformed favorite commands fail validation and do not mutate Project state (Ticket #45)", async () => {
    const userId = await seedUser();
    const projectId = await seedProject(userId, { favorite: 0, visibility: "unlisted" });

    const malformedPayloads = [
      {},
      { favorite: "true" },
      { favorite: 1 },
      { favorite: 0 },
      { favorite: null },
      { favorite: true, extraKey: "exploit", visibility: "private" },
    ];

    for (const bad of malformedPayloads) {
      const parsed = ProjectFavoriteSchema.safeParse(bad);
      expect(parsed.success).toBe(false);
    }

    // State is strictly preserved
    const row = await env.DB.prepare(
      `SELECT favorite, visibility FROM projects WHERE id = ?1`
    ).bind(projectId).first<{ favorite: number; visibility: string }>();
    expect(row?.favorite).toBe(0);
    expect(row?.visibility).toBe("unlisted");

    // Valid command succeeds
    const valid = ProjectFavoriteSchema.safeParse({ favorite: true });
    expect(valid.success).toBe(true);
    if (!valid.success) return;

    await toggleProjectFavorite(env, userId, projectId, valid.data.favorite);
    const updated = await env.DB.prepare(
      `SELECT favorite, visibility FROM projects WHERE id = ?1`
    ).bind(projectId).first<{ favorite: number; visibility: string }>();
    expect(updated?.favorite).toBe(1);
    expect(updated?.visibility).toBe("unlisted");
  });
});

// ── Assets ─────────────────────────────────────────────────────────────────────

describe("listAssets", () => {
  it("returns an empty list for a user with no assets", async () => {
    const userId = await seedUser();
    const result = await listAssets(env, userId);
    expect(result.items).toHaveLength(0);
  });

  it("filters source/generated, lifecycle, project, and search", async () => {
    const userId = await seedUser();
    const project = await seedProject(userId);
    const source = await seedAsset(userId, { name: "source.png" });
    const generated = await seedAsset(userId, { name: "generated.png" });
    const rejected = await seedAsset(userId, { name: "bad.png", lifecycle: "rejected" });
    await attachAsset(project, source, "source");
    await attachAsset(project, generated, "generated");

    const all = await listAssets(env, userId);
    expect(all.items).toHaveLength(3);

    const sourceOnly = await listAssets(env, userId, { type: "source" });
    expect(sourceOnly.items.map((a) => a.id)).toEqual([source]);

    const generatedOnly = await listAssets(env, userId, { type: "generated" });
    expect(generatedOnly.items.map((a) => a.id)).toEqual([generated]);

    const rejectedOnly = await listAssets(env, userId, { lifecycle: "rejected" });
    expect(rejectedOnly.items.map((a) => a.id)).toEqual([rejected]);

    const byProject = await listAssets(env, userId, { projectId: project });
    expect(byProject.items).toHaveLength(2);

    const bySearch = await listAssets(env, userId, { search: "bad" });
    expect(bySearch.items[0].id).toBe(rejected);
  });

  it("reports reference counts", async () => {
    const userId = await seedUser();
    const p1 = await seedProject(userId);
    const p2 = await seedProject(userId);
    const asset = await seedAsset(userId);
    await attachAsset(p1, asset, "source");
    await attachAsset(p2, asset, "source");

    const result = await listAssets(env, userId);
    expect(result.items[0].refCount).toBe(2);
  });
});

describe("deleteOwnerAsset", () => {
  it("deletes the asset and returns the project reference count", async () => {
    const userId = await seedUser();
    const otherUser = await seedUser();
    const project = await seedProject(userId);
    const asset = await seedAsset(userId);
    await attachAsset(project, asset, "source");

    const result = await deleteOwnerAsset(env, userId, asset);
    expect(result.id).toBe(asset);
    expect(result.refCount).toBe(1);

    const lifecycle = await env.DB.prepare(`SELECT lifecycle FROM assets WHERE id = ?1`)
      .bind(asset)
      .first<{ lifecycle: string }>();
    expect(lifecycle?.lifecycle).toBe("deleted");

    await expect(deleteOwnerAsset(env, otherUser, asset)).rejects.toThrow("FORBIDDEN");
  });
});

// ── Activity ───────────────────────────────────────────────────────────────────

describe("listActivity", () => {
  it("is empty when the account has no domain events", async () => {
    const userId = await seedUser();
    const result = await listActivity(env, userId);
    expect(result.items).toHaveLength(0);
  });

  it("derives project, asset, generation, and payment events", async () => {
    const userId = await seedUser();
    const project = await seedProject(userId, { name: "Project X" });
    const asset = await seedAsset(userId, { name: "room.png" });
    await seedPayment(userId, "lite", 80);

    // Generation requires an ai_tasks + designs row sharing the same id.
    const taskId = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO ai_tasks (id, scene, provider, model, prompt, source_key, status, created_at, updated_at, user_id)
       VALUES (?1, 'image-to-image', 'fake', 'gemini', 'prompt', NULL, 'ready', ?2, ?2, ?3)`
    ).bind(taskId, Date.now(), userId).run();
    await env.DB.prepare(
      `INSERT INTO designs (id, user_id, project_id, scene, provider, model, provider_scene, prompt, config_json,
         source_asset_id, output_asset_id, cost_credits, idempotency_key, created_at, updated_at, completed_at)
       VALUES (?1, ?2, ?3, 'interior', 'fake', 'gemini', 'image-to-image', 'prompt', '{}', ?4, NULL, 1, ?5, ?6, ?6, ?6)`
    ).bind(taskId, userId, project, asset, `idem-${taskId}`, Date.now()).run();

    const result = await listActivity(env, userId);
    const families = new Set(result.items.map((e) => e.family));
    expect(families.has("project")).toBe(true);
    expect(families.has("asset")).toBe(true);
    expect(families.has("payment")).toBe(true);
    expect(families.has("generation")).toBe(true);

    const genEvent = result.items.find((e) => e.family === "generation" && e.type === "generation_succeeded");
    expect(genEvent).toBeDefined();
    expect(genEvent?.referenceId).toBe(taskId);
  });

  it("filters by family and enforces 90-day retention", async () => {
    const userId = await seedUser();
    await seedProject(userId, { name: "Old" });
    const recent = await seedProject(userId, { name: "Recent" });

    // Forge a project older than 90 days.
    const oldId = crypto.randomUUID();
    const oldTime = Date.now() - 91 * 24 * 3600 * 1000;
    await env.DB.prepare(
      `INSERT INTO projects (id, user_id, kind, name, status, source_asset_id, favorite, visibility, created_at, updated_at)
       VALUES (?1, ?2, 'interior', 'Old project', 'draft', NULL, 0, 'private', ?3, ?3)`
    ).bind(oldId, userId, oldTime).run();

    const all = await listActivity(env, userId, { family: "project" });
    expect(all.items.some((e) => e.referenceId === oldId)).toBe(false);
    expect(all.items.some((e) => e.referenceId === recent)).toBe(true);
  });

  it("is idempotent: repeated calls return the same event ids", async () => {
    const userId = await seedUser();
    await seedProject(userId);
    await seedProject(userId);

    const first = await listActivity(env, userId);
    const second = await listActivity(env, userId);
    expect(first.items.map((e) => e.eventId)).toEqual(second.items.map((e) => e.eventId));
  });
});

// ── Schema bootstrap for the library tests ─────────────────────────────────────

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
  for (const sql of drops) {
    await db.prepare(sql).run();
  }

  await db.batch([
    db.prepare(
      `CREATE TABLE IF NOT EXISTS user (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
        emailVerified INTEGER NOT NULL DEFAULT 0, role TEXT NOT NULL DEFAULT 'user',
        image TEXT, createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL
      )`
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS session (
        id TEXT PRIMARY KEY, expiresAt INTEGER NOT NULL, token TEXT NOT NULL UNIQUE,
        createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL,
        ipAddress TEXT, userAgent TEXT,
        userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE
      )`
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS account (
        id TEXT PRIMARY KEY, accountId TEXT NOT NULL, providerId TEXT NOT NULL,
        issuer TEXT NOT NULL, userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
        accessToken TEXT, refreshToken TEXT, idToken TEXT,
        accessTokenExpiresAt INTEGER, refreshTokenExpiresAt INTEGER, scope TEXT,
        password TEXT, createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL
      )`
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS verification (
        id TEXT PRIMARY KEY, identifier TEXT NOT NULL, value TEXT NOT NULL,
        expiresAt INTEGER NOT NULL, createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL
      )`
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS email_outbox (
        id INTEGER PRIMARY KEY AUTOINCREMENT, to_email TEXT NOT NULL, subject TEXT NOT NULL,
        body TEXT NOT NULL, verification_url TEXT NOT NULL, token_fingerprint TEXT NOT NULL,
        created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, user_id TEXT,
        environment TEXT NOT NULL DEFAULT 'development'
      )`
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS assets (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, mime_type TEXT NOT NULL, size INTEGER NOT NULL,
        lifecycle TEXT NOT NULL DEFAULT 'pending-upload'
          CHECK (lifecycle IN ('pending-upload','quarantined','ready','rejected','deleted')),
        storage_key TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
        user_id TEXT, declared_size INTEGER, actual_size INTEGER, width INTEGER, height INTEGER,
        created_by TEXT, deleted_at INTEGER, purge_at INTEGER, recovery_until INTEGER
      )`
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('interior','exterior','floor-plan')),
        name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft', source_asset_id TEXT,
        favorite INTEGER NOT NULL DEFAULT 0, visibility TEXT NOT NULL DEFAULT 'private',
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
      `CREATE TABLE IF NOT EXISTS project_shares (
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
      `CREATE TABLE IF NOT EXISTS room_designs (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        marker_id TEXT NOT NULL,
        marker_x REAL NOT NULL,
        marker_y REAL NOT NULL,
        marker_locked INTEGER NOT NULL DEFAULT 0,
        brief_confirmed_at INTEGER,
        progress TEXT NOT NULL DEFAULT 'draft',
        recognition_json TEXT,
        proposal_json TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS floor_plan_stage_runs (
        id TEXT PRIMARY KEY,
        room_design_id TEXT NOT NULL,
        stage TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft',
        design_id TEXT,
        confirmed_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`
    ),
    db.prepare(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_fp_stage_runs_processing
        ON floor_plan_stage_runs(room_design_id, stage) WHERE status = 'processing'`
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
      `CREATE TABLE IF NOT EXISTS mock_payments (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
        pack TEXT NOT NULL CHECK (pack IN ('lite','plus','pro','max')), label TEXT NOT NULL,
        amount INTEGER NOT NULL CHECK (amount > 0), idempotency_key TEXT NOT NULL,
        ledger_entry_id TEXT NOT NULL, created_at INTEGER NOT NULL
      )`
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_mock_payments_user_created ON mock_payments(user_id, created_at)`
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
      `CREATE TABLE IF NOT EXISTS queue_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT, queue TEXT NOT NULL,
        body TEXT NOT NULL, received_at INTEGER NOT NULL
      )`
    ),
  ]);
}
