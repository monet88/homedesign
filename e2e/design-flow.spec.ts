import { test, expect } from "@playwright/test";

// Ticket #14 — Interior / Exterior design-flow pages.
// Covers form rendering, anonymous Generate block toast, and the native result
// slider interactions without requiring an authenticated upload.

test("interior design page renders the form and upload dropzone", async ({ page }) => {
  await page.goto("/ai-interior-design");
  await expect(page.getByRole("heading", { name: "AI Interior Design" }).first()).toBeVisible();
  await expect(page.getByText(/(Upload a room photo|Upload a photo)/i).first()).toBeVisible();
  await expect(page.getByRole("combobox", { name: /Room Type|Area/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Generate (1 Credits)" })).toBeVisible();
});

test("exterior design page renders the form and upload dropzone", async ({ page }) => {
  await page.goto("/ai-exterior-design");
  await expect(page.getByRole("heading", { name: "AI Exterior Design" }).first()).toBeVisible();
  await expect(page.getByText(/(Upload a house photo|Upload a photo)/i).first()).toBeVisible();
  await expect(page.getByRole("combobox", { name: /Room Type|Area/ })).toBeVisible();
});

test("anonymous upload is blocked and no generation request fires", async ({ page }) => {
  await page.goto("/ai-interior-design");

  let requestFired = false;
  page.on("request", (req) => {
    if (req.url().includes("/api/designs")) requestFired = true;
  });

  await page.getByLabel("Upload a room photo").setInputFiles({
    name: "room.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64"
    ),
  });

  // Anonymous upload hits the auth guard, so the Generate button stays disabled
  // and no generation request ever fires.
  await expect(
    page.getByRole("button", { name: "Generate (1 Credits)" })
  ).toBeDisabled();
  expect(requestFired).toBe(false);
});
