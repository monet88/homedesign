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
  const auth = createAuth(env);
  const rawSession = (await auth.api.getSession({ headers: request.headers })) as any;
  if (!rawSession?.user) return null;
  return {
    session: rawSession.session,
    user: {
      ...rawSession.user,
      role: (rawSession.user.role as UserRole) || "user",
    },
  };
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
 * Rate limiting: 1 resend/minute and 5/hour/user. Duplicate requests inside
 * the window return the existing result without sending another message
 * (idempotent — enforced by the caller via fingerprint upsert).
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

  // Rate limit: 1 resend/min per email. Duplicate within window returns stable result.
  const recent = await env.DB.prepare(
    `SELECT COUNT(*) AS cnt FROM email_outbox WHERE to_email = ?1 AND created_at > ?2`
  )
    .bind(emailLower, now - RESEND_WINDOW_MS)
    .first();
  if (recent && Number(recent.cnt) > 0) {
    // Stable result — no additional send.
    return;
  }

  // Hourly cap: 5 sends/hour per email.
  const hourly = await env.DB.prepare(
    `SELECT COUNT(*) AS cnt FROM email_outbox WHERE to_email = ?1 AND created_at > ?2`
  )
    .bind(emailLower, now - RESEND_HOURLY_WINDOW_MS)
    .first();
  if (hourly && Number(hourly.cnt) >= RESEND_HOURLY_LIMIT) {
    // Hourly limit reached — stable result, no additional send.
    return;
  }

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
 * Reads outbox messages for an email (Access-protected usage: local tooling or
 * Cloudflare Access only). Rows are pruned when older than their TTL.
 */
export async function listOutbox(env: AuthEnv, email?: string) {
  await env.DB.prepare(`DELETE FROM email_outbox WHERE expires_at < ?1`).bind(Date.now()).run();
  if (email) {
    return env.DB.prepare(
      `SELECT id, to_email, subject, body, verification_url, token_fingerprint, created_at, expires_at
       FROM email_outbox WHERE to_email = ?1 ORDER BY created_at DESC`)
      .bind(email.toLowerCase())
      .all();
  }
  return env.DB.prepare(
    `SELECT id, to_email, subject, body, verification_url, created_at, expires_at
     FROM email_outbox ORDER BY created_at DESC`
  ).all();
}

export { requireAdminSession, type AdminAuthResult } from "@/lib/auth/admin";

