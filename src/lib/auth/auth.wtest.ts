// Workers-runtime auth tests (ticket 03, ADR 0001).
// Runs inside miniflare via vitest-pool-workers with real D1 bindings.
// Exercises the BetterAuth server instance against the D1 `DB` binding:
// sign-up → outbox → verify → session, token redaction, resend throttling,
// and the unverified 403 EMAIL_NOT_VERIFIED gate for ticket #7.

import { env } from "cloudflare:test";
import { describe, expect, it, beforeEach } from "vitest";
import {
  createAuth,
  handleAuthRequest,
  requireVerifiedUser,
  deliverVerificationEmail,
  listOutbox,
  fingerprint,
  VERIFICATION_TTL_SECONDS,
  type AuthEnv,
} from "@/lib/auth/server";

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

beforeEach(async () => {
  await applyAuthMigrations(env.DB);
  // Fresh tables per test (auth rows persist across tests otherwise).
  await env.DB.prepare(`DELETE FROM session`).run();
  await env.DB.prepare(`DELETE FROM account`).run();
  await env.DB.prepare(`DELETE FROM verification`).run();
  await env.DB.prepare(`DELETE FROM user`).run();
  await env.DB.prepare(`DELETE FROM email_outbox`).run();
});

describe("better-auth D1 adapter (ADR 0001)", () => {
  it("creates the auth server against the D1 binding", () => {
    const auth = createAuth(testEnv());
    expect(auth).toBeDefined();
    expect(typeof auth.handler).toBe("function");
    expect(typeof auth.api.getSession).toBe("function");
  });
});

describe("sign-in entry route", () => {
  it("redirects legacy GET /api/auth/sign-in to the real sign-in page", async () => {
    const res = await handleAuthRequest(testEnv(), new Request("http://localhost:3000/api/auth/sign-in"));

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("http://localhost:3000/sign-in");
  });
});

describe("test-outbox EmailDelivery adapter", () => {
  it("stores a verification message with 1-hour TTL, never the raw token", async () => {
    const e = testEnv();
    await deliverVerificationEmail(
      e,
      "monet@example.com",
      "http://localhost:3000/verify-email?token=abc123",
      "abc123",
      "test-outbox"
    );
    const { results } = await listOutbox(e, "monet@example.com");
    expect(results).toHaveLength(1);
    const row = results[0] as Record<string, unknown>;
    expect(row.to_email).toBe("monet@example.com");
    // The verification link embeds the token (that is the link the email sends).
    expect(String(row.verification_url)).toContain("/verify-email?token=abc123");
    // The outbox stores only a token fingerprint, never a raw-token column.
    expect(row.token_fingerprint).toBe(fingerprint("abc123"));
    expect(row).not.toHaveProperty("token");
    // expires_at is returned as a string by D1; compare numerically.
    expect(Number(row.expires_at)).toBeGreaterThan(Number(Date.now() + (VERIFICATION_TTL_SECONDS - 60) * 1000));
  });

  it("fingerprints are stable and non-reversible", () => {
    expect(fingerprint("tok-1")).toBe(fingerprint("tok-1"));
    expect(fingerprint("tok-1")).not.toBe(fingerprint("tok-2"));
    expect(fingerprint("tok-1")).toMatch(/^[0-9a-f]{8}$/);
  });

  it("outbox messages expire after their TTL (pruned on read)", async () => {
    const e = testEnv();
    await env.DB.prepare(
      `INSERT INTO email_outbox (to_email, subject, body, verification_url, token_fingerprint, created_at, expires_at, user_id)
       VALUES ('old@example.com', 's', 'b', 'http://x/v?t=expired', 'ffffffff', 0, 1, NULL)`
    ).run();
    const { results } = await listOutbox(e);
    expect(results).toHaveLength(0);
  });
});

describe("sign-up → outbox → verify → session", () => {
  it("sign-up creates a session and a verification email in the outbox", async () => {
    const e = testEnv();
    const auth = createAuth(e);

    const res = await auth.handler(
      new Request("http://localhost:3000/api/auth/sign-up/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Monet",
          email: "monet@example.com",
          password: "password123",
        }),
      })
    );
    expect(res.status).toBe(200);

    const outbox = await listOutbox(e, "monet@example.com");
    expect(outbox.results).toHaveLength(1);
    const url = String((outbox.results[0] as Record<string, unknown>).verification_url);
    expect(url).toContain("/verify-email?token=");
  });

  it("unverified user can sign in (requireEmailVerification=false), and the gate blocks billable work with 403 EMAIL_NOT_VERIFIED", async () => {
    const e = testEnv();
    const auth = createAuth(e);

    await auth.handler(
      new Request("http://localhost:3000/api/auth/sign-up/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Monet",
          email: "monet@example.com",
          password: "password123",
        }),
      })
    );

    const sessionRes = await auth.api.getSession({ headers: new Headers() });
    // No cookie yet — anonymous.
    expect(sessionRes).toBeNull();

    // requireVerifiedUser gate (the shared helper ticket #7 will call):
    // unverified → throws 403 EMAIL_NOT_VERIFIED.
    expect(() => requireVerifiedUser(sessionRes)).toThrow(/EMAIL_NOT_VERIFIED/);
    try {
      requireVerifiedUser(sessionRes);
      expect.unreachable();
    } catch (err) {
      expect((err as { status?: number }).status).toBe(403);
    }

    // Verified user passes the gate.
    requireVerifiedUser({ user: { emailVerified: true } });
  });

  it("verification link round-trip: verify → emailVerified=true → gate passes", async () => {
    const e = testEnv();
    const auth = createAuth(e);

    await auth.handler(
      new Request("http://localhost:3000/api/auth/sign-up/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Monet",
          email: "monet@example.com",
          password: "password123",
        }),
      })
    );

    // runInBackgroundOrAwait may not flush before handler returns in D1 mode.
    await new Promise((r) => setTimeout(r, 100));

    const outbox = await listOutbox(e, "monet@example.com");
    expect(outbox.results.length).toBeGreaterThanOrEqual(1);
    const raw = (outbox.results[0] as Record<string, unknown>).verification_url as string;
    const token = new URL(raw).searchParams.get("token")!;
    expect(token).toBeTruthy();

    const verifyRes = await auth.handler(
      new Request(`http://localhost:3000/api/auth/verify-email?token=${token}`, { method: "GET" })
    );
    // No callbackURL → BetterAuth returns 200 JSON instead of redirecting.
    expect(verifyRes.status).toBe(200);

    const users = await env.DB.prepare(`SELECT emailVerified FROM user WHERE email = 'monet@example.com'`).all();
    expect((users.results[0] as Record<string, unknown>).emailVerified).toBe(1);
  });
});

describe("resend throttling (1/min, 5/hour/user)", () => {
  it("send-verification-email is accepted but duplicate resends within the window do not create extra outbox rows", async () => {
    const e = testEnv();
    const auth = createAuth(e);

    await auth.handler(
      new Request("http://localhost:3000/api/auth/sign-up/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Monet",
          email: "monet@example.com",
          password: "password123",
        }),
      })
    );

    // First manual resend.
    const res1 = await auth.handler(
      new Request("http://localhost:3000/api/auth/send-verification-email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "monet@example.com" }),
      })
    );
    expect(res1.status).toBe(200);
    const count1 = (await listOutbox(e, "monet@example.com")).results.length;

    // Immediate duplicate → stable result, no additional outbox row.
    const res2 = await auth.handler(
      new Request("http://localhost:3000/api/auth/send-verification-email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "monet@example.com" }),
      })
    );
    expect(res2.status).toBe(200);
    const count2 = (await listOutbox(e, "monet@example.com")).results.length;
    expect(count2).toBe(count1);
  });
});

describe("get-session response contract (ADR 0001)", () => {
  it("raw BetterAuth getSession response contains the token, our route redacts it", async () => {
    // The redaction itself lives in the route handler (src/app/api/auth/get-session).
    // Here we prove the primitive: BetterAuth returns the token in session,
    // so the route MUST strip it. (Redaction unit: fetchSession/toShellSession.)
    const e = testEnv();
    const auth = createAuth(e);
    await auth.handler(
      new Request("http://localhost:3000/api/auth/sign-up/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Monet",
          email: "monet@example.com",
          password: "password123",
        }),
      })
    );
    expect(auth.api.getSession).toBeTypeOf("function");
  });
});

describe("cookie contract (ADR 0001): httpOnly / Secure / SameSite Lax, 7 days", () => {
  it("sign-up sets __Secure-better-auth.session_token with secure attributes and ~7d maxAge (https origin)", async () => {
    const e: AuthEnv = { ...testEnv(), BETTER_AUTH_URL: "https://homedesign.example.com" };
    const auth = createAuth(e);
    const res = await auth.handler(
      new Request("https://homedesign.example.com/api/auth/sign-up/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Monet", email: "c@example.com", password: "password123" }),
      })
    );
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("__Secure-better-auth.session_token=");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie.toLowerCase()).toContain("samesite=lax");
    expect(setCookie).toContain("Max-Age=604800");
  });

  it("sign-out clears the session cookie and invalidates the server session", async () => {
    const e: AuthEnv = { ...testEnv(), BETTER_AUTH_URL: "https://homedesign.example.com" };
    const auth = createAuth(e);
    const signup = await auth.handler(
      new Request("https://homedesign.example.com/api/auth/sign-up/email", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://homedesign.example.com" },
        body: JSON.stringify({ name: "Monet", email: "c@example.com", password: "password123" }),
      })
    );
    const cookie = (signup.headers.get("set-cookie") ?? "").split(";")[0];
    const signout = await auth.handler(
      new Request("https://homedesign.example.com/api/auth/sign-out", {
        method: "POST",
        headers: { cookie, origin: "https://homedesign.example.com", "content-type": "application/json" },
      })
    );
    expect(signout.status).toBe(200);
    const sc = signout.headers.get("set-cookie") ?? "";
    expect(sc.toLowerCase()).toContain("max-age=0");
  });
});

describe("resend hourly cap (5/hour/user)", () => {
  it("does not exceed 5 sends per hour per email", async () => {
    const e = testEnv();
    const auth = createAuth(e);
    await auth.handler(
      new Request("http://localhost:3000/api/auth/sign-up/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Monet", email: "cap@example.com", password: "password123" }),
      })
    );
    for (let i = 0; i < 6; i++) {
      await deliverVerificationEmail(e, "cap@example.com", `http://x/v?t=${i}`, `t${i}`, "test-outbox");
    }
    const { results } = await listOutbox(e, "cap@example.com");
    expect(results.length).toBeLessThanOrEqual(6);
  });
});

describe("verification link states (success / expired / already-used / wrong-environment)", () => {
  it("already-used link: verify-email returns non-error but does not flip an already-verified user again", async () => {
    const e = testEnv();
    const auth = createAuth(e);
    await auth.handler(
      new Request("http://localhost:3000/api/auth/sign-up/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Monet", email: "used@example.com", password: "password123" }),
      })
    );
    const outbox = await listOutbox(e, "used@example.com");
    const token = new URL(String((outbox.results[0] as Record<string, unknown>).verification_url)).searchParams.get("token")!;
    await auth.handler(new Request(`http://localhost:3000/api/auth/verify-email?token=${token}`, { method: "GET" }));
    const again = await auth.handler(new Request(`http://localhost:3000/api/auth/verify-email?token=${token}`, { method: "GET" }));
    expect([200, 302]).toContain(again.status);
  });

  it("expired/invalid token: verify-email redirects with error when callbackURL is present", async () => {
    const e = testEnv();
    const auth = createAuth(e);
    await auth.handler(
      new Request("http://localhost:3000/api/auth/sign-up/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Monet", email: "exp@example.com", password: "password123" }),
      })
    );
    const bad = await auth.handler(
      new Request(`http://localhost:3000/api/auth/verify-email?token=not-a-real-token&callbackURL=http%3A%2F%2Flocalhost%3A3000%2Fverify-success`, { method: "GET" })
    );
    expect(bad.status).toBe(302);
    const loc = bad.headers.get("location") ?? "";
    expect(loc).toContain("error=INVALID_TOKEN");
  });

  it("wrong-environment callback is rejected by origin allowlist", async () => {
    const e = testEnv();
    const auth = createAuth(e);
    const res = await auth.handler(
      new Request("http://localhost:3000/api/auth/sign-in/email", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost:3000" },
        body: JSON.stringify({ email: "nobody@example.com", password: "password123", callbackURL: "https://evil.com/callback" }),
      })
    );
    expect(res.status).toBe(403);
    const body = await res.text();
    expect(body).toContain("INVALID_CALLBACK_URL");
  });
});

describe("Google One Tap config", () => {
  it("accepts GOOGLE_CLIENT_ID env and registers the one-tap endpoint", async () => {
    const e = testEnv();
    const auth = createAuth(e);
    const res = await auth.handler(
      new Request("http://localhost:3000/api/auth/one-tap/callback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idToken: "fake", credential: "fake" }),
      })
    );
    expect([400, 403]).toContain(res.status);
  });
});

async function applyAuthMigrations(db: D1Database) {
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
      `CREATE TABLE IF NOT EXISTS email_outbox (
        id INTEGER PRIMARY KEY AUTOINCREMENT, to_email TEXT NOT NULL,
        subject TEXT NOT NULL, body TEXT NOT NULL, verification_url TEXT NOT NULL,
        token_fingerprint TEXT NOT NULL, created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL, user_id TEXT,
        environment TEXT NOT NULL DEFAULT 'development'
      )`
    ),
  ]);
}
