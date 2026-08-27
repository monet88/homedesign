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
  const password = env.ADMIN_PASSWORD || "Tonight123@";
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
    const hashedPassword = config.password ? await hashPassword(config.password) : "";

    const userSql = `INSERT INTO user (id, name, email, emailVerified, role, createdAt, updatedAt)
VALUES ('${userId}', '${config.name.replace(/'/g, "''")}', '${config.email}', 1, 'admin', ${now}, ${now})
ON CONFLICT(email) DO UPDATE SET
  role = 'admin',
  emailVerified = 1,
  updatedAt = ${now};`;

    const accountSql = `INSERT INTO account (id, accountId, providerId, issuer, userId, password, createdAt, updatedAt)
VALUES ('${accountId}', '${userId}', 'credential', 'credential', (SELECT id FROM user WHERE email = '${config.email}'), '${hashedPassword}', ${now}, ${now})
ON CONFLICT(id) DO UPDATE SET
  password = '${hashedPassword}',
  updatedAt = ${now};`;

    const ledgerSql = `INSERT INTO credit_ledger (id, user_id, entry_type, amount, reason, grant_key, created_at)
VALUES ('${ledgerId}', (SELECT id FROM user WHERE email = '${config.email}'), 'grant', ${config.credits}, 'Initial Admin Credit Grant', 'admin-initial-grant', ${now})
ON CONFLICT(user_id, grant_key) WHERE grant_key IS NOT NULL DO UPDATE SET
  amount = ${config.credits};`;

    return [userSql, accountSql, ledgerSql];
  },

  async seedDirect(
    db: AuthEnv["DB"],
    config: AdminSeedConfig = getAdminSeedConfig()
  ): Promise<void> {
    const statements = await this.generateSqlStatements(config);
    for (const sql of statements) {
      await db.exec(sql);
    }
  },
};

export type AdminAuthResult =
  | {
      authorized: true;
      user: ResolvedSession["user"];
      session: ResolvedSession["session"];
    }
  | {
      authorized: false;
      status: 401 | 403;
      error: string;
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
    };
  }

  if (session.user.role !== "admin") {
    return {
      authorized: false,
      status: 403,
      error: "FORBIDDEN",
    };
  }

  return {
    authorized: true,
    user: session.user,
    session: session.session,
  };
}
