import { test, expect } from "@playwright/test";

// Ticket #12 — Landing (static) post-refactor. Covers the Before/After slider
// (keyboard + pointer operable), the Interior/Exterior/Floor Plan tabs, Pricing
// tiers with Buy Credits actions, and FAQ. Popular styles/ideas grids live on
// the /ai-interior-design and /ai-exterior-design pages and are covered by
// catalog-wiring.spec.ts.

test("landing renders the Before/After showcase with tabs and native slider", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /(Curated Showcase Gallery|Before and After|Before & After)/i })
  ).toBeVisible();

  // Preview tabs
  for (const tab of ["Interior", "Exterior", "Floor Plan"]) {
    await expect(
      page.getByRole("tab", { name: tab, exact: true })
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

  // Pointer / Touch: wheel the slider into view first (it sits below the fold), then
  // interact with track.
  await slider.scrollIntoViewIfNeeded();
  const box = (await slider.boundingBox())!;
  if (page.viewportSize()?.width && page.viewportSize()!.width < 600) {
    // Touch: tap-drag on the slider (touchscreen input via CDP touch emulation).
    await page.touchscreen.tap(box.x + box.width * 0.2, box.y + box.height / 2);
    const afterTouch = await slider.inputValue();
    expect(Number(afterTouch)).toBeLessThanOrEqual(80);
  } else {
    await page.mouse.click(box.x + box.width * 0.9, box.y + box.height / 2);
    await expect(Number(await slider.inputValue())).toBeGreaterThan(70);

    // Touch: tap-drag on the slider (touchscreen input via CDP touch emulation).
    await page.touchscreen.tap(box.x + box.width * 0.2, box.y + box.height / 2);
    const afterTouch = await slider.inputValue();
    expect(Number(afterTouch)).toBeLessThan(80);
  }
});

test("landing renders design tool entry sections", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: /(Interior Styling from Any Room Photo|AI Interior Design From a Room Photo)/i })
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /(Exterior & Facade Visualization|AI Exterior Design From a House Photo)/i })
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /(2D Floor Plan to 3D Panorama|AI Floor Plan to 3D Rooms)/i })
  ).toBeVisible();

  // Each tool entry links to its design flow.
  const tools = page.locator("#tools");
  await expect(tools.getByRole("link", { name: /Launch Interior Studio|Try Interior Design|AI Interior Design|Interior Styling/i }).first()).toBeVisible();
  await expect(tools.getByRole("link", { name: /Launch Exterior Studio|Try Exterior Design|AI Exterior Design|Exterior & Facade/i }).first()).toBeVisible();
  await expect(tools.getByRole("link", { name: /Launch Floor Plan Studio|Try Floor|AI Floor Plan|2D Floor Plan/i }).first()).toBeVisible();
});

test("pricing tiers and FAQ are present", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: /(Flexible Credit Packages|Pricing)/i })).toBeVisible();
  for (const tier of ["Lite", "Plus", "Pro", "Max"]) {
    await expect(
      page.getByRole("heading", { name: tier, exact: true })
    ).toBeVisible();
  }

  await expect(page.getByRole("button", { name: /Buy Credits|Get Credits/i })).toHaveCount(4);

  const faq = page.getByRole("heading", {
    name: /Frequently Asked Questions/,
  });
  await expect(faq).toBeVisible();
  // FAQ items are <details>/<summary> rows, not buttons.
  await expect(page.locator("#faq summary").first()).toBeVisible();
  await expect(page.locator("#faq details").first()).toBeVisible();
});
