import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: vi.fn(),
}));

vi.mock("@/lib/ai/http", () => ({
  authorizeVerified: vi.fn(),
  readJson: vi.fn(),
  designErrorResponse: vi.fn((err) =>
    Response.json({ error: "INTERNAL_ERROR", message: String(err) }, { status: 500 })
  ),
}));

vi.mock("@/lib/panorama/batch-panorama", () => ({
  autoLinkTourScenes: vi.fn(),
}));

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { authorizeVerified, readJson } from "@/lib/ai/http";
import { autoLinkTourScenes } from "@/lib/panorama/batch-panorama";

describe("Tour Auto-Link API Route (POST /api/tours/[id]/auto-link)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects unauthenticated requests with 401", async () => {
    vi.mocked(authorizeVerified).mockResolvedValue(
      Response.json({ error: "UNAUTHORIZED" }, { status: 401 }) as any
    );

    const req = new Request("http://localhost/api/tours/tour-1/auto-link", { method: "POST" });
    const res = await POST(req, { params: Promise.resolve({ id: "tour-1" }) });

    expect(res.status).toBe(401);
  });

  it("returns 400 when auto-link returns success: false", async () => {
    vi.mocked(authorizeVerified).mockResolvedValue({ userId: "user-1", env: {} } as any);
    vi.mocked(getCloudflareContext).mockResolvedValue({ env: { DB: {} } } as any);
    vi.mocked(readJson).mockResolvedValue({} as any);

    vi.mocked(autoLinkTourScenes).mockResolvedValue({
      success: false,
      linkedCount: 0,
      message: "Cần ít nhất 2 phòng để liên kết",
    });

    const req = new Request("http://localhost/api/tours/tour-1/auto-link", { method: "POST" });
    const res = await POST(req, { params: Promise.resolve({ id: "tour-1" }) });

    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.error).toBe("AUTO_LINK_FAILED");
  });

  it("returns 200 with linkedCount on success", async () => {
    vi.mocked(authorizeVerified).mockResolvedValue({ userId: "user-1", env: {} } as any);
    vi.mocked(getCloudflareContext).mockResolvedValue({ env: { DB: {} } } as any);
    vi.mocked(readJson).mockResolvedValue({ strategy: "hub_and_spoke" } as any);

    vi.mocked(autoLinkTourScenes).mockResolvedValue({
      success: true,
      linkedCount: 4,
    });

    const req = new Request("http://localhost/api/tours/tour-1/auto-link", { method: "POST" });
    const res = await POST(req, { params: Promise.resolve({ id: "tour-1" }) });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.code).toBe(0);
    expect(body.data.linkedCount).toBe(4);
  });
});
