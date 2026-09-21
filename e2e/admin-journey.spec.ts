import { test, expect } from "@playwright/test";
import {
  ADMIN_CREDENTIALS,
  signInAsAdmin,
  signInAsStandardUser,
  signOutUser,
} from "./helpers/auth-helper";

// Ticket #24 / ADR 0007 / Spec 0001: Phase 1 — Admin Operations & RBAC Verification.
// Ticket #41: Server-side admin authorization boundary.

test.describe("Phase 1: Admin Operations & RBAC", () => {
  test.beforeEach(async ({ page }) => {
    await signOutUser(page);
  });

  test("anonymous visitor to /admin sees 401 Unauthorized and API returns 401", async ({ page }) => {
    await page.goto("/admin");

    // Server-rendered unauthorized screen (no dashboard content)
    await expect(page.getByRole("heading", { name: "401 Unauthorized" })).toBeVisible();
    await expect(
      page.getByText("Access to the Administrator Operations Panel is restricted.")
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Sign In as Administrator" })
    ).toBeVisible();

    // Dashboard content must NOT be present (server-side boundary prevents rendering)
    await expect(page.getByRole("heading", { name: "System Administration" })).not.toBeVisible();
    await expect(page.getByText("Admin Console")).not.toBeVisible();

    // API boundary returns proper 401 status
    const apiRes = await page.request.fetch("/api/admin/users");
    expect(apiRes.status()).toBe(401);
  });

  test("non-admin user to /admin sees 403 Forbidden and API returns 403", async ({ page }) => {
    await signInAsStandardUser(page);
    await page.goto("/admin");

    // Server-rendered forbidden screen
    await expect(page.getByRole("heading", { name: "403 Forbidden" })).toBeVisible();
    await expect(
      page.getByText("Access to the Administrator Operations Panel is restricted.")
    ).toBeVisible();

    // Dashboard content must NOT be present
    await expect(page.getByRole("heading", { name: "System Administration" })).not.toBeVisible();

    // API boundary returns proper 403 status
    const apiRes = await page.request.fetch("/api/admin/users");
    expect(apiRes.status()).toBe(403);
  });

  test("admin session accesses /admin, views tabs, inspects users and tasks", async ({
    page,
  }, testInfo) => {
    await signInAsAdmin(page);
    await page.goto("/admin");

    // Header assertions — admin dashboard renders immediately (no flicker)
    await expect(
      page.getByRole("heading", { name: "System Administration" })
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Admin Console")).toBeVisible();
    // The signed-in email block is intentionally hidden below `sm` (admin
    // header collapses), so only assert it on desktop runs.
    if (testInfo.project.name === "chromium-desktop") {
      await expect(page.getByText(ADMIN_CREDENTIALS.email).first()).toBeVisible();
    }

    // API boundary returns 200 for admin session
    const apiRes = await page.request.fetch("/api/admin/users");
    expect(apiRes.status()).toBe(200);

    // Tab 1: User Management Table
    await expect(page.getByRole("button", { name: /User Management/ })).toBeVisible();
    await expect(page.getByText("User", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Adjust Credits").first()).toBeVisible();

    // Tab 2: AI Task Monitor
    await page.getByRole("button", { name: /AI Task Monitor/ }).click();
    await expect(page.getByLabel("Scene:")).toBeVisible();
    await expect(page.getByLabel("Status:")).toBeVisible();

    // Tab 3: Provider Health Check
    const healthTab = page.getByRole("button", { name: /Provider Health Check/ });
    await healthTab.scrollIntoViewIfNeeded();
    await healthTab.click();
    await expect(
      page.getByRole("heading", { name: "AI Provider Status" })
    ).toBeVisible();

    // Trigger Health Check
    const healthCheckBtn = page.getByRole("button", { name: /Health Check/ });
    await expect(healthCheckBtn).toBeVisible();
    await healthCheckBtn.click();

    // Health check results card
    await expect(
      page.getByText(/Healthy \(200 OK\)|Unhealthy \(Failed\)/)
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Round-Trip Latency")).toBeVisible();
    await expect(page.getByText("Endpoint")).toBeVisible();
  });

  test("admin can adjust user credits via modal", async ({ page }) => {
    await signInAsAdmin(page);
    await page.goto("/admin");

    await expect(
      page.getByRole("heading", { name: "System Administration" })
    ).toBeVisible({ timeout: 15_000 });

    // Wait for user management table to load
    const adjustBtn = page.getByRole("button", { name: "Adjust Credits" }).first();
    await expect(adjustBtn).toBeVisible({ timeout: 15_000 });

    // Open Credit Adjustment modal
    await adjustBtn.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("heading", { name: "Adjust User Credits" })
    ).toBeVisible();

    // Set amount and reason
    const amountInput = dialog.locator("#credit-amount-input");
    await amountInput.fill("250");

    const reasonInput = dialog.locator("#credit-reason-input");
    await reasonInput.fill("Automated E2E Credit Grant Test");

    // Submit form
    await dialog.getByRole("button", { name: "Confirm Adjustment" }).click();

    // Verification: Success feedback in modal
    await expect(
      dialog.getByText(/Successfully granted 250 credits/i)
    ).toBeVisible({ timeout: 10_000 });
  });
});
