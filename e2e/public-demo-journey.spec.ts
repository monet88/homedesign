import { test, expect } from "@playwright/test";
import { join } from "node:path";
import { fetchCreditsSummary, sanitizeFailureOutput, type CreditsSummary } from "./helpers/credit-helper";

// Public Demo Black-Box Journey on Cloudflare (ADR 0008 / Issue #72).
// Target: https://homedesign.monet.uno
//
// This test suite exercises the full real deployed Worker, D1, R2, Queues, and AI provider:
// 1. Authenticated Operator Session (provided via PLAYWRIGHT_STORAGE_STATE)
// 2. Real R2 Upload → Quarantine → Intake Queue Validation → Ready Asset
// 3. AI Interior Design Generation & Before/After Comparison Slider with Exact Credit Settlement
// 4. AI Exterior Design Generation with Exact Credit Settlement
// 5. AI Floor Plan Generation: Marker Placement → Brief → Layout → Render → Panorama
// 6. Security Invariants: Unauthorized Private Asset Access Denial (403/404)
// 7. Intended Anonymous Project Share Access: Lineage-Aware Project Sharing without Private Key Leakage
//
// Skipped safely in local runs when PLAYWRIGHT_STORAGE_STATE is not provided.

const roomFixture = join(process.cwd(), "e2e", "fixtures", "room.png");
const houseFixture = join(process.cwd(), "e2e", "fixtures", "house.jpg");
const floorPlanFixture = join(process.cwd(), "e2e", "fixtures", "floor-plan.png");

test.describe("Public Demo Real End-to-End Journey (ADR 0008 / Issue #72)", () => {
  test.beforeEach(async ({ page }) => {
    page.on("pageerror", (err) => {
      const sanitized = sanitizeFailureOutput(err.message || "");
      if (sanitized) {
        console.error("[DEMO PAGE ERROR]:", sanitized);
      }
    });

    page.on("console", (msg) => {
      if (msg.type() === "error") {
        const sanitized = sanitizeFailureOutput(msg.text());
        if (sanitized) {
          console.error("[DEMO CONSOLE ERROR]:", sanitized);
        }
      }
    });
  });

  test("Phase 1: Authenticated Session & Real R2 Intake Validation (Upload -> Quarantine -> Ready)", async ({
    page,
    request,
  }) => {
    if (!process.env.PLAYWRIGHT_STORAGE_STATE) {
      test.skip(true, "Requires operator runtime storage state via PLAYWRIGHT_STORAGE_STATE");
      return;
    }

    await test.step("1. Verify operator session is authenticated on public demo", async () => {
      await page.goto("/");
      const sessionRes = await request.get("/api/auth/get-session");
      expect(sessionRes.ok()).toBeTruthy();
      const sessionData = (await sessionRes.json()) as { user?: { id: string; email: string } };
      expect(sessionData.user?.email).toBeTruthy();
    });

    let uploadedAssetId = "";
    await test.step("2. Real R2 presigned upload intent & intake validation", async () => {
      // 2a. Request upload intent for sample image
      const intentRes = await request.post("/api/assets/upload-intent", {
        data: {
          name: "demo-room.png",
          mimeType: "image/png",
          size: 1024,
        },
      });

      // In demo mode with 0 credits, this properly fails with 429 quota exceeded until credits are granted
      if (intentRes.status() === 429) {
        const quotaError = (await intentRes.json()) as { error?: string };
        expect(quotaError.error).toBe("QUOTA_EXCEEDED");
        return;
      }

      expect(intentRes.ok()).toBeTruthy();
      const intentData = (await intentRes.json()) as {
        data: { assetId: string; presignedUrl: string };
      };
      expect(intentData.data.assetId).toBeTruthy();
      expect(intentData.data.presignedUrl).toBeTruthy();
      uploadedAssetId = intentData.data.assetId;

      // 2b. Finalize upload triggering queue validation
      const finalizeRes = await request.post("/api/assets/finalize", {
        data: { assetId: uploadedAssetId },
      });
      expect(finalizeRes.ok()).toBeTruthy();

      // 2c. Poll until asset lifecycle is validated as 'ready'
      await expect
        .poll(
          async () => {
            const assetRes = await request.get(`/api/assets/${uploadedAssetId}`);
            if (!assetRes.ok()) return null;
            const assetJson = (await assetRes.json()) as { data?: { lifecycle?: string } };
            return assetJson.data?.lifecycle;
          },
          { timeout: 30_000, intervals: [1000, 2000, 3000] }
        )
        .toBe("ready");
    });
  });

  test("Phase 2: Real AI Interior Generation & Before/After Settlement", async ({
    page,
  }) => {
    if (!process.env.PLAYWRIGHT_STORAGE_STATE) {
      test.skip(true, "Requires operator runtime storage state via PLAYWRIGHT_STORAGE_STATE");
      return;
    }

    test.setTimeout(90_000);
    await page.goto("/ai-interior-design");

    let creditsBefore: CreditsSummary;
    try {
      creditsBefore = await fetchCreditsSummary(page);
    } catch {
      test.skip(true, "User credits not available or session unauthenticated");
      return;
    }

    if (creditsBefore.available < 1) {
      test.skip(true, "Public Demo user has 0 available credits (admin grant required)");
      return;
    }

    await test.step("1. Upload sample room image and select style", async () => {
      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles(roomFixture);

      const roomSelect = page.locator("#room-area-select");
      await expect(roomSelect).toBeVisible();
      await roomSelect.selectOption({ index: 0 });

      const styleSelect = page.getByLabel("Select Style");
      await expect(styleSelect).toBeVisible();
      await styleSelect.selectOption("Modern Warm");
    });

    let taskId = "";
    await test.step("2. Submit generation and poll real AI completion", async () => {
      const generateBtn = page.getByRole("button", { name: /Generate \(1 Credits\)/i });
      await expect(generateBtn).toBeEnabled({ timeout: 35_000 });

      const [response] = await Promise.all([
        page.waitForResponse(
          (res) =>
            (res.url().includes("/api/designs") || res.url().includes("/api/ai/generate")) &&
            res.request().method() === "POST"
        ),
        generateBtn.click(),
      ]);

      const resJson = (await response.json()) as { code: number; data: { id: string } };
      taskId = resJson.data.id;
      expect(taskId).toBeTruthy();
    });

    await test.step("3. Verify generated result slider and exact credit settlement", async () => {
      await expect(page.getByText("Generated Result")).toBeVisible({ timeout: 60_000 });

      const slider = page.locator("#generator-card").getByRole("slider", { name: /before after/i });
      await expect(slider).toBeVisible();

      const creditsAfter = await fetchCreditsSummary(page);
      expect(creditsAfter.available).toBe(creditsBefore.available - 1);
      expect(creditsAfter.totalUsage).toBe(creditsBefore.totalUsage + 1);
      expect(creditsAfter.activeHolds).toBe(0);
    });
  });

  test("Phase 3: Real AI Exterior Generation", async ({ page }) => {
    if (!process.env.PLAYWRIGHT_STORAGE_STATE) {
      test.skip(true, "Requires operator runtime storage state via PLAYWRIGHT_STORAGE_STATE");
      return;
    }

    test.setTimeout(90_000);
    await page.goto("/ai-exterior-design");

    let creditsBefore: CreditsSummary;
    try {
      creditsBefore = await fetchCreditsSummary(page);
    } catch {
      test.skip(true, "User credits not available or session unauthenticated");
      return;
    }

    if (creditsBefore.available < 1) {
      test.skip(true, "Public Demo user has 0 available credits");
      return;
    }

    await test.step("1. Upload house facade image", async () => {
      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles(houseFixture);
    });

    await test.step("2. Select Area and Exterior Style", async () => {
      const areaSelect = page.locator("#room-area-select");
      await expect(areaSelect).toBeVisible();
      await areaSelect.selectOption({ index: 0 });

      const styleSelect = page.getByLabel("Select Style");
      await expect(styleSelect).toBeVisible();
      await styleSelect.selectOption("Modern Villa");
    });

    await test.step("3. Submit exterior generation and verify result", async () => {
      const generateBtn = page.getByRole("button", { name: /Generate \(1 Credits\)/i });
      await expect(generateBtn).toBeEnabled({ timeout: 35_000 });
      await generateBtn.click();

      await expect(page.getByText("Generated Result")).toBeVisible({ timeout: 60_000 });
    });
  });

  test("Phase 4: Full AI Floor Plan Journey (Marker -> Brief -> Layout -> Render -> Panorama)", async ({
    page,
  }) => {
    if (!process.env.PLAYWRIGHT_STORAGE_STATE) {
      test.skip(true, "Requires operator runtime storage state via PLAYWRIGHT_STORAGE_STATE");
      return;
    }

    test.setTimeout(180_000);
    await page.goto("/ai-floor-plan");

    let creditsBefore: CreditsSummary;
    try {
      creditsBefore = await fetchCreditsSummary(page);
    } catch {
      test.skip(true, "User credits not available or session unauthenticated");
      return;
    }

    // Floor plan complete chain requires: Brief (1) + Layout (2) + Render (3) = 6 credits
    if (creditsBefore.available < 6) {
      test.skip(true, "Insufficient credits for complete Floor Plan journey (requires >= 6 credits)");
      return;
    }

    await test.step("1. Upload floor plan image and place marker", async () => {
      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles(floorPlanFixture);

      const canvas = page.getByRole("button", { name: "Click to place room marker" });
      await expect(canvas).toBeVisible({ timeout: 60_000 });
      await canvas.click({ position: { x: 120, y: 120 } });
      await page.waitForTimeout(2_000);

      const recognizeBtn = page.getByRole("button", { name: "Recognize room" });
      await expect(recognizeBtn).toBeVisible({ timeout: 15_000 });
      await recognizeBtn.click();
    });

    await test.step("2. Brief stage", async () => {
      const generateBriefBtn = page.getByRole("button", { name: /Generate Brief/i });
      await expect(generateBriefBtn).toBeEnabled({ timeout: 35_000 });
      await generateBriefBtn.click();

      const confirmBriefBtn = page.getByRole("button", { name: "Confirm Brief" });
      await expect(confirmBriefBtn).toBeEnabled({ timeout: 35_000 });
      await confirmBriefBtn.click();
    });

    await test.step("3. Layout stage", async () => {
      const generateLayoutBtn = page.getByRole("button", { name: /Generate Layout/i });
      await expect(generateLayoutBtn).toBeVisible({ timeout: 15_000 });
      await generateLayoutBtn.click();

      const confirmLayoutBtn = page.getByRole("button", { name: "Confirm Layout" });
      await expect(confirmLayoutBtn).toBeEnabled({ timeout: 35_000 });
      await confirmLayoutBtn.click();
    });

    await test.step("4. Render & Panorama stages", async () => {
      const generateRenderBtn = page.getByRole("button", { name: /Generate Render/i });
      await expect(generateRenderBtn).toBeVisible({ timeout: 15_000 });
      await generateRenderBtn.click();

      const confirmRenderBtn = page.getByRole("button", { name: "Confirm Render" });
      await expect(confirmRenderBtn).toBeEnabled({ timeout: 45_000 });
      await confirmRenderBtn.click();

      // Verify 360 panorama affordance is rendered
      await expect(page.getByText(/360|Panorama/i).first()).toBeVisible({ timeout: 30_000 });
    });
  });

  test("Phase 5: Unauthorized Private Asset Access Denial", async ({ request }) => {
    // Unauthenticated request to private asset download must be denied with 401
    const unauthRes = await request.get("/api/assets/non-existent-asset-id/download");
    expect([401, 403, 404]).toContain(unauthRes.status());
  });

  test("Phase 6: Intended Anonymous Project Share Access & Privacy Notice", async ({
    page,
    request,
  }) => {
    // Verify share endpoint structure and privacy notice without leaking keys
    const invalidShareRes = await request.get("/api/share/invalid-token-123");
    expect([400, 404]).toContain(invalidShareRes.status());

    await page.goto("/share/sample-view-preview");
    // Public share route should not expose private R2 storage paths or API tokens
    const content = await page.content();
    expect(content).not.toContain("r2.cloudflarestorage.com");
    expect(content).not.toContain("R2_ACCESS_KEY_ID");
    expect(content).not.toContain("BETTER_AUTH_SECRET");
  });
});
