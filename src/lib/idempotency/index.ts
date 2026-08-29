import type { Env } from "@/lib/bindings";

// ── Canonical fingerprint ────────────────────────────────────────────────────
// Deterministic JSON hash: keys sorted lexicographically, no whitespace, SHA-256.

export function canonicalStringify(obj: unknown): string {
  if (obj === null || obj === undefined) return "null";
  if (typeof obj === "string") return JSON.stringify(obj);
  if (typeof obj === "number" || typeof obj === "boolean") return String(obj);
  if (Array.isArray(obj)) return "[" + obj.map(canonicalStringify).join(",") + "]";
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  const pairs = keys.map((k) => JSON.stringify(k) + ":" + canonicalStringify((obj as Record<string, unknown>)[k]));
  return "{" + pairs.join(",") + "}";
}

export async function canonicalHash(obj: unknown): Promise<string> {
  const canonical = canonicalStringify(obj);
  const encoder = new TextEncoder();
  const data = encoder.encode(canonical);
  const hash = await crypto.subtle.digest("SHA-256", data);
  const hex = Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex;
}

// ── Idempotency record type ─────────────────────────────────────────────────

export interface IdempotencyRecord {
  id: string;
  user_id: string;
  operation: string;
  idempotency_key: string;
  request_fingerprint: string;
  result_type: string;
  result_id: string;
  created_at: number;
}

// ── Shared idempotency helper ────────────────────────────────────────────────

/**
 * Wraps an operation with idempotency checking.
 *
 * 1. Computes a canonical fingerprint of `payload`.
 * 2. Looks up `(user_id, operation, idempotency_key)`.
 *    - Found + same fingerprint   → returns the cached `{ result_type, result_id }`.
 *    - Found + different fingerprint → throws `409 IDEMPOTENCY_KEY_REUSED`.
 * 3. Not found → calls `fn()` to produce the domain record.
 * 4. Records the idempotency key with the result_id and fingerprint.
 *    If the record creation fails (race), the unique constraint throws and the
 *    caller sees a retryable error (code 409 in practice).
 *
 * @returns The new domain record id (from `fn`) or the cached one.
 */
export async function withIdempotency<T>(
  env: Env,
  userId: string,
  operation: string,
  idempotencyKey: string,
  payload: unknown,
  fn: () => Promise<{ resultType: string; resultId: string; data: T }>
): Promise<{ resultType: string; resultId: string; data: T; cached: boolean }> {
  const fingerprint = await canonicalHash(payload);

  // Check existing.
  const existing = await env.DB.prepare(
    `SELECT * FROM idempotency_keys WHERE user_id = ?1 AND operation = ?2 AND idempotency_key = ?3`
  ).bind(userId, operation, idempotencyKey).first<IdempotencyRecord>();

  if (existing) {
    if (existing.request_fingerprint !== fingerprint) {
      // Same key + different payload → 409.
      const err = new Error("IDEMPOTENCY_KEY_REUSED") as Error & { status?: number };
      err.status = 409;
      throw err;
    }
    // Same key + same payload → cached.
    return {
      resultType: existing.result_type,
      resultId: existing.result_id,
      data: null as unknown as T,
      cached: true,
    };
  }

  // Run the operation.
  const result = await fn();

  // Record idempotency.
  const id = crypto.randomUUID();
  const now = Date.now();
  try {
    await env.DB.prepare(
      `INSERT INTO idempotency_keys (id, user_id, operation, idempotency_key, request_fingerprint, result_type, result_id, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`
    ).bind(id, userId, operation, idempotencyKey, fingerprint, result.resultType, result.resultId, now).run();
  } catch (err: unknown) {
    // Unique constraint race — another concurrent request won. Check the existing record.
    const existingAfterRace = await env.DB.prepare(
      `SELECT * FROM idempotency_keys WHERE user_id = ?1 AND operation = ?2 AND idempotency_key = ?3`
    ).bind(userId, operation, idempotencyKey).first<IdempotencyRecord>();

    if (existingAfterRace) {
      // Re-verify fingerprint on the racing record.
      if (existingAfterRace.request_fingerprint !== fingerprint) {
        const err409 = new Error("IDEMPOTENCY_KEY_REUSED") as Error & { status?: number };
        err409.status = 409;
        throw err409;
      }
      return {
        resultType: existingAfterRace.result_type,
        resultId: existingAfterRace.result_id,
        data: null as unknown as T,
        cached: true,
      };
    }

    // Not a unique constraint race — do not swallow unexpected database errors.
    throw err;
  }

  return { ...result, cached: false };
}
