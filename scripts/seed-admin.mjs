#!/usr/bin/env node
/**
 * Administrator Database Seeding Script (Ticket #22, ADR 0007, Spec 0001, Ticket #36)
 *
 * Provisions administrator account and grants initial credits in D1.
 * Preserves credit ledger immutability and idempotency.
 *
 * Usage:
 *   node scripts/seed-admin.mjs [--local | --remote]
 *   npm run db:seed:admin
 */

import { execSync } from "node:child_process";
import { writeFileSync, unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { hashPassword } from "better-auth/crypto";

const root = join(import.meta.dirname, "..");
const tempSqlPath = join(root, ".admin-seed-temp.sql");

const isRemote = process.argv.includes("--remote");
const isDemo = process.argv.includes("--demo");
const d1TargetFlag = isRemote ? "--remote" : "--local";
const dbName = isDemo ? (isRemote ? "hd-demo" : "homedesign") : "homedesign";
/**
 * Query D1 to check if an initial admin grant already exists for this email.
 */
export async function checkExistingAdminGrant(email, targetFlag = d1TargetFlag, cwd = root) {
  try {
    const stdout = execSync(
      `npx wrangler d1 execute ${dbName} ${targetFlag} --command="SELECT cl.amount, cl.created_at, cl.grant_key FROM credit_ledger cl JOIN user u ON cl.user_id = u.id WHERE u.email = '${email}' AND cl.grant_key = 'admin-initial-grant';" --json`,
      { cwd, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }
    );
    const parsed = JSON.parse(stdout);
    const results = parsed[0]?.results ?? [];
    return results.length > 0 ? results[0] : null;
  } catch {
    // Table or database might not be initialized yet
    return null;
  }
}

/**
 * Generates the SQL statements for admin seeding matching seedAdminDatabase in src/lib/auth/admin.ts.
 */
export async function buildAdminSeedSql(config = {}) {
  const email = (config.email || process.env.ADMIN_EMAIL || "minhthang421992@gmail.com").trim().toLowerCase();
  const password = config.password || process.env.ADMIN_PASSWORD;
  if (!password) {
    throw new Error("ADMIN_PASSWORD environment variable is required for admin database seeding.");
  }
  const credits = parseInt(String(config.credits ?? process.env.ADMIN_INITIAL_CREDITS ?? "99999"), 10);
  if (isNaN(credits) || credits < 0) {
    throw new Error(`Invalid credit grant amount: ${config.credits ?? process.env.ADMIN_INITIAL_CREDITS}`);
  }
  const name = (config.name || process.env.ADMIN_NAME || "Administrator").replace(/'/g, "''");

  const now = Date.now();
  const userId = `admin-${email.replace(/[^a-zA-Z0-9]/g, "_")}`;
  const accountId = `acc-${userId}`;
  const ledgerId = `ledger-${userId}-initial-grant`;
  const hashedPassword = await hashPassword(password);

  return [
    `-- 1. Ensure admin user exists with role = 'admin'`,
    `INSERT INTO user (id, name, email, emailVerified, role, createdAt, updatedAt)`,
    `VALUES ('${userId}', '${name}', '${email}', 1, 'admin', ${now}, ${now})`,
    `ON CONFLICT(email) DO UPDATE SET`,
    `  role = 'admin',`,
    `  emailVerified = 1,`,
    `  updatedAt = ${now};`,
    ``,
    `-- 2. Ensure credential account exists with hashed password`,
    `INSERT INTO account (id, accountId, providerId, issuer, userId, password, createdAt, updatedAt)`,
    `VALUES ('${accountId}', '${userId}', 'credential', 'local:credential', (SELECT id FROM user WHERE email = '${email}'), '${hashedPassword}', ${now}, ${now})`,
    `ON CONFLICT(id) DO UPDATE SET`,
    `  issuer = 'local:credential',`,
    `  password = '${hashedPassword}',`,
    `  updatedAt = ${now};`,
    ``,
    `-- 3. Ensure admin credit grant in credit_ledger (idempotent, immutable)`,
    `INSERT INTO credit_ledger (id, user_id, entry_type, amount, reason, grant_key, created_at)`,
    `VALUES ('${ledgerId}', (SELECT id FROM user WHERE email = '${email}'), 'grant', ${credits}, 'Initial Admin Credit Grant', 'admin-initial-grant', ${now})`,
    `ON CONFLICT(user_id, grant_key) WHERE grant_key IS NOT NULL DO NOTHING;`,
  ].join("\n");
}

export async function run() {
  const email = (process.env.ADMIN_EMAIL || "minhthang421992@gmail.com").trim().toLowerCase();

  if (isDemo) {
    console.log(`[seed-admin] Public Demo mode: promoting Google-authenticated account (${email}) to role 'admin' without password or credit grant.`);
    const now = Date.now();
    const updateSql = `UPDATE user SET role = 'admin', updatedAt = ${now} WHERE email = '${email}';`;
    writeFileSync(tempSqlPath, updateSql, "utf8");
    try {
      execSync(
        `npx wrangler d1 execute ${dbName} ${d1TargetFlag} --file=.admin-seed-temp.sql`,
        { cwd: root, stdio: "pipe" }
      );
      console.log(`[seed-admin] Promoted existing account (${email}) to role 'admin' on Public Demo.`);
    } catch (error) {
      console.error(`[seed-admin] Error executing D1 demo promotion:`, error?.message || error);
      process.exit(1);
    } finally {
      if (existsSync(tempSqlPath)) {
        try { unlinkSync(tempSqlPath); } catch {}
      }
    }
    return;
  }

  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    console.error("[seed-admin] Error: ADMIN_PASSWORD environment variable is required for admin database seeding.");
    process.exit(1);
  }
  const rawCredits = process.env.ADMIN_INITIAL_CREDITS ?? "99999";
  const credits = parseInt(rawCredits, 10);
  if (isNaN(credits) || credits < 0) {
    console.error(`[seed-admin] Error: Invalid ADMIN_INITIAL_CREDITS value "${rawCredits}".`);
    process.exit(1);
  }

  const existingGrant = await checkExistingAdminGrant(email, d1TargetFlag, root);
  if (existingGrant) {
    const existingAmount = Number(existingGrant.amount);
    if (existingAmount !== credits) {
      console.error(
        `[seed-admin] Mismatch: Existing initial grant of ${existingAmount.toLocaleString()} credits found for admin (${email}) [grant_key: '${existingGrant.grant_key}'], differing from requested ${credits.toLocaleString()} credits.`
      );
      console.error(
        `[seed-admin] The Credit Ledger is immutable and historical grants cannot be rewritten.`
      );
      console.error(
        `[seed-admin] Use the Admin Credit Adjustment API (POST /api/admin/credits) to adjust balances.`
      );
      process.exit(1);
    }
    console.log(
      `[seed-admin] Existing initial grant of ${existingAmount.toLocaleString()} credits found for admin (${email}). Credit ledger will be preserved (no-op). Reconciling role/credential access.`
    );
  }

  console.log(`[seed-admin] Seeding admin account: ${email} (${d1TargetFlag})`);
  const sql = await buildAdminSeedSql({
    email,
    password,
    credits,
    name: process.env.ADMIN_NAME,
  });

  writeFileSync(tempSqlPath, sql, "utf8");

  try {
    execSync(
      `npx wrangler d1 execute ${dbName} ${d1TargetFlag} --file=.admin-seed-temp.sql`,
      { cwd: root, stdio: "inherit" }
    );
    if (existingGrant) {
      console.log(`[seed-admin] Successfully reconciled admin (${email}) with role 'admin'. Existing credit grant preserved.`);
    } else {
      console.log(`[seed-admin] Successfully provisioned admin (${email}) with role 'admin' and ${credits.toLocaleString()} initial credits.`);
    }
  } catch (error) {
    console.error(`[seed-admin] Error executing D1 seed:`, error?.message || error);
    process.exit(1);
  } finally {
    if (existsSync(tempSqlPath)) {
      try {
        unlinkSync(tempSqlPath);
      } catch {
        // ignore cleanup error
      }
    }
  }
}

if (process.argv[1] && process.argv[1].endsWith("seed-admin.mjs")) {
  run().catch((err) => {
    console.error("[seed-admin] Unexpected failure:", err?.message || err);
    process.exit(1);
  });
}
