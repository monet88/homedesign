import { describe, it, expect, vi, beforeEach } from "vitest";
import { createBatchRenderJob, getBatchRenderJob, listBatchRenderJobs, MAX_BATCH_ITEMS } from "./batch-service";
import type { Env } from "@/lib/bindings";

vi.mock("@/lib/ai/task-lifecycle", () => ({
  createTaskWithHold: vi.fn(),
}));

vi.mock("@/lib/credits/ledger", () => ({
  getAvailableCredits: vi.fn(),
  getWorkspaceAvailableCredits: vi.fn(),
}));

vi.mock("@/lib/audit/audit-logger", () => ({
  recordWorkspaceAuditLog: vi.fn(),
}));

import { createTaskWithHold } from "@/lib/ai/task-lifecycle";
import { getAvailableCredits, getWorkspaceAvailableCredits } from "@/lib/credits/ledger";

describe("Batch AI Rendering Service (Sprint 9 - Ticket 9.2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("enforces maximum 8 items limit per batch", async () => {
    const fakeEnv = {} as Env;
    const items = Array(9).fill({
      scene: "interior",
      roomType: "Phòng ngủ",
      prompt: "Modern style",
    });

    await expect(
      createBatchRenderJob(fakeEnv, {
        userId: "user-1",
        name: "Căn hộ 9 phòng",
        items,
      })
    ).rejects.toThrow("BATCH_MAX_ITEMS_EXCEEDED");
  });

  it("enforces non-empty items array", async () => {
    const fakeEnv = {} as Env;
    await expect(
      createBatchRenderJob(fakeEnv, {
        userId: "user-1",
        name: "Căn hộ trống",
        items: [],
      })
    ).rejects.toThrow("BATCH_EMPTY_ITEMS");
  });

  it("checks credit balance preflight and rejects if insufficient", async () => {
    vi.mocked(getAvailableCredits).mockResolvedValue(2); // Only 2 credits available

    const fakeEnv = {} as Env;
    const items = Array(4).fill({
      scene: "interior",
      roomType: "Phòng khách",
      prompt: "Scandinavian",
    });

    await expect(
      createBatchRenderJob(fakeEnv, {
        userId: "user-1",
        name: "Căn hộ 4 phòng",
        items,
      })
    ).rejects.toThrow("INSUFFICIENT_CREDITS");
  });

  it("creates batch job and links sub-tasks atomically with fal provider by default", async () => {
    vi.mocked(getAvailableCredits).mockResolvedValue(10);
    vi.mocked(createTaskWithHold).mockResolvedValue({
      taskId: "task-child-1",
      cached: false,
    });

    const runMock = vi.fn().mockResolvedValue({ success: true });
    const bindMock = vi.fn().mockReturnValue({ run: runMock });
    const prepareMock = vi.fn().mockReturnValue({ bind: bindMock });

    const fakeEnv = {
      DB: { prepare: prepareMock },
    } as unknown as Env;

    const items = [
      { scene: "interior", roomType: "Phòng khách", prompt: "Warm Scandinavian" },
      { scene: "interior", roomType: "Phòng ngủ Master", prompt: "Minimalist Japandi" },
      { scene: "interior", roomType: "Bếp - Ăn", prompt: "Modern Luxury Marble" },
    ];

    const result = await createBatchRenderJob(fakeEnv, {
      userId: "user-1",
      name: "Căn hộ Vinhomes 3PN",
      items,
    });

    expect(result.totalItems).toBe(3);
    expect(result.status).toBe("processing");
    expect(result.items).toHaveLength(3);
    expect(createTaskWithHold).toHaveBeenCalledTimes(3);
    expect(prepareMock).toHaveBeenCalled();
  });

  it("rejects workspace batch job if user is not a member", async () => {
    const firstMock = vi.fn().mockResolvedValue(null); // Not a member
    const bindMock = vi.fn().mockReturnValue({ first: firstMock });
    const prepareMock = vi.fn().mockReturnValue({ bind: bindMock });

    const fakeEnv = {
      DB: { prepare: prepareMock },
    } as unknown as Env;

    await expect(
      createBatchRenderJob(fakeEnv, {
        userId: "user-1",
        workspaceId: "ws-secret",
        name: "Batch Test",
        items: [{ scene: "interior", roomType: "Phòng khách", prompt: "Test" }],
      })
    ).rejects.toThrow("FORBIDDEN");
  });

  it("rejects workspace batch job if user role is viewer", async () => {
    const firstMock = vi.fn().mockResolvedValue({ role: "viewer" });
    const bindMock = vi.fn().mockReturnValue({ first: firstMock });
    const prepareMock = vi.fn().mockReturnValue({ bind: bindMock });

    const fakeEnv = {
      DB: { prepare: prepareMock },
    } as unknown as Env;

    await expect(
      createBatchRenderJob(fakeEnv, {
        userId: "user-1",
        workspaceId: "ws-secret",
        name: "Batch Test",
        items: [{ scene: "interior", roomType: "Phòng khách", prompt: "Test" }],
      })
    ).rejects.toThrow("ROLE_CANNOT_GENERATE");
  });

  it("listBatchRenderJobs returns empty array if user is not in workspace", async () => {
    const firstMock = vi.fn().mockResolvedValue(null); // Not a member
    const bindMock = vi.fn().mockReturnValue({ first: firstMock });
    const prepareMock = vi.fn().mockReturnValue({ bind: bindMock });

    const fakeEnv = {
      DB: { prepare: prepareMock },
    } as unknown as Env;

    const jobs = await listBatchRenderJobs(fakeEnv, "user-1", "ws-other");
    expect(jobs).toEqual([]);
  });
});
