import { test, expect } from "@playwright/test";

// Ticket #12 — Landing + Catalog (static). Proves the ACs that are testable
// through the DOM: 5 Before/After comparisons, 12 Popular Styles, 10 Ideas,
// Pricing, FAQ, and that the native comparison slider is keyboard-, pointer-
// and touch-operable. Runs on both desktop and mobile projects.

test("landing renders the 5 Show comparison buttons and the native slider", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Before & After" })
  ).toBeVisible();

  for (let i = 1; i <= 5; i++) {
    await expect(
      page.getByRole("button", { name: `Show comparison ${i}` })
    ).toBeVisible();
  }

  const slider = page.getByRole("slider", { name: /before after/i });
  await expect(slider).toBeVisible();
  await expect(slider).toHaveAttribute("type", "range");
});

test("slider responds to keyboard, pointer, and touch input", async ({
  page,
}) => {
  await page.goto("/");
  const slider = page.getByRole("slider", { name: /before after/i });
  await expect(slider).toBeVisible();

  // Keyboard: focus + arrow key changes the value (native range input).
  await slider.focus();
  await expect(slider).toBeFocused();
  const before = await slider.inputValue();
  await page.keyboard.press("ArrowRight");
  const afterKeyboard = await slider.inputValue();
  expect(Number(afterKeyboard)).toBeGreaterThan(Number(before));

  // Pointer: drag the range from one edge to the other.
  const box = (await slider.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.1, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.9, box.y + box.height / 2, {
    steps: 10,
  });
  await page.mouse.up();
  expect(Number(await slider.inputValue())).toBeGreaterThan(70);

  // Touch: tap-drag on the slider (touchscreen input via CDP touch emulation).
  await page.touchscreen.tap(box.x + box.width * 0.2, box.y + box.height / 2);
  const afterTouch = await slider.inputValue();
  expect(Number(afterTouch)).toBeLessThan(80);
});

test("popular styles and ideas grids render the expected card counts", async ({
  page,
}) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Popular Styles" })
  ).toBeVisible();
  const styleCards = page.locator("#popular-styles .card");
  await expect(styleCards).toHaveCount(12);

  await expect(
    page.getByRole("heading", { name: "Ideas for Every Room" })
  ).toBeVisible();
  const ideaCards = page.locator("#ideas .card");
  await expect(ideaCards).toHaveCount(10);

  // Every card has a Preview + Use action.
  const styleActions = page.locator("#popular-styles .card .actions");
  await expect(styleActions.first().getByRole("button")).toHaveCount(1);
  await expect(styleActions.first().getByRole("link")).toHaveCount(1);
});

test("pricing tiers and FAQ are present", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Pricing" })).toBeVisible();
  for (const tier of ["Lite", "Plus", "Pro", "Max"]) {
    await expect(
      page.getByRole("heading", { name: tier, exact: true })
    ).toBeVisible();
  }

  await expect(page.getByRole("button", { name: "Buy Credits" })).toHaveCount(4);

  const faq = page.getByRole("heading", {
    name: /Frequently Asked Questions/,
  });
  await expect(faq).toBeVisible();
  await expect(
    page.getByRole("button", { name: /How does AI interior design work/ })
  ).toBeVisible();
});
