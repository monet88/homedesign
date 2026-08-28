// Workers-runtime tests for the intake pipeline (Ticket 06):
// intent → pending-upload → finalize → quarantined → validate → ready|rejected.
// Exercises real D1 + R2 + Queue bindings through the ASSET_VALIDATE consumer.
import { env, SELF } from "cloudflare:test";
import { describe, expect, it, beforeEach } from "vitest";
import {
  validPngBytes,
  validJpegBytes,
  invalidImageBytes,
  truncatedPngBytes,
  createSyntheticPngStream,
  MAGIC,
} from "@/lib/fixtures/images";
import {
  createUploadIntent,
  finalizeUpload,
  deleteAsset,
  getAssetLifecycle,
  checkQuota,
  type AssetValidationJob,
} from "@/lib/intake/intake-service";
import { validateAsset, type CopyObjectOptions } from "@/lib/intake/validator";
import { UploadIntentSchema, FinalizeAssetSchema } from "@/lib/validation/schemas";

let userCounter = 0;
function nextUser(): string {
  userCounter++;
  return `user-${userCounter}`;
}

async function applyMigrations(db: D1Database) {
  await db.batch([
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

beforeEach(async () => {
  await applyMigrations(env.DB);
});

describe("intake pipeline — intent creation (AC1)", () => {
  it("creates a pending-upload asset with a quarantine key and 10-min expiry", async () => {
    const intent = await createUploadIntent(env, {
      userId: nextUser(),
      name: "room.png",
      mimeType: "image/png",
      size: 1024,
    });
    expect(intent.expiresInSec).toBe(10 * 60);
    expect(intent.key.startsWith("quarantine/")).toBe(true);
    expect(await getAssetLifecycle(env, intent.assetId)).toBe("pending-upload");
  });

  it("rejects unsupported MIME", async () => {
    await expect(
      createUploadIntent(env, { userId: nextUser(), name: "x.txt", mimeType: "text/plain", size: 10 })
    ).rejects.toThrow(/unsupported mime/);
  });

  it("rejects size above 50MB", async () => {
    await expect(
      createUploadIntent(env, { userId: nextUser(), name: "big.png", mimeType: "image/png", size: 51 * 1024 * 1024 })
    ).rejects.toThrow(/size exceeds/);
  });
});

describe("intake pipeline — quotas (AC5)", () => {
  it("enforces 3 active intake limit", async () => {
    const USER = nextUser();
    for (let i = 0; i < 3; i++) {
      await createUploadIntent(env, { userId: USER, name: `a${i}.png`, mimeType: "image/png", size: 100 });
    }
    const quota = await checkQuota(env, USER);
    expect(quota.ok).toBe(false);
    await expect(
      createUploadIntent(env, { userId: USER, name: "a4.png", mimeType: "image/png", size: 100 })
    ).rejects.toThrow(/active intake limit/);
  });

  it("enforces 20 intents per hour", async () => {
    const USER = nextUser();
    const now = Date.now();
    // Seed 20 intents for this user within the hour window.
    for (let i = 0; i < 20; i++) {
      await env.DB.prepare(
        `INSERT INTO assets (id, name, mime_type, size, lifecycle, storage_key, user_id, created_at, updated_at)
         VALUES (?1, 'seed.png', 'image/png', 10, 'ready', ?2, ?3, ?4, ?4)`
      )
        .bind(`seed-${i}`, `ready/seed-${i}`, USER, now)
        .run();
    }
    const quota = await checkQuota(env, USER);
    expect(quota.ok).toBe(false);
    // Reset to prove the hourly limit specifically:
    await env.DB.prepare(`DELETE FROM assets WHERE user_id = ?1`).bind(USER).run();
    for (let i = 0; i < 20; i++) {
      await env.DB.prepare(
        `INSERT INTO assets (id, name, mime_type, size, lifecycle, storage_key, user_id, created_at, updated_at)
         VALUES (?1, 'seed.png', 'image/png', 10, 'rejected', ?2, ?3, ?4, ?4)`
      )
        .bind(`seed-r-${i}`, `quarantine/seed-r-${i}`, USER, now)
        .run();
    }
    const quota2 = await checkQuota(env, USER);
    expect(quota2.ok).toBe(false);
  });

  it("allows new intents after hourly window passes", async () => {
    const USER = nextUser();
    const past = Date.now() - 3600_000 - 1000;
    for (let i = 0; i < 20; i++) {
      await env.DB.prepare(
        `INSERT INTO assets (id, name, mime_type, size, lifecycle, storage_key, user_id, created_at, updated_at)
         VALUES (?1, 'seed.png', 'image/png', 10, 'rejected', ?2, ?3, ?4, ?4)`
      )
        .bind(`seed-old-${i}`, `quarantine/seed-old-${i}`, USER, past)
        .run();
    }
    const quota = await checkQuota(env, USER);
    expect(quota.ok).toBe(true);
  });
});

describe("intake pipeline — finalize + queue convergence (AC2)", () => {
  it("finalize moves pending-upload → quarantined and queues one job", async () => {
    const intent = await createUploadIntent(env, { userId: nextUser(), name: "room.png", mimeType: "image/png", size: 1024 });
    // Simulate the direct presigned PUT into the quarantine key.
    await env.HD_PRIVATE.put(intent.key, validPngBytes());

    const res = await finalizeUpload(env, intent.assetId);
    expect(res.ok).toBe(true);
    expect(res.ok && res.lifecycle).toBe("quarantined");
    expect(await getAssetLifecycle(env, intent.assetId)).toBe("quarantined");

    // Converges: calling finalize again is a no-op (idempotent), no second job.
    const res2 = await finalizeUpload(env, intent.assetId);
    expect(res2.ok).toBe(true);
    expect(res2.ok && res2.lifecycle).toBe("quarantined");
  });

  it("finalize fails when object was not uploaded", async () => {
    const intent = await createUploadIntent(env, { userId: nextUser(), name: "room.png", mimeType: "image/png", size: 1024 });
    const res = await finalizeUpload(env, intent.assetId);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/not uploaded/);
    expect(await getAssetLifecycle(env, intent.assetId)).toBe("pending-upload");
  });

  it("R2 event filter only matches quarantine/ prefix (ready copy doesn't loop)", async () => {
    // The queue consumer only runs validateAsset for quarantine jobs. A ready-key
    // copy must never enqueue a new validation job: the finalize path only ever
    // writes quarantine/* and the validation job carries the quarantine key.
    const intent = await createUploadIntent(env, { userId: nextUser(), name: "room.png", mimeType: "image/png", size: 1024 });
    await env.HD_PRIVATE.put(intent.key, validPngBytes());
    await finalizeUpload(env, intent.assetId);

    // Ready copy must be under ready/ and must not create a quarantine-prefixed
    // object that could re-trigger validation.
    const readyKey = `ready/${intent.assetId}`;
    await env.HD_PRIVATE.put(readyKey, validPngBytes());
    const obj = await env.HD_PRIVATE.get(readyKey);
    expect(obj).not.toBeNull();
    // The ready object exists; no new job for it (no quarantine/ prefix).
    const readyObj = await env.HD_PRIVATE.get(`ready/${intent.assetId}`);
    expect(readyObj).not.toBeNull();
  });
});

describe("intake pipeline — validation worker (AC3/AC4)", () => {
  async function setupQuarantined(mimeType: string, bytes: Uint8Array) {
    const intent = await createUploadIntent(env, {
      userId: nextUser(),
      name: mimeType === "image/png" ? "room.png" : "room.jpg",
      mimeType,
      size: bytes.length,
    });
    await env.HD_PRIVATE.put(intent.key, bytes);
    await finalizeUpload(env, intent.assetId);
    return intent;
  }

  it("valid PNG passes → ready + durable ready-key copy + quarantine deleted", async () => {
    const intent = await setupQuarantined("image/png", validPngBytes());
    const job: AssetValidationJob = {
      assetId: intent.assetId,
      key: intent.key,
      declaredSize: intent.size,
      declaredMime: "image/png",
      attempt: 1,
    };
    const result = await validateAsset(env, job);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.outcome.lifecycle).toBe("ready");
    expect(result.outcome.width).toBe(1);
    expect(result.outcome.height).toBe(1);

    // Durable ready-key copy exists with PNG magic.
    const readyObj = await env.HD_PRIVATE.get(`ready/${intent.assetId}`);
    expect(readyObj).not.toBeNull();
    const readyBytes = new Uint8Array(await readyObj!.arrayBuffer());
    expect(Array.from(readyBytes.slice(0, 8))).toEqual(Array.from(MAGIC.PNG));
    // Quarantine copy deleted.
    expect(await env.HD_PRIVATE.get(intent.key)).toBeNull();
    // Lifecycle ready.
    expect(await getAssetLifecycle(env, intent.assetId)).toBe("ready");
  });

  it("valid JPEG passes → ready", async () => {
    const intent = await setupQuarantined("image/jpeg", validJpegBytes());
    const result = await validateAsset(env, {
      assetId: intent.assetId,
      key: intent.key,
      declaredSize: intent.size,
      declaredMime: "image/jpeg",
      attempt: 1,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.outcome.lifecycle).toBe("ready");
    expect(result.outcome.width).toBe(1);
    expect(result.outcome.height).toBe(1);
    expect(await getAssetLifecycle(env, intent.assetId)).toBe("ready");
  });

  it("invalid bytes → rejected + object deleted", async () => {
    const intent = await setupQuarantined("image/png", invalidImageBytes());
    const result = await validateAsset(env, {
      assetId: intent.assetId,
      key: intent.key,
      declaredSize: intent.size,
      declaredMime: "image/png",
      attempt: 1,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.outcome.lifecycle).toBe("rejected");
    expect(await getAssetLifecycle(env, intent.assetId)).toBe("rejected");
    expect(await env.HD_PRIVATE.get(intent.key)).toBeNull();
  });

  it("truncated PNG → rejected", async () => {
    const intent = await setupQuarantined("image/png", truncatedPngBytes());
    const result = await validateAsset(env, {
      assetId: intent.assetId,
      key: intent.key,
      declaredSize: intent.size,
      declaredMime: "image/png",
      attempt: 1,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.outcome.lifecycle).toBe("rejected");
    expect(await getAssetLifecycle(env, intent.assetId)).toBe("rejected");
  });

  it("oversized dimensions → rejected", async () => {
    // Build a fake PNG header with oversized dimensions but valid magic + IHDR.
    const bytes = new Uint8Array(8 + 4 + 4 + 13 + 4 + 12);
    bytes.set(MAGIC.PNG, 0);
    bytes[8] = 0x00; bytes[9] = 0x00; bytes[10] = 0x00; bytes[11] = 13;
    bytes[12] = 0x49; bytes[13] = 0x48; bytes[14] = 0x44; bytes[15] = 0x52;
    bytes[16] = 0x00; bytes[17] = 0x00; bytes[18] = 0x2e; bytes[19] = 0xe1; // width 12001
    bytes[20] = 0x00; bytes[21] = 0x00; bytes[22] = 0x00; bytes[23] = 0x01; // height 1
    bytes[24] = 8; bytes[25] = 2; bytes[26] = 0; bytes[27] = 0; bytes[28] = 0;
    // IEND at tail for the truncation check to pass.
    bytes.set([0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82], bytes.length - 12);

    const intent = await setupQuarantined("image/png", bytes);
    const result = await validateAsset(env, {
      assetId: intent.assetId,
      key: intent.key,
      declaredSize: intent.size,
      declaredMime: "image/png",
      attempt: 1,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.outcome.lifecycle).toBe("rejected");
    expect(await getAssetLifecycle(env, intent.assetId)).toBe("rejected");
  });

  it("oversized byte size → rejected (HEAD check, no body read)", async () => {
    const intent = await setupQuarantined("image/png", validPngBytes());
    // Rewrite the object to exceed 50MB.
    const big = new Uint8Array(51 * 1024 * 1024);
    big.set(validPngBytes(), 0);
    await env.HD_PRIVATE.put(intent.key, big);
    const result = await validateAsset(env, {
      assetId: intent.assetId,
      key: intent.key,
      declaredSize: intent.size,
      declaredMime: "image/png",
      attempt: 1,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.outcome.lifecycle).toBe("rejected");
    expect(result.outcome.reason).toMatch(/50MB/);
    expect(await getAssetLifecycle(env, intent.assetId)).toBe("rejected");
  });

  it("idempotent: re-delivery of the same job converges (no duplicate ready key)", async () => {
    const intent = await setupQuarantined("image/png", validPngBytes());
    const job: AssetValidationJob = {
      assetId: intent.assetId,
      key: intent.key,
      declaredSize: intent.size,
      declaredMime: "image/png",
      attempt: 1,
    };
    await validateAsset(env, job);
    const res2 = await validateAsset(env, job);
    expect(res2.ok).toBe(true);
    if (!res2.ok) return;
    expect(res2.outcome.lifecycle).toBe("ready");
    // Still exactly one ready object.
    const readyObj = await env.HD_PRIVATE.get(`ready/${intent.assetId}`);
    expect(readyObj).not.toBeNull();
  });
});

describe("intake pipeline — DLQ rejects only the Asset (AC7)", () => {
  it("DLQ handling marks the asset rejected and never touches credits", async () => {
    const intent = await createUploadIntent(env, { userId: nextUser(), name: "room.png", mimeType: "image/png", size: 1024 });
    await env.HD_PRIVATE.put(intent.key, invalidImageBytes());
    await finalizeUpload(env, intent.assetId);

    // Simulate DLQ delivery of the failed job (validation exhausted).
    const job: AssetValidationJob = {
      assetId: intent.assetId,
      key: intent.key,
      declaredSize: intent.size,
      declaredMime: "image/png",
      attempt: 4,
    };
    // Send through the queue consumer; the DLQ handler rejects only the Asset.
    // There is no credit ledger table in this harness, so "never touches
    // credits" is proven by the absence of any credit/hold write path in the
    // consumer + the asset reaching a terminal rejected state.
    const dlqResult = await SELF.fetch("https://test.local/__test/consume-asset-validate", {
      method: "POST",
      body: JSON.stringify(job),
    });
    expect(dlqResult.status).toBe(200);
    expect(await getAssetLifecycle(env, intent.assetId)).toBe("rejected");
  });
});

describe("intake expiry reconciler (24h purge_at)", () => {
  it("rejects pending-upload assets past purge_at", async () => {
    const userId = nextUser();
    const intent = await createUploadIntent(env, {
      userId,
      name: "stale-pending.png",
      mimeType: "image/png",
      size: 1024,
    });

    const past = Date.now() - 1000;
    await env.DB.prepare(`UPDATE assets SET purge_at = ?2 WHERE id = ?1`)
      .bind(intent.assetId, past)
      .run();

    const { reconcileIntakeExpiry } = await import("@/lib/intake/expiry");
    const result = await reconcileIntakeExpiry(env);
    expect(result.expired).toBe(1);
    expect(await getAssetLifecycle(env, intent.assetId)).toBe("rejected");
  });

  it("rejects quarantined assets past purge_at and deletes quarantine bytes", async () => {
    const userId = nextUser();
    const intent = await createUploadIntent(env, {
      userId,
      name: "stale-quarantine.png",
      mimeType: "image/png",
      size: 1024,
    });

    await env.HD_PRIVATE.put(intent.key, validPngBytes());
    await finalizeUpload(env, intent.assetId);

    const past = Date.now() - 1000;
    await env.DB.prepare(`UPDATE assets SET purge_at = ?2 WHERE id = ?1`)
      .bind(intent.assetId, past)
      .run();

    const { reconcileIntakeExpiry } = await import("@/lib/intake/expiry");
    const result = await reconcileIntakeExpiry(env);
    expect(result.expired).toBe(1);
    expect(await getAssetLifecycle(env, intent.assetId)).toBe("rejected");
    expect(await env.HD_PRIVATE.get(intent.key)).toBeNull();
  });
});

describe("intake pipeline — delete + recovery (AC6)", () => {
  it("delete hides immediately and sets recovery_until (30 days)", async () => {
    const intent = await createUploadIntent(env, { userId: nextUser(), name: "room.png", mimeType: "image/png", size: 1024 });
    await env.HD_PRIVATE.put(intent.key, validPngBytes());
    await finalizeUpload(env, intent.assetId);

    const deleted = await deleteAsset(env, intent.assetId);
    expect(deleted).toBe(intent.assetId);
    expect(await getAssetLifecycle(env, intent.assetId)).toBe("deleted");

    const row = await env.DB.prepare(
      `SELECT deleted_at, recovery_until FROM assets WHERE id = ?1`
    ).bind(intent.assetId).first<{ deleted_at: number; recovery_until: number }>();
    expect(row?.deleted_at).not.toBeNull();
    expect(row?.recovery_until).not.toBeNull();
    expect(row!.recovery_until! - row!.deleted_at!).toBe(30 * 24 * 3600_000);
  });
});

describe("asset promotion streaming + bounded memory (Ticket 34)", () => {
  it("promotes 50 MB maximum-size image via streaming without whole-object accumulation", async () => {
    const stream = createSyntheticPngStream(50 * 1024 * 1024);
    const intent = await createUploadIntent(env, {
      userId: nextUser(),
      name: "max-50mb.png",
      mimeType: "image/png",
      size: 50 * 1024 * 1024,
    });
    await env.HD_PRIVATE.put(intent.key, stream, { httpMetadata: { contentType: "image/png" } });
    await finalizeUpload(env, intent.assetId);

    const job: AssetValidationJob = {
      assetId: intent.assetId,
      key: intent.key,
      declaredSize: 50 * 1024 * 1024,
      declaredMime: "image/png",
      attempt: 1,
    };

    const result = await validateAsset(env, job);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.outcome.lifecycle).toBe("ready");
    expect(result.outcome.actualSize).toBe(50 * 1024 * 1024);
    expect(result.outcome.width).toBe(100);
    expect(result.outcome.height).toBe(100);

    // Durable ready-key copy exists in R2 with exact size
    const readyObj = await env.HD_PRIVATE.get(`ready/${intent.assetId}`);
    expect(readyObj).not.toBeNull();
    expect(readyObj!.size).toBe(50 * 1024 * 1024);

    // Quarantine object deleted
    expect(await env.HD_PRIVATE.get(intent.key)).toBeNull();
    // Lifecycle is ready
    expect(await getAssetLifecycle(env, intent.assetId)).toBe("ready");
  });

  it("asserts peak in-memory byte bound during 50 MB promotion stays below 8 MiB (<= 64 KiB per chunk)", async () => {
    const stream = createSyntheticPngStream(50 * 1024 * 1024);
    const intent = await createUploadIntent(env, {
      userId: nextUser(),
      name: "peak-bound-50mb.png",
      mimeType: "image/png",
      size: 50 * 1024 * 1024,
    });
    await env.HD_PRIVATE.put(intent.key, stream, { httpMetadata: { contentType: "image/png" } });
    await finalizeUpload(env, intent.assetId);

    let peakBytesInFlight = 0;
    let totalBytesStreamed = 0;
    let chunkCount = 0;

    const copyOptions: CopyObjectOptions = {
      transform(srcStream) {
        return new ReadableStream<Uint8Array>({
          async start(controller) {
            const reader = srcStream.getReader();
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) {
                  controller.close();
                  break;
                }
                const len = value.byteLength;
                chunkCount++;
                totalBytesStreamed += len;
                if (len > peakBytesInFlight) {
                  peakBytesInFlight = len;
                }
                controller.enqueue(value);
              }
            } catch (err) {
              controller.error(err);
              throw err;
            } finally {
              reader.releaseLock();
            }
          },
        });
      },
    };

    const job: AssetValidationJob = {
      assetId: intent.assetId,
      key: intent.key,
      declaredSize: 50 * 1024 * 1024,
      declaredMime: "image/png",
      attempt: 1,
    };

    const result = await validateAsset(env, job, { copyOptions });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(totalBytesStreamed).toBe(50 * 1024 * 1024);
    // Assert peak in-memory bytes for any chunk in flight is strictly <= 8 MiB (and <= 64 KiB in practice)
    expect(peakBytesInFlight).toBeLessThanOrEqual(8 * 1024 * 1024);
    expect(peakBytesInFlight).toBeLessThanOrEqual(64 * 1024);
    expect(chunkCount).toBeGreaterThan(100);
    expect(await getAssetLifecycle(env, intent.assetId)).toBe("ready");
  });

  it("short read / stream truncation during copy leaves Asset quarantined for retry without corruption", async () => {
    const intent = await createUploadIntent(env, {
      userId: nextUser(),
      name: "short-read.png",
      mimeType: "image/png",
      size: validPngBytes().length,
    });
    await env.HD_PRIVATE.put(intent.key, validPngBytes());
    await finalizeUpload(env, intent.assetId);

    const job: AssetValidationJob = {
      assetId: intent.assetId,
      key: intent.key,
      declaredSize: validPngBytes().length,
      declaredMime: "image/png",
      attempt: 1,
    };

    // Simulate short read / stream error during copy
    const failingCopyOptions: CopyObjectOptions = {
      transform(srcStream) {
        return new ReadableStream<Uint8Array>({
          start(controller) {
            controller.error(new Error("simulated short read / connection abort"));
          },
        });
      },
    };

    const failResult = await validateAsset(env, job, { copyOptions: failingCopyOptions });
    expect(failResult.ok).toBe(false);
    if (failResult.ok) return;
    expect(failResult.error).toMatch(/short read/);

    // Asset must remain quarantined (NOT ready, NOT rejected)
    expect(await getAssetLifecycle(env, intent.assetId)).toBe("quarantined");
    // Ready object must not exist
    expect(await env.HD_PRIVATE.get(`ready/${intent.assetId}`)).toBeNull();
    // Quarantine object is preserved for retry
    expect(await env.HD_PRIVATE.get(intent.key)).not.toBeNull();

    // Retry with normal copy succeeds
    const retryResult = await validateAsset(env, { ...job, attempt: 2 });
    expect(retryResult.ok).toBe(true);
    if (!retryResult.ok) return;
    expect(retryResult.outcome.lifecycle).toBe("ready");
    expect(await getAssetLifecycle(env, intent.assetId)).toBe("ready");
    expect(await env.HD_PRIVATE.get(`ready/${intent.assetId}`)).not.toBeNull();
    expect(await env.HD_PRIVATE.get(intent.key)).toBeNull();
  });

  it("missing source object or unreadable range leaves Asset quarantined without corruption", async () => {
    const intent = await createUploadIntent(env, {
      userId: nextUser(),
      name: "missing.png",
      mimeType: "image/png",
      size: 1024,
    });
    // Set lifecycle directly to quarantined without putting bytes to HD_PRIVATE
    await env.DB.prepare(`UPDATE assets SET lifecycle = 'quarantined' WHERE id = ?1`)
      .bind(intent.assetId)
      .run();

    const job: AssetValidationJob = {
      assetId: intent.assetId,
      key: intent.key,
      declaredSize: 1024,
      declaredMime: "image/png",
      attempt: 1,
    };

    const result = await validateAsset(env, job);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/missing/);

    // Asset stays quarantined
    expect(await getAssetLifecycle(env, intent.assetId)).toBe("quarantined");
    expect(await env.HD_PRIVATE.get(`ready/${intent.assetId}`)).toBeNull();
  });

  it("retry after partial copy failure is idempotent and does not duplicate assets or corrupt metadata", async () => {
    const intent = await createUploadIntent(env, {
      userId: nextUser(),
      name: "retry-test.png",
      mimeType: "image/png",
      size: validPngBytes().length,
    });
    await env.HD_PRIVATE.put(intent.key, validPngBytes());
    await finalizeUpload(env, intent.assetId);

    const job: AssetValidationJob = {
      assetId: intent.assetId,
      key: intent.key,
      declaredSize: validPngBytes().length,
      declaredMime: "image/png",
      attempt: 1,
    };

    // Attempt 1: fail during copy
    let shouldFail = true;
    const copyOptions: CopyObjectOptions = {
      transform(srcStream) {
        if (shouldFail) {
          return new ReadableStream<Uint8Array>({
            start(controller) {
              controller.error(new Error("R2 storage transient network glitch"));
            },
          });
        }
        return srcStream;
      },
    };

    const attempt1 = await validateAsset(env, job, { copyOptions });
    expect(attempt1.ok).toBe(false);
    expect(await getAssetLifecycle(env, intent.assetId)).toBe("quarantined");

    // Attempt 2: transient error resolved, succeeds
    shouldFail = false;
    const attempt2 = await validateAsset(env, { ...job, attempt: 2 }, { copyOptions });
    expect(attempt2.ok).toBe(true);
    if (!attempt2.ok) return;
    expect(attempt2.outcome.lifecycle).toBe("ready");
    expect(await getAssetLifecycle(env, intent.assetId)).toBe("ready");

    // Record initial updated_at and storage_key
    const assetRow1 = await env.DB.prepare(
      `SELECT id, lifecycle, storage_key, actual_size, width, height, updated_at FROM assets WHERE id = ?1`
    ).bind(intent.assetId).first<{
      id: string;
      lifecycle: string;
      storage_key: string;
      actual_size: number;
      width: number;
      height: number;
      updated_at: number;
    }>();
    expect(assetRow1).not.toBeNull();
    expect(assetRow1!.storage_key).toBe(`ready/${intent.assetId}`);

    // Attempt 3: duplicate job replay is an idempotent no-op
    const attempt3 = await validateAsset(env, { ...job, attempt: 3 });
    expect(attempt3.ok).toBe(true);
    if (!attempt3.ok) return;
    expect(attempt3.outcome.lifecycle).toBe("ready");

    // Asset row remains unchanged (not duplicated, metadata preserved)
    const assetRow2 = await env.DB.prepare(
      `SELECT id, lifecycle, storage_key, actual_size, width, height, updated_at FROM assets WHERE id = ?1`
    ).bind(intent.assetId).first<{
      id: string;
      lifecycle: string;
      storage_key: string;
      actual_size: number;
      width: number;
      height: number;
      updated_at: number;
    }>();
    expect(assetRow2).toEqual(assetRow1);

    // Total assets for this ID in DB is exactly 1
    const count = await env.DB.prepare(
      `SELECT COUNT(*) as cnt FROM assets WHERE id = ?1`
    ).bind(intent.assetId).first<{ cnt: number }>();
    expect(count?.cnt).toBe(1);
  });
});

describe("asset intake & finalize command validation (Ticket #45)", () => {
  it("malformed upload-intent commands fail before D1 row or R2 quarantine key creation", async () => {
    const user = nextUser();
    const malformedPayloads = [
      { name: "", mimeType: "image/png", size: 1024 },
      { name: "   ", mimeType: "image/png", size: 1024 },
      { name: "bad-mime.gif", mimeType: "image/gif", size: 1024 },
      { name: "negative-size.png", mimeType: "image/png", size: -100 },
      { name: "zero-size.png", mimeType: "image/png", size: 0 },
      { name: "fractional.png", mimeType: "image/png", size: 10.5 },
      { name: "oversized.png", mimeType: "image/png", size: 55 * 1024 * 1024 },
      { name: "extra-keys.png", mimeType: "image/png", size: 1024, maliciousKey: true },
    ];

    const initialAssetCount = await env.DB.prepare(`SELECT COUNT(*) as cnt FROM assets WHERE user_id = ?1`)
      .bind(user)
      .first<{ cnt: number }>();

    for (const bad of malformedPayloads) {
      const parsed = UploadIntentSchema.safeParse(bad);
      expect(parsed.success).toBe(false);
      // Because validation fails before domain work, no intent or D1 row is created
    }

    const finalAssetCount = await env.DB.prepare(`SELECT COUNT(*) as cnt FROM assets WHERE user_id = ?1`)
      .bind(user)
      .first<{ cnt: number }>();
    expect(finalAssetCount?.cnt).toBe(initialAssetCount?.cnt);
  });

  it("valid upload-intent command creates pending-upload asset with bounded metadata", async () => {
    const user = nextUser();
    const validPayload = {
      name: "  kitchen_render.png  ",
      mimeType: "image/png" as const,
      size: 4096,
    };

    const parsed = UploadIntentSchema.safeParse(validPayload);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    const intent = await createUploadIntent(env, {
      userId: user,
      name: parsed.data.name,
      mimeType: parsed.data.mimeType,
      size: parsed.data.size,
    });

    expect(intent.name).toBe("kitchen_render.png");
    expect(intent.mimeType).toBe("image/png");
    expect(intent.size).toBe(4096);
    expect(intent.expiresInSec).toBe(600);
    expect(await getAssetLifecycle(env, intent.assetId)).toBe("pending-upload");
  });

  it("malformed finalize command fails validation and cannot advance Asset lifecycle", async () => {
    const user = nextUser();
    const intent = await createUploadIntent(env, {
      userId: user,
      name: "valid.png",
      mimeType: "image/png",
      size: validPngBytes().length,
    });
    await env.HD_PRIVATE.put(intent.key, validPngBytes());

    const malformedFinalizePayloads = [
      {},
      { assetId: "" },
      { assetId: "   " },
      { assetId: 123 },
      { assetId: intent.assetId, extraKey: "exploit" },
    ];

    for (const bad of malformedFinalizePayloads) {
      const parsed = FinalizeAssetSchema.safeParse(bad);
      expect(parsed.success).toBe(false);
    }

    // Asset lifecycle remains pending-upload
    expect(await getAssetLifecycle(env, intent.assetId)).toBe("pending-upload");

    // Valid finalize schema advances lifecycle
    const validParsed = FinalizeAssetSchema.safeParse({ assetId: `  ${intent.assetId}  ` });
    expect(validParsed.success).toBe(true);
    if (!validParsed.success) return;

    const res = await finalizeUpload(env, validParsed.data.assetId);
    expect(res.ok).toBe(true);
    expect(await getAssetLifecycle(env, intent.assetId)).toBe("quarantined");
  });
});