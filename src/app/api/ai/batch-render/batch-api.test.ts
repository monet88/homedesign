import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST, GET } from "./route";

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

vi.mock("@/lib/batch/batch-service", () => ({
  MAX_BATCH_ITEMS: 8,
  createBatchRenderJob: vi.fn(),
  listBatchRenderJobs: vi.fn(),
}));

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { authorizeVerified, readJson } from "@/lib/ai/http";
import { createBatchRenderJob, listBatchRenderJobs } from "@/lib/batch/batch-service";

describe("Batch Render API Routes (Sprint 9 - Ticket 9.2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects unauthenticated requests", async () => {
    vi.mocked(authorizeVerified).mockResolvedValue(
      Response.json({ error: "UNAUTHORIZED" }, { status: 401 }) as any
    );

    const req = new Request("http://localhost/api/ai/batch-render", { method: "POST" });
    const res = await POST(req);

    expect(res.status).toBe(401);
  });

  it("validates empty items payload (HTTP 400)", async () => {
    vi.mocked(authorizeVerified).mockResolvedValue({ userId: "user-1", env: {} } as any);
    vi.mocked(getCloudflareContext).mockResolvedValue({ env: {} } as any);
    vi.mocked(readJson).mockResolvedValue({ items: [] } as any);

    const req = new Request("http://localhost/api/ai/batch-render", { method: "POST" });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.error).toBe("INVALID_ITEMS");
  });

  it("creates batch job successfully (HTTP 200)", async () => {
    vi.mocked(authorizeVerified).mockResolvedValue({ userId: "user-1", env: {} } as any);
    vi.mocked(getCloudflareContext).mockResolvedValue({ env: {} } as any);
    vi.mocked(readJson).mockResolvedValue({
      name: "Căn hộ 3 phòng",
      items: [
        { scene: "interior", roomType: "Phòng khách", prompt: "Warm woods" },
        { scene: "interior", roomType: "Phòng ngủ", prompt: "Minimalist" },
      ],
    } as any);

    vi.mocked(createBatchRenderJob).mockResolvedValue({
      id: "batch-123",
      userId: "user-1",
      name: "Căn hộ 3 phòng",
      status: "processing",
      totalItems: 2,
      completedItems: 0,
      failedItems: 0,
      totalCreditsCost: 2,
      createdAt: 1000,
      updatedAt: 1000,
    });

    const req = new Request("http://localhost/api/ai/batch-render", { method: "POST" });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.code).toBe(0);
    expect(body.data.batch.id).toBe("batch-123");
    expect(createBatchRenderJob).toHaveBeenCalled();
  });

  it("returns 403 when user is not a member of the workspace", async () => {
    vi.mocked(authorizeVerified).mockResolvedValue({ userId: "user-1", env: {} } as any);
    vi.mocked(getCloudflareContext).mockResolvedValue({ env: {} } as any);
    vi.mocked(readJson).mockResolvedValue({
      workspaceId: "ws-forbidden",
      items: [{ scene: "interior", prompt: "Modern" }],
    } as any);

    vi.mocked(createBatchRenderJob).mockRejectedValue(new Error("FORBIDDEN: Not a member of this workspace"));

    const req = new Request("http://localhost/api/ai/batch-render", { method: "POST" });
    const res = await POST(req);

    expect(res.status).toBe(403);
    const body = (await res.json()) as any;
    expect(body.error).toBe("FORBIDDEN");
  });

  it("returns 403 when user role is viewer", async () => {
    vi.mocked(authorizeVerified).mockResolvedValue({ userId: "user-1", env: {} } as any);
    vi.mocked(getCloudflareContext).mockResolvedValue({ env: {} } as any);
    vi.mocked(readJson).mockResolvedValue({
      workspaceId: "ws-viewer",
      items: [{ scene: "interior", prompt: "Modern" }],
    } as any);

    vi.mocked(createBatchRenderJob).mockRejectedValue(new Error("ROLE_CANNOT_GENERATE: Viewers cannot create"));

    const req = new Request("http://localhost/api/ai/batch-render", { method: "POST" });
    const res = await POST(req);

    expect(res.status).toBe(403);
    const body = (await res.json()) as any;
    expect(body.error).toBe("ROLE_CANNOT_GENERATE");
  });

  it("rejects unauthorized provider not in allowlist (HTTP 400)", async () => {
    vi.mocked(authorizeVerified).mockResolvedValue({ userId: "user-1", env: {} } as any);
    vi.mocked(getCloudflareContext).mockResolvedValue({ env: {} } as any);
    vi.mocked(readJson).mockResolvedValue({
      provider: "untrusted_external_exploit",
      items: [{ scene: "interior", prompt: "Modern" }],
    } as any);

    const req = new Request("http://localhost/api/ai/batch-render", { method: "POST" });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.error).toBe("INVALID_PROVIDER");
  });
});

