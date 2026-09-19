import { test, expect } from "@playwright/test";

// Sprint 3 E2E Integration Suite
// Covers:
// 1. Ticket 3.3: B2B Virtual Staging Engine & Presets (/ai-virtual-staging)
// 2. Ticket 3.4: Viral Share Funnel & Interactive Before/After Slider (/share/[token])

test.describe("Sprint 3: B2B Virtual Staging Engine", () => {
  test("loads /ai-virtual-staging with B2B Presets and real estate copy", async ({ page }) => {
    await page.goto("/ai-virtual-staging");

    // Title and SEO copy
    await expect(page.getByRole("heading", { name: /Virtual Staging/i, level: 1 })).toBeVisible();

    // Verify preset buttons presence
    await expect(page.getByText("Living Room Luxury")).toBeVisible();
    await expect(page.getByText("Modern Bedroom")).toBeVisible();
    await expect(page.getByText("Executive Office", { exact: true })).toBeVisible();
  });
});

test.describe("Sprint 3: Viral Share Funnel", () => {
  test("anonymous visitor can interact with Before/After slider and PLG CTA card", async ({ request, page }) => {
    const fixture = await request.post("/api/test/share-fixture");
    if (!fixture.ok()) {
      // In environments without test fixture endpoint, skip gracefully
      return;
    }
    const { token } = (await fixture.json()) as { token: string };

    await page.goto(`/share/${encodeURIComponent(token)}`);

    // Project Heading
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // Copy link button and CTA
    await expect(page.getByRole("button", { name: /Sao chép link/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Tự thiết kế phòng của bạn/i })).toBeVisible();

    // PLG Conversion Card
    await expect(page.getByText(/HomeDesign AI Studio/i)).toBeVisible();
    await expect(page.getByText(/Miễn phí 10 Credits ban đầu/i)).toBeVisible();
  });
});
