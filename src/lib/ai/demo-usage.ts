// Concurrency-safe provider usage rate limiter for Public Demo (ADR 0008, Issue #72).
// Tracks actual outbound provider submissions per Asia/Bangkok calendar day.
// Max 50 provider submissions per day.

import type { Env } from "@/lib/bindings";
import { isDemo } from "@/lib/env/policy";

export const DEMO_DAILY_PROVIDER_LIMIT = 50;
export const BANGKOK_TIMEZONE = "Asia/Bangkok";

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
 * Uses atomic SQLite UPDATE ... WHERE usage_count < 50.
 * If row does not exist, inserts with count = 1.
 * Returns true if the submission is allowed under the cap, false if quota exceeded.
 */
export async function claimDemoProviderSubmission(env: Env, now: Date = new Date()): Promise<boolean> {
  if (!isDemo(env)) {
    return true; // only enforced in demo environment
  }

  const usageDate = getBangkokDateString(now);
  const nowMs = now.getTime();

  // Try to insert with 1 if no row exists yet for today
  const insertRes = await env.DB.prepare(
    `INSERT INTO demo_provider_usage (usage_date, usage_count, updated_at)
     VALUES (?1, 1, ?2)
     ON CONFLICT(usage_date) DO UPDATE SET
       usage_count = usage_count + 1,
       updated_at = ?2
     WHERE usage_count < ?3`
  )
    .bind(usageDate, nowMs, DEMO_DAILY_PROVIDER_LIMIT)
    .run();

  // If changes === 0, it means conflict update condition 'usage_count < 50' was false -> exceeded limit!
  const rowsChanged = insertRes.meta?.changes ?? 0;
  return rowsChanged > 0;
}

/**
 * Reads current usage for the current Bangkok day.
 */
export async function getDemoProviderUsage(env: Env, now: Date = new Date()): Promise<DemoProviderUsageCheck> {
  const usageDate = getBangkokDateString(now);
  const row = await env.DB.prepare(
    `SELECT usage_count FROM demo_provider_usage WHERE usage_date = ?1`
  )
    .bind(usageDate)
    .first<{ usage_count: number }>();

  const currentUsage = row?.usage_count ?? 0;
  return {
    allowed: currentUsage < DEMO_DAILY_PROVIDER_LIMIT,
    currentUsage,
    limit: DEMO_DAILY_PROVIDER_LIMIT,
    usageDate,
  };
}
