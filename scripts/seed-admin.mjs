#!/usr/bin/env node
/**
 * Administrator Database Seeding Script (Ticket #22, ADR 0007, Spec 0001)
 *
 * Provisions administrator account and grants initial credits in D1.
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
const d1TargetFlag = isRemote ? "--remote" : "--local";

/**
 * Generates the SQL statements for admin seeding matching seedAdminDatabase in src/lib/auth/admin.ts.
 */
export async function buildAdminSeedSql(config = {}) {
  const email = (config.email || process.env.ADMIN_EMAIL || "minhthang421992@gmail.com").trim().toLowerCase();
  const password = config.password || process.env.ADMIN_PASSWORD || "Tonight123@";
  const credits = parseInt(String(config.credits || process.env.ADMIN_INITIAL_CREDITS || "99999"), 10);
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
    `-- 3. Ensure admin credit grant in credit_ledger`,
    `INSERT INTO credit_ledger (id, user_id, entry_type, amount, reason, grant_key, created_at)`,
    `VALUES ('${ledgerId}', (SELECT id FROM user WHERE email = '${email}'), 'grant', ${credits}, 'Initial Admin Credit Grant', 'admin-initial-grant', ${now})`,
    `ON CONFLICT(user_id, grant_key) WHERE grant_key IS NOT NULL DO UPDATE SET`,
    `  amount = ${credits};`,
  ].join("\n");
}

async function run() {
  const email = (process.env.ADMIN_EMAIL || "minhthang421992@gmail.com").trim().toLowerCase();
  const credits = parseInt(process.env.ADMIN_INITIAL_CREDITS || "99999", 10);

  console.log(`[seed-admin] Seeding admin account: ${email} (${d1TargetFlag})`);
  const sql = await buildAdminSeedSql();

  writeFileSync(tempSqlPath, sql, "utf8");

  try {
    execSync(
      `npx wrangler d1 execute homedesign ${d1TargetFlag} --file=.admin-seed-temp.sql`,
      { cwd: root, stdio: "inherit" }
    );
    console.log(`[seed-admin] Successfully provisioned admin (${email}) with role 'admin' and ${credits.toLocaleString()} credits.`);
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

run().catch((err) => {
  console.error("[seed-admin] Unexpected failure:", err);
  process.exit(1);
});
