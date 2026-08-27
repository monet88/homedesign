import { test, expect } from "@playwright/test";

// Ticket #17 — Use-style wiring + Preview modal on catalog cards.

test("Preview style opens the card gallery image on the landing page", async ({
  page,
}) => {
  await page.goto("/#popular-styles");

  const card = page.locator("#popular-styles .card").filter({ hasText: "Modern Warm" });
  await card.getByRole("button", { name: "Preview style" }).click();

  const dialog = page.getByRole("dialog", { name: "Preview: Modern Warm" });
  await expect(dialog).toBeVisible();

  const previewImage = dialog.getByTestId("catalog-preview-image");
  await expect(previewImage).toBeVisible();
  await expect(previewImage).toHaveAttribute("src", /hero-room-light\.webp/);
});

test("Use style on interior card applies preset and routes to interior flow", async ({
  page,
}) => {
  await page.goto("/#popular-styles");

  const card = page.locator("#popular-styles .card").filter({ hasText: "Japandi" });
  await card.getByRole("link", { name: "Use style" }).click();

  await expect(page).toHaveURL(/\/ai-interior-design\?style=Japandi/);
  await expect(page.getByRole("heading", { name: "AI Interior Design" })).toBeVisible();

  const styleSelect = page.locator("select").nth(1);
  await expect(styleSelect).toHaveValue("Japandi");

  await expect(
    page.getByRole("button", { name: "Full Redesign", exact: true })
  ).toHaveAttribute("aria-pressed", "true");
});

test("Try this look on exterior card applies area preset and routes to exterior flow", async ({
  page,
}) => {
  await page.goto("/ai-exterior-design#ideas");

  const card = page.locator("#ideas .card").filter({ hasText: "Front Porch" });
  await card.getByRole("link", { name: "Try this look" }).click();

  await expect(page).toHaveURL(/\/ai-exterior-design\?area=Front\+Porch/);

  const areaSelect = page.getByLabel("Area");
  await expect(areaSelect).toHaveValue("Front Porch");

  await expect(
    page.getByRole("button", { name: "Full Redesign", exact: true })
  ).toHaveAttribute("aria-pressed", "true");
});

test("Preview area idea opens the exterior card image", async ({ page }) => {
  await page.goto("/ai-exterior-design#popular-styles");

  const card = page
    .locator("#popular-styles .card")
    .filter({ hasText: "Modern Farmhouse" });
  await card.getByRole("button", { name: "Preview area idea" }).click();

  const dialog = page.getByRole("dialog", { name: "Preview: Modern Farmhouse" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId("catalog-preview-image")).toHaveAttribute(
    "src",
    /ai-exterior-design-poster\.webp/
  );
});
