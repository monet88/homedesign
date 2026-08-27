import { Page, expect } from "@playwright/test";

export const ADMIN_CREDENTIALS = {
  email: "minhthang421992@gmail.com",
  password: "Tonight123@",
};

export const TEST_USER_CREDENTIALS = {
  name: "Standard User",
  email: "standard-user@example.com",
  password: "StandardUser123!",
};

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
 * Signs in or creates a standard user session.
 */
export async function signInAsStandardUser(page: Page) {
  await page.goto("/");
  const res = await page.evaluate(async (creds) => {
    let response = await fetch("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: creds.email, password: creds.password }),
    });

    if (!response.ok) {
      response = await fetch("/api/auth/sign-up/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(creds),
      });
    }

    return { ok: response.ok, status: response.status };
  }, TEST_USER_CREDENTIALS);
  expect(res.ok).toBeTruthy();
}

/**
 * Clears cookies to guarantee anonymous state.
 */
export async function signOutUser(page: Page) {
  await page.context().clearCookies();
}
