import { Page, expect } from "@playwright/test";

export const ADMIN_CREDENTIALS = {
  email: process.env.ADMIN_EMAIL || "minhthang421992@gmail.com",
  password: process.env.ADMIN_PASSWORD || "Tonight123@",
};

export function generateTestUserCredentials(prefix = "test-user") {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    name: `User ${id}`,
    email: `${prefix}-${id}@example.com`,
    password: `UserPass-${id}!Aa1`,
  };
}

export const TEST_USER_CREDENTIALS = generateTestUserCredentials("standard-user");

/**
 * Signs in as administrator using the seeded admin credentials.
 */
export async function signInAsAdmin(page: Page) {
  await page.goto("/");
  const res = await page.evaluate(async (creds) => {
    const response = await fetch("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(creds),
    });
    return { ok: response.ok, status: response.status };
  }, ADMIN_CREDENTIALS);
  expect(res.ok).toBeTruthy();
}

/**
 * Signs up a new standard user and verifies their email via the Ticket #32 authorized test-outbox.
 */
export async function signUpAndVerifyStandardUser(
  page: Page,
  creds: { name: string; email: string; password: string } = TEST_USER_CREDENTIALS
) {
  await page.goto("/");

  // 1. Sign up user
  const signUpRes = await page.evaluate(async (c) => {
    const response = await fetch("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(c),
    });
    return { ok: response.ok, status: response.status };
  }, creds);
  expect(signUpRes.ok).toBeTruthy();

  // 2. Retrieve verification message from test-outbox using capability authorization
  const outboxRes = await page.evaluate(async (email) => {
    const secret = "dev-only-insecure-secret-for-local-e2e";
    const response = await fetch(`/api/auth/test-outbox?email=${encodeURIComponent(email)}`, {
      headers: {
        Authorization: `Bearer ${secret}`,
        "x-outbox-secret": secret,
      },
    });
    if (!response.ok) {
      return { ok: false, status: response.status, messages: [] };
    }
    const data = (await response.json()) as { messages?: Array<{ verification_url?: string }> };
    return { ok: true, status: response.status, messages: data.messages || [] };
  }, creds.email);
  expect(outboxRes.ok).toBeTruthy();
  expect(outboxRes.messages.length).toBeGreaterThanOrEqual(1);

  const verificationUrl = String(outboxRes.messages[0].verification_url);
  const token = new URL(verificationUrl).searchParams.get("token");
  expect(token).toBeTruthy();

  // 3. Complete email verification using token
  const verifyRes = await page.evaluate(async (t) => {
    const response = await fetch(`/api/auth/verify-email?token=${encodeURIComponent(t)}`);
    return { ok: response.ok, status: response.status };
  }, token!);
  expect(verifyRes.ok).toBeTruthy();
}

/**
 * Signs in or creates a standard user session.
 */
export async function signInAsStandardUser(page: Page, creds = TEST_USER_CREDENTIALS) {
  await page.goto("/");
  const res = await page.evaluate(async (c) => {
    let response = await fetch("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: c.email, password: c.password }),
    });

    if (!response.ok) {
      response = await fetch("/api/auth/sign-up/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(c),
      });
    }

    return { ok: response.ok, status: response.status };
  }, creds);
  expect(res.ok).toBeTruthy();
}

/**
 * Clears cookies to guarantee anonymous state.
 */
export async function signOutUser(page: Page) {
  await page.context().clearCookies();
}

