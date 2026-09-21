import { test, expect } from "@playwright/test";
import { join } from "node:path";
import {
  ADMIN_CREDENTIALS,
  generateTestUserCredentials,
  signInAsAdmin,
  signInAsStandardUser,
  signUpAndVerifyStandardUser,
  signOutUser,
} from "./helpers/auth-helper";
import {
  fetchCreditsSummary,
  sanitizeFailureOutput,
  type CreditsSummary,
} from "./helpers/credit-helper";

// Ticket #24 / ADR 0007 / Spec 0001 / Ticket #37 / Ticket #48: Complete End-to-End System Journey.
// Covers:
// 1. Auth: Sign up, Outbox verification (ADR 0001 / Ticket #32), Verified session with Free Grant
// 2. Admin RBAC & Credit Adjustment: 403 for non-admin, admin console, credit adjustments
// 3. AI Interior Design Generation: Offline FakeProvider lifecycle to ready output with Before/After comparison & exact credit settlement
// 4. AI Exterior Design Generation: Offline FakeProvider lifecycle to ready output with Before/After comparison & exact credit settlement
// 5. AI Floor Plan Generation: Marker placement, Recognize, Brief (1 Cr), Layout (2 Cr), Render (3 Cr), Panorama stage
// 6. Project Share: Lineage-aware project sharing and anonymous access
// 7. Credits & Activity Ledger: Exact transaction reference, settled balance verification & repeated polling idempotency

const roomFixture = join(process.cwd(), "e2e", "fixtures", "room.png");
const houseFixture = join(process.cwd(), "e2e", "fixtures", "house.jpg");
const floorPlanFixture = join(process.cwd(), "e2e", "fixtures", "floor-plan.png");

test.describe("Full End-to-End System Journey", () => {
  test.beforeEach(async ({ page }) => {
    // Sanitize any page error logs to prevent leaking tokens, credentials, prompts, or private asset URLs
    page.on("pageerror", (err) => {
      const sanitized = sanitizeFailureOutput(err.message || "");
      if (sanitized) {
        console.error("[PAGE ERROR]:", sanitized);
      }
    });

    page.on("console", (msg) => {
      if (msg.type() === "error") {
        const sanitized = sanitizeFailureOutput(msg.text());
        if (sanitized) {
          console.error("[CONSOLE ERROR]:", sanitized);
        }
      }
    });

    await signOutUser(page);
  });

  test("Phase 1: User Registration, Outbox Email Verification & Free Credit Grant", async ({
    page,
  }) => {
    const userCreds = generateTestUserCredentials("e2e-journey-user");

    await test.step("1. Register user and verify email via test-outbox capability path", async () => {
      await signUpAndVerifyStandardUser(page, userCreds);
    });

    await test.step("2. Authenticate as verified user and inspect initial free credit grant", async () => {
      await signInAsStandardUser(page, userCreds);
      await page.goto("/ai-interior-design");
      const creditBadge = page.locator("aside, header").getByText(/\d+|Credits/i).first();
      await expect(creditBadge).toBeVisible({ timeout: 15_000 });

      // Prove exact Credit summary via authorized HTTP boundary
      const credits = await fetchCreditsSummary(page);
      expect(credits.available).toBe(10);
      expect(credits.totalGrants).toBe(10);
      expect(credits.totalUsage).toBe(0);
      expect(credits.activeHolds).toBe(0);
    });
  });

  test("Phase 2: Admin Operations, RBAC Verification & Credit Adjustment", async ({
    page,
  }, testInfo) => {
    const regularUser = generateTestUserCredentials("regular-visitor");

    await test.step("1. Anonymous receives 401 and non-admin receives 403 at /admin", async () => {
      await page.goto("/admin");
      await expect(page.getByRole("heading", { name: "401 Unauthorized" })).toBeVisible();

      await signInAsStandardUser(page, regularUser);
      await page.goto("/admin");
      await expect(page.getByRole("heading", { name: "403 Forbidden" })).toBeVisible();
      await signOutUser(page);
    });

    await test.step("2. Admin session accesses /admin dashboard", async () => {
      await signInAsAdmin(page);
      await page.goto("/admin");

      await expect(
        page.getByRole("heading", { name: "System Administration" })
      ).toBeVisible({ timeout: 15_000 });
      // The signed-in email block is hidden below `sm`; assert on desktop only.
      if (testInfo.project.name === "chromium-desktop") {
        await expect(page.getByText(ADMIN_CREDENTIALS.email).first()).toBeVisible();
      }
    });

    await test.step("3. Admin inspects User Management and AI Task Monitor", async () => {
      await expect(page.getByRole("button", { name: /User Management/ })).toBeVisible();
      await expect(page.getByText("User", { exact: true }).first()).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Adjust Credits" }).first()
      ).toBeVisible({ timeout: 15_000 });

      await page.getByRole("button", { name: /AI Task Monitor/ }).click();
      await expect(page.getByLabel("Scene:")).toBeVisible();
    });

    await test.step("4. Admin triggers Provider Health Check", async () => {
      const healthTab = page.getByRole("button", { name: /Provider Health Check/ });
      await healthTab.scrollIntoViewIfNeeded();
      await healthTab.click();
      const checkBtn = page.getByRole("button", { name: /Health Check/ });
      await expect(checkBtn).toBeVisible();
      await checkBtn.click();
      await expect(
        page.getByText(/Healthy \(200 OK\)|Unhealthy \(Failed\)/)
      ).toBeVisible({ timeout: 15_000 });
    });

    await test.step("5. Admin adjusts user credits via modal", async () => {
      await page.getByRole("button", { name: /User Management/ }).click();
      const adjustBtn = page.getByRole("button", { name: "Adjust Credits" }).first();
      await expect(adjustBtn).toBeVisible({ timeout: 15_000 });
      await adjustBtn.click();

      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await dialog.locator("#credit-amount-input").fill("100");
      await dialog.getByRole("button", { name: "Confirm Adjustment" }).click();
      await expect(
        dialog.getByText(/Successfully granted 100 credits/i)
      ).toBeVisible({ timeout: 10_000 });
    });
  });

  test("Phase 3: AI Interior Design Generation & Before/After View", async ({
    page,
  }) => {
    await signInAsAdmin(page);
    await page.goto("/ai-interior-design");

    await test.step("1. Upload sample room image", async () => {
      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles(roomFixture);
    });

    await test.step("2. Select Room Type and Style", async () => {
      const roomSelect = page.locator("#room-area-select");
      await expect(roomSelect).toBeVisible();
      await roomSelect.selectOption({ index: 0 });

      const styleSelect = page.getByLabel("Select Style");
      await expect(styleSelect).toBeVisible();
      await styleSelect.selectOption("Modern Warm");
    });

    let taskId = "";
    let creditsBefore: CreditsSummary;

    await test.step("3. Submit generation and wait for FakeProvider completion", async () => {
      creditsBefore = await fetchCreditsSummary(page);

      const generateBtn = page.getByRole("button", { name: "Generate (1 Credits)" });
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

    await test.step("4. Verify generated result with interactive Before/After comparison slider and assert exact credit settlement", async () => {
      await expect(page.getByText("Generated Result")).toBeVisible({
        timeout: 45_000,
      });
      const slider = page.locator("#generator-card").getByRole("slider", { name: /before after/i });
      await expect(slider).toBeVisible();
      await expect(page.getByRole("link", { name: "Download" })).toBeVisible();

      // Assert post-ready credit balance decreased by exactly the cost (1 credit)
      const creditsAfter = await fetchCreditsSummary(page);
      expect(creditsAfter.available).toBe(creditsBefore.available - 1);
      expect(creditsAfter.totalUsage).toBe(creditsBefore.totalUsage + 1);
      expect(creditsAfter.activeHolds).toBe(0);

      // Assert repeated polling and reconnect queries cannot settle the same generation twice
      const pollRes = await page.request.get(`/api/designs/${taskId}`);
      expect(pollRes.ok()).toBeTruthy();
      const pollCompatRes = await page.request.post("/api/ai/query", { data: { taskId } });
      expect(pollCompatRes.ok()).toBeTruthy();

      const creditsAfterRepoll = await fetchCreditsSummary(page);
      expect(creditsAfterRepoll.available).toBe(creditsAfter.available);
      expect(creditsAfterRepoll.totalUsage).toBe(creditsAfter.totalUsage);
      expect(creditsAfterRepoll.activeHolds).toBe(0);
    });
  });

  test("Phase 4: AI Exterior Design Generation & Facade Redesign View", async ({
    page,
  }) => {
    await signInAsAdmin(page);
    await page.goto("/ai-exterior-design");

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
      await styleSelect.selectOption("Modern Farmhouse");
    });

    let creditsBefore: CreditsSummary;

    await test.step("3. Submit generation and wait for FakeProvider completion", async () => {
      creditsBefore = await fetchCreditsSummary(page);

      const generateBtn = page.getByRole("button", { name: "Generate (1 Credits)" });
      await expect(generateBtn).toBeEnabled({ timeout: 35_000 });
      await generateBtn.click();
    });

    await test.step("4. Verify generated result with Before/After comparison slider and assert credit settlement", async () => {
      await expect(page.getByText("Generated Result")).toBeVisible({
        timeout: 45_000,
      });
      const slider = page.locator("#generator-card").getByRole("slider", { name: /before after/i });
      await expect(slider).toBeVisible();
      await expect(page.getByRole("link", { name: "Download" })).toBeVisible();

      // Assert post-ready credit balance decreased by exactly 1
      const creditsAfter = await fetchCreditsSummary(page);
      expect(creditsAfter.available).toBe(creditsBefore.available - 1);
      expect(creditsAfter.totalUsage).toBe(creditsBefore.totalUsage + 1);
      expect(creditsAfter.activeHolds).toBe(0);
    });
  });

  test("Phase 5: AI Floor Plan Journey (Marker Placement, Brief, Layout & Render)", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await signInAsAdmin(page);
    await page.goto("/ai-floor-plan");

    await test.step("1. Upload floor plan image", async () => {
      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles(floorPlanFixture);
    });

    await test.step("2. Place marker on canvas and run recognition", async () => {
      const canvas = page.getByRole("button", { name: "Click to place room marker" });
      // CI runners are slower and the upload→project→marker canvas chain is
      // async; allow generous settling time.
      await expect(canvas).toBeVisible({ timeout: 60_000 });
      await expect(canvas).toHaveAttribute("aria-disabled", "false", { timeout: 60_000 });
      await canvas.click({ position: { x: 120, y: 120 } });

      // Registering the room is async (marker POST → room row); give the flow a
      // beat to settle before recognizing, otherwise the recognize call races
      // an unset room.id and errors out.
      await page.waitForTimeout(2_000);

      const recognizeBtn = page.getByRole("button", { name: "Recognize room" });
      await expect(recognizeBtn).toBeVisible({ timeout: 15_000 });
      await recognizeBtn.click();
    });

    let creditsBeforeBrief: CreditsSummary;
    let briefTaskId = "";
    await test.step("3. Generate and Confirm Brief (locks marker)", async () => {
      creditsBeforeBrief = await fetchCreditsSummary(page);

      const generateBriefBtn = page.getByRole("button", { name: /Generate Brief/i });
      await expect(generateBriefBtn).toBeEnabled({ timeout: 35_000 });

      const [briefRes] = await Promise.all([
        page.waitForResponse(
          (res) =>
            (res.url().includes("/api/designs") || res.url().includes("/api/ai/generate")) &&
            res.request().method() === "POST"
        ),
        generateBriefBtn.click(),
      ]);
      const briefData = (await briefRes.json()) as { code: number; data: { id: string } };
      briefTaskId = briefData.data.id;
      expect(briefTaskId).toBeTruthy();

      const confirmBriefBtn = page.getByRole("button", { name: "Confirm Brief" });
      await expect(confirmBriefBtn).toBeEnabled({ timeout: 25_000 });

      // Assert post-ready delta for brief (1 credit)
      const creditsAfterBrief = await fetchCreditsSummary(page);
      expect(creditsAfterBrief.available).toBe(creditsBeforeBrief.available - 1);
      expect(creditsAfterBrief.totalUsage).toBe(creditsBeforeBrief.totalUsage + 1);
      expect(creditsAfterBrief.activeHolds).toBe(0);

      await confirmBriefBtn.click();
    });

    let creditsBeforeLayout: CreditsSummary;
    let layoutTaskId = "";
    await test.step("4. Generate and Confirm Layout", async () => {
      creditsBeforeLayout = await fetchCreditsSummary(page);

      const generateLayoutBtn = page.getByRole("button", { name: /Generate Layout/i });
      await expect(generateLayoutBtn).toBeVisible({ timeout: 15_000 });

      const [layoutRes] = await Promise.all([
        page.waitForResponse(
          (res) =>
            (res.url().includes("/api/designs") || res.url().includes("/api/ai/generate")) &&
            res.request().method() === "POST"
        ),
        generateLayoutBtn.click(),
      ]);
      const layoutData = (await layoutRes.json()) as { code: number; data: { id: string } };
      layoutTaskId = layoutData.data.id;
      expect(layoutTaskId).toBeTruthy();

      const confirmLayoutBtn = page.getByRole("button", { name: "Confirm Layout" });
      await expect(confirmLayoutBtn).toBeEnabled({ timeout: 45_000 });

      // Assert post-ready delta for layout (2 credits)
      const creditsAfterLayout = await fetchCreditsSummary(page);
      expect(creditsAfterLayout.available).toBe(creditsBeforeLayout.available - 2);
      expect(creditsAfterLayout.totalUsage).toBe(creditsBeforeLayout.totalUsage + 2);
      expect(creditsAfterLayout.activeHolds).toBe(0);

      // Assert repeated polling / reconnect on layout task cannot settle twice
      const pollLayout = await page.request.get(`/api/designs/${layoutTaskId}`);
      expect(pollLayout.ok()).toBeTruthy();
      const creditsAfterRepoll = await fetchCreditsSummary(page);
      expect(creditsAfterRepoll.available).toBe(creditsAfterLayout.available);

      await confirmLayoutBtn.click();
    });

    let creditsBeforeRender: CreditsSummary;
    let renderTaskId = "";
    await test.step("5. Generate and Confirm Render", async () => {
      creditsBeforeRender = await fetchCreditsSummary(page);

      const generateRenderBtn = page.getByRole("button", { name: /Generate Render/i });
      await expect(generateRenderBtn).toBeEnabled({ timeout: 25_000 });

      const [renderRes] = await Promise.all([
        page.waitForResponse(
          (res) =>
            (res.url().includes("/api/designs") || res.url().includes("/api/ai/generate")) &&
            res.request().method() === "POST"
        ),
        generateRenderBtn.click(),
      ]);
      const renderData = (await renderRes.json()) as { code: number; data: { id: string } };
      renderTaskId = renderData.data.id;
      expect(renderTaskId).toBeTruthy();

      const confirmRenderBtn = page.getByRole("button", { name: "Confirm Render" });
      await expect(confirmRenderBtn).toBeEnabled({ timeout: 45_000 });

      // Assert post-ready delta for render (3 credits)
      const creditsAfterRender = await fetchCreditsSummary(page);
      expect(creditsAfterRender.available).toBe(creditsBeforeRender.available - 3);
      expect(creditsAfterRender.totalUsage).toBe(creditsBeforeRender.totalUsage + 3);
      expect(creditsAfterRender.activeHolds).toBe(0);

      // Assert repeated polling / query cannot double settle render
      const pollRender = await page.request.get(`/api/designs/${renderTaskId}`);
      expect(pollRender.ok()).toBeTruthy();
      const creditsAfterRepoll = await fetchCreditsSummary(page);
      expect(creditsAfterRepoll.available).toBe(creditsAfterRender.available);

      await confirmRenderBtn.click();
    });

    await test.step("6. Assert Room Panorama / Completed stage", async () => {
      await expect(
        page.getByRole("heading", { name: /Room Panorama/i })
      ).toBeVisible({ timeout: 20_000 });
      await expect(page.getByRole("button", { name: /Generate Panorama/i })).toBeVisible();
      await expect(page.getByRole("button", { name: /Skip Panorama/i })).toBeVisible();
    });

    await test.step("7. Failed replacement upload cannot reuse the previous project", async () => {
      await page.route("**/api/floor-plan/projects", async (route) => {
        if (route.request().method() === "POST") {
          await route.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({ error: "PROJECT_BOOTSTRAP_FAILED" }),
          });
          return;
        }
        await route.continue();
      });

      try {
        await page.locator('input[type="file"]').setInputFiles(roomFixture);
        const canvas = page.getByRole("button", { name: "Click to place room marker" });
        await expect(canvas).toBeVisible({ timeout: 60_000 });
        await expect(canvas).toHaveAttribute("aria-disabled", "true", { timeout: 60_000 });
      } finally {
        await page.unroute("**/api/floor-plan/projects");
      }
    });
  });

  test("Phase 6: Lineage-Aware Project Sharing & Anonymous Access", async ({
    page,
    request,
  }) => {
    let shareToken = "";

    await test.step("1. Create shareable project fixture via API", async () => {
      const fixtureRes = await request.post("/api/test/share-fixture");
      expect(fixtureRes.ok()).toBeTruthy();
      const fixture = (await fixtureRes.json()) as { token: string };
      expect(fixture.token).toBeTruthy();
      shareToken = fixture.token;
    });

    await test.step("2. Anonymous visitor loads share link and verifies lineage and privacy notice", async () => {
      await signOutUser(page);
      await page.goto(`/share/${encodeURIComponent(shareToken)}`);

      await expect(page.getByRole("heading", { name: "Fixture Living Room" })).toBeVisible();
      await expect(page.getByText("Shared project")).toBeVisible();
      await expect(page.getByRole("note", { name: "Sharing privacy notice" })).toContainText("not DRM");
      await expect(page.getByRole("link", { name: /download/i })).toHaveCount(0);
    });
  });

  test("Phase 7: Credit Ledger Settlement & Activity Log Verification", async ({
    page,
  }) => {
    await signInAsAdmin(page);

    let generationTaskId = "";
    let creditsBefore: CreditsSummary;

    await test.step("1. Perform a generation to trigger ledger debit and assert exact settlement", async () => {
      creditsBefore = await fetchCreditsSummary(page);

      await page.goto("/ai-interior-design");
      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles(roomFixture);

      const generateBtn = page.getByRole("button", { name: "Generate (1 Credits)" });
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
      generationTaskId = resJson.data.id;
      expect(generationTaskId).toBeTruthy();

      await expect(page.getByText("Generated Result")).toBeVisible({
        timeout: 45_000,
      });

      // 1a. Assert exact post-ready balance delta (decreased by 1, usage increased by 1, hold is 0)
      const creditsAfter = await fetchCreditsSummary(page);
      expect(creditsAfter.available).toBe(creditsBefore.available - 1);
      expect(creditsAfter.totalUsage).toBe(creditsBefore.totalUsage + 1);
      expect(creditsAfter.activeHolds).toBe(0);

      // 1b. Assert repeated status polling and reconnect cannot settle the same generation twice
      const poll1 = await page.request.get(`/api/designs/${generationTaskId}`);
      expect(poll1.ok()).toBeTruthy();
      const poll2 = await page.request.post("/api/ai/query", { data: { taskId: generationTaskId } });
      expect(poll2.ok()).toBeTruthy();

      const creditsAfterRepoll = await fetchCreditsSummary(page);
      expect(creditsAfterRepoll.available).toBe(creditsAfter.available);
      expect(creditsAfterRepoll.totalUsage).toBe(creditsAfter.totalUsage);
      expect(creditsAfterRepoll.activeHolds).toBe(0);

      // 1c. Verify settled usage through admin HTTP boundary (/api/admin/tasks)
      const adminTasksRes = await page.request.get("/api/admin/tasks");
      expect(adminTasksRes.ok()).toBeTruthy();
      const adminTasks = (await adminTasksRes.json()) as {
        code: number;
        data: { tasks: Array<{ id: string; status: string; cost_credits: number }> };
      };
      const matchingTask = adminTasks.data.tasks.find((t) => t.id === generationTaskId);
      expect(matchingTask).toBeDefined();
      expect(matchingTask?.status).toBe("ready");
      expect(matchingTask?.cost_credits).toBe(1);
    });

    await test.step("2. Verify Activity timeline records the exact generation reference", async () => {
      // 2a. Verify through authorized /api/activity HTTP boundary with exact referenceId
      const activityRes = await page.request.get("/api/activity?family=generation");
      expect(activityRes.ok()).toBeTruthy();
      const activityData = (await activityRes.json()) as {
        code: number;
        data: {
          items: Array<{
            eventId: string;
            family: string;
            type: string;
            referenceId: string;
            status: string;
          }>;
        };
      };
      const exactGenerationEvent = activityData.data.items.find(
        (item) => item.referenceId === generationTaskId && item.type === "generation_succeeded"
      );
      expect(exactGenerationEvent).toBeDefined();
      expect(exactGenerationEvent?.status).toBe("ready");
      expect(exactGenerationEvent?.family).toBe("generation");

      // 2b. Verify in browser UI on /activity page
      await page.goto("/activity");
      await expect(
        page.getByRole("heading", { name: "Activity", exact: true })
      ).toBeVisible({ timeout: 15_000 });

      const familySelect = page.getByRole("combobox", { name: "Filter by event family" });
      await expect(familySelect).toBeVisible();
      await familySelect.selectOption("generation");

      await expect(
        page.getByText("generation succeeded — Interior design").first()
      ).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText("generation · ready").first()).toBeVisible({ timeout: 10_000 });
    });
  });
});
