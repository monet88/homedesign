// Workers-runtime admin database seed & credit ledger immutability tests (Ticket #36, Ticket #22, Spec #20).
// Runs inside miniflare via vitest-pool-workers with real D1 bindings.

import { env } from "cloudflare:test";
import { describe, expect, it, beforeEach } from "vitest";
import {
  seedAdminDatabase,
  bootstrapDemoAdmin,
  requireAdminSession,
  type AdminSeedConfig,
} from "@/lib/auth/admin";
import {
  getAvailableCredits,
  getCreditLedger,
  recordAdminCreditAdjustment,
  assertCreditInvariant,
} from "@/lib/credits/ledger";
import { createAuth, type AuthEnv } from "@/lib/auth/server";

const AUTH = {
  BETTER_AUTH_SECRET: "test-secret-that-is-long-enough-32-chars",
  BETTER_AUTH_URL: "http://localhost:3000",
  EMAIL_DELIVERY_MODE: "test-outbox",
} as const;

function testEnv(): AuthEnv {
  return {
    ...(env as unknown as AuthEnv),
    ...AUTH,
  };
}

async function applyMigrations(db: D1Database) {
  await db.batch([
    db.prepare(
      `CREATE TABLE IF NOT EXISTS user (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
        emailVerified INTEGER NOT NULL DEFAULT 0, role TEXT NOT NULL DEFAULT 'user',
        image TEXT, createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL
      )`
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS session (
        id TEXT PRIMARY KEY, expiresAt INTEGER NOT NULL, token TEXT NOT NULL UNIQUE,
        createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL,
        ipAddress TEXT, userAgent TEXT,
        userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE
      )`
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS account (
        id TEXT PRIMARY KEY, accountId TEXT NOT NULL, providerId TEXT NOT NULL,
        issuer TEXT NOT NULL,
        userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
        accessToken TEXT, refreshToken TEXT, idToken TEXT,
        accessTokenExpiresAt INTEGER, refreshTokenExpiresAt INTEGER, scope TEXT,
        password TEXT, createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL
      )`
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS verification (
        id TEXT PRIMARY KEY, identifier TEXT NOT NULL, value TEXT NOT NULL,
        expiresAt INTEGER NOT NULL, createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL
      )`
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS credit_ledger (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
        entry_type TEXT NOT NULL CHECK (entry_type IN ('grant', 'payment', 'usage', 'hold', 'release')),
        amount INTEGER NOT NULL,
        reason TEXT NOT NULL,
        ref_type TEXT,
        ref_id TEXT,
        grant_key TEXT,
        workspace_id TEXT,
        created_at INTEGER NOT NULL
      )`
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
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'settled', 'released')),
        ref_type TEXT NOT NULL,
        ref_id TEXT NOT NULL,
        ledger_hold_id TEXT,
        workspace_id TEXT,
        created_at INTEGER NOT NULL,
        settled_at INTEGER,
        released_at INTEGER
      )`
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_credit_holds_user_status
        ON credit_holds(user_id, status)`
    ),
    db.prepare(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_holds_ref_active
        ON credit_holds(ref_type, ref_id) WHERE status = 'active'`
    ),
  ]);
}

beforeEach(async () => {
  await applyMigrations(env.DB);
  await env.DB.prepare(`DELETE FROM credit_holds`).run();
  await env.DB.prepare(`DELETE FROM credit_ledger`).run();
  await env.DB.prepare(`DELETE FROM session`).run();
  await env.DB.prepare(`DELETE FROM account`).run();
  await env.DB.prepare(`DELETE FROM verification`).run();
  await env.DB.prepare(`DELETE FROM user`).run();
});

describe("Admin Seed & Immutable Credit Ledger (Ticket #36)", () => {
  const adminConfig: AdminSeedConfig = {
    email: "admin@example.com",
    password: "test-admin-password-123!",
    credits: 99999,
    name: "Admin Tester",
    role: "admin",
  };

  it("AC1: First seed provisions user, credential account, role, and exactly one initial grant", async () => {
    const res = await seedAdminDatabase.seedDirect(env.DB, adminConfig);
    expect(res.status).toBe("created");
    expect(res.initialCredits).toBe(99999);

    // Verify user row
    const user = await env.DB.prepare(`SELECT * FROM user WHERE email = ?1`)
      .bind(adminConfig.email)
      .first<{ id: string; role: string; emailVerified: number; name: string }>();
    expect(user).not.toBeNull();
    expect(user?.role).toBe("admin");
    expect(user?.emailVerified).toBe(1);
    expect(user?.name).toBe("Admin Tester");

    // Verify credential account
    const account = await env.DB.prepare(`SELECT * FROM account WHERE userId = ?1`)
      .bind(user!.id)
      .first<{ providerId: string; password: string }>();
    expect(account).not.toBeNull();
    expect(account?.providerId).toBe("credential");
    expect(account?.password).toBeDefined();

    // Verify credit ledger: exactly 1 initial grant
    const entries = await getCreditLedger(testEnv(), user!.id);
    expect(entries).toHaveLength(1);
    const grant = entries[0];
    expect(grant.entry_type).toBe("grant");
    expect(grant.amount).toBe(99999);
    expect(grant.grant_key).toBe("admin-initial-grant");
    expect(grant.reason).toBe("Initial Admin Credit Grant");

    // Available credits match initial grant
    const available = await getAvailableCredits(testEnv(), user!.id);
    expect(available).toBe(99999);

    // Admin authentication verification
    const authResult = await requireAdminSession(
      testEnv(),
      new Request("http://localhost:3000/admin"),
      async () => ({
        session: {
          id: "sess-1",
          userId: user!.id,
          expiresAt: new Date(Date.now() + 3600000),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        user: {
          id: user!.id,
          name: user!.name,
          email: adminConfig.email,
          emailVerified: true,
          role: "admin",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      })
    );
    expect(authResult.authorized).toBe(true);
  });

  it("AC2: Re-running the same seed creates no additional grant and does not mutate the existing entry", async () => {
    // Run 1
    await seedAdminDatabase.seedDirect(env.DB, adminConfig);
    const user = (await env.DB.prepare(`SELECT id FROM user WHERE email = ?1`).bind(adminConfig.email).first<{ id: string }>())!;
    const entriesRun1 = await getCreditLedger(testEnv(), user.id);
    expect(entriesRun1).toHaveLength(1);
    const initialEntry = entriesRun1[0];

    // Wait 10ms to ensure timestamp difference would be visible if mutated
    await new Promise((r) => setTimeout(r, 10));

    // Run 2: Re-run same seed
    const resRun2 = await seedAdminDatabase.seedDirect(env.DB, adminConfig);
    const { promise, resolve } = Promise.withResolvers<void>();
    setTimeout(resolve, 10);
    await promise;
    const entriesRun2 = await getCreditLedger(testEnv(), user.id);
    expect(entriesRun2).toHaveLength(1);
    const currentEntry = entriesRun2[0];

    // Verify full immutability: id, amount, reason, grant_key, and created_at remain unchanged
    expect(currentEntry.id).toBe(initialEntry.id);
    expect(currentEntry.amount).toBe(initialEntry.amount);
    expect(currentEntry.reason).toBe(initialEntry.reason);
    expect(currentEntry.grant_key).toBe(initialEntry.grant_key);
    expect(currentEntry.created_at).toBe(initialEntry.created_at);

    // Invariant check
    await expect(assertCreditInvariant(testEnv(), user.id)).resolves.toBe(true);
  });

  it("AC3: Re-running with a DIFFERENT requested initial-credit value does not rewrite history and rejects", async () => {
    // Run 1: seed with 99,999 credits
    await seedAdminDatabase.seedDirect(env.DB, adminConfig);
    const user = (await env.DB.prepare(`SELECT id FROM user WHERE email = ?1`).bind(adminConfig.email).first<{ id: string }>())!;
    const entriesBefore = await getCreditLedger(testEnv(), user.id);
    expect(entriesBefore[0].amount).toBe(99999);

    // Run 2: attempt to re-seed with 50,000 credits
    const conflictingConfig: AdminSeedConfig = {
      ...adminConfig,
      credits: 50000,
    };

    await expect(seedAdminDatabase.seedDirect(env.DB, conflictingConfig)).rejects.toThrow(
      /Initial credit grant mismatch: existing grant is 99999 credits, but requested 50000 credits/
    );

    // Verify ledger was NOT rewritten
    const entriesAfter = await getCreditLedger(testEnv(), user.id);
    expect(entriesAfter).toHaveLength(1);
    expect(entriesAfter[0].id).toBe(entriesBefore[0].id);
    expect(entriesAfter[0].amount).toBe(99999);
    expect(entriesAfter[0].created_at).toBe(entriesBefore[0].created_at);

    const available = await getAvailableCredits(testEnv(), user.id);
    expect(available).toBe(99999);
  });

  it("AC4: Subsequent balance changes use separate immutable adjustment entries via Admin Operation", async () => {
    // Initial seed
    await seedAdminDatabase.seedDirect(env.DB, adminConfig);
    const user = (await env.DB.prepare(`SELECT id FROM user WHERE email = ?1`).bind(adminConfig.email).first<{ id: string }>())!;

    expect(await getAvailableCredits(testEnv(), user.id)).toBe(99999);

    // Admin grants +500 promotional credits
    const grantAdjustment = await recordAdminCreditAdjustment(
      testEnv(),
      user.id,
      500,
      "Promotional Bonus",
      user.id
    );
    expect(grantAdjustment.entry_type).toBe("grant");
    expect(grantAdjustment.amount).toBe(500);
    expect(grantAdjustment.ref_type).toBe("admin_adjustment");
    expect(grantAdjustment.grant_key).toBeNull();

    expect(await getAvailableCredits(testEnv(), user.id)).toBe(100499);

    // Admin deducts 200 credits
    const deductAdjustment = await recordAdminCreditAdjustment(
      testEnv(),
      user.id,
      -200,
      "Deduct testing quota",
      user.id
    );
    expect(deductAdjustment.entry_type).toBe("usage");
    expect(deductAdjustment.amount).toBe(200);
    expect(deductAdjustment.ref_type).toBe("admin_adjustment");
    expect(deductAdjustment.grant_key).toBeNull();

    expect(await getAvailableCredits(testEnv(), user.id)).toBe(100299);

    // Ledger has 3 distinct immutable entries: 1 initial grant + 2 adjustments
    const ledger = await getCreditLedger(testEnv(), user.id);
    expect(ledger).toHaveLength(3);

    // Initial grant is unchanged
    const initialGrant = ledger.find((e) => e.grant_key === "admin-initial-grant");
    expect(initialGrant).toBeDefined();
    expect(initialGrant?.amount).toBe(99999);

    await expect(assertCreditInvariant(testEnv(), user.id)).resolves.toBe(true);
  });

  it("AC5: safely handles single quotes and injection attempts in direct seeding via parameterized statements", async () => {
    const maliciousConfig: AdminSeedConfig = {
      email: "injection'--admin@example.com",
      password: "test-admin-password-123!",
      credits: 99999,
      name: "Admin' OR '1'='1",
      role: "admin",
    };

    const res = await seedAdminDatabase.seedDirect(env.DB, maliciousConfig);
    expect(res.status).toBe("created");
    expect(res.initialCredits).toBe(99999);

    const user = await env.DB.prepare(`SELECT * FROM user WHERE email = ?1`)
      .bind(maliciousConfig.email)
      .first<{ id: string; role: string; name: string; email: string }>();

    expect(user).not.toBeNull();
    expect(user?.email).toBe("injection'--admin@example.com");
    expect(user?.name).toBe("Admin' OR '1'='1");
    expect(user?.role).toBe("admin");

    const ledger = await env.DB.prepare(`SELECT * FROM credit_ledger WHERE user_id = ?1`)
      .bind(user!.id)
      .first<{ amount: number; reason: string }>();

    expect(ledger).not.toBeNull();
    expect(ledger?.amount).toBe(99999);
  });
});

describe("Public Demo role-only admin promotion (ADR 0008, Issue #72)", () => {
  it("promotes an existing Google-authenticated account to role 'admin' idempotently without credit grants or password", async () => {
    const adminEmail = "minhthang421992@gmail.com";
    const userId = "google-user-admin-1";
    const now = Date.now();

    // 1. User signs in with Google, starting with 0 credits and role 'user'
    await env.DB.prepare(
      `INSERT INTO user (id, name, email, emailVerified, role, createdAt, updatedAt)
       VALUES (?1, 'Google Admin', ?2, 1, 'user', ?3, ?3)`
    ).bind(userId, adminEmail, now).run();

    // Verify initial state: role is user, available credits is 0
    const initialUser = await env.DB.prepare("SELECT role FROM user WHERE id = ?1").bind(userId).first<{ role: string }>();
    expect(initialUser?.role).toBe("user");
    expect(await getAvailableCredits(testEnv(), userId)).toBe(0);

    // 2. Run bootstrapDemoAdmin
    const res1 = await bootstrapDemoAdmin(env.DB, adminEmail);
    expect(res1.promoted).toBe(true);
    expect(res1.userId).toBe(userId);

    // Role is promoted to admin
    const promotedUser = await env.DB.prepare("SELECT role FROM user WHERE id = ?1").bind(userId).first<{ role: string }>();
    expect(promotedUser?.role).toBe("admin");

    // Credits remain 0 (no automatic 99,999 credits grant)
    expect(await getAvailableCredits(testEnv(), userId)).toBe(0);
    const ledger = await getCreditLedger(testEnv(), userId);
    expect(ledger).toHaveLength(0);

    // No password account created
    const account = await env.DB.prepare("SELECT * FROM account WHERE userId = ?1").bind(userId).first();
    expect(account).toBeNull();

    // 3. Idempotent re-run
    const res2 = await bootstrapDemoAdmin(env.DB, adminEmail);
    expect(res2.promoted).toBe(true);
    expect(res2.userId).toBe(userId);
    expect(await getAvailableCredits(testEnv(), userId)).toBe(0);
  });

  it("returns promoted: false when user has not yet signed in", async () => {
    const res = await bootstrapDemoAdmin(env.DB, "nonexistent@gmail.com");
    expect(res.promoted).toBe(false);
  });
});
