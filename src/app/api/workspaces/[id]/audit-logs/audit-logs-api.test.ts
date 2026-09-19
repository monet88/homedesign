import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: vi.fn(),
}));

vi.mock("@/lib/ai/http", () => ({
  authorizeVerified: vi.fn(),
  designErrorResponse: vi.fn((err) =>
    Response.json({ error: "INTERNAL_ERROR", message: String(err) }, { status: 500 })
  ),
}));

vi.mock("@/lib/workspaces/workspaces", () => ({
  getWorkspace: vi.fn(),
}));

vi.mock("@/lib/audit/audit-logger", () => ({
  listWorkspaceAuditLogs: vi.fn(),
}));

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { authorizeVerified } from "@/lib/ai/http";
import { getWorkspace } from "@/lib/workspaces/workspaces";
import { listWorkspaceAuditLogs } from "@/lib/audit/audit-logger";

describe("GET /api/workspaces/[id]/audit-logs API (Sprint 9 - Ticket 9.1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects unauthenticated requests", async () => {
    vi.mocked(authorizeVerified).mockResolvedValue(
      Response.json({ error: "UNAUTHORIZED" }, { status: 401 }) as any
    );

    const req = new Request("http://localhost/api/workspaces/ws-1/audit-logs");
    const res = await GET(req, { params: Promise.resolve({ id: "ws-1" }) });

    expect(res.status).toBe(401);
  });

  it("forbids viewers from inspecting audit logs (HTTP 403)", async () => {
    vi.mocked(authorizeVerified).mockResolvedValue({
      userId: "user-viewer",
      env: {},
    } as any);

    vi.mocked(getCloudflareContext).mockResolvedValue({
      env: {},
    } as any);

    vi.mocked(getWorkspace).mockResolvedValue({
      id: "ws-1",
      name: "Acme Studio",
      role: "viewer",
    } as any);

    const req = new Request("http://localhost/api/workspaces/ws-1/audit-logs");
    const res = await GET(req, { params: Promise.resolve({ id: "ws-1" }) });

    expect(res.status).toBe(403);
    const body = (await res.json()) as any;
    expect(body.error).toBe("FORBIDDEN_VIEWER_ROLE");
  });

  it("allows owners to inspect audit logs and returns log entries (HTTP 200)", async () => {
    vi.mocked(authorizeVerified).mockResolvedValue({
      userId: "user-owner",
      env: {},
    } as any);

    vi.mocked(getCloudflareContext).mockResolvedValue({
      env: {},
    } as any);

    vi.mocked(getWorkspace).mockResolvedValue({
      id: "ws-1",
      name: "Acme Studio",
      role: "owner",
    } as any);

    vi.mocked(listWorkspaceAuditLogs).mockResolvedValue({
      logs: [
        {
          id: "log-1",
          workspaceId: "ws-1",
          actorId: "user-owner",
          action: "CREDIT_ALLOCATED",
          targetType: "credit",
          details: { amount: 100 },
          createdAt: 1000,
          actorName: "Owner Boss",
        },
      ],
      nextCursor: undefined,
    });

    const req = new Request("http://localhost/api/workspaces/ws-1/audit-logs?limit=10");
    const res = await GET(req, { params: Promise.resolve({ id: "ws-1" }) });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.code).toBe(0);
    expect(body.data.logs).toHaveLength(1);
    expect(body.data.logs[0].action).toBe("CREDIT_ALLOCATED");
    expect(listWorkspaceAuditLogs).toHaveBeenCalled();
  });
});
