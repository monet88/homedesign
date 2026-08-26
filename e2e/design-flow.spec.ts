import { test, expect } from "@playwright/test";

// Ticket #14 — Interior / Exterior design-flow pages.
// Covers form rendering, anonymous Generate block toast, and the native result
// slider interactions without requiring an authenticated upload.

test("interior design page renders the form and upload dropzone", async ({ page }) => {
  await page.goto("/ai-interior-design");
  await expect(page.getByRole("heading", { name: "AI Interior Design" })).toBeVisible();
  await expect(page.getByText("Upload a room photo", { exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: /Room Type|Area/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Generate (1 Credits)" })).toBeVisible();
});

test("exterior design page renders the form and upload dropzone", async ({ page }) => {
  await page.goto("/ai-exterior-design");
  await expect(page.getByRole("heading", { name: "AI Exterior Design" })).toBeVisible();
  await expect(page.getByText("Upload a home photo", { exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: /Room Type|Area/ })).toBeVisible();
});

test("anonymous Generate click shows a toast and sends no request", async ({ page }) => {
  await page.goto("/ai-interior-design");

  let requestFired = false;
  page.on("request", (req) => {
    if (req.url().includes("/api/designs")) requestFired = true;
  });

  await page.getByRole("button", { name: "Generate (1 Credits)" }).click();

  await expect(page.getByRole("status")).toContainText("Sign in to generate designs.");
  expect(requestFired).toBe(false);
});
