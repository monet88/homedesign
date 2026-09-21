import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, PATCH } from "./route";

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

vi.mock("@/lib/branding/branding-service", () => ({
  getWorkspaceBranding: vi.fn(),
  updateWorkspaceBranding: vi.fn(),
}));

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { authorizeVerified, readJson } from "@/lib/ai/http";
import { getWorkspaceBranding, updateWorkspaceBranding } from "@/lib/branding/branding-service";

describe("Workspace Branding API Routes (Sprint 9 - Ticket 9.3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET rejects unauthenticated requests", async () => {
    vi.mocked(authorizeVerified).mockResolvedValue(
      Response.json({ error: "UNAUTHORIZED" }, { status: 401 }) as any
    );

    const req = new Request("http://localhost/api/workspaces/ws-1/branding");
    const res = await GET(req, { params: Promise.resolve({ id: "ws-1" }) });

    expect(res.status).toBe(401);
  });

  it("GET returns studio branding successfully (HTTP 200)", async () => {
    vi.mocked(authorizeVerified).mockResolvedValue({ userId: "user-1", env: {} } as any);
    vi.mocked(getCloudflareContext).mockResolvedValue({ env: {} } as any);
    vi.mocked(getWorkspaceBranding).mockResolvedValue({
      workspaceId: "ws-1",
      brandName: "Studio X",
      watermarkEnabled: true,
      watermarkPosition: "bottom-right",
    });

    const req = new Request("http://localhost/api/workspaces/ws-1/branding");
    const res = await GET(req, { params: Promise.resolve({ id: "ws-1" }) });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.code).toBe(0);
    expect(body.data.branding.brandName).toBe("Studio X");
  });

  it("PATCH updates studio branding for owner (HTTP 200)", async () => {
    vi.mocked(authorizeVerified).mockResolvedValue({ userId: "user-owner", env: {} } as any);
    vi.mocked(getCloudflareContext).mockResolvedValue({ env: {} } as any);
    vi.mocked(readJson).mockResolvedValue({
      brandName: "New Brand Name",
      contactPhone: "0911223344",
    } as any);

    vi.mocked(updateWorkspaceBranding).mockResolvedValue({
      workspaceId: "ws-1",
      brandName: "New Brand Name",
      contactPhone: "0911223344",
      watermarkEnabled: true,
      watermarkPosition: "bottom-right",
    });

    const req = new Request("http://localhost/api/workspaces/ws-1/branding", { method: "PATCH" });
    const res = await PATCH(req, { params: Promise.resolve({ id: "ws-1" }) });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.code).toBe(0);
    expect(body.data.branding.brandName).toBe("New Brand Name");
  });
});
