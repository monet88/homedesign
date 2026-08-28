import { test, expect } from "@playwright/test";

// Ticket #09 seam 4: anonymous share view, no download control, not-DRM disclaimer.

test("share page loads without login", async ({ request, page }) => {
  const fixture = await request.post("/api/test/share-fixture");
  expect(fixture.ok()).toBeTruthy();
  const { token } = (await fixture.json()) as { token: string };

  await page.goto(`/share/${encodeURIComponent(token)}`);
  await expect(page.getByRole("heading", { name: "Fixture Living Room" })).toBeVisible();
  await expect(page.getByText("Shared project")).toBeVisible();
});

test("share view shows not-DRM disclaimer and no download control", async ({ request, page }) => {
  const fixture = await request.post("/api/test/share-fixture");
  const { token } = (await fixture.json()) as { token: string };

  await page.goto(`/share/${encodeURIComponent(token)}`);

  await expect(page.getByRole("note", { name: "Sharing privacy notice" })).toContainText("not DRM");
  await expect(page.getByRole("note", { name: "Sharing privacy notice" })).toContainText("screenshot");

  await expect(page.getByRole("link", { name: /download/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /download/i })).toHaveCount(0);
});
