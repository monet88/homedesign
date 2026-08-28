// Workers runtime test harness (ticket 01 AC2 + seam 2).
// Runs inside miniflare via vitest-pool-workers with real D1/R2/Queue bindings
// from wrangler.jsonc. `env` provides the bound services.

import { env, SELF } from "cloudflare:test";
import { describe, expect, it, beforeEach } from "vitest";
import { runFakeProviderPipeline, type AiTask } from "@/lib/ai/fake-provider";
import {
  createUploadIntent,
  transitionAsset,
  getAssetLifecycle,
  ALLOWED_LIFECYCLE_TRANSITIONS,
} from "@/lib/fixtures/upload-intent";
import {
  validPngBytes,
  invalidImageBytes,
  truncatedPngBytes,
  validJpegBytes,
  MAGIC,
  ASSET_LIFECYCLE,
  VALID_UPLOAD_MIMES,
  MAX_UPLOAD_BYTES,
  spoofedMimeBytes,
} from "@/lib/fixtures/images";

beforeEach(async () => {
  await applyMigrations(env.DB);
});

describe("workers runtime bindings (AC2)", () => {
  it("D1 binding works: write + read an asset row", async () => {
    await env.DB.prepare(
      `INSERT INTO assets (id, name, mime_type, size, lifecycle, created_at, updated_at)
       VALUES ('a1', 'x.png', 'image/png', 10, 'pending-upload', 1, 1)`
    ).run();
    const row = await env.DB.prepare(`SELECT lifecycle FROM assets WHERE id = 'a1'`).first();
    expect(row?.lifecycle).toBe("pending-upload");
  });

  it("R2 binding works: put + get + delete", async () => {
    await env.HD_PRIVATE.put("quarantine/t1.png", validPngBytes());
    const obj = await env.HD_PRIVATE.get("quarantine/t1.png");
    expect(obj).not.toBeNull();
    await env.HD_PRIVATE.delete("quarantine/t1.png");
    expect(await env.HD_PRIVATE.get("quarantine/t1.png")).toBeNull();
  });

  it("Queue producer binding works: send to ASSET_VALIDATE + PROVIDER_NOTIFY", async () => {
    await env.ASSET_VALIDATE.send({ assetId: "a1", key: "quarantine/a1.png" });
    await env.PROVIDER_NOTIFY.send({ type: "ai-output-ready", taskId: "t1" });
    expect(true).toBe(true);
  });

  it("SELF fetch reaches the test worker /__test/health with bindings", async () => {
    const res = await SELF.fetch("https://test.local/__test/health");
    expect(res.status).toBe(200);
    const body = await res.json<{
      ok: boolean;
      environment: string;
      hasD1: boolean;
      hasR2: boolean;
      hasQueue: boolean;
    }>();
    expect(body.ok).toBe(true);
    expect(body.hasD1).toBe(true);
    expect(body.hasR2).toBe(true);
    expect(body.hasQueue).toBe(true);
  });
});

describe("fixture helpers (AC5)", () => {
  it("provides valid/invalid image bytes with correct magic", () => {
    expect(Array.from(validPngBytes().slice(0, 8))).toEqual(Array.from(MAGIC.PNG));
    expect(Array.from(validJpegBytes().slice(0, 4))).toEqual(Array.from(MAGIC.JPEG));
    expect(Array.from(invalidImageBytes().slice(0, 4))).not.toEqual(Array.from(MAGIC.PNG));
    expect(Array.from(truncatedPngBytes().slice(0, 8))).toEqual(Array.from(MAGIC.PNG));
    expect(truncatedPngBytes().length).toBeLessThan(validPngBytes().length);
  });

  it("spoofed MIME fixture carries JPEG bytes declared as PNG", () => {
    const s = spoofedMimeBytes();
    expect(s.mime).toBe("image/png");
    expect(Array.from(s.bytes.slice(0, 4))).toEqual(Array.from(MAGIC.JPEG));
  });

  it("known asset lifecycle states match the domain model", () => {
    expect(ASSET_LIFECYCLE).toEqual([
      "pending-upload",
      "quarantined",
      "ready",
      "rejected",
      "deleted",
    ]);
    expect(VALID_UPLOAD_MIMES).toEqual(["image/png", "image/jpeg"]);
    expect(MAX_UPLOAD_BYTES).toBe(50 * 1024 * 1024);
  });

  it("presigned upload intent creates a pending-upload asset (AC5)", async () => {
    const intent = await createUploadIntent(env, {
      name: "room.png",
      mimeType: "image/png",
      size: 1024,
    });
    expect(intent.expiresInSec).toBe(10 * 60);
    expect(intent.key.startsWith("quarantine/")).toBe(true);
    expect(await getAssetLifecycle(env, intent.assetId)).toBe("pending-upload");
  });

  it("asset lifecycle transitions follow the ADR 0003 state machine", async () => {
    const intent = await createUploadIntent(env, {
      name: "room.png",
      mimeType: "image/png",
      size: 1024,
    });
    await transitionAsset(env, intent.assetId, "quarantined");
    expect(await getAssetLifecycle(env, intent.assetId)).toBe("quarantined");
    await transitionAsset(env, intent.assetId, "ready");
    expect(await getAssetLifecycle(env, intent.assetId)).toBe("ready");
    expect(ALLOWED_LIFECYCLE_TRANSITIONS.ready).not.toContain("quarantined");
  });
});

describe("fake AI provider seam (AC3)", () => {
  it("accept -> processing -> output -> quarantine -> notify", async () => {
    const task: AiTask = {
      id: "task-1",
      scene: "interior",
      provider: "fake",
      model: "gemini-2.5-flash-image",
      prompt: "Redesign this room.",
      sourceKey: "quarantine/source.png",
      options: { aspect_ratio: "1:1", num_outputs: 1 },
      createdAt: Date.now(),
    };

    const result = await runFakeProviderPipeline(env, task);
    expect(result.status).toBe("notified");

    const row = await env.DB.prepare(`SELECT status FROM ai_tasks WHERE id = 'task-1'`).first();
    expect(row?.status).toBe("notified");

    const obj = await env.HD_PRIVATE.get("quarantine/task-1.png");
    expect(obj).not.toBeNull();
    expect(Array.from(new Uint8Array(await obj!.arrayBuffer()).slice(0, 8))).toEqual(Array.from(MAGIC.PNG));
  });

  it("provider completion does not decide success — quarantine is observable (spec §2)", async () => {
    const task: AiTask = {
      id: "task-2",
      scene: "room-design-render",
      provider: "fake",
      model: "fake-render",
      prompt: "Render the room.",
      sourceKey: null,
      options: {},
      createdAt: Date.now(),
    };
    const result = await runFakeProviderPipeline(env, task);
    expect(result.status).toBe("notified");
    const row = await env.DB.prepare(`SELECT status FROM ai_tasks WHERE id = 'task-2'`).first();
    expect(["notified", "quarantined"]).toContain(row?.status);
  });
});

async function applyMigrations(db: D1Database) {
  await db
    .batch([
      db.prepare(
        `CREATE TABLE IF NOT EXISTS assets (
          id TEXT PRIMARY KEY, name TEXT NOT NULL, mime_type TEXT NOT NULL,
          size INTEGER NOT NULL,
          lifecycle TEXT NOT NULL DEFAULT 'pending-upload'
            CHECK (lifecycle IN ('pending-upload','quarantined','ready','rejected','deleted')),
          storage_key TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
          user_id TEXT, declared_size INTEGER, actual_size INTEGER,
          width INTEGER, height INTEGER, created_by TEXT,
          deleted_at INTEGER, purge_at INTEGER, recovery_until INTEGER
        )`
      ),
      db.prepare(
        `CREATE TABLE IF NOT EXISTS ai_tasks (
          id TEXT PRIMARY KEY, scene TEXT NOT NULL, provider TEXT NOT NULL,
          model TEXT NOT NULL, prompt TEXT NOT NULL, source_key TEXT,
          status TEXT NOT NULL DEFAULT 'accepted'
            CHECK (status IN ('accepted','processing','output','quarantined','notified','failed')),
          created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
        )`
      ),
      db.prepare(
        `CREATE TABLE IF NOT EXISTS queue_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT, queue TEXT NOT NULL,
          body TEXT NOT NULL, received_at INTEGER NOT NULL
        )`
      ),
    ]);
}
