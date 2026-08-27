// Workers-runtime tests for ticket #09: unlisted read-only project sharing.
//
// Seams: createProjectShare, revokeProjectShare, setProjectVisibility,
//        getShareViewByToken, softDeleteProject, restoreProject,
//        restoreOwnerAsset, digestShareToken.

import { env } from "cloudflare:test";
import { describe, expect, it, beforeEach } from "vitest";
import {
  createProjectShare,
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

async function applyMigrations(db: D1Database) {
  await db.batch([
    db.prepare(`DROP TABLE IF EXISTS project_shares`),
    db.prepare(`DROP TABLE IF EXISTS project_assets`),
    db.prepare(`DROP TABLE IF EXISTS projects`),
    db.prepare(`DROP TABLE IF EXISTS assets`),
    db.prepare(`DROP TABLE IF EXISTS user`),
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
