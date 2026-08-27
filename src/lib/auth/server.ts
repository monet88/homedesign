import { betterAuth } from "better-auth";
import { oneTap } from "better-auth/plugins";
import type { Env } from "@/lib/bindings";
import { assertEmailSignUpAllowed, isAuthBypassEnabled } from "@/lib/env/policy";
import { ensureFreeCreditGrant } from "@/lib/credits/ledger";

// Ticket 03 (ADR 0001): BetterAuth server instance.
//
// Database: D1 binding (`DB`) — BetterAuth's Kysely adapter auto-detects the
// D1 shape (`batch`/`exec`/`prepare`) and uses D1SqliteDialect. No custom
// adapter import needed (better-auth 1.7.x; PR #7519).
//
// The EmailDelivery adapter writes verification messages into an
// environment-local test-outbox (D1 `email_outbox`), never stdout/logs.

export interface AuthEnv extends Env {
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  GOOGLE_CLIENT_ID?: string;
  EMAIL_DELIVERY_MODE?: string;
}

export const VERIFICATION_TTL_SECONDS = 60 * 60; // 1 hour (ADR 0001)
export const RESEND_WINDOW_MS = 60 * 1000; // 1 resend / minute
export const RESEND_HOURLY_LIMIT = 5; // 5 resends / hour / user
export const RESEND_HOURLY_WINDOW_MS = 60 * 60 * 1000;

function isProduction(env: AuthEnv): boolean {
  return env.ENVIRONMENT === "production";
}

function isTestOutbox(env: AuthEnv): boolean {
  const mode = env.EMAIL_DELIVERY_MODE?.toLowerCase() ?? "test-outbox";
  return mode === "test-outbox" || mode === "local" || mode === "dev";
}

export const LOCAL_BYPASS_USER_ID = "local-bypass-user";
export const LOCAL_BYPASS_EMAIL = "local@homedesign.dev";

export type UserRole = "admin" | "user";

export type ResolvedSession = {
  session: {
    id: string;
    userId: string;
    expiresAt: Date;
    createdAt: Date;
    updatedAt: Date;
    token?: string;
  };
  user: {
    id: string;
    name: string;
    email: string;
    emailVerified: boolean;
    role: UserRole;
    image?: string | null;
    createdAt: Date;
    updatedAt: Date;
  };
};

async function ensureLocalBypassUser(env: AuthEnv): Promise<ResolvedSession["user"]> {
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO user (id, name, email, emailVerified, role, createdAt, updatedAt)
     VALUES (?1, 'Local tester', ?2, 1, 'user', ?3, ?3)
     ON CONFLICT(id) DO UPDATE SET emailVerified = 1, name = excluded.name`
  )
    .bind(LOCAL_BYPASS_USER_ID, LOCAL_BYPASS_EMAIL, now)
    .run();
  await ensureFreeCreditGrant(env, LOCAL_BYPASS_USER_ID);
  const created = new Date(now);
  return {
    id: LOCAL_BYPASS_USER_ID,
    name: "Local tester",
    email: LOCAL_BYPASS_EMAIL,
    emailVerified: true,
    role: "user",
    createdAt: created,
    updatedAt: created,
  };
}

function bypassSession(user: ResolvedSession["user"]): ResolvedSession {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  return {
    session: {
      id: "local-bypass-session",
      userId: user.id,
      expiresAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    },
    user,
  };
}

/** Real BetterAuth session, or a verified local guest when AUTH_BYPASS is on. */
export async function resolveSession(
  env: AuthEnv,
  request: Request
): Promise<ResolvedSession | null> {
  if (isAuthBypassEnabled(env)) {
    const user = await ensureLocalBypassUser(env);
    return bypassSession(user);
  }
  try {
    const auth = createAuth(env);
    const rawSession = (await auth.api.getSession({ headers: request.headers })) as {
      session: ResolvedSession["session"];
      user: ResolvedSession["user"];
    } | null;
    if (!rawSession?.user) return null;
    return {
      session: rawSession.session,
      user: {
        ...rawSession.user,
        role: (rawSession.user.role as UserRole) || "user",
      },
    };
  } catch {
    return null;
  }
}
export function requireVerifiedUser(session: { user: { emailVerified: boolean } } | null): void {
  // Shared gate for later tickets (Generate, billable actions). ADR 0001:
  // unverified users may log in and browse, but the App Worker blocks all
  // billable work with 403 EMAIL_NOT_VERIFIED before any task/hold is created.
  if (!session?.user.emailVerified) {
    const err = new Error("EMAIL_NOT_VERIFIED") as Error & { status?: number };
    err.status = 403;
    throw err;
  }
}

export function createAuth(env: AuthEnv) {
  const emailDeliveryMode = env.EMAIL_DELIVERY_MODE?.toLowerCase() ?? "test-outbox";

  return betterAuth({
    appName: "HomeDesign Clone",
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: env.DB,
    user: {
      additionalFields: {
        role: {
          type: "string",
          required: false,
          defaultValue: "user",
          input: false,
        },
      },
    },
    advanced: {
      useSecureCookies: isProduction(env) || env.BETTER_AUTH_URL.startsWith("https://"),
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false, // ADR 0001: unverified users can log in; App Worker gates billable work
      minPasswordLength: 8,
      maxPasswordLength: 128,
    },
    emailVerification: {
      sendOnSignUp: true, // ADR 0001
      sendOnSignIn: false,
      autoSignInAfterVerification: true,
      expiresIn: VERIFICATION_TTL_SECONDS, // 1 hour
      sendVerificationEmail: async ({ user, url, token }) => {
        await deliverVerificationEmail(env, user.email, url, token, emailDeliveryMode);
      },
    },
    socialProviders: {
      google: env.GOOGLE_CLIENT_ID
        ? {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_ID, // One Tap uses clientId only; secret is not used for GSI
          }
        : undefined,
    },
    plugins: [
      oneTap({
        clientId: env.GOOGLE_CLIENT_ID ?? undefined,
      }),
    ],
    trustedOrigins: [env.BETTER_AUTH_URL],
  });
}

export type AppAuth = ReturnType<typeof createAuth>;

/** Auth HTTP entry with production sign-up gate (ADR 0006 / ticket #18). */
export async function handleAuthRequest(env: AuthEnv, request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname.endsWith("/sign-up/email") && request.method === "POST") {
    try {
      assertEmailSignUpAllowed(env);
    } catch (err) {
      const status = (err as { status?: number }).status ?? 403;
      return Response.json({ error: "EMAIL_SIGNUP_BANNED_IN_PRODUCTION" }, { status });
    }
  }
  return createAuth(env).handler(request);
}

// --- EmailDelivery adapter → environment-local test-outbox (ADR 0001) ---

/**
 * Stores a verification email in the environment-local test-outbox (D1).
 * TTL = verification token TTL (1 hour). The outbox is only readable through
 * the protected endpoint; nothing is written to logs.
 *
 * Rate limiting: 1 resend/minute and 5/hour/user per environment namespace.
 * Duplicate requests inside the window return the existing result without
 * sending another message.
 */
export async function deliverVerificationEmail(
  env: AuthEnv,
  email: string,
  url: string,
  token: string,
  mode: string = "test-outbox"
): Promise<void> {
  if (mode !== "test-outbox" && mode !== "local" && mode !== "dev") {
    throw new Error(`EMAIL_DELIVERY_MODE "${mode}" not implemented (only test-outbox is available in this environment)`);
  }
  const now = Date.now();
  const emailLower = email.toLowerCase();
  const currentEnv = env.ENVIRONMENT ?? "development";

  try {
    // Rate limit: 1 resend/min per email in this environment.
    const recent = await env.DB.prepare(
      `SELECT COUNT(*) AS cnt FROM email_outbox WHERE to_email = ?1 AND (environment = ?2 OR environment IS NULL OR environment = '') AND created_at > ?3`
    )
      .bind(emailLower, currentEnv, now - RESEND_WINDOW_MS)
      .first<{ cnt: number | string }>();
    if (recent && Number(recent.cnt) > 0) {
      return;
    }

    // Hourly cap: 5 sends/hour per email.
    const hourly = await env.DB.prepare(
      `SELECT COUNT(*) AS cnt FROM email_outbox WHERE to_email = ?1 AND (environment = ?2 OR environment IS NULL OR environment = '') AND created_at > ?3`
    )
      .bind(emailLower, currentEnv, now - RESEND_HOURLY_WINDOW_MS)
      .first<{ cnt: number | string }>();
    if (hourly && Number(hourly.cnt) >= RESEND_HOURLY_LIMIT) {
      return;
    }

    await env.DB.prepare(
      `INSERT INTO email_outbox (to_email, subject, body, verification_url, token_fingerprint, created_at, expires_at, user_id, environment)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`
    )
      .bind(
        emailLower,
        "Verify your HomeDesign email",
        `Verify your email to start generating: ${url}`,
        url,
        fingerprint(token),
        now,
        now + VERIFICATION_TTL_SECONDS * 1000,
        null,
        currentEnv
      )
      .run();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("no such column: environment")) {
      // Fallback for older schema without environment column
      const recent = await env.DB.prepare(
        `SELECT COUNT(*) AS cnt FROM email_outbox WHERE to_email = ?1 AND created_at > ?2`
      )
        .bind(emailLower, now - RESEND_WINDOW_MS)
        .first<{ cnt: number | string }>();
      if (recent && Number(recent.cnt) > 0) return;

      const hourly = await env.DB.prepare(
        `SELECT COUNT(*) AS cnt FROM email_outbox WHERE to_email = ?1 AND created_at > ?2`
      )
        .bind(emailLower, now - RESEND_HOURLY_WINDOW_MS)
        .first<{ cnt: number | string }>();
      if (hourly && Number(hourly.cnt) >= RESEND_HOURLY_LIMIT) return;

      await env.DB.prepare(
        `INSERT INTO email_outbox (to_email, subject, body, verification_url, token_fingerprint, created_at, expires_at, user_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`
      )
        .bind(
          emailLower,
          "Verify your HomeDesign email",
          `Verify your email to start generating: ${url}`,
          url,
          fingerprint(token),
          now,
          now + VERIFICATION_TTL_SECONDS * 1000,
          null
        )
        .run();
      return;
    }
    throw err;
  }
}

/** Stable non-reversible fingerprint for tokens (so the outbox never stores raw tokens). */
export function fingerprint(value: string): string {
  // FNV-1a 32-bit — fast, deterministic, enough for equality checks.
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/**
 * Reads outbox messages for an email, scoped to the environment namespace.
 * Rows are pruned when older than their TTL.
 */
export async function listOutbox(env: AuthEnv, email?: string, environment?: string) {
  await env.DB.prepare(`DELETE FROM email_outbox WHERE expires_at < ?1`).bind(Date.now()).run();
  const currentEnv = environment ?? env.ENVIRONMENT ?? "development";

  try {
    if (email) {
      return await env.DB.prepare(
        `SELECT id, to_email, subject, body, verification_url, token_fingerprint, created_at, expires_at, environment
         FROM email_outbox
         WHERE to_email = ?1 AND (environment = ?2 OR environment IS NULL OR environment = '')
         ORDER BY created_at DESC`
      )
        .bind(email.toLowerCase(), currentEnv)
        .all();
    }
    return await env.DB.prepare(
      `SELECT id, to_email, subject, body, verification_url, created_at, expires_at, environment
       FROM email_outbox
       WHERE (environment = ?1 OR environment IS NULL OR environment = '')
       ORDER BY created_at DESC`
    )
      .bind(currentEnv)
      .all();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("no such column: environment")) {
      if (email) {
        return env.DB.prepare(
          `SELECT id, to_email, subject, body, verification_url, token_fingerprint, created_at, expires_at
           FROM email_outbox WHERE to_email = ?1 ORDER BY created_at DESC`
        )
          .bind(email.toLowerCase())
          .all();
      }
      return env.DB.prepare(
        `SELECT id, to_email, subject, body, verification_url, created_at, expires_at
         FROM email_outbox ORDER BY created_at DESC`
      ).all();
    }
    throw err;
  }
}

export type OutboxAuthResult =
  | {
      authorized: true;
      user?: ResolvedSession["user"];
      session?: ResolvedSession["session"];
      env: AuthEnv;
      authMethod: "admin-session" | "capability-secret" | "local-bypass";
    }
  | {
      authorized: false;
      status: 401 | 403 | 404;
      error: string;
      env: AuthEnv;
    };

/**
 * Enforces authorized access to the non-production test outbox (Ticket #32 / ADR 0001).
 *
 * 1. Production: 404 not found (hides surface entirely).
 * 2. Capability / Secret: Authorized if matching OUTBOX_ACCESS_SECRET or BETTER_AUTH_SECRET,
 *    or local dev secret when running in a local environment.
 * 3. Session Principal: Authorized if admin role, or local bypass session in local environment.
 * 4. Anonymous / Spoofed / Standard user: 401 UNAUTHORIZED or 403 FORBIDDEN.
 */
export async function authorizeOutboxRequest(
  env: AuthEnv,
  request: Request,
  customResolver?: (env: AuthEnv, request: Request) => Promise<ResolvedSession | null>
): Promise<OutboxAuthResult> {
  if (isProduction(env) || env.ENVIRONMENT === "production") {
    return {
      authorized: false,
      status: 404,
      error: "not found",
      env,
    };
  }

  // 1. Check explicit capability / secret in headers
  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : undefined;
  const customSecret =
    request.headers.get("x-outbox-secret") ||
    request.headers.get("x-outbox-token") ||
    request.headers.get("x-outbox-key") ||
    request.headers.get("x-admin-key");
  const providedToken = bearerToken || customSecret;

  const isLocal =
    env.ENVIRONMENT === "local" ||
    !env.ENVIRONMENT ||
    env.ALLOW_LOCAL_OUTBOX_ACCESS === "1" ||
    (typeof process !== "undefined" && process.env?.NODE_ENV === "development");

  if (providedToken) {
    const validSecret =
      (Boolean(env.OUTBOX_ACCESS_SECRET) && providedToken === env.OUTBOX_ACCESS_SECRET) ||
      (Boolean(env.BETTER_AUTH_SECRET) && providedToken === env.BETTER_AUTH_SECRET) ||
      (isLocal &&
        (providedToken === "dev-only-insecure-secret-for-local-e2e" ||
          providedToken === "local-outbox-secret"));

    if (validSecret) {
      return {
        authorized: true,
        env,
        authMethod: "capability-secret",
      };
    }

    return {
      authorized: false,
      status: 401,
      error: "UNAUTHORIZED",
      env,
    };
  }

  // 2. Check Session Principal
  const resolve = customResolver ?? resolveSession;
  const session = await resolve(env, request);

  if (session) {
    if (session.user.role === "admin") {
      return {
        authorized: true,
        user: session.user,
        session: session.session,
        env,
        authMethod: "admin-session",
      };
    }

    if (isLocal && isAuthBypassEnabled(env)) {
      return {
        authorized: true,
        user: session.user,
        session: session.session,
        env,
        authMethod: "local-bypass",
      };
    }

    return {
      authorized: false,
      status: 403,
      error: "FORBIDDEN",
      env,
    };
  }

  // 3. Anonymous request
  return {
    authorized: false,
    status: 401,
    error: "UNAUTHORIZED",
    env,
  };
}

export { requireAdminSession, type AdminAuthResult } from "@/lib/auth/admin";
