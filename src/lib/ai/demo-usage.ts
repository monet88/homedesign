// Concurrency-safe provider usage rate limiter for Public Demo (ADR 0008, Issue #72).
// Tracks actual outbound provider submissions per Asia/Bangkok calendar day.
// Configurable limit via DEMO_DAILY_PROVIDER_LIMIT env var with safe fallback to 50.
// Invalid/non-numeric/negative values fail safe to default 50 and NEVER disable the cap.

import type { Env } from "@/lib/bindings";
import { isDemo } from "@/lib/env/policy";

export const DEFAULT_DEMO_DAILY_PROVIDER_LIMIT = 50;
export const BANGKOK_TIMEZONE = "Asia/Bangkok";

/**
 * Resolves the configured daily provider submission limit.
 * Defaults to 50. If env var is missing, empty, non-numeric, or <= 0,
 * it fails safe to 50, ensuring the cap is never disabled.
 */
export function getDemoDailyProviderLimit(env?: { DEMO_DAILY_PROVIDER_LIMIT?: string | number } | null): number {
  const raw = env?.DEMO_DAILY_PROVIDER_LIMIT;
  if (raw === undefined || raw === null) {
    return DEFAULT_DEMO_DAILY_PROVIDER_LIMIT;
  }
  if (typeof raw === "number") {
    if (Number.isInteger(raw) && raw > 0) {
      return raw;
    }
    return DEFAULT_DEMO_DAILY_PROVIDER_LIMIT;
  }
  const str = String(raw).trim();
  // Strict positive integer: digits only, must not start with 0 unless length is 1 (and > 0 so no 0)
  if (!/^[1-9]\d*$/.test(str)) {
    return DEFAULT_DEMO_DAILY_PROVIDER_LIMIT;
  }
  const parsed = Number(str);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    return DEFAULT_DEMO_DAILY_PROVIDER_LIMIT;
  }
  return parsed;
}

/**
 * Formats a timestamp (or current time) into 'YYYY-MM-DD' in Asia/Bangkok time.
 */
export function getBangkokDateString(date: Date = new Date()): string {
  // Use Intl.DateTimeFormat to reliably get year, month, day in Asia/Bangkok
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: BANGKOK_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(date); // en-CA produces YYYY-MM-DD
}

export interface DemoProviderUsageCheck {
  allowed: boolean;
  currentUsage: number;
  limit: number;
  usageDate: string;
}

/**
 * Concurrency-safe atomic check and increment of demo provider usage counter.
 * Uses atomic SQLite UPDATE ... WHERE submission_count < limit.
 * If row does not exist, inserts with count = 1 (provided limit >= 1).
 * Returns true if the submission is allowed under the cap, false if quota exceeded.
 */
export async function claimDemoProviderSubmission(env: Env, now: Date = new Date()): Promise<boolean> {
  if (!isDemo(env)) {
    return true; // only enforced in demo environment
  }

  const limit = getDemoDailyProviderLimit(env);
  const usageDate = getBangkokDateString(now);
  const nowMs = now.getTime();

  // Try to insert with 1 if no row exists yet for today
  const insertRes = await env.DB.prepare(
    `INSERT INTO demo_daily_provider_usage (day_key, submission_count, created_at, updated_at)
     VALUES (?1, 1, ?2, ?2)
     ON CONFLICT(day_key) DO UPDATE SET
       submission_count = submission_count + 1,
       updated_at = ?2
     WHERE submission_count < ?3`
  )
    .bind(usageDate, nowMs, limit)
    .run();

  // If changes === 0, the conflict update condition was false and the cap was reached.
  const rowsChanged = insertRes.meta?.changes ?? 0;
  return rowsChanged > 0;
}

/**
 * Reads current usage for the current Bangkok day.
 */
export async function getDemoProviderUsage(env: Env, now: Date = new Date()): Promise<DemoProviderUsageCheck> {
  const limit = getDemoDailyProviderLimit(env);
  const usageDate = getBangkokDateString(now);
  const row = await env.DB.prepare(
    `SELECT submission_count FROM demo_daily_provider_usage WHERE day_key = ?1`
  )
    .bind(usageDate)
    .first<{ submission_count: number }>();

  const currentUsage = row?.submission_count ?? 0;
  return {
    allowed: currentUsage < limit,
    currentUsage,
    limit,
    usageDate,
  };
}
