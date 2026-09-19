import { test, expect } from "@playwright/test";

// Ticket #09 & Ticket 3.4: anonymous share view, interactive before/after, unlisted read-only policy.

test("share page loads without login", async ({ request, page }) => {
  const fixture = await request.post("/api/test/share-fixture");
  expect(fixture.ok()).toBeTruthy();
  const { token } = (await fixture.json()) as { token: string };

  await page.goto(`/share/${encodeURIComponent(token)}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText(/Design/i).first()).toBeVisible();
});

test("share view shows unlisted read-only notice and viral CTA", async ({ request, page }) => {
  const fixture = await request.post("/api/test/share-fixture");
  const { token } = (await fixture.json()) as { token: string };

  await page.goto(`/share/${encodeURIComponent(token)}`);

  await expect(page.getByText(/Bản xem chia sẻ bảo mật/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /Sao chép link/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /Tự thiết kế phòng của bạn/i })).toBeVisible();
});
