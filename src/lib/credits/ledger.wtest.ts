// Workers-runtime tests for the immutable Credit Ledger (ticket #04, ADR 0002).
// Run via `npm run wrangler:test` (vitest-pool-workers, real D1 binding).
//
// Covers:
//   AC1  append-only ledger, balance derived
//   AC2  free grant 10 credits, idempotent (concurrent-safe)
//   AC4  add/use/hold/release primitives
//   AC5  invariant grants = usage + available + active holds after every transition

import { env } from "cloudflare:test";
import { describe, expect, it, beforeEach } from "vitest";
import type { Env } from "@/lib/bindings";
import {
  addCredits,
  assertCreditInvariant,
  ensureFreeCreditGrant,
  getActiveHoldByRef,
  getAvailableCredits,
  getLedgerSummary,
  holdCredits,
  releaseHold,
  settleHold,
  useCredits,
} from "@/lib/credits/ledger";

let userId: string;
let email: string;

beforeEach(async () => {
  await applyMigrations(env.DB);
  userId = "user-" + crypto.randomUUID();
  email = userId + "@example.com";
  await env.DB.prepare(
    `INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt)
     VALUES (?1, 'Test User', ?2, 1, 1, 1)`
  ).bind(userId, email).run();
});

describe("free credit grant (AC2)", () => {
  it("grants 10 credits exactly once", async () => {
    const first = await ensureFreeCreditGrant(env, userId);
    expect(first).toBe(true);
    expect(await getAvailableCredits(env, userId)).toBe(10);

    const again = await ensureFreeCreditGrant(env, userId);
    expect(again).toBe(false);
    expect(await getAvailableCredits(env, userId)).toBe(10);

    const summary = await getLedgerSummary(env, userId);
    expect(summary.totalGrants).toBe(10);
    expect(summary.available).toBe(10);
    await expect(assertCreditInvariant(env, userId)).resolves.toBe(true);
  });

  it("is idempotent under concurrent calls (only one ledger entry)", async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, () => ensureFreeCreditGrant(env, userId))
    );
    // Exactly one caller observed the grant being applied.
    expect(results.filter(Boolean)).toHaveLength(1);

    const ledger = await env.DB.prepare(
      `SELECT COUNT(*) AS cnt FROM credit_ledger WHERE user_id = ?1 AND entry_type = 'grant'`
    ).bind(userId).first<{ cnt: number }>();
    expect(ledger?.cnt).toBe(1);
    expect(await getAvailableCredits(env, userId)).toBe(10);
  });
});

describe("hold / settle / release primitives (AC4)", () => {
  it("hold deducts from available; settle converts to usage", async () => {
    await ensureFreeCreditGrant(env, userId);
    expect(await getAvailableCredits(env, userId)).toBe(10);

    const holdId = await holdCredits(env, userId, 3, "task", "task-1", "Room render");
    expect(await getAvailableCredits(env, userId)).toBe(7);
    expect(await getActiveHoldByRef(env, "task", "task-1")).not.toBeNull();

    await settleHold(env, holdId);
    expect(await getAvailableCredits(env, userId)).toBe(7); // used, not restored
    expect(await getActiveHoldByRef(env, "task", "task-1")).toBeNull();

    const summary = await getLedgerSummary(env, userId);
    expect(summary.totalUsage).toBe(3);
    expect(summary.available).toBe(7);
    await expect(assertCreditInvariant(env, userId)).resolves.toBe(true);
  });

  it("release restores the held amount to available", async () => {
    await ensureFreeCreditGrant(env, userId);
    const holdId = await holdCredits(env, userId, 4, "task", "task-2", "Floor plan");
    expect(await getAvailableCredits(env, userId)).toBe(6);

    await releaseHold(env, holdId);
    expect(await getAvailableCredits(env, userId)).toBe(10);
    expect(await getActiveHoldByRef(env, "task", "task-2")).toBeNull();

    await expect(assertCreditInvariant(env, userId)).resolves.toBe(true);
  });

  it("refuses double-hold on the same ref", async () => {
    await ensureFreeCreditGrant(env, userId);
    await holdCredits(env, userId, 2, "task", "task-3", "First");
    await expect(
      holdCredits(env, userId, 2, "task", "task-3", "Duplicate")
    ).rejects.toThrow("HOLD_ALREADY_ACTIVE");
    // Invariant still holds (ledger untouched).
    await expect(assertCreditInvariant(env, userId)).resolves.toBe(true);
  });

  it("settle/release on non-active hold throws", async () => {
    await ensureFreeCreditGrant(env, userId);
    const holdId = await holdCredits(env, userId, 1, "task", "task-4", "Test");
    await settleHold(env, holdId);
    await expect(releaseHold(env, holdId)).rejects.toThrow("HOLD_NOT_ACTIVE");
    await expect(settleHold(env, holdId)).rejects.toThrow("HOLD_NOT_ACTIVE");
  });
});

describe("add / use primitives (AC4)", () => {
  it("addCredits (payment) adds to available, idempotent by key", async () => {
    await ensureFreeCreditGrant(env, userId);
    const entry = await addCredits(env, userId, 80, "Mock purchase — Lite pack", {
      entryType: "payment",
      idempotencyKey: "mockpay-1",
    });
    expect(entry.entry_type).toBe("payment");
    expect(await getAvailableCredits(env, userId)).toBe(90);

    // Same idempotency key -> existing entry, no double-add.
    const again = await addCredits(env, userId, 80, "Mock purchase — Lite pack", {
      entryType: "payment",
      idempotencyKey: "mockpay-1",
    });
    expect(again.id).toBe(entry.id);
    expect(await getAvailableCredits(env, userId)).toBe(90);

    await expect(assertCreditInvariant(env, userId)).resolves.toBe(true);
  });

  it("useCredits deducts directly (non-hold-backed spending)", async () => {
    await ensureFreeCreditGrant(env, userId);
    await useCredits(env, userId, 2, "Direct spend");
    expect(await getAvailableCredits(env, userId)).toBe(8);
    await expect(assertCreditInvariant(env, userId)).resolves.toBe(true);
  });
});

describe("ledger invariant (AC5)", () => {
  it("holds after every transition: grants = usage + available + active holds", async () => {
    await ensureFreeCreditGrant(env, userId); // 10
    await addCredits(env, userId, 160, "Mock purchase — Plus pack", {
      entryType: "payment",
      idempotencyKey: "mockpay-2",
    }); // 170

    const h1 = await holdCredits(env, userId, 1, "task", "t-a", "Interior"); // available 169
    const h2 = await holdCredits(env, userId, 3, "task", "t-b", "Floor plan"); // available 166
    await expect(assertCreditInvariant(env, userId)).resolves.toBe(true);

    await settleHold(env, h1); // 1 used
    await expect(assertCreditInvariant(env, userId)).resolves.toBe(true);
    await releaseHold(env, h2); // 3 restored
    await expect(assertCreditInvariant(env, userId)).resolves.toBe(true);

    const summary = await getLedgerSummary(env, userId);
    expect(summary.totalGrants).toBe(10);
    expect(summary.totalPayments).toBe(160);
    expect(summary.totalUsage).toBe(1);
    expect(summary.activeHolds).toBe(0);
    expect(summary.available).toBe(169);
    expect(summary.totalGrants + summary.totalPayments).toBe(
      summary.totalUsage + summary.available + summary.activeHolds
    );
  });
});

// Recreate the credit schema + the `user` FK target in the test DB.
// The real migrations (0001..0003) are applied by wrangler/wrangler d1, but
// the vitest-pool-workers harness starts from an empty DB, so the harness
// must provision the same tables.
async function applyMigrations(db: D1Database) {
  await db
    .batch([
      db.prepare(
        `CREATE TABLE IF NOT EXISTS user (
          id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
          emailVerified INTEGER NOT NULL DEFAULT 0, image TEXT,
          createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL
        )`
      ),
      db.prepare(
        `CREATE TABLE IF NOT EXISTS credit_ledger (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
          entry_type TEXT NOT NULL CHECK (entry_type IN ('grant','payment','usage','hold','release')),
          amount INTEGER NOT NULL,
          reason TEXT NOT NULL,
          ref_type TEXT,
          ref_id TEXT,
          grant_key TEXT,
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
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
          amount INTEGER NOT NULL CHECK (amount > 0),
          status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','settled','released')),
          ref_type TEXT NOT NULL,
          ref_id TEXT NOT NULL,
          ledger_hold_id TEXT,
          created_at INTEGER NOT NULL,
          settled_at INTEGER,
          released_at INTEGER
        )`
      ),
      db.prepare(
        `CREATE INDEX IF NOT EXISTS idx_credit_holds_user_status ON credit_holds(user_id, status)`
      ),
      db.prepare(
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_holds_ref_active
          ON credit_holds(ref_type, ref_id) WHERE status = 'active'`
      ),
    ]);
}