// Presigned upload intent fixture + asset lifecycle helpers (spec ADR 0003:
// upload intent → Asset `pending-upload` + presigned PUT → `quarantined`).

import type { Env } from "@/lib/bindings";
import type { AssetLifecycle } from "@/lib/fixtures/images";
import { MAX_UPLOAD_BYTES, VALID_UPLOAD_MIMES } from "@/lib/fixtures/images";

/** Upload intent created by the browser before the presigned PUT. */
export interface UploadIntent {
  assetId: string;
  name: string;
  mimeType: string;
  size: number;
  /** Quarantine key where the client PUTs the object. */
  key: string;
  /** Seconds until the presigned URL expires (spec: 10 minutes). */
  expiresInSec: number;
  createdAt: number;
}

/**
 * Creates an upload intent and records the Asset as `pending-upload` in D1.
 * Presigned URL generation itself is deferred to the upload ticket (007); the
 * harness fixture returns the intent shape later tickets will consume.
 */
export async function createUploadIntent(
  env: Env,
  input: { assetId?: string; name: string; mimeType: string; size: number }
): Promise<UploadIntent> {
  if (!VALID_UPLOAD_MIMES.includes(input.mimeType as (typeof VALID_UPLOAD_MIMES)[number])) {
    throw new Error(`unsupported mime type: ${input.mimeType}`);
  }
  if (input.size > MAX_UPLOAD_BYTES) {
    throw new Error(`size exceeds ${MAX_UPLOAD_BYTES} bytes`);
  }

  const assetId = input.assetId ?? crypto.randomUUID();
  const key = `quarantine/${assetId}-${Date.now()}`;
  const now = Date.now();

  await env.DB.prepare(
    `INSERT INTO assets (id, name, mime_type, size, lifecycle, storage_key, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, 'pending-upload', ?5, ?6, ?6)`
  )
    .bind(assetId, input.name, input.mimeType, input.size, key, now)
    .run();

  return {
    assetId,
    name: input.name,
    mimeType: input.mimeType,
    size: input.size,
    key,
    expiresInSec: 10 * 60,
    createdAt: now,
  };
}

/**
 * Simulates finalize/verified object-create: moves the Asset from
 * `pending-upload` → `quarantined` (object exists, validation pending).
 */
export async function transitionAsset(
  env: Env,
  assetId: string,
  lifecycle: AssetLifecycle
): Promise<void> {
  const now = Date.now();
  await env.DB.prepare(
    `UPDATE assets SET lifecycle = ?2, updated_at = ?3 WHERE id = ?1`
  )
    .bind(assetId, lifecycle, now)
    .run();
}

/** Reads the lifecycle of an Asset from D1. */
export async function getAssetLifecycle(env: Env, assetId: string): Promise<AssetLifecycle | null> {
  const res = await env.DB.prepare(`SELECT lifecycle FROM assets WHERE id = ?1`)
    .bind(assetId)
    .first<{ lifecycle: AssetLifecycle }>();
  return res?.lifecycle ?? null;
}

/**
 * Lifecycle transitions allowed by ADR 0003. Used by the fixture to assert
 * the state machine in later tickets.
 */
export const ALLOWED_LIFECYCLE_TRANSITIONS: Record<AssetLifecycle, AssetLifecycle[]> = {
  "pending-upload": ["quarantined", "rejected", "deleted"],
  quarantined: ["ready", "rejected", "deleted"],
  ready: ["deleted"],
  rejected: ["deleted"],
  deleted: [],
};
