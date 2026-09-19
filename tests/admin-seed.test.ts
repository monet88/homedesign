// Real CLI-to-local-D1 integration tests for seed-admin.mjs (Ticket #36, Spec #20).
import { execSync, spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it, beforeAll, afterAll } from "vitest";

const ROOT = join(import.meta.dirname, "..");
const TEST_ADMIN_EMAIL = "test_seeder_admin@example.com";
const TEST_ADMIN_PASSWORD = "test-admin-password-123!";

function queryD1(command: string): unknown[] {
  const stdout = execSync(
    `npx wrangler d1 execute homedesign --local --command="${command}" --json`,
    { cwd: ROOT, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }
  );
  const parsed = JSON.parse(stdout) as Array<{ results: unknown[] }>;
  return parsed[0]?.results ?? [];
}
describe("CLI Seeder to local D1 integration test (Ticket #36 AC 1-5)", { timeout: 180000 }, () => {
  beforeAll(() => {
    // Ensure migrations are applied in local D1
    execSync(`npx wrangler d1 migrations apply homedesign --local`, {
      cwd: ROOT,
      stdio: "pipe",
    });

    // Clean up test admin rows before test run
    queryD1(
      `DELETE FROM credit_ledger WHERE user_id IN (SELECT id FROM user WHERE email = '${TEST_ADMIN_EMAIL}'); ` +
      `DELETE FROM account WHERE userId IN (SELECT id FROM user WHERE email = '${TEST_ADMIN_EMAIL}'); ` +
      `DELETE FROM session WHERE userId IN (SELECT id FROM user WHERE email = '${TEST_ADMIN_EMAIL}'); ` +
      `DELETE FROM user WHERE email = '${TEST_ADMIN_EMAIL}';`
    );
  }, 180000);

  afterAll(() => {
    // Clean up test admin rows after test run
    try {
      queryD1(
        `DELETE FROM credit_ledger WHERE user_id IN (SELECT id FROM user WHERE email = '${TEST_ADMIN_EMAIL}'); ` +
        `DELETE FROM account WHERE userId IN (SELECT id FROM user WHERE email = '${TEST_ADMIN_EMAIL}'); ` +
        `DELETE FROM session WHERE userId IN (SELECT id FROM user WHERE email = '${TEST_ADMIN_EMAIL}'); ` +
        `DELETE FROM user WHERE email = '${TEST_ADMIN_EMAIL}';`
      );
    } catch {
      // ignore cleanup errors
    }
  }, 60000);

  it("fails with explicit actionable message when ADMIN_PASSWORD is missing", () => {
    const res = spawnSync("node", ["scripts/seed-admin.mjs", "--local"], {
      cwd: ROOT,
      env: {
        ...process.env,
        ADMIN_EMAIL: TEST_ADMIN_EMAIL,
        ADMIN_PASSWORD: "",
      },
      encoding: "utf8",
    });

    expect(res.status).not.toBe(0);
    const stderr = res.stderr || res.stdout;
    expect(stderr).toContain("ADMIN_PASSWORD environment variable is required");
  });

  it("Run 1: First seed provisions user, credential account, role, and exactly one initial grant", () => {
    const res = spawnSync("node", ["scripts/seed-admin.mjs", "--local"], {
      cwd: ROOT,
      env: {
        ...process.env,
        ADMIN_EMAIL: TEST_ADMIN_EMAIL,
        ADMIN_PASSWORD: TEST_ADMIN_PASSWORD,
        ADMIN_INITIAL_CREDITS: "99999",
        ADMIN_NAME: "Test Seeder Administrator",
      },
      encoding: "utf8",
    });

    expect(res.status).toBe(0);
    expect(res.stdout).toContain("Successfully provisioned admin");
    expect(res.stdout).toContain("99,999 initial credits");

    // Verify user in D1
    const users = queryD1(`SELECT * FROM user WHERE email = '${TEST_ADMIN_EMAIL}';`) as Array<{
      id: string;
      role: string;
      emailVerified: number;
      name: string;
    }>;
    expect(users).toHaveLength(1);
    expect(users[0].role).toBe("admin");
    expect(users[0].emailVerified).toBe(1);
    expect(users[0].name).toBe("Test Seeder Administrator");

    // Verify account in D1
    const accounts = queryD1(`SELECT * FROM account WHERE userId = '${users[0].id}';`) as Array<{
      providerId: string;
      password: string;
    }>;
    expect(accounts).toHaveLength(1);
    expect(accounts[0].providerId).toBe("credential");
    expect(accounts[0].password).toBeDefined();

    // Verify credit_ledger in D1
    const grants = queryD1(
      `SELECT * FROM credit_ledger WHERE user_id = '${users[0].id}';`
    ) as Array<{
      id: string;
      user_id: string;
      entry_type: string;
      amount: number;
      reason: string;
      grant_key: string;
      created_at: number;
    }>;
    expect(grants).toHaveLength(1);
    expect(grants[0].entry_type).toBe("grant");
    expect(grants[0].amount).toBe(99999);
    expect(grants[0].grant_key).toBe("admin-initial-grant");
    expect(grants[0].reason).toBe("Initial Admin Credit Grant");
  });

  it("Run 2: Re-running same seed creates no additional grant and does not mutate existing grant", () => {
    // Check grant before run 2
    const users = queryD1(`SELECT id FROM user WHERE email = '${TEST_ADMIN_EMAIL}';`) as Array<{ id: string }>;
    const userId = users[0].id;
    const grantsBefore = queryD1(`SELECT * FROM credit_ledger WHERE user_id = '${userId}';`) as Array<{
      id: string;
      amount: number;
      reason: string;
      grant_key: string;
      created_at: number;
    }>;
    expect(grantsBefore).toHaveLength(1);
    const initialGrant = grantsBefore[0];

    // Run seed-admin.mjs a second time with the same configuration
    const res = spawnSync("node", ["scripts/seed-admin.mjs", "--local"], {
      cwd: ROOT,
      env: {
        ...process.env,
        ADMIN_EMAIL: TEST_ADMIN_EMAIL,
        ADMIN_PASSWORD: TEST_ADMIN_PASSWORD,
        ADMIN_INITIAL_CREDITS: "99999",
        ADMIN_NAME: "Test Seeder Administrator Updated Name",
      },
      encoding: "utf8",
    });

    expect(res.status).toBe(0);
    expect(res.stdout).toContain("Existing initial grant of 99,999 credits found");
    expect(res.stdout).toContain("Credit ledger will be preserved (no-op)");

    // Verify credit_ledger after run 2: still exactly 1 row, completely unchanged
    const grantsAfter = queryD1(`SELECT * FROM credit_ledger WHERE user_id = '${userId}';`) as Array<{
      id: string;
      amount: number;
      reason: string;
      grant_key: string;
      created_at: number;
    }>;
    expect(grantsAfter).toHaveLength(1);
    expect(grantsAfter[0].id).toBe(initialGrant.id);
    expect(grantsAfter[0].amount).toBe(initialGrant.amount);
    expect(grantsAfter[0].reason).toBe(initialGrant.reason);
    expect(grantsAfter[0].grant_key).toBe(initialGrant.grant_key);
    expect(grantsAfter[0].created_at).toBe(initialGrant.created_at);
  });

  it("Run 3: Re-running with a DIFFERENT initial credits amount does NOT rewrite history and fails with actionable message", () => {
    const users = queryD1(`SELECT id FROM user WHERE email = '${TEST_ADMIN_EMAIL}';`) as Array<{ id: string }>;
    const userId = users[0].id;
    const grantsBefore = queryD1(`SELECT * FROM credit_ledger WHERE user_id = '${userId}';`) as Array<{
      id: string;
      amount: number;
      created_at: number;
    }>;

    // Run seed-admin.mjs with different initial credits (50000 instead of 99999)
    const res = spawnSync("node", ["scripts/seed-admin.mjs", "--local"], {
      cwd: ROOT,
      env: {
        ...process.env,
        ADMIN_EMAIL: TEST_ADMIN_EMAIL,
        ADMIN_PASSWORD: TEST_ADMIN_PASSWORD,
        ADMIN_INITIAL_CREDITS: "50000",
      },
      encoding: "utf8",
    });

    expect(res.status).not.toBe(0);
    const combinedOutput = (res.stderr || "") + (res.stdout || "");
    expect(combinedOutput).toContain("Mismatch: Existing initial grant of 99,999 credits found");
    expect(combinedOutput).toContain("Credit Ledger is immutable and historical grants cannot be rewritten");
    expect(combinedOutput).toContain("POST /api/admin/credits");

    // Verify ledger in D1 was NOT altered
    const grantsAfter = queryD1(`SELECT * FROM credit_ledger WHERE user_id = '${userId}';`) as Array<{
      id: string;
      amount: number;
      created_at: number;
    }>;
    expect(grantsAfter).toHaveLength(1);
    expect(grantsAfter[0].id).toBe(grantsBefore[0].id);
    expect(grantsAfter[0].amount).toBe(99999); // Still 99999!
    expect(grantsAfter[0].created_at).toBe(grantsBefore[0].created_at);
  });

  it("Demo bootstrap (--demo): promotes user to role admin without password requirement and does not create credit grants", () => {
    const DEMO_ADMIN_EMAIL = "demo_admin_cli@example.com";
    const now = Date.now();

    // Ensure clean state before test
    queryD1(`DELETE FROM user WHERE email = '${DEMO_ADMIN_EMAIL}';`);

    // Pre-create Google user in local D1
    execSync(
      `npx wrangler d1 execute homedesign --local --command="INSERT INTO user (id, name, email, emailVerified, role, createdAt, updatedAt) VALUES ('demo-u-1', 'Google Demo Admin', '${DEMO_ADMIN_EMAIL}', 1, 'user', ${now}, ${now});"`,
      { cwd: ROOT, stdio: "pipe" }
    );

    // Run with --demo flag without ADMIN_PASSWORD
    const res = spawnSync("node", ["scripts/seed-admin.mjs", "--local", "--demo"], {
      cwd: ROOT,
      env: {
        ...process.env,
        ADMIN_EMAIL: DEMO_ADMIN_EMAIL,
      },
      encoding: "utf8",
    });

    expect(res.status).toBe(0);
    const stdout = res.stdout || "";
    expect(stdout).toContain("Promoted existing account");
    expect(stdout).toContain("to role 'admin' on Public Demo");

    // Verify user role in D1
    const userRows = queryD1(`SELECT role FROM user WHERE email = '${DEMO_ADMIN_EMAIL}';`) as Array<{ role: string }>;
    expect(userRows[0]?.role).toBe("admin");

    // Verify NO account or credit_ledger rows created
    const accountRows = queryD1(`SELECT * FROM account WHERE userId = 'demo-u-1';`);
    expect(accountRows).toHaveLength(0);
    const ledgerRows = queryD1(`SELECT * FROM credit_ledger WHERE user_id = 'demo-u-1';`);
    expect(ledgerRows).toHaveLength(0);

    // Clean up
    queryD1(`DELETE FROM user WHERE email = '${DEMO_ADMIN_EMAIL}';`);
  });
});
