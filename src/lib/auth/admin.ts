import { getCloudflareContext } from "@opennextjs/cloudflare";
import { hashPassword } from "better-auth/crypto";
import {
  resolveSession,
  type AuthEnv,
  type ResolvedSession,
  type UserRole,
} from "@/lib/auth/server";

export interface AdminSeedConfig {
  email: string;
  password?: string;
  credits: number;
  name: string;
  role: UserRole;
}

export function getAdminSeedConfig(
  env: Record<string, string | undefined> = process.env
): AdminSeedConfig {
  const email = (env.ADMIN_EMAIL || "minhthang421992@gmail.com").trim().toLowerCase();
  const password = env.ADMIN_PASSWORD || undefined;
  const credits = parseInt(env.ADMIN_INITIAL_CREDITS || "99999", 10);
  const name = env.ADMIN_NAME || "Administrator";
  return {
    email,
    password,
    credits: isNaN(credits) ? 99999 : credits,
    name,
    role: "admin",
  };
}

export const seedAdminDatabase = {
  async generateSqlStatements(config: AdminSeedConfig): Promise<string[]> {
    const now = Date.now();
    const userId = `admin-${config.email.replace(/[^a-zA-Z0-9]/g, "_")}`;
    const accountId = `acc-${userId}`;
    const ledgerId = `ledger-${userId}-initial-grant`;
    if (!config.password) {
      throw new Error("ADMIN_PASSWORD is required for admin database seeding.");
    }
    const hashedPassword = await hashPassword(config.password);

    const safeName = config.name.replace(/'/g, "''");
    const safeEmail = config.email.replace(/'/g, "''");
    const safeHashedPassword = hashedPassword.replace(/'/g, "''");

    const userSql = `INSERT INTO user (id, name, email, emailVerified, role, createdAt, updatedAt) VALUES ('${userId}', '${safeName}', '${safeEmail}', 1, 'admin', ${now}, ${now}) ON CONFLICT(email) DO UPDATE SET role = 'admin', emailVerified = 1, updatedAt = ${now};`;

    const accountSql = `INSERT INTO account (id, accountId, providerId, issuer, userId, password, createdAt, updatedAt) VALUES ('${accountId}', '${userId}', 'credential', 'local:credential', (SELECT id FROM user WHERE email = '${safeEmail}'), '${safeHashedPassword}', ${now}, ${now}) ON CONFLICT(id) DO UPDATE SET issuer = 'local:credential', password = '${safeHashedPassword}', updatedAt = ${now};`;

    const ledgerSql = `INSERT INTO credit_ledger (id, user_id, entry_type, amount, reason, grant_key, created_at) VALUES ('${ledgerId}', (SELECT id FROM user WHERE email = '${safeEmail}'), 'grant', ${config.credits}, 'Initial Admin Credit Grant', 'admin-initial-grant', ${now}) ON CONFLICT(user_id, grant_key) WHERE grant_key IS NOT NULL DO NOTHING;`;

    return [userSql, accountSql, ledgerSql];
  },

  async seedDirect(
    db: AuthEnv["DB"],
    config: AdminSeedConfig = getAdminSeedConfig()
  ): Promise<{ status: "created" | "reconciled"; initialCredits: number }> {
    if (!config.password) {
      throw new Error("ADMIN_PASSWORD is required for admin database seeding.");
    }

    const existing = await db
      .prepare(
        `SELECT cl.amount, cl.created_at FROM credit_ledger cl
         JOIN user u ON cl.user_id = u.id
         WHERE u.email = ?1 AND cl.grant_key = 'admin-initial-grant'`
      )
      .bind(config.email)
      .first<{ amount: number; created_at: number }>();

    if (existing && existing.amount !== config.credits) {
      throw new Error(
        `Initial credit grant mismatch: existing grant is ${existing.amount} credits, but requested ${config.credits} credits. Credit ledger is immutable; use POST /api/admin/credits for adjustments.`
      );
    }

    const now = Date.now();
    const userId = `admin-${config.email.replace(/[^a-zA-Z0-9]/g, "_")}`;
    const accountId = `acc-${userId}`;
    const ledgerId = `ledger-${userId}-initial-grant`;
    const hashedPassword = await hashPassword(config.password);

    await db
      .prepare(
        `INSERT INTO user (id, name, email, emailVerified, role, createdAt, updatedAt)
         VALUES (?1, ?2, ?3, 1, 'admin', ?4, ?4)
         ON CONFLICT(email) DO UPDATE SET role = 'admin', emailVerified = 1, updatedAt = ?4;`
      )
      .bind(userId, config.name, config.email, now)
      .run();

    await db
      .prepare(
        `INSERT INTO account (id, accountId, providerId, issuer, userId, password, createdAt, updatedAt)
         VALUES (?1, ?2, 'credential', 'local:credential', (SELECT id FROM user WHERE email = ?3), ?4, ?5, ?5)
         ON CONFLICT(id) DO UPDATE SET issuer = 'local:credential', password = ?4, updatedAt = ?5;`
      )
      .bind(accountId, userId, config.email, hashedPassword, now)
      .run();

    await db
      .prepare(
        `INSERT INTO credit_ledger (id, user_id, entry_type, amount, reason, grant_key, created_at)
         VALUES (?1, (SELECT id FROM user WHERE email = ?2), 'grant', ?3, 'Initial Admin Credit Grant', 'admin-initial-grant', ?4)
         ON CONFLICT(user_id, grant_key) WHERE grant_key IS NOT NULL DO NOTHING;`
      )
      .bind(ledgerId, config.email, config.credits, now)
      .run();

    return {
      status: existing ? "reconciled" : "created",
      initialCredits: existing ? existing.amount : config.credits,
    };
  },
};

/**
 * Public Demo role-only admin promotion (ADR 0008, Issue #72).
 * Idempotently promotes the exact configured admin account to role 'admin'.
 * Leaves credit balance completely unchanged (no automatic 99,999 credits grant).
 * Does not create or touch password credentials.
 */
export async function bootstrapDemoAdmin(
  db: AuthEnv["DB"],
  adminEmail: string
): Promise<{ promoted: boolean; userId?: string; email: string }> {
  const normalizedEmail = adminEmail.trim().toLowerCase();
  const now = Date.now();

  const user = await db
    .prepare("SELECT id, role FROM user WHERE email = ?1")
    .bind(normalizedEmail)
    .first<{ id: string; role: string }>();

  if (!user) {
    return { promoted: false, email: normalizedEmail };
  }

  if (user.role !== "admin") {
    await db
      .prepare("UPDATE user SET role = 'admin', updatedAt = ?2 WHERE id = ?1")
      .bind(user.id, now)
      .run();
  }

  return { promoted: true, userId: user.id, email: normalizedEmail };
}

export type AdminAuthResult =
  | {
      authorized: true;
      user: ResolvedSession["user"];
      session: ResolvedSession["session"];
      env: AuthEnv;
    }
  | {
      authorized: false;
      status: 401 | 403;
      error: string;
      env?: AuthEnv;
    };

type SessionResolver = (
  env: AuthEnv,
  request: Request
) => Promise<ResolvedSession | null>;

export async function requireAdminSession(
  request: Request,
  env?: AuthEnv,
  resolver?: SessionResolver
): Promise<AdminAuthResult>;
export async function requireAdminSession(
  env: AuthEnv,
  request: Request,
  resolver?: SessionResolver
): Promise<AdminAuthResult>;
export async function requireAdminSession(
  arg1: Request | AuthEnv,
  arg2?: AuthEnv | Request,
  customResolver?: SessionResolver
): Promise<AdminAuthResult> {
  let req: Request;
  let env: AuthEnv | undefined;

  if (arg1 instanceof Request) {
    req = arg1;
    if (arg2 && typeof (arg2 as AuthEnv).DB !== "undefined") {
      env = arg2 as AuthEnv;
    }
  } else {
    env = arg1 as AuthEnv;
    req = arg2 as Request;
  }

  if (!env) {
    try {
      const cf = await getCloudflareContext({ async: true });
      env = cf.env as unknown as AuthEnv;
    } catch {
      // Fallback if not inside Cloudflare context
      env = {} as unknown as AuthEnv;
    }
  }

  const resolve = customResolver ?? resolveSession;
  const session = await resolve(env, req);

  if (!session) {
    return {
      authorized: false,
      status: 401,
      error: "UNAUTHORIZED",
      env,
    };
  }

  if (session.user.role !== "admin") {
    return {
      authorized: false,
      status: 403,
      error: "FORBIDDEN",
      env,
    };
  }

  return {
    authorized: true,
    user: session.user,
    session: session.session,
    env: env!,
  };
}
