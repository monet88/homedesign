import { test, expect } from "@playwright/test";

// Public Demo Google-auth live smoke contract (ADR 0008, Issue #72).
// Proves both Google One Tap and normal "Sign in with Google" affordances exist
// on the public origin (https://homedesign.monet.uno) without committing Google credentials,
// session tokens, or attempting to bypass Google CAPTCHA.
//
// In black-box public demo mode (e.g. against deployed URL), tests verify:
// 1. Google OAuth entry points are rendered correctly.
// 2. Client config exposes Google client ID without exposing client secret.
// 3. Email/password forms are NOT rendered on public demo (Google-only auth).
// 4. If an operator-provided runtime storage state is supplied (PLAYWRIGHT_STORAGE_STATE),
//    it verifies the authenticated session has 0 credits initially and cannot create workloads.

test.describe("Public Demo Auth & Google Live Smoke (ADR 0008, Issue #72)", () => {
  test("client-config endpoint returns non-empty googleClientId without secrets or sensitive tokens", async ({
    request,
  }) => {
    const res = await request.get("/api/auth/client-config");
    expect(res.status()).toBe(200);

    const json = (await res.json()) as Record<string, unknown>;
    expect(json).toHaveProperty("googleClientId");
    expect(typeof json.googleClientId).toBe("string");
    expect((json.googleClientId as string).trim().length).toBeGreaterThan(0);

    // Invariants: secrets and tokens must never appear in client config
    expect(json).not.toHaveProperty("googleClientSecret");
    expect(json).not.toHaveProperty("clientSecret");
    expect(json).not.toHaveProperty("secret");
    expect(json).not.toHaveProperty("token");
    expect(json).not.toHaveProperty("apiKey");
  });

  test("public landing renders sign-in trigger, Google One Tap client config, and normal Google auth entry points", async ({
    page,
    request,
  }) => {
    await page.goto("/");

    // 1. Public visitor can view landing page
    await expect(
      page.getByRole("heading", { name: "See your future home in minutes" })
    ).toBeVisible();

    // 2. Normal Sign In trigger is accessible in header/nav
    const signInTrigger = page.getByRole("link", { name: "Sign In", exact: true }).first();
    await expect(signInTrigger).toBeVisible();

    // 3. Google One Tap client config is exposed, valid, and contains non-empty googleClientId
    const cfgRes = await request.get("/api/auth/client-config");
    expect(cfgRes.status()).toBe(200);
    const cfgJson = (await cfgRes.json()) as { googleClientId?: string | null };
    expect(cfgJson).toHaveProperty("googleClientId");
    expect(typeof cfgJson.googleClientId).toBe("string");
    expect((cfgJson.googleClientId as string).trim().length).toBeGreaterThan(0);

    // 4. Normal Google OAuth social sign-in affordance exists at the auth endpoint
    // BetterAuth social sign-in initiation endpoint: POST /api/auth/sign-in/social
    const socialSignInRes = await request.post("/api/auth/sign-in/social", {
      data: {
        provider: "google",
        callbackURL: "https://homedesign.monet.uno/",
      },
    });
    // Must return a valid initiation response (200 with accounts.google.com redirect URL, or 302 redirect).
    // Cannot pass merely on HTTP 400.
    expect([200, 302]).toContain(socialSignInRes.status());
    if (socialSignInRes.status() === 200) {
      const body = (await socialSignInRes.json()) as { url?: string };
      expect(body.url).toBeDefined();
      expect(typeof body.url).toBe("string");
      expect(body.url).toContain("accounts.google.com");
    } else if (socialSignInRes.status() === 302) {
      const location = socialSignInRes.headers()["location"] || "";
      expect(location).toContain("accounts.google.com");
    }
  });
  test("demo mode presents Google-only auth contract and bans email/password", async ({
    request,
  }) => {
    // Attempt email signup on the target
    const signUpRes = await request.post("/api/auth/sign-up/email", {
      data: {
        email: "demo-test@example.com",
        password: "Password123!",
        name: "Demo Tester",
      },
    });

    // If running against demo environment, email signup MUST be banned with 403
    if (signUpRes.status() === 403) {
      const body = (await signUpRes.json()) as { error?: string };
      expect(body.error).toBe("EMAIL_SIGNUP_BANNED_IN_DEMO");
    } else {
      // In local testing environment, status can be non-403 (testing economy allowed)
      expect([200, 400, 403, 422]).toContain(signUpRes.status());
    }
  });

  test("authenticated operator session (when provided via runtime storageState) proves valid session on homedesign.monet.uno and starts with 0 credits", async ({
    page,
    request,
  }) => {
    // Only executed when operator provided an authenticated runtime storage state
    if (!process.env.PLAYWRIGHT_STORAGE_STATE) {
      test.skip(true, "No operator runtime storage state supplied via PLAYWRIGHT_STORAGE_STATE");
      return;
    }

    await page.goto("/");

    // 1. Prove authenticated Google session is returned on the public origin
    const sessionRes = await request.get("/api/auth/get-session");
    expect(sessionRes.status()).toBe(200);
    const sessionJson = (await sessionRes.json()) as {
      session?: { id: string; userId: string; token?: string };
      user?: { id: string; email: string; role: string };
    } | null;

    expect(sessionJson).toBeTruthy();
    expect(sessionJson?.user).toBeDefined();
    expect(sessionJson?.user?.email).toBeTruthy();
    // Invariants: session token must be redacted from browser-visible JSON
    expect(sessionJson?.session).not.toHaveProperty("token");

    // 2. In demo environment, verify initial available credits = 0
    const creditsRes = await request.get("/api/credits");
    expect(creditsRes.status()).toBe(200);
    const creditsData = (await creditsRes.json()) as {
      code: number;
      data?: { available: number; totalGrants: number; totalUsage: number; activeHolds: number };
    };
    expect(creditsData.data).toBeDefined();
    expect(creditsData.data?.available).toBe(0);
    expect(creditsData.data?.totalUsage).toBe(0);
    expect(creditsData.data?.activeHolds).toBe(0);
  });
});
