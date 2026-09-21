import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildBatchPanoramaPrompt,
  autoLinkTourScenes,
  createBatchPanoramaTour,
} from "./batch-panorama";
import type { PanoramaTour, PanoramaScene } from "./types";
import * as tourService from "./tour-service";
import * as ledger from "@/lib/credits/ledger";
import * as taskLifecycle from "@/lib/ai/task-lifecycle";
import * as auditLogger from "@/lib/audit/audit-logger";
import type { Env } from "@/lib/bindings";

vi.mock("./tour-service");
vi.mock("@/lib/credits/ledger");
vi.mock("@/lib/ai/task-lifecycle");
vi.mock("@/lib/audit/audit-logger");

describe("AI Batch Panorama & Auto-Link Engine (Sprint 11 - Ticket 11.1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("buildBatchPanoramaPrompt", () => {
    it("builds a full 2:1 equirectangular panoramic prompt with style and palette", () => {
      const prompt = buildBatchPanoramaPrompt(
        {
          name: "Phòng Khách Skyview",
          roomType: "living_room",
          customPrompt: "Sofa góc da Ý màu kem, view cửa kính kịch trần",
        },
        "Modern Luxury",
        "Gỗ óc chó & đá Calacatta Gold"
      );

      expect(prompt).toContain("Seamless 360° equirectangular spherical panorama");
      expect(prompt).toContain("Phòng Khách Skyview (living room)");
      expect(prompt).toContain("Architectural style: Modern Luxury");
      expect(prompt).toContain("Color palette and material finishes: Gỗ óc chó & đá Calacatta Gold");
      expect(prompt).toContain("Sofa góc da Ý màu kem");
      expect(prompt).toContain("Strict 2:1 ratio full spherical 360x180 equirectangular projection");
      expect(prompt).toContain("8K ultra-detailed photorealistic");
    });

    it("uses balanced default palette when not specified", () => {
      const prompt = buildBatchPanoramaPrompt(
        { name: "Phòng Bếp", roomType: "kitchen" },
        "Japandi Warm"
      );

      expect(prompt).toContain("Architectural style: Japandi Warm");
      expect(prompt).toContain("Color palette: Warm natural luxury tones");
    });
  });

  describe("autoLinkTourScenes", () => {
    it("returns error if tour has fewer than 2 scenes", async () => {
      const fakeDb = {} as D1Database;
      vi.mocked(tourService.getTourById).mockResolvedValue({
        id: "tour-1",
        userId: "user-1",
        title: "Single Room Tour",
        description: null,
        isPublic: true,
        shareToken: "token123",
        createdAt: 1000,
        updatedAt: 1000,
        workspaceId: null,
        projectId: null,
        firstSceneId: "scene-1",
        scenes: [{ id: "scene-1", name: "Phòng Khách" } as PanoramaScene],
      });

      const res = await autoLinkTourScenes(fakeDb, "tour-1", "user-1");
      expect(res.success).toBe(false);
      expect(res.linkedCount).toBe(0);
      expect(res.message).toContain("ít nhất 2 phòng");
    });

    it("rejects unauthorized user who is neither owner nor workspace member", async () => {
      const fakeDb = {
        prepare: vi.fn().mockReturnValue({
          bind: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue(null),
          }),
        }),
      } as unknown as D1Database;

      vi.mocked(tourService.getTourById).mockResolvedValue({
        id: "tour-ws-1",
        userId: "owner-user",
        title: "Workspace Tour",
        description: null,
        isPublic: true,
        shareToken: "token123",
        createdAt: 1000,
        updatedAt: 1000,
        workspaceId: "ws-100",
        projectId: null,
        firstSceneId: "scene-1",
        scenes: [
          { id: "scene-1", name: "Phòng 1" } as PanoramaScene,
          { id: "scene-2", name: "Phòng 2" } as PanoramaScene,
        ],
      });

      const res = await autoLinkTourScenes(fakeDb, "tour-ws-1", "stranger-user");
      expect(res.success).toBe(false);
      expect(res.message).toContain("không có quyền truy cập");
    });

    it("allows workspace member to auto-link scenes even if not direct owner", async () => {
      const runMock = vi.fn().mockResolvedValue({ success: true });
      const bindMock = vi.fn().mockReturnValue({ run: runMock });
      const firstMock = vi.fn().mockResolvedValue({ role: "member" });
      const prepareMock = vi.fn().mockImplementation((sql: string) => {
        if (sql.includes("workspace_members")) {
          return { bind: vi.fn().mockReturnValue({ first: firstMock }) };
        }
        return { bind: bindMock };
      });
      const fakeDb = { prepare: prepareMock } as unknown as D1Database;

      vi.mocked(tourService.getTourById).mockResolvedValue({
        id: "tour-ws-1",
        userId: "owner-user",
        title: "Workspace Tour",
        description: null,
        isPublic: true,
        shareToken: "token123",
        createdAt: 1000,
        updatedAt: 1000,
        workspaceId: "ws-100",
        projectId: null,
        firstSceneId: "scene-1",
        scenes: [
          { id: "s1", name: "Phòng 1", tourId: "tour-ws-1", assetId: "a1", initialYaw: 0, initialPitch: 0, initialHfov: 100, orderIndex: 0, createdAt: 1000 },
          { id: "s2", name: "Phòng 2", tourId: "tour-ws-1", assetId: "a2", initialYaw: 0, initialPitch: 0, initialHfov: 100, orderIndex: 1, createdAt: 1000 },
        ],
      });

      const res = await autoLinkTourScenes(fakeDb, "tour-ws-1", "colleague-user");
      expect(res.success).toBe(true);
      expect(res.linkedCount).toBe(2);
    });

    it("links hub scene (scene 0) bidirectionally with all other scenes (hub_and_spoke)", async () => {
      const scenes: PanoramaScene[] = [
        { id: "s-living", name: "Phòng Khách", tourId: "tour-1", assetId: "a1", initialYaw: 0, initialPitch: 0, initialHfov: 100, orderIndex: 0, createdAt: 1000 },
        { id: "s-kitchen", name: "Bếp & Bàn Ăn", tourId: "tour-1", assetId: "a2", initialYaw: 0, initialPitch: 0, initialHfov: 100, orderIndex: 1, createdAt: 1000 },
        { id: "s-bed", name: "Phòng Ngủ Master", tourId: "tour-1", assetId: "a3", initialYaw: 0, initialPitch: 0, initialHfov: 100, orderIndex: 2, createdAt: 1000 },
      ];

      vi.mocked(tourService.getTourById).mockResolvedValue({
        id: "tour-1",
        userId: "user-1",
        title: "Penthouse 360",
        description: null,
        isPublic: true,
        shareToken: "token123",
        createdAt: 1000,
        updatedAt: 1000,
        workspaceId: null,
        projectId: null,
        firstSceneId: "s-living",
        scenes,
      });

      const runMock = vi.fn().mockResolvedValue({ success: true });
      const bindMock = vi.fn().mockReturnValue({ run: runMock });
      const prepareMock = vi.fn().mockReturnValue({ bind: bindMock });
      const fakeDb = { prepare: prepareMock } as unknown as D1Database;

      const res = await autoLinkTourScenes(fakeDb, "tour-1", "user-1", "hub_and_spoke");

      expect(res.success).toBe(true);
      // 2 other scenes * 2 (forward & return) = 4 portals
      expect(res.linkedCount).toBe(4);
      expect(res.hotspots).toHaveLength(4);

      // Verify deletion of old scene hotspots was executed first
      expect(prepareMock).toHaveBeenCalledWith(expect.stringContaining("DELETE FROM panorama_hotspots"));
      // Verify insertion of new portals
      expect(prepareMock).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO panorama_hotspots"));
    });

    it("supports sequential loop strategy connecting all rooms sequentially", async () => {
      const scenes: PanoramaScene[] = [
        { id: "s1", name: "Phòng 1", tourId: "tour-1", assetId: "a1", initialYaw: 0, initialPitch: 0, initialHfov: 100, orderIndex: 0, createdAt: 1000 },
        { id: "s2", name: "Phòng 2", tourId: "tour-1", assetId: "a2", initialYaw: 0, initialPitch: 0, initialHfov: 100, orderIndex: 1, createdAt: 1000 },
        { id: "s3", name: "Phòng 3", tourId: "tour-1", assetId: "a3", initialYaw: 0, initialPitch: 0, initialHfov: 100, orderIndex: 2, createdAt: 1000 },
      ];

      vi.mocked(tourService.getTourById).mockResolvedValue({
        id: "tour-1",
        userId: "user-1",
        title: "Loop Tour",
        description: null,
        isPublic: true,
        shareToken: "token123",
        createdAt: 1000,
        updatedAt: 1000,
        workspaceId: null,
        projectId: null,
        firstSceneId: "s1",
        scenes,
      });

      const runMock = vi.fn().mockResolvedValue({ success: true });
      const bindMock = vi.fn().mockReturnValue({ run: runMock });
      const prepareMock = vi.fn().mockReturnValue({ bind: bindMock });
      const fakeDb = { prepare: prepareMock } as unknown as D1Database;

      const res = await autoLinkTourScenes(fakeDb, "tour-1", "user-1", "sequential");
      expect(res.success).toBe(true);
      // 3 forward + 3 backward = 6 hotspots
      expect(res.linkedCount).toBe(6);
    });
  });

  describe("createBatchPanoramaTour", () => {
    it("fails with INSUFFICIENT_CREDITS if user balance is lower than total rooms", async () => {
      vi.mocked(ledger.getAvailableCredits).mockResolvedValue(2); // Only 2 credits, needs 3

      const fakeEnv = {
        DB: {} as D1Database,
      } as unknown as Env;

      await expect(
        createBatchPanoramaTour(fakeEnv, {
          userId: "user-1",
          tourTitle: "Luxury Villa",
          style: "Modern",
          rooms: [
            { name: "Khách", roomType: "living" },
            { name: "Bếp", roomType: "kitchen" },
            { name: "Ngủ", roomType: "bedroom" },
          ],
        })
      ).rejects.toThrow("INSUFFICIENT_CREDITS");
    });

    it("successfully creates tour, batch job and sub-tasks with credit holds", async () => {
      vi.mocked(ledger.getAvailableCredits).mockResolvedValue(10);
      vi.mocked(tourService.createTour).mockResolvedValue({
        id: "tour-batch-1",
        userId: "user-1",
        title: "Vinhomes Grand Park 3PN",
        description: null,
        isPublic: true,
        shareToken: "share123",
        createdAt: 1000,
        updatedAt: 1000,
        workspaceId: null,
        projectId: null,
        firstSceneId: null,
      });
      vi.mocked(taskLifecycle.createTaskWithHold).mockResolvedValue({
        taskId: "task-item-1",
        cached: false,
      } as any);

      const runMock = vi.fn().mockResolvedValue({ success: true });
      const bindMock = vi.fn().mockReturnValue({ run: runMock });
      const prepareMock = vi.fn().mockReturnValue({ bind: bindMock });
      const fakeEnv = {
        DB: { prepare: prepareMock } as unknown as D1Database,
      } as unknown as Env;

      const result = await createBatchPanoramaTour(fakeEnv, {
        userId: "user-1",
        tourTitle: "Vinhomes Grand Park 3PN",
        style: "Indochine Heritage",
        palette: "Gỗ sồi & Gạch bông",
        rooms: [
          { name: "Phòng Khách", roomType: "living_room" },
          { name: "Phòng Ngủ", roomType: "bedroom" },
        ],
      });

      expect(result.tour.id).toBe("tour-batch-1");
      expect(result.totalCreditsCost).toBe(2);
      expect(result.tasksCount).toBe(2);
      expect(tourService.createTour).toHaveBeenCalledWith(
        expect.anything(),
        "user-1",
        expect.objectContaining({ isPublic: false })
      );
      expect(taskLifecycle.createTaskWithHold).toHaveBeenCalledTimes(2);
      expect(prepareMock).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO batch_render_jobs"));
    });

    it("rejects workspace batch tour if user is not a member", async () => {
      const firstMock = vi.fn().mockResolvedValue(null);
      const bindMock = vi.fn().mockReturnValue({ first: firstMock });
      const prepareMock = vi.fn().mockReturnValue({ bind: bindMock });
      const fakeEnv = {
        DB: { prepare: prepareMock } as unknown as D1Database,
      } as unknown as Env;

      await expect(
        createBatchPanoramaTour(fakeEnv, {
          userId: "user-1",
          workspaceId: "ws-secret",
          tourTitle: "Penthouse",
          style: "Modern Luxury",
          rooms: [{ name: "Khách", roomType: "living" }],
        })
      ).rejects.toThrow("FORBIDDEN");
    });

    it("rejects workspace batch tour if user role is viewer", async () => {
      const firstMock = vi.fn().mockResolvedValue({ role: "viewer" });
      const bindMock = vi.fn().mockReturnValue({ first: firstMock });
      const prepareMock = vi.fn().mockReturnValue({ bind: bindMock });
      const fakeEnv = {
        DB: { prepare: prepareMock } as unknown as D1Database,
      } as unknown as Env;

      await expect(
        createBatchPanoramaTour(fakeEnv, {
          userId: "user-1",
          workspaceId: "ws-secret",
          tourTitle: "Penthouse",
          style: "Modern Luxury",
          rooms: [{ name: "Khách", roomType: "living" }],
        })
      ).rejects.toThrow("ROLE_CANNOT_GENERATE");
    });
  });
});
