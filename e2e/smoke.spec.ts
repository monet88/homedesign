import { test, expect, Page } from "@playwright/test";

// Playwright smoke (ticket 01 AC6 + ticket 02 AC5): the Next.js app boots,
// serves the landing page, renders the application shell (header + footer +
// design tokens), and matches visual baselines at both viewports.
//
// Visual baseline comparison is wired via testInfo snapshots; run with
// `--update-snapshots` to (re)baseline. Baselines must show paper bg (#f6f0e4),
// ink text (#171411), header + footer (DESIGN.md).

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
    page.getByRole("heading", { name: "See your future home in minutes" })
  ).toBeVisible();
  expect(page.viewportSize()).toEqual({ width: 1264, height: 591 });
});

test("landing page boots at mobile viewport 390x844", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-mobile", "mobile project only");
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "See your future home in minutes" })
  ).toBeVisible();
  expect(page.viewportSize()).toEqual({ width: 390, height: 844 });
});

test("application shell renders header, footer, and token colors (desktop)", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "desktop project only");
  await page.goto("/");

  // Header: brand + nav anchors + anonymous Sign In.
  await expect(page.getByRole("banner")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "HomeDesign", exact: true }).first()
  ).toBeVisible();
  for (const label of ["Design Tools", "Before & After", "Pricing", "FAQ"]) {
    await expect(
      page.getByRole("link", { name: label, exact: true }).first()
    ).toBeVisible();
  }
  await expect(
    page.getByRole("link", { name: "Sign In", exact: true })
  ).toBeVisible();

  // Landing sections with the four anchors exist.
  for (const id of ["tools", "before-after", "pricing", "faq"]) {
    await expect(page.locator(`#${id}`)).toBeVisible();
  }

  // Footer: brand + 3 columns + legal links.
  await expect(page.getByRole("contentinfo")).toBeVisible();
  for (const col of ["Design Tools", "Resources", "About"]) {
    await expect(
      page.getByRole("navigation", { name: col })
    ).toBeVisible();
  }
  await expect(
    page.getByRole("link", { name: "Privacy Policy" })
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Terms of Service" })
  ).toBeVisible();

  // Design tokens (DESIGN.md §3): paper bg on body, ink text.
  const bodyBg = await page.evaluate(() =>
    getComputedStyle(document.body).backgroundColor
  );
  expect(bodyBg).toBe("rgb(246, 240, 228)"); // #f6f0e4 paper
  const h1Color = await page
    .getByRole("heading", { name: "See your future home in minutes" })
    .evaluate((el) => getComputedStyle(el).color);
  expect(h1Color).toBe("rgb(23, 20, 17)"); // #171411 ink
});

test("application shell renders header and footer on mobile (390x844)", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-mobile", "mobile project only");
  await page.goto("/");

  await expect(page.getByRole("banner")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Sign In", exact: true })
  ).toBeVisible();
  await expect(page.getByRole("contentinfo")).toBeVisible();

  // Mobile hides the nav link row (md:flex) but keeps the footer columns.
  await expect(
    page.getByRole("navigation", { name: "Design Tools" })
  ).toBeVisible();
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

test("projects page prompts anonymous users to sign in", async ({ page }) => {
  await page.goto("/projects");
  await expect(page.getByRole("heading", { name: "Sign in to view your projects" })).toBeVisible();
});
