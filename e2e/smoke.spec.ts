import { test, expect, Page } from "@playwright/test";

// Playwright smoke (ticket 01 AC6): the Next.js app boots, serves the landing
// page, and renders at both baseline viewports. Visual baseline comparison is
// wired via testInfo snapshots; run with `--update-snapshots` to (re)baseline.

// Wait for fonts to settle so screenshots are deterministic.
async function settleFonts(page: Page) {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);
}

test("landing page boots at desktop viewport 1264x591", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "desktop project only");
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "HomeDesign Clone" })
  ).toBeVisible();
  expect(page.viewportSize()).toEqual({ width: 1264, height: 591 });
});

test("landing page boots at mobile viewport 390x844", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-mobile", "mobile project only");
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "HomeDesign Clone" })
  ).toBeVisible();
  expect(page.viewportSize()).toEqual({ width: 390, height: 844 });
});

test("landing page visual baseline matches (desktop)", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "desktop project only");
  await settleFonts(page);
  await expect(page).toHaveScreenshot("landing-desktop.png");
});

test("landing page visual baseline matches (mobile)", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-mobile", "mobile project only");
  await settleFonts(page);
  await expect(page).toHaveScreenshot("landing-mobile.png");
});
