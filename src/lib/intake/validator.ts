// Validation Worker (ADR 0003 / Ticket 06 / spec §Upload & Asset lifecycle).
// Queue-driven: consumes `AssetValidationJob` from ASSET_VALIDATE.
//
// Checks (all bounded, no raster decode):
//  1. Actual object size <= 50MB (ranged HEAD)
//  2. Magic bytes + bounded PNG/JPEG header parse for width/height
//  3. <=50MP and <=12000px/side
//  4. 1GiB ready-private quota
//
// Pass  -> durable copy to ready key + Asset `ready` + delete quarantine copy
// Fail  -> Asset `rejected` + object delete
//
// Idempotent: re-delivery of the same job (queue retries / duplicate events)
// converges to the same terminal state.

import type { Env } from "@/lib/bindings";
import { MAX_UPLOAD_BYTES } from "@/lib/fixtures/images";
import {
  hasPngIend,
  parseImageHeader,
  validateDimensions,
  type ParseResult,
} from "@/lib/intake/header-parser";

// Maximum header bytes read from the head of the object (bounded ranged read).
const HEAD_BYTES = 64 * 1024;
// Maximum tail bytes read (IEND check for PNG).
const TAIL_BYTES = 12;

// 1GiB ready-private quota (ADR 0003).
const MAX_READY_BYTES = 1 * 1024 * 1024 * 1024;

export interface AssetValidationJob {
  assetId: string;
  key: string;
  declaredSize: number;
  declaredMime: string;
  attempt: number;
}

export interface ValidationOutcome {
  assetId: string;
  lifecycle: "ready" | "rejected";
  reason?: string;
  width?: number;
  height?: number;
  actualSize?: number;
}

export type ValidationResult = { ok: true; outcome: ValidationOutcome } | { ok: false; error: string };

/**
 * Main entry point for the validation worker. Consumes a single job.
 * Throws on transient errors so the queue retries; permanent input failures
 * return a resolved `rejected` outcome (no retry).
 */
export async function validateAsset(
  env: Env,
  job: AssetValidationJob,
  options?: { copyOptions?: CopyObjectOptions }
): Promise<ValidationResult> {
  const { assetId, key } = job;

  // Idempotency guard: if the asset already reached a terminal state, no-op.
  const current = await getAssetRow(env, assetId);
  if (!current) {
    return { ok: false, error: `asset not found: ${assetId}` };
  }
  if (current.lifecycle === "ready" || current.lifecycle === "rejected") {
    return { ok: true, outcome: { assetId, lifecycle: current.lifecycle } };
  }
  if (current.lifecycle !== "quarantined") {
    // pending-upload (finalize not yet done) or deleted → skip.
    return { ok: false, error: `asset not quarantined: ${assetId} (${current.lifecycle})` };
  }

  // 1. Actual byte size (HEAD — no body read).
  const obj = await env.HD_PRIVATE.head(key);
  if (!obj) {
    return { ok: false, error: `object missing: ${key}` };
  }
  if (obj.size > MAX_UPLOAD_BYTES) {
    await reject(env, assetId, key, `object size ${obj.size} exceeds 50MB`);
    return { ok: true, outcome: { assetId, lifecycle: "rejected", reason: "size exceeds 50MB", actualSize: obj.size } };
  }

  // 2+3. Bounded header parse (ranged reads: head + PNG tail).
  const head = await env.HD_PRIVATE.get(key, { range: { offset: 0, length: HEAD_BYTES } });
  if (!head) {
    return { ok: false, error: `object unreadable: ${key}` };
  }
  const headBytes = new Uint8Array(await head.arrayBuffer());

  const parsed: ParseResult | null = parseImageHeader(headBytes);
  if (!parsed) {
    await reject(env, assetId, key, "unrecognized or malformed image header");
    return { ok: true, outcome: { assetId, lifecycle: "rejected", reason: "malformed header" } };
  }

  // PNG: verify IEND at the tail (bounded truncation check).
  if (parsed.format === "png") {
    const tail = await env.HD_PRIVATE.get(key, { range: { offset: Math.max(0, obj.size - TAIL_BYTES), length: TAIL_BYTES } });
    const tailBytes = new Uint8Array(tail ? await tail.arrayBuffer() : new ArrayBuffer(0));
    if (!hasPngIend(tailBytes)) {
      await reject(env, assetId, key, "truncated PNG (missing IEND)");
      return { ok: true, outcome: { assetId, lifecycle: "rejected", reason: "truncated PNG" } };
    }
  }

  const dimsCheck = validateDimensions(parsed.dimensions);
  if (!dimsCheck.ok) {
    await reject(env, assetId, key, dimsCheck.reason);
    return { ok: true, outcome: { assetId, lifecycle: "rejected", reason: dimsCheck.reason, width: parsed.dimensions.width, height: parsed.dimensions.height } };
  }

  // 4. 1GiB ready-private quota (checked at intent time too, but re-checked here
  //    because validation is the authoritative gate before promoting to ready).
  const readyBytes = await env.DB.prepare(
    `SELECT COALESCE(SUM(actual_size), 0) AS total FROM assets WHERE lifecycle = 'ready'`
  ).first<{ total: number }>();
  if (readyBytes && Number(readyBytes.total) + obj.size > MAX_READY_BYTES) {
    await reject(env, assetId, key, "ready private storage quota exceeded");
    return { ok: true, outcome: { assetId, lifecycle: "rejected", reason: "ready storage quota exceeded" } };
  }

  // Pass → durable copy to ready key.
  const readyKey = readyKeyFor(key, assetId);

  // Stream/copy the full object (R2 streaming copy without buffering the whole file).
  try {
    await copyObject(
      env,
      key,
      readyKey,
      obj.size,
      parsed.format === "png" ? "image/png" : "image/jpeg",
      options?.copyOptions
    );
  } catch (err) {
    return {
      ok: false,
      error: `copy failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // Asset becomes ready ONLY after the durable ready object exists
  const readyObj = await env.HD_PRIVATE.head(readyKey);
  if (!readyObj) {
    return { ok: false, error: `ready object verification failed: ${readyKey}` };
  }

  // Atomically mark ready and record dimensions.
  const now = Date.now();
  await env.DB.prepare(
    `UPDATE assets SET lifecycle = 'ready', storage_key = ?2, actual_size = ?3, width = ?4, height = ?5, updated_at = ?6
     WHERE id = ?1 AND lifecycle = 'quarantined'`
  )
    .bind(assetId, readyKey, obj.size, parsed.dimensions.width, parsed.dimensions.height, now)
    .run();

  // Delete the quarantine copy (durable ready copy already exists).
  await env.HD_PRIVATE.delete(key);

  return { ok: true, outcome: { assetId, lifecycle: "ready", width: parsed.dimensions.width, height: parsed.dimensions.height, actualSize: obj.size } };
}

export interface CopyObjectOptions {
  /** Optional stream transform for instrumentation, chunk monitoring, or testing */
  transform?: (stream: ReadableStream<Uint8Array>) => ReadableStream<Uint8Array>;
}

/**
 * Copy an R2 object to a new key via streaming (no full-file buffering).
 * Pipes R2's native ReadableStream body directly into `put()` without whole-object
 * accumulation or concatenation in memory.
 */
async function copyObject(
  env: Env,
  srcKey: string,
  destKey: string,
  size: number,
  contentType: string,
  options?: CopyObjectOptions
): Promise<void> {
  const srcObj = await env.HD_PRIVATE.get(srcKey);
  if (!srcObj) {
    throw new Error(`copy failed: missing source object ${srcKey}`);
  }

  let bodyStream: ReadableStream<Uint8Array> = srcObj.body;
  if (options?.transform) {
    const transformed = options.transform(bodyStream);
    bodyStream = typeof FixedLengthStream !== "undefined"
      ? transformed.pipeThrough(new FixedLengthStream(size))
      : transformed;
  }

  await env.HD_PRIVATE.put(destKey, bodyStream, {
    httpMetadata: { contentType },
    customMetadata: srcObj.customMetadata,
  });
}

async function reject(env: Env, assetId: string, key: string, reason: string): Promise<void> {
  // Mark rejected + delete the object (ADR 0003: failure deletes the object).
  await env.DB.prepare(
    `UPDATE assets SET lifecycle = 'rejected', updated_at = ?2 WHERE id = ?1 AND lifecycle = 'quarantined'`
  ).bind(assetId, Date.now()).run();
  await env.HD_PRIVATE.delete(key);
}

async function getAssetRow(env: Env, assetId: string) {
  return env.DB.prepare(
    `SELECT id, lifecycle, storage_key FROM assets WHERE id = ?1`
  ).bind(assetId).first<{ id: string; lifecycle: string; storage_key: string }>();
}

function readyKeyFor(quarantineKey: string, assetId: string): string {
  return `ready/${assetId}`;
}


// Export for tests / seam reuse by ticket #7 (AI output validation).
export { readyKeyFor, copyObject };