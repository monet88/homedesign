import { test, expect } from "@playwright/test";
import { join } from "node:path";
import {
  ADMIN_CREDENTIALS,
  signInAsAdmin,
  signOutUser,
} from "./helpers/auth-helper";

// Ticket #24 / ADR 0007 / Spec 0001: Complete End-to-End User & Administrator Journey.

const roomFixture = join(process.cwd(), "e2e", "fixtures", "room.png");
const houseFixture = join(process.cwd(), "e2e", "fixtures", "house.jpg");
const floorPlanFixture = join(process.cwd(), "e2e", "fixtures", "floor-plan.png");

test.describe("Full End-to-End System Journey", () => {
  test.beforeEach(async ({ page }) => {
    page.on("console", (msg) => console.log(`[BROWSER ${msg.type()}]:`, msg.text()));
    page.on("pageerror", (err) => console.log("[PAGE ERROR]:", err));
    page.on("response", async (res) => {
      if (res.url().includes("/api/")) {
        console.log(`[API ${res.status()}] ${res.url()}`);
        if (!res.ok()) {
          console.log(`[API ERROR BODY]:`, await res.text().catch(() => ""));
        }
      }
    });
    // Start fresh by signing in as Admin with full 99,999 credits and verified status
    await signOutUser(page);
    await signInAsAdmin(page);
  });

  test("Phase 1: Admin Operations & RBAC Verification", async ({ page }) => {
    await page.goto("/admin");

    // 1. Verify Admin Console renders
    await expect(
      page.getByRole("heading", { name: "System Administration" })
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(ADMIN_CREDENTIALS.email)).toBeVisible();

    // 2. User Management tab
    await expect(page.getByRole("button", { name: /User Management/ })).toBeVisible();
    await expect(page.getByText("admin", { exact: true }).first()).toBeVisible();

    // 3. AI Task Monitor tab
    await page.getByRole("button", { name: /AI Task Monitor/ }).click();
    await expect(page.getByLabel("Scene:")).toBeVisible();

    // 4. Provider Health Check tab
    await page.getByRole("button", { name: /Provider Health Check/ }).click();
    const checkBtn = page.getByRole("button", { name: /Health Check/ });
    await expect(checkBtn).toBeVisible();
    await checkBtn.click();
    await expect(
      page.getByText(/Healthy \(200 OK\)|Unhealthy \(Failed\)/)
    ).toBeVisible({ timeout: 15_000 });

    // 5. Adjust credits modal
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

  test("Phase 2: AI Interior Design Generation & Before/After View", async ({
    page,
  }) => {
    await page.goto("/ai-interior-design");

    // 1. Upload sample room image
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(roomFixture);

    // 2. Form is ready: Select Room Type and Style
    const roomSelect = page.locator("#room-area-select");
    await expect(roomSelect).toBeVisible();
    await roomSelect.selectOption({ index: 0 });

    const styleSelect = page.getByLabel("Select Style");
    await expect(styleSelect).toBeVisible();
    await styleSelect.selectOption("Modern Warm");

    // 3. Wait for asset upload and submit generation
    const generateBtn = page.getByRole("button", { name: "Generate (1 Credits)" });
    await expect(generateBtn).toBeEnabled({ timeout: 15_000 });
    await generateBtn.click();

    // 4. Verify polling and final generated result with Before/After comparison
    await expect(page.getByText("Generated Result")).toBeVisible({
      timeout: 45_000,
    });
    const slider = page.locator("#generator-card").getByRole("slider", { name: /before after/i });
    await expect(slider).toBeVisible();
    await expect(page.getByRole("link", { name: "Download" })).toBeVisible();
  });

  test("Phase 3: AI Exterior Design Generation & Facade Redesign View", async ({
    page,
  }) => {
    await page.goto("/ai-exterior-design");

    // 1. Upload sample house facade image
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(houseFixture);

    // 2. Form is ready: Select Area and Exterior Style
    const areaSelect = page.locator("#room-area-select");
    await expect(areaSelect).toBeVisible();
    await areaSelect.selectOption({ index: 0 });

    const styleSelect = page.getByLabel("Select Style");
    await expect(styleSelect).toBeVisible();
    await styleSelect.selectOption("Modern Farmhouse");

    // 3. Wait for asset upload and submit generation
    const generateBtn = page.getByRole("button", { name: "Generate (1 Credits)" });
    await expect(generateBtn).toBeEnabled({ timeout: 15_000 });
    await generateBtn.click();

    // 4. Verify polling and final generated result
    await expect(page.getByText("Generated Result")).toBeVisible({
      timeout: 45_000,
    });
    const slider = page.locator("#generator-card").getByRole("slider", { name: /before after/i });
    await expect(slider).toBeVisible();
    await expect(page.getByRole("link", { name: "Download" })).toBeVisible();
  });

  test("Phase 4: AI Floor Plan Journey (Marker Placement, Brief, Layout & Render)", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto("/ai-floor-plan");

    // 1. Upload floor plan image
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(floorPlanFixture);

    // 2. Click on floor plan canvas to place marker
    const canvas = page.getByRole("button", { name: "Click to place room marker" });
    await expect(canvas).toBeVisible({ timeout: 20_000 });
    await canvas.click({ position: { x: 120, y: 120 } });

    // 3. Run recognition & Generate Brief
    const recognizeBtn = page.getByRole("button", { name: "Recognize room" });
    await expect(recognizeBtn).toBeVisible({ timeout: 15_000 });
    await recognizeBtn.click();

    const generateBriefBtn = page.getByRole("button", {
      name: /Generate Brief/i,
    });
    await expect(generateBriefBtn).toBeEnabled({ timeout: 15_000 });
    await generateBriefBtn.click();

    // 4. Confirm Brief (locks marker)
    const confirmBriefBtn = page.getByRole("button", { name: "Confirm Brief" });
    await expect(confirmBriefBtn).toBeEnabled({ timeout: 25_000 });
    await confirmBriefBtn.click();

    // 5. Generate and Confirm Layout
    const generateLayoutBtn = page.getByRole("button", {
      name: /Generate Layout/i,
    });
    await expect(generateLayoutBtn).toBeVisible({ timeout: 15_000 });
    await generateLayoutBtn.click();

    const confirmLayoutBtn = page.getByRole("button", {
      name: "Confirm Layout",
    });
    await expect(confirmLayoutBtn).toBeEnabled({ timeout: 45_000 });
    await confirmLayoutBtn.click();

    // 6. Generate and Confirm Render
    const generateRenderBtn = page.getByRole("button", {
      name: /Generate Render/i,
    });
    await expect(generateRenderBtn).toBeEnabled({ timeout: 25_000 });
    await generateRenderBtn.click();

    const confirmRenderBtn = page.getByRole("button", {
      name: "Confirm Render",
    });
    await expect(confirmRenderBtn).toBeEnabled({ timeout: 45_000 });
    await confirmRenderBtn.click();

    // 7. Assert Room Panorama / Completed stage
    await expect(
      page.getByRole("heading", { name: /Room Panorama/i })
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      page.getByRole("button", { name: /Generate Panorama/i })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Skip Panorama/i })
    ).toBeVisible();
  });

  test("Phase 5: Credits & Ledger Balance Verification", async ({ page }) => {
    await page.goto("/ai-interior-design");

    // Check credit badge in sidebar / header
    const creditBadge = page.locator("aside, header").getByText(/\d+|Credits/i).first();
    await expect(creditBadge).toBeVisible({ timeout: 15_000 });

    // Perform a 1-credit generation
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(roomFixture);

    const generateBtn = page.getByRole("button", { name: "Generate (1 Credits)" });
    await expect(generateBtn).toBeEnabled({ timeout: 15_000 });
    await generateBtn.click();

    await expect(page.getByText("Generated Result")).toBeVisible({
      timeout: 45_000,
    });

    // Check Activity Log page to verify transaction ledger record
    await page.goto("/activity");
    await expect(
      page.getByRole("heading", { name: "Activity", exact: true })
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/generation|interior/i).first()).toBeVisible();
  });
});
