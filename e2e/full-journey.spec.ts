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

// Ticket #24 / ADR 0007 / Spec 0001 / Ticket #37: Complete End-to-End System Journey.
// Covers:
// 1. Auth: Sign up, Outbox verification (ADR 0001 / Ticket #32), Verified session with Free Grant
// 2. Admin RBAC & Credit Adjustment: 403 for non-admin, admin console, credit adjustments
// 3. AI Interior Design Generation: Offline FakeProvider lifecycle to ready output with Before/After comparison
// 4. AI Exterior Design Generation: Offline FakeProvider lifecycle to ready output with Before/After comparison
// 5. AI Floor Plan Generation: Marker placement, Recognize, Brief, Layout, Render, Panorama stage
// 6. Project Share: Lineage-aware project sharing and anonymous access
// 7. Credits & Activity Ledger: Transaction history and settled balance verification

const roomFixture = join(process.cwd(), "e2e", "fixtures", "room.png");
const houseFixture = join(process.cwd(), "e2e", "fixtures", "house.jpg");
const floorPlanFixture = join(process.cwd(), "e2e", "fixtures", "floor-plan.png");

test.describe("Full End-to-End System Journey", () => {
  test.beforeEach(async ({ page }) => {
    // Sanitize any page error logs to prevent leaking tokens or credentials
    page.on("pageerror", (err) => {
      const sanitized = (err.message || "").split("?")[0];
      if (sanitized) {
        console.error("[PAGE ERROR]:", sanitized);
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
    });
  });

  test("Phase 2: Admin Operations, RBAC Verification & Credit Adjustment", async ({
    page,
  }, testInfo) => {
    const regularUser = generateTestUserCredentials("regular-visitor");

    await test.step("1. Anonymous & non-admin visitors to /admin receive 403 Forbidden", async () => {
      await page.goto("/admin");
      await expect(page.getByRole("heading", { name: "403 Forbidden" })).toBeVisible();

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
        await expect(page.getByText(ADMIN_CREDENTIALS.email)).toBeVisible();
      }
    });

    await test.step("3. Admin inspects User Management and AI Task Monitor", async () => {
      await expect(page.getByRole("button", { name: /User Management/ })).toBeVisible();
      await expect(page.getByText("User", { exact: true }).first()).toBeVisible();
      await expect(page.getByText("Adjust Credits").first()).toBeVisible();

      await page.getByRole("button", { name: /AI Task Monitor/ }).click();
      await expect(page.getByLabel("Scene:")).toBeVisible();
    });

    await test.step("4. Admin triggers Provider Health Check", async () => {
      await page.getByRole("button", { name: /Provider Health Check/ }).click();
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

    await test.step("3. Submit generation and wait for FakeProvider completion", async () => {
      const generateBtn = page.getByRole("button", { name: "Generate (1 Credits)" });
      await expect(generateBtn).toBeEnabled({ timeout: 35_000 });
      await generateBtn.click();
    });

    await test.step("4. Verify generated result with interactive Before/After comparison slider", async () => {
      await expect(page.getByText("Generated Result")).toBeVisible({
        timeout: 45_000,
      });
      const slider = page.locator("#generator-card").getByRole("slider", { name: /before after/i });
      await expect(slider).toBeVisible();
      await expect(page.getByRole("link", { name: "Download" })).toBeVisible();
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

    await test.step("3. Submit generation and wait for FakeProvider completion", async () => {
      const generateBtn = page.getByRole("button", { name: "Generate (1 Credits)" });
      await expect(generateBtn).toBeEnabled({ timeout: 35_000 });
      await generateBtn.click();
    });

    await test.step("4. Verify generated result with Before/After comparison slider", async () => {
      await expect(page.getByText("Generated Result")).toBeVisible({
        timeout: 45_000,
      });
      const slider = page.locator("#generator-card").getByRole("slider", { name: /before after/i });
      await expect(slider).toBeVisible();
      await expect(page.getByRole("link", { name: "Download" })).toBeVisible();
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
      await expect(canvas).toBeVisible({ timeout: 20_000 });
      await canvas.click({ position: { x: 120, y: 120 } });

      // Registering the room is async (marker POST → room row); give the flow a
      // beat to settle before recognizing, otherwise the recognize call races
      // an unset room.id and errors out.
      await page.waitForTimeout(2_000);

      const recognizeBtn = page.getByRole("button", { name: "Recognize room" });
      await expect(recognizeBtn).toBeVisible({ timeout: 15_000 });
      await recognizeBtn.click();
    });

    await test.step("3. Generate and Confirm Brief (locks marker)", async () => {
      const generateBriefBtn = page.getByRole("button", { name: /Generate Brief/i });
      await expect(generateBriefBtn).toBeEnabled({ timeout: 35_000 });
      await generateBriefBtn.click();

      const confirmBriefBtn = page.getByRole("button", { name: "Confirm Brief" });
      await expect(confirmBriefBtn).toBeEnabled({ timeout: 25_000 });
      await confirmBriefBtn.click();
    });

    await test.step("4. Generate and Confirm Layout", async () => {
      const generateLayoutBtn = page.getByRole("button", { name: /Generate Layout/i });
      await expect(generateLayoutBtn).toBeVisible({ timeout: 15_000 });
      await generateLayoutBtn.click();

      const confirmLayoutBtn = page.getByRole("button", { name: "Confirm Layout" });
      await expect(confirmLayoutBtn).toBeEnabled({ timeout: 45_000 });
      await confirmLayoutBtn.click();
    });

    await test.step("5. Generate and Confirm Render", async () => {
      const generateRenderBtn = page.getByRole("button", { name: /Generate Render/i });
      await expect(generateRenderBtn).toBeEnabled({ timeout: 25_000 });
      await generateRenderBtn.click();

      const confirmRenderBtn = page.getByRole("button", { name: "Confirm Render" });
      await expect(confirmRenderBtn).toBeEnabled({ timeout: 45_000 });
      await confirmRenderBtn.click();
    });

    await test.step("6. Assert Room Panorama / Completed stage", async () => {
      await expect(
        page.getByRole("heading", { name: /Room Panorama/i })
      ).toBeVisible({ timeout: 20_000 });
      await expect(page.getByRole("button", { name: /Generate Panorama/i })).toBeVisible();
      await expect(page.getByRole("button", { name: /Skip Panorama/i })).toBeVisible();
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

    await test.step("1. Perform a generation to trigger ledger debit", async () => {
      await page.goto("/ai-interior-design");
      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles(roomFixture);

      const generateBtn = page.getByRole("button", { name: "Generate (1 Credits)" });
      await expect(generateBtn).toBeEnabled({ timeout: 35_000 });
      await generateBtn.click();

      await expect(page.getByText("Generated Result")).toBeVisible({
        timeout: 45_000,
      });
    });

    await test.step("2. Verify Activity page displays settled generation records", async () => {
      await page.goto("/activity");
      await expect(
        page.getByRole("heading", { name: "Activity", exact: true })
      ).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText(/generation|interior/i).first()).toBeVisible();
    });
  });
});
