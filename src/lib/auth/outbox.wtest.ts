// Workers-runtime test-outbox security tests (Ticket #32 / ADR 0001).
// Exercises the route handler and D1 persistence in the real miniflare environment.

import { env } from "cloudflare:test";
import { describe, expect, it, beforeEach } from "vitest";
import { GET as getOutbox } from "@/app/api/auth/test-outbox/route";
import {
  createAuth,
  deliverVerificationEmail,
  listOutbox,
  type AuthEnv,
} from "@/lib/auth/server";

const AUTH = {
  BETTER_AUTH_SECRET: "test-secret-that-is-long-enough-32-chars",
  BETTER_AUTH_URL: "http://localhost:3000",
  EMAIL_DELIVERY_MODE: "test-outbox",
  OUTBOX_ACCESS_SECRET: "secret-outbox-token-workers-test",
} as const;

function testEnv(overrides?: Partial<AuthEnv>): AuthEnv {
  return {
    ...(env as unknown as AuthEnv),
    ...AUTH,
    ...overrides,
  };
}

beforeEach(async () => {
  await applyAuthMigrations(env.DB);
  await env.DB.prepare(`DELETE FROM session`).run();
  await env.DB.prepare(`DELETE FROM account`).run();
  await env.DB.prepare(`DELETE FROM verification`).run();
  await env.DB.prepare(`DELETE FROM user`).run();
  await env.DB.prepare(`DELETE FROM email_outbox`).run();
});

describe("Workers runtime: Test outbox security & environment isolation (Ticket #32)", () => {
  it("anonymous read is denied with 401 and cache-control: no-store", async () => {
    const e = testEnv({ ENVIRONMENT: "development" });
    const req = new Request("http://localhost:3000/api/auth/test-outbox");
    const res = await getOutbox(req, e);
    expect(res.status).toBe(401);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("spoofed role/headers are denied with 401", async () => {
    const e = testEnv({ ENVIRONMENT: "preview" });
    const req = new Request("https://preview.example.com/api/auth/test-outbox", {
      headers: {
        "x-role": "admin",
        "x-admin": "true",
        "cf-access-authenticated-user-email": "admin@example.com",
        "x-outbox-secret": "wrong-secret",
      },
    });
    const res = await getOutbox(req, e);
    expect(res.status).toBe(401);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("authorized read with OUTBOX_ACCESS_SECRET succeeds in development", async () => {
    const e = testEnv({ ENVIRONMENT: "development" });
    await deliverVerificationEmail(
      e,
      "worker-user@example.com",
      "http://localhost:3000/verify-email?token=worker-tok-123",
      "worker-tok-123"
    );

    const req = new Request("http://localhost:3000/api/auth/test-outbox", {
      headers: { Authorization: `Bearer ${AUTH.OUTBOX_ACCESS_SECRET}` },
    });
    const res = await getOutbox(req, e);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const data = (await res.json()) as { messages: Array<{ to_email: string; verification_url: string }> };
    expect(data.messages).toHaveLength(1);
    expect(data.messages[0].to_email).toBe("worker-user@example.com");
  });

  it("cross-environment request is denied with 403", async () => {
    const e = testEnv({ ENVIRONMENT: "development" });
    const req = new Request("http://localhost:3000/api/auth/test-outbox?environment=staging", {
      headers: { Authorization: `Bearer ${AUTH.OUTBOX_ACCESS_SECRET}` },
    });
    const res = await getOutbox(req, e);
    expect(res.status).toBe(403);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("CROSS_ENVIRONMENT_FORBIDDEN");
  });

  it("cross-environment messages in D1 are isolated", async () => {
    const devEnv = testEnv({ ENVIRONMENT: "development" });
    const stagingEnv = testEnv({ ENVIRONMENT: "staging" });

    await deliverVerificationEmail(
      devEnv,
      "dev@example.com",
      "http://localhost:3000/verify-email?token=dev1",
      "dev1"
    );
    await deliverVerificationEmail(
      stagingEnv,
      "staging@example.com",
      "https://staging.example.com/verify-email?token=staging1",
      "staging1"
    );

    const devReq = new Request("http://localhost:3000/api/auth/test-outbox", {
      headers: { Authorization: `Bearer ${AUTH.OUTBOX_ACCESS_SECRET}` },
    });
    const devRes = await getOutbox(devReq, devEnv);
    expect(devRes.status).toBe(200);
    const devData = (await devRes.json()) as { messages: Array<{ to_email: string }> };
    expect(devData.messages).toHaveLength(1);
    expect(devData.messages[0].to_email).toBe("dev@example.com");

    const stagingReq = new Request("https://staging.example.com/api/auth/test-outbox", {
      headers: { Authorization: `Bearer ${AUTH.OUTBOX_ACCESS_SECRET}` },
    });
    const stagingRes = await getOutbox(stagingReq, stagingEnv);
    expect(stagingRes.status).toBe(200);
    const stagingData = (await stagingRes.json()) as { messages: Array<{ to_email: string }> };
    expect(stagingData.messages).toHaveLength(1);
    expect(stagingData.messages[0].to_email).toBe("staging@example.com");
  });

  it("production environment hides outbox completely (404) for all requester types", async () => {
    const prodEnv = testEnv({ ENVIRONMENT: "production" });

    // 1. Anonymous in production -> 404
    const anonReq = new Request("https://homedesign.com/api/auth/test-outbox");
    const anonRes = await getOutbox(anonReq, prodEnv);
    expect(anonRes.status).toBe(404);
    expect(anonRes.headers.get("cache-control")).toBe("no-store");

    // 2. Valid secret in production -> 404
    const secretReq = new Request("https://homedesign.com/api/auth/test-outbox", {
      headers: { Authorization: `Bearer ${AUTH.OUTBOX_ACCESS_SECRET}` },
    });
    const secretRes = await getOutbox(secretReq, prodEnv);
    expect(secretRes.status).toBe(404);
    expect(secretRes.headers.get("cache-control")).toBe("no-store");
  });
});

async function applyAuthMigrations(db: D1Database) {
  await db.batch([
    db.prepare(
      `CREATE TABLE IF NOT EXISTS user (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
        emailVerified INTEGER NOT NULL DEFAULT 0, image TEXT,
        role TEXT NOT NULL DEFAULT 'user',
        createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL
      )`
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS session (
        id TEXT PRIMARY KEY, expiresAt INTEGER NOT NULL, token TEXT NOT NULL UNIQUE,
        createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL, ipAddress TEXT,
        userAgent TEXT, userId TEXT NOT NULL REFERENCES user(id)
      )`
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS account (
        id TEXT PRIMARY KEY, accountId TEXT NOT NULL, providerId TEXT NOT NULL,
        userId TEXT NOT NULL REFERENCES user(id),
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
