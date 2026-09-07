// Tests for Public Demo provider usage rate limiting and Bangkok-time calculation (ADR 0008, Issue #72).

import { env } from "cloudflare:test";
import { describe, expect, it, beforeEach } from "vitest";
import type { Env } from "@/lib/bindings";
import {
  claimDemoProviderSubmission,
  getBangkokDateString,
  getDemoProviderUsage,
  DEMO_DAILY_PROVIDER_LIMIT,
} from "@/lib/ai/demo-usage";

async function applyMigrations(db: D1Database) {
  await db.batch([
    db.prepare(
      `CREATE TABLE IF NOT EXISTS demo_provider_usage (
        usage_date TEXT PRIMARY KEY,
        usage_count INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL
      )`
    ),
  ]);
}

beforeEach(async () => {
  await applyMigrations(env.DB);
  await env.DB.prepare("DELETE FROM demo_provider_usage").run();
});

describe("getBangkokDateString", () => {
  it("computes Bangkok date correctly across UTC boundary", () => {
    // 2026-09-07 16:59:00 UTC = 2026-09-07 23:59:00 in UTC+7 (Bangkok)
    const t1 = new Date("2026-09-07T16:59:00.000Z");
    expect(getBangkokDateString(t1)).toBe("2026-09-07");

    // 2026-09-07 17:00:00 UTC = 2026-09-08 00:00:00 in UTC+7 (Bangkok)
    const t2 = new Date("2026-09-07T17:00:00.000Z");
    expect(getBangkokDateString(t2)).toBe("2026-09-08");
  });
});

describe("claimDemoProviderSubmission", () => {
  it("is a no-op / returns true in non-demo environment", async () => {
    const devEnv = { ...env, ENVIRONMENT: "development" } as unknown as Env;
    const res = await claimDemoProviderSubmission(devEnv);
    expect(res).toBe(true);

    const check = await getDemoProviderUsage(devEnv);
    expect(check.currentUsage).toBe(0);
  });

  it("increments usage atomically up to 50 in demo environment and fails closed at limit", async () => {
    const demoEnv = { ...env, ENVIRONMENT: "demo" } as unknown as Env;
    const now = new Date("2026-09-07T10:00:00.000Z");

    // First claim creates row with count 1
    const firstClaim = await claimDemoProviderSubmission(demoEnv, now);
    expect(firstClaim).toBe(true);

    let usage = await getDemoProviderUsage(demoEnv, now);
    expect(usage.currentUsage).toBe(1);
    expect(usage.allowed).toBe(true);

    // Increment up to 50
    for (let i = 2; i <= DEMO_DAILY_PROVIDER_LIMIT; i++) {
      const allowed = await claimDemoProviderSubmission(demoEnv, now);
      expect(allowed).toBe(true);
    }

    usage = await getDemoProviderUsage(demoEnv, now);
    expect(usage.currentUsage).toBe(50);
    expect(usage.allowed).toBe(false);

    // 51st claim must be rejected!
    const overLimitClaim = await claimDemoProviderSubmission(demoEnv, now);
    expect(overLimitClaim).toBe(false);

    // Usage count remains at 50
    usage = await getDemoProviderUsage(demoEnv, now);
    expect(usage.currentUsage).toBe(50);
  });

  it("resets quota on next Bangkok calendar day", async () => {
    const demoEnv = { ...env, ENVIRONMENT: "demo" } as unknown as Env;
    const day1 = new Date("2026-09-07T10:00:00.000Z"); // Day 1
    const day2 = new Date("2026-09-08T10:00:00.000Z"); // Day 2

    // Fill day 1
    for (let i = 1; i <= DEMO_DAILY_PROVIDER_LIMIT; i++) {
      await claimDemoProviderSubmission(demoEnv, day1);
    }
    expect(await claimDemoProviderSubmission(demoEnv, day1)).toBe(false);

    // Day 2 has fresh quota
    expect(await claimDemoProviderSubmission(demoEnv, day2)).toBe(true);
    const day2Usage = await getDemoProviderUsage(demoEnv, day2);
    expect(day2Usage.currentUsage).toBe(1);
  });
});
