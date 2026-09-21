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
  createBatchPanoramaTour: vi.fn(),
}));

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { authorizeVerified, readJson } from "@/lib/ai/http";
import { createBatchPanoramaTour } from "@/lib/panorama/batch-panorama";

describe("AI Batch Panorama API Route (POST /api/ai/batch-panorama)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects unauthenticated requests with 401", async () => {
    vi.mocked(authorizeVerified).mockResolvedValue(
      Response.json({ error: "UNAUTHORIZED" }, { status: 401 }) as any
    );

    const req = new Request("http://localhost/api/ai/batch-panorama", { method: "POST" });
    const res = await POST(req);

    expect(res.status).toBe(401);
  });

  it("validates missing tour title with 400", async () => {
    vi.mocked(authorizeVerified).mockResolvedValue({ userId: "user-1", env: {} } as any);
    vi.mocked(getCloudflareContext).mockResolvedValue({ env: {} } as any);
    vi.mocked(readJson).mockResolvedValue({ tourTitle: "   ", rooms: [{ name: "Living", roomType: "living" }] } as any);

    const req = new Request("http://localhost/api/ai/batch-panorama", { method: "POST" });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.error).toBe("INVALID_TITLE");
  });

  it("validates empty rooms list with 400", async () => {
    vi.mocked(authorizeVerified).mockResolvedValue({ userId: "user-1", env: {} } as any);
    vi.mocked(getCloudflareContext).mockResolvedValue({ env: {} } as any);
    vi.mocked(readJson).mockResolvedValue({ tourTitle: "Sky Villa", rooms: [] } as any);

    const req = new Request("http://localhost/api/ai/batch-panorama", { method: "POST" });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.error).toBe("INVALID_ROOMS");
  });

  it("handles INSUFFICIENT_CREDITS with 402 payment required", async () => {
    vi.mocked(authorizeVerified).mockResolvedValue({ userId: "user-1", env: {} } as any);
    vi.mocked(getCloudflareContext).mockResolvedValue({ env: {} } as any);
    vi.mocked(readJson).mockResolvedValue({
      tourTitle: "Sky Villa",
      rooms: [{ name: "Living", roomType: "living" }],
    } as any);
    vi.mocked(createBatchPanoramaTour).mockRejectedValue(new Error("INSUFFICIENT_CREDITS"));

    const req = new Request("http://localhost/api/ai/batch-panorama", { method: "POST" });
    const res = await POST(req);

    expect(res.status).toBe(402);
    const body = (await res.json()) as any;
    expect(body.error).toBe("INSUFFICIENT_CREDITS");
  });

  it("successfully initiates batch panorama tour generation with 200", async () => {
    vi.mocked(authorizeVerified).mockResolvedValue({ userId: "user-1", env: {} } as any);
    vi.mocked(getCloudflareContext).mockResolvedValue({ env: {} } as any);
    vi.mocked(readJson).mockResolvedValue({
      tourTitle: "Penthouse Horizon",
      style: "Modern Luxury",
      rooms: [
        { name: "Phòng Khách", roomType: "living" },
        { name: "Phòng Ngủ", roomType: "bedroom" },
      ],
    } as any);

    vi.mocked(createBatchPanoramaTour).mockResolvedValue({
      tour: { id: "tour-123", shareToken: "token123" } as any,
      batchJobId: "batch-456",
      totalCreditsCost: 2,
      tasksCount: 2,
    });

    const req = new Request("http://localhost/api/ai/batch-panorama", { method: "POST" });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.code).toBe(0);
    expect(body.data.tour.id).toBe("tour-123");
    expect(body.data.batchJobId).toBe("batch-456");
    expect(body.data.totalCreditsCost).toBe(2);
  });

  it("returns 403 when user is not a member of the workspace", async () => {
    vi.mocked(authorizeVerified).mockResolvedValue({ userId: "user-1", env: {} } as any);
    vi.mocked(getCloudflareContext).mockResolvedValue({ env: {} } as any);
    vi.mocked(readJson).mockResolvedValue({
      tourTitle: "Penthouse",
      workspaceId: "ws-forbidden",
      rooms: [{ name: "Khách", roomType: "living" }],
    } as any);

    vi.mocked(createBatchPanoramaTour).mockRejectedValue(new Error("FORBIDDEN: Not a member of this workspace"));

    const req = new Request("http://localhost/api/ai/batch-panorama", { method: "POST" });
    const res = await POST(req);

    expect(res.status).toBe(403);
    const body = (await res.json()) as any;
    expect(body.error).toBe("FORBIDDEN");
  });

  it("returns 403 when user role is viewer", async () => {
    vi.mocked(authorizeVerified).mockResolvedValue({ userId: "user-1", env: {} } as any);
    vi.mocked(getCloudflareContext).mockResolvedValue({ env: {} } as any);
    vi.mocked(readJson).mockResolvedValue({
      tourTitle: "Penthouse",
      workspaceId: "ws-viewer",
      rooms: [{ name: "Khách", roomType: "living" }],
    } as any);

    vi.mocked(createBatchPanoramaTour).mockRejectedValue(new Error("ROLE_CANNOT_GENERATE: Viewers cannot create"));

    const req = new Request("http://localhost/api/ai/batch-panorama", { method: "POST" });
    const res = await POST(req);

    expect(res.status).toBe(403);
    const body = (await res.json()) as any;
    expect(body.error).toBe("ROLE_CANNOT_GENERATE");
  });

  it("rejects unauthorized provider not in allowlist (HTTP 400)", async () => {
    vi.mocked(authorizeVerified).mockResolvedValue({ userId: "user-1", env: {} } as any);
    vi.mocked(getCloudflareContext).mockResolvedValue({ env: {} } as any);
    vi.mocked(readJson).mockResolvedValue({
      tourTitle: "Penthouse",
      provider: "untrusted_external_exploit",
      rooms: [{ name: "Khách", roomType: "living" }],
    } as any);

    const req = new Request("http://localhost/api/ai/batch-panorama", { method: "POST" });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.error).toBe("INVALID_PROVIDER");
  });
});

