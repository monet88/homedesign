import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fetchCreditsSummary, sanitizeFailureOutput, type CreditsSummary } from "./helpers/credit-helper";

// Public Demo Black-Box Journey on Cloudflare (ADR 0008 / Issue #72).
// Target: https://homedesign.monet.uno
//
// This test suite exercises the full real deployed Worker, D1, R2, Queues, and AI provider:
// 1. Authenticated Operator Session (provided via PLAYWRIGHT_STORAGE_STATE)
// 2. Real R2 Upload: upload-intent -> S3 presigned PUT with fixture bytes -> finalize -> intake queue validation -> ready asset
// 3. AI Interior Design Generation & Before/After Comparison Slider with Exact Credit Settlement (-1 credit)
// 4. AI Exterior Design Generation with Exact Credit Settlement (-1 credit)
// 5. AI Floor Plan Generation: Marker Placement -> Brief (1 Cr) -> Layout (2 Cr) -> Render (3 Cr) -> Panorama (4 Cr) with Exact Total Settlement (-10 credits)
// 6. Security Invariants: Unauthorized Private Asset Access Denial (401 on real existing private asset without auth)
// 7. Intended Anonymous Project Share Access: Real Project Share Creation -> Public Anonymous View without Private Key Leakage
//
// Skipped safely in local runs when PLAYWRIGHT_STORAGE_STATE is not provided.

const roomFixturePath = join(process.cwd(), "e2e", "fixtures", "room.png");
const houseFixturePath = join(process.cwd(), "e2e", "fixtures", "house.jpg");
const floorPlanFixturePath = join(process.cwd(), "e2e", "fixtures", "floor-plan.png");

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

    await test.step("2. Verify funded operator session has available credits for funded flows", async () => {
      const creditsRes = await request.get("/api/credits");
      expect(creditsRes.ok()).toBeTruthy();
      const creditsJson = (await creditsRes.json()) as { code: number; data?: CreditsSummary };
      expect(creditsJson.code).toBe(0);
      expect(creditsJson.data).toBeDefined();
      const available = creditsJson.data?.available ?? 0;
      // In funded operator suite, fail rather than silently return if credits are 0
      expect(available).toBeGreaterThanOrEqual(1);
    });

    let uploadedAssetId = "";
    await test.step("3. Real R2 presigned upload intent, S3 PUT with fixture bytes, and intake validation", async () => {
      const fixtureBytes = readFileSync(roomFixturePath);

      // 3a. Request upload intent for sample image
      const intentRes = await request.post("/api/assets/upload-intent", {
        data: {
          name: "demo-room.png",
          mimeType: "image/png",
          size: fixtureBytes.byteLength,
        },
      });

      // Must succeed for funded operator session
      expect(intentRes.status()).toBe(200);
      const intentData = (await intentRes.json()) as {
        data: { assetId: string; presignedUrl: string };
      };
      expect(intentData.data.assetId).toBeTruthy();
      expect(intentData.data.presignedUrl).toBeTruthy();
      uploadedAssetId = intentData.data.assetId;

      // 3b. Actually perform presigned R2 PUT with fixture bytes
      const putRes = await request.put(intentData.data.presignedUrl, {
        headers: {
          "Content-Type": "image/png",
        },
        data: fixtureBytes,
      });
      expect(putRes.ok()).toBeTruthy();

      // 3c. Finalize upload triggering queue intake validation
      const finalizeRes = await request.post("/api/assets/finalize", {
        data: { assetId: uploadedAssetId },
      });
      expect(finalizeRes.ok()).toBeTruthy();

      // 3d. Poll until asset lifecycle is validated as 'ready'
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

    const creditsBefore = await fetchCreditsSummary(page);
    // Must fail if account is not funded for funded-flow suite
    expect(creditsBefore.available).toBeGreaterThanOrEqual(1);

    await test.step("1. Upload sample room image and select style", async () => {
      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles(roomFixturePath);

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

    await test.step("3. Verify generated result slider and exact credit settlement (-1 credit)", async () => {
      await expect(page.getByText("Generated Result")).toBeVisible({ timeout: 60_000 });

      const slider = page.locator("#generator-card").getByRole("slider", { name: /before after/i });
      await expect(slider).toBeVisible();

      const creditsAfter = await fetchCreditsSummary(page);
      expect(creditsAfter.available).toBe(creditsBefore.available - 1);
      expect(creditsAfter.totalUsage).toBe(creditsBefore.totalUsage + 1);
      expect(creditsAfter.activeHolds).toBe(0);
    });
  });

  test("Phase 3: Real AI Exterior Generation & Exact Credit Settlement", async ({ page }) => {
    if (!process.env.PLAYWRIGHT_STORAGE_STATE) {
      test.skip(true, "Requires operator runtime storage state via PLAYWRIGHT_STORAGE_STATE");
      return;
    }

    test.setTimeout(90_000);
    await page.goto("/ai-exterior-design");

    const creditsBefore = await fetchCreditsSummary(page);
    // Must fail if account is not funded for funded-flow suite
    expect(creditsBefore.available).toBeGreaterThanOrEqual(1);

    await test.step("1. Upload house facade image", async () => {
      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles(houseFixturePath);
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

    await test.step("4. Verify exact exterior credit settlement (-1 credit)", async () => {
      const creditsAfter = await fetchCreditsSummary(page);
      expect(creditsAfter.available).toBe(creditsBefore.available - 1);
      expect(creditsAfter.totalUsage).toBe(creditsBefore.totalUsage + 1);
      expect(creditsAfter.activeHolds).toBe(0);
    });
  });

  test("Phase 4: Full AI Floor Plan Journey (Brief -> Layout -> Render -> Panorama) with Exact Settlement", async ({
    page,
  }) => {
    if (!process.env.PLAYWRIGHT_STORAGE_STATE) {
      test.skip(true, "Requires operator runtime storage state via PLAYWRIGHT_STORAGE_STATE");
      return;
    }

    test.setTimeout(240_000);
    await page.goto("/ai-floor-plan");

    const creditsBefore = await fetchCreditsSummary(page);
    // Floor plan complete chain requires: Brief (1) + Layout (2) + Render (3) + Panorama (4) = 10 credits
    expect(creditsBefore.available).toBeGreaterThanOrEqual(10);

    await test.step("1. Upload floor plan image and place marker", async () => {
      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles(floorPlanFixturePath);

      const canvas = page.getByRole("button", { name: "Click to place room marker" });
      await expect(canvas).toBeVisible({ timeout: 60_000 });
      await canvas.click({ position: { x: 120, y: 120 } });
      await page.waitForTimeout(2_000);

      const recognizeBtn = page.getByRole("button", { name: "Recognize room" });
      await expect(recognizeBtn).toBeVisible({ timeout: 15_000 });
      await recognizeBtn.click();
    });

    await test.step("2. Brief stage (1 Credit)", async () => {
      const generateBriefBtn = page.getByRole("button", { name: /Generate Brief/i });
      await expect(generateBriefBtn).toBeEnabled({ timeout: 35_000 });
      await generateBriefBtn.click();

      const confirmBriefBtn = page.getByRole("button", { name: "Confirm Brief" });
      await expect(confirmBriefBtn).toBeEnabled({ timeout: 35_000 });
      await confirmBriefBtn.click();
    });

    await test.step("3. Layout stage (2 Credits)", async () => {
      const generateLayoutBtn = page.getByRole("button", { name: /Generate Layout/i });
      await expect(generateLayoutBtn).toBeVisible({ timeout: 15_000 });
      await generateLayoutBtn.click();

      const confirmLayoutBtn = page.getByRole("button", { name: "Confirm Layout" });
      await expect(confirmLayoutBtn).toBeEnabled({ timeout: 35_000 });
      await confirmLayoutBtn.click();
    });

    await test.step("4. Render stage (3 Credits)", async () => {
      const generateRenderBtn = page.getByRole("button", { name: /Generate Render/i });
      await expect(generateRenderBtn).toBeVisible({ timeout: 15_000 });
      await generateRenderBtn.click();

      const confirmRenderBtn = page.getByRole("button", { name: "Confirm Render" });
      await expect(confirmRenderBtn).toBeEnabled({ timeout: 45_000 });
      await confirmRenderBtn.click();
    });

    await test.step("5. Panorama stage (4 Credits)", async () => {
      // Execute real Panorama generation
      const generatePanoramaBtn = page.getByRole("button", { name: /Generate Panorama/i });
      await expect(generatePanoramaBtn).toBeVisible({ timeout: 20_000 });
      await expect(generatePanoramaBtn).toBeEnabled({ timeout: 35_000 });
      await generatePanoramaBtn.click();

      // Verify panorama viewer / affordance is rendered
      await expect(page.getByText(/360|Panorama/i).first()).toBeVisible({ timeout: 60_000 });
    });

    await test.step("6. Verify exact total floor plan chain credit settlement (-10 credits total)", async () => {
      const creditsAfter = await fetchCreditsSummary(page);
      // Brief (1) + Layout (2) + Render (3) + Panorama (4) = 10 Credits
      expect(creditsAfter.available).toBe(creditsBefore.available - 10);
      expect(creditsAfter.totalUsage).toBe(creditsBefore.totalUsage + 10);
      expect(creditsAfter.activeHolds).toBe(0);
    });
  });

  test("Phase 5: Unauthorized Private Asset Access Denial", async ({ page, request }) => {
    if (!process.env.PLAYWRIGHT_STORAGE_STATE) {
      test.skip(true, "Requires operator runtime storage state via PLAYWRIGHT_STORAGE_STATE");
      return;
    }

    // 1. Fetch an existing private asset owned by the authenticated session
    const listRes = await request.get("/api/assets?type=all");
    expect(listRes.ok()).toBeTruthy();
    const listJson = (await listRes.json()) as { data?: { items?: Array<{ id: string }> } };
    const items = listJson.data?.items ?? [];
    expect(items.length).toBeGreaterThan(0);
    const existingAssetId = items[0].id;

    // 2. Request download of this real existing private asset without auth (new unauthenticated context)
    const browser = page.context().browser();
    if (!browser) {
      throw new Error("Browser instance unavailable for unauthenticated context test");
    }
    const cleanContext = await browser.newContext({ storageState: undefined });
    const cleanPage = await cleanContext.newPage();
    try {
      const unauthRes = await cleanPage.request.get(`/api/assets/${existingAssetId}/download`);
      // Must be denied with 401 Unauthenticated
      expect(unauthRes.status()).toBe(401);
      const unauthBody = (await unauthRes.json()) as { error?: string };
      expect(unauthBody.error).toBe("UNAUTHENTICATED");
    } finally {
      await cleanContext.close();
    }
  });

  test("Phase 6: Intended Anonymous Project Share Access & Privacy Notice", async ({
    page,
    request,
  }) => {
    if (!process.env.PLAYWRIGHT_STORAGE_STATE) {
      test.skip(true, "Requires operator runtime storage state via PLAYWRIGHT_STORAGE_STATE");
      return;
    }
    // 1. Fetch user's existing projects and find one that actually owns ready generated assets
    const projectsRes = await request.get("/api/projects");
    expect(projectsRes.ok()).toBeTruthy();
    const projectsJson = (await projectsRes.json()) as {
      data?: { items?: Array<{ id: string; name: string; kind: string }> };
    };
    const projects = projectsJson.data?.items ?? [];
    expect(projects.length).toBeGreaterThan(0);

    let targetProject: { id: string; name: string; kind: string } | null = null;
    let targetAsset: { id: string; name: string } | null = null;

    for (const project of projects) {
      const assetsRes = await request.get(
        `/api/assets?type=generated&lifecycle=ready&projectId=${encodeURIComponent(project.id)}`
      );
      if (!assetsRes.ok()) continue;
      const assetsJson = (await assetsRes.json()) as {
        data?: { items?: Array<{ id: string; name: string }> };
      };
      const assets = assetsJson.data?.items ?? [];
      if (assets.length > 0) {
        targetProject = project;
        targetAsset = assets[0];
        break;
      }
    }

    expect(targetProject).not.toBeNull();
    expect(targetAsset).not.toBeNull();
    const chosenProject = targetProject!;
    const chosenAsset = targetAsset!;
    const projectId = chosenProject.id;
    // 2. Create a real Project Share for this exact owned project with its attached generated asset
    const shareRes = await request.post(`/api/projects/${projectId}/share`, {
      data: { expiresAt: null, assetIds: [chosenAsset.id] },
    });
    expect(shareRes.ok()).toBeTruthy();
    const shareData = (await shareRes.json()) as {
      data?: { shareId: string; token: string };
    };
    expect(shareData.data?.token).toBeTruthy();
    const realShareToken = shareData.data!.token;

    // 3. Anonymous visitor loads real share link in a clean unauthenticated context
    const browser = page.context().browser();
    if (!browser) {
      throw new Error("Browser instance unavailable for anonymous context test");
    }
    const anonContext = await browser.newContext({ storageState: undefined });
    const anonPage = await anonContext.newPage();
    try {
      // 3a. Anonymous API query for share view succeeds and contains the selected generated asset
      const shareApiRes = await anonPage.request.get(`/api/share/${encodeURIComponent(realShareToken)}`);
      expect(shareApiRes.ok()).toBeTruthy();
      const shareViewJson = (await shareApiRes.json()) as {
        data?: { name: string; kind: string; assets: Array<{ id: string; mimeType: string }> };
      };
      expect(shareViewJson.data?.assets).toBeDefined();
      const foundAsset = shareViewJson.data?.assets.find((a) => a.id === chosenAsset.id);
      expect(foundAsset).toBeDefined();
      const sharedAssetRes = await anonPage.request.get(
        `/api/share/${encodeURIComponent(realShareToken)}/assets/${chosenAsset.id}`
      );
      expect(sharedAssetRes.ok()).toBeTruthy();
      expect(sharedAssetRes.status()).toBe(200);
      const contentType = sharedAssetRes.headers()["content-type"] || "";
      expect(contentType).toMatch(/image\/(png|jpeg|jpg|webp)/);
      const contentDisposition = sharedAssetRes.headers()["content-disposition"] || "";
      expect(contentDisposition).toContain("inline");

      // 3c. Direct private download without share token remains denied for anonymous visitor
      const directDownloadRes = await anonPage.request.get(`/api/assets/${chosenAsset.id}/download`);
      expect(directDownloadRes.status()).toBe(401);
      const directDownloadJson = (await directDownloadRes.json()) as { error?: string };
      expect(directDownloadJson.error).toBe("UNAUTHENTICATED");

      // 3d. Anonymous page view renders shared project and privacy notice
      await anonPage.goto(`/share/${encodeURIComponent(realShareToken)}`);
      await expect(anonPage.getByText("Shared project")).toBeVisible();
      await expect(anonPage.getByRole("note", { name: "Sharing privacy notice" })).toContainText(
        "not DRM"
      );
      await expect(anonPage.getByRole("link", { name: /download/i })).toHaveCount(0);

      // 3e. Verify public share route and asset delivery never expose private storage secrets
      const content = await anonPage.content();
      expect(content).not.toContain("r2.cloudflarestorage.com");
      expect(content).not.toContain("R2_ACCESS_KEY_ID");
      expect(content).not.toContain("R2_SECRET_ACCESS_KEY");
      expect(content).not.toContain("BETTER_AUTH_SECRET");

      const assetHeaders = JSON.stringify(sharedAssetRes.headers());
      expect(assetHeaders).not.toContain("r2.cloudflarestorage.com");
      expect(assetHeaders).not.toContain("R2_ACCESS_KEY_ID");
      expect(assetHeaders).not.toContain("R2_SECRET_ACCESS_KEY");
    } finally {
      await anonContext.close();
    }
  });
});
