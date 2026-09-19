import { describe, it, expect, vi } from "vitest";
import { recordWorkspaceAuditLog, listWorkspaceAuditLogs } from "./audit-logger";
import type { Env } from "@/lib/bindings";

describe("Workspace Audit Logger (Sprint 9 - Ticket 9.1)", () => {
  it("records an audit log successfully and returns the generated ID", async () => {
    const runMock = vi.fn().mockResolvedValue({ success: true });
    const bindMock = vi.fn().mockReturnValue({ run: runMock });
    const prepareMock = vi.fn().mockReturnValue({ bind: bindMock });

    const fakeEnv = {
      DB: { prepare: prepareMock },
    } as unknown as Env;

    const logId = await recordWorkspaceAuditLog(fakeEnv, {
      workspaceId: "ws-123",
      actorId: "user-456",
      action: "CREDIT_ALLOCATED",
      targetType: "credit",
      targetId: "ledger-789",
      details: { amount: 50, note: "Top-up from owner" },
    });

    expect(logId).toBeTruthy();
    expect(typeof logId).toBe("string");
    expect(prepareMock).toHaveBeenCalled();
    expect(runMock).toHaveBeenCalled();
  });

  it("handles database errors gracefully without throwing (fail-safe)", async () => {
    const prepareMock = vi.fn().mockImplementation(() => {
      throw new Error("D1 database locked or unavailable");
    });

    const fakeEnv = {
      DB: { prepare: prepareMock },
    } as unknown as Env;

    const logId = await recordWorkspaceAuditLog(fakeEnv, {
      workspaceId: "ws-123",
      actorId: "user-456",
      action: "MEMBER_INVITED",
      targetType: "member",
      details: { email: "architect@agency.com" },
    });

    expect(logId).toBeNull();
  });

  it("queries and parses audit logs with user info and JSON details", async () => {
    const sampleRows = [
      {
        id: "log-1",
        workspace_id: "ws-123",
        actor_id: "user-1",
        action: "CREDIT_ALLOCATED",
        target_type: "credit",
        target_id: "tx-1",
        details: JSON.stringify({ amount: 100 }),
        created_at: 1000,
        actor_name: "Alice Architect",
        actor_email: "alice@agency.com",
        actor_image: null,
      },
      {
        id: "log-2",
        workspace_id: "ws-123",
        actor_id: "user-2",
        action: "RENDER_TRIGGERED",
        target_type: "task",
        target_id: "task-99",
        details: JSON.stringify({ room: "living-room", cost: 1 }),
        created_at: 900,
        actor_name: "Bob Builder",
        actor_email: "bob@agency.com",
        actor_image: "https://avatar.com/bob.png",
      },
    ];

    const allMock = vi.fn().mockResolvedValue({ results: sampleRows });
    const bindMock = vi.fn().mockReturnValue({ all: allMock });
    const prepareMock = vi.fn().mockReturnValue({ bind: bindMock });

    const fakeEnv = {
      DB: { prepare: prepareMock },
    } as unknown as Env;

    const result = await listWorkspaceAuditLogs(fakeEnv, "ws-123", { limit: 10 });

    expect(result.logs).toHaveLength(2);
    expect(result.logs[0].action).toBe("CREDIT_ALLOCATED");
    expect(result.logs[0].details).toEqual({ amount: 100 });
    expect(result.logs[0].actorName).toBe("Alice Architect");
    expect(result.logs[1].action).toBe("RENDER_TRIGGERED");
    expect(result.logs[1].actorEmail).toBe("bob@agency.com");
  });
});
