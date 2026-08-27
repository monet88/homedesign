import { test, expect } from "@playwright/test";
import {
  ADMIN_CREDENTIALS,
  signInAsAdmin,
  signInAsStandardUser,
  signOutUser,
} from "./helpers/auth-helper";

// Ticket #24 / ADR 0007 / Spec 0001: Phase 1 — Admin Operations & RBAC Verification.

test.describe("Phase 1: Admin Operations & RBAC", () => {
  test.beforeEach(async ({ page }) => {
    await signOutUser(page);
  });

  test("anonymous visitor to /admin sees 403 Forbidden", async ({ page }) => {
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "403 Forbidden" })).toBeVisible();
    await expect(
      page.getByText("Access to the Administrator Operations Panel is restricted.")
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Sign In as Administrator" })
    ).toBeVisible();
  });

  test("non-admin user to /admin sees 403 Forbidden", async ({ page }) => {
    await signInAsStandardUser(page);
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "403 Forbidden" })).toBeVisible();
    await expect(
      page.getByText("Access to the Administrator Operations Panel is restricted.")
    ).toBeVisible();
  });

  test("admin session accesses /admin, views tabs, inspects users and tasks", async ({
    page,
  }) => {
    await signInAsAdmin(page);
    await page.goto("/admin");

    // Header assertions
    await expect(
      page.getByRole("heading", { name: "System Administration" })
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Admin Console")).toBeVisible();
    await expect(page.getByText(ADMIN_CREDENTIALS.email)).toBeVisible();

    // Tab 1: User Management Table
    await expect(page.getByRole("button", { name: /User Management/ })).toBeVisible();
    await expect(page.getByText("admin", { exact: true }).first()).toBeVisible();

    // Tab 2: AI Task Monitor
    await page.getByRole("button", { name: /AI Task Monitor/ }).click();
    await expect(page.getByLabel("Scene:")).toBeVisible();
    await expect(page.getByLabel("Status:")).toBeVisible();

    // Tab 3: Provider Health Check
    await page.getByRole("button", { name: /Provider Health Check/ }).click();
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
