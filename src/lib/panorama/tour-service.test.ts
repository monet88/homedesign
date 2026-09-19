import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createTour,
  getTourById,
  getTourByShareToken,
  listUserTours,
  updateTour,
  deleteTour,
  addSceneToTour,
  deleteScene,
  addHotspot,
  deleteHotspot,
} from "./tour-service";
import { CreateHotspotSchema, CreateSceneSchema, CreateTourSchema } from "./types";

describe("3D Panorama & VR 360 Tour Service (Sprint 10)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Validation Schemas", () => {
    it("validates hotspot pitch and yaw boundaries strictly", () => {
      // Valid coordinates: pitch in [-90, 90], yaw in [-180, 180]
      const valid = CreateHotspotSchema.safeParse({
        sceneId: "scene-1",
        targetSceneId: "scene-2",
        type: "scene",
        pitch: 15.5,
        yaw: -45.2,
        title: "Sang Phòng Bếp",
      });
      expect(valid.success).toBe(true);

      // Invalid pitch (>90)
      const invalidPitch = CreateHotspotSchema.safeParse({
        sceneId: "scene-1",
        type: "info",
        pitch: 95.0,
        yaw: 0,
        title: "Invalid",
      });
      expect(invalidPitch.success).toBe(false);

      // Invalid yaw (<-180)
      const invalidYaw = CreateHotspotSchema.safeParse({
        sceneId: "scene-1",
        type: "info",
        pitch: 0,
        yaw: -190.0,
        title: "Invalid",
      });
      expect(invalidYaw.success).toBe(false);
    });

    it("validates scene initial angles and field of view", () => {
      const valid = CreateSceneSchema.safeParse({
        name: "Phòng Khách Master",
        assetId: "asset-pano-1",
        initialYaw: 120,
        initialPitch: -10,
        initialHfov: 110,
      });
      expect(valid.success).toBe(true);

      const invalidHfov = CreateSceneSchema.safeParse({
        name: "Test",
        assetId: "asset-1",
        initialHfov: 180, // hfov max 140
      });
      expect(invalidHfov.success).toBe(false);
    });

    it("validates tour title requirements", () => {
      const valid = CreateTourSchema.safeParse({
        title: "Biệt Thự Vườn Ecopark",
        description: "VR 360 Walkthrough",
      });
      expect(valid.success).toBe(true);

      const empty = CreateTourSchema.safeParse({
        title: "",
      });
      expect(empty.success).toBe(false);
    });
  });

  describe("Database CRUD operations", () => {
    it("creates a new virtual tour with unique share token", async () => {
      const runMock = vi.fn().mockResolvedValue({ success: true });
      const bindMock = vi.fn().mockReturnValue({ run: runMock });
      const prepareMock = vi.fn().mockReturnValue({ bind: bindMock });

      const fakeDb = { prepare: prepareMock } as unknown as D1Database;

      const tour = await createTour(fakeDb, "user-123", {
        title: "Penthouse Ciputra VR Tour",
        description: "360 walkthrough for client",
        isPublic: true,
      });

      expect(tour.id).toContain("tour_");
      expect(tour.shareToken).toHaveLength(16);
      expect(tour.title).toBe("Penthouse Ciputra VR Tour");
      expect(tour.userId).toBe("user-123");
      expect(tour.isPublic).toBe(true);
      expect(prepareMock).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO panorama_tours"));
    });

    it("creates a new virtual tour with isPublic: false by default when omitted (private-by-default)", async () => {
      const runMock = vi.fn().mockResolvedValue({ success: true });
      const bindMock = vi.fn().mockReturnValue({ run: runMock });
      const prepareMock = vi.fn().mockReturnValue({ bind: bindMock });

      const fakeDb = { prepare: prepareMock } as unknown as D1Database;

      const tour = await createTour(fakeDb, "user-123", {
        title: "Private Penthouse",
      });

      expect(tour.isPublic).toBe(false);
      expect(bindMock).toHaveBeenCalledWith(
        expect.any(String),
        null,
        null,
        "user-123",
        "Private Penthouse",
        null,
        0, // is_public = 0
        expect.any(String),
        expect.any(Number)
      );
    });

    it("retrieves a tour by id and nests its scenes and hotspots", async () => {
      const tourRow = {
        id: "tour-1",
        workspace_id: "ws-1",
        project_id: "prj-1",
        user_id: "user-123",
        title: "Villa 360",
        description: "Tour",
        first_scene_id: "scene-1",
        is_public: 1,
        share_token: "token123",
        created_at: 1000,
        updated_at: 1000,
      };

      const sceneRows = [
        {
          id: "scene-1",
          tour_id: "tour-1",
          name: "Phòng Khách",
          asset_id: "asset-1",
          initial_yaw: 0,
          initial_pitch: 0,
          initial_hfov: 100,
          order_index: 0,
          created_at: 1000,
        },
      ];

      const hotspotRows = [
        {
          id: "hotspot-1",
          scene_id: "scene-1",
          target_scene_id: "scene-2",
          type: "scene",
          pitch: 5,
          yaw: 45,
          title: "Vào Phòng Bếp",
          description: null,
          created_at: 1000,
        },
      ];

      const firstMock = vi.fn().mockResolvedValue(tourRow);
      const allMock = vi
        .fn()
        .mockResolvedValueOnce({ results: sceneRows })
        .mockResolvedValueOnce({ results: hotspotRows });

      const bindMock = vi.fn().mockReturnValue({ first: firstMock, all: allMock });
      const prepareMock = vi.fn().mockReturnValue({ bind: bindMock });

      const fakeDb = { prepare: prepareMock } as unknown as D1Database;

      const tour = await getTourById(fakeDb, "tour-1");

      expect(tour).not.toBeNull();
      expect(tour?.title).toBe("Villa 360");
      expect(tour?.scenes).toHaveLength(1);
      expect(tour?.scenes?.[0].name).toBe("Phòng Khách");
      expect(tour?.scenes?.[0].hotspots).toHaveLength(1);
      expect(tour?.scenes?.[0].hotspots?.[0].title).toBe("Vào Phòng Bếp");
    });

    it("retrieves public tour by share token and rejects private tour", async () => {
      const firstMock = vi.fn().mockResolvedValue(null);
      const bindMock = vi.fn().mockReturnValue({ first: firstMock });
      const prepareMock = vi.fn().mockReturnValue({ bind: bindMock });

      const fakeDb = { prepare: prepareMock } as unknown as D1Database;

      const tour = await getTourByShareToken(fakeDb, "non-existent-or-private");
      expect(tour).toBeNull();
    });

    it("lists tours for a user", async () => {
      const allMock = vi.fn().mockResolvedValue({
        results: [
          {
            id: "tour-1",
            workspace_id: "ws-1",
            project_id: null,
            user_id: "user-123",
            title: "Tour 1",
            description: null,
            first_scene_id: null,
            is_public: 1,
            share_token: "tok1",
            created_at: 2000,
            updated_at: 2000,
          },
        ],
      });

      const bindMock = vi.fn().mockReturnValue({ all: allMock });
      const prepareMock = vi.fn().mockReturnValue({ bind: bindMock });
      const fakeDb = { prepare: prepareMock } as unknown as D1Database;

      const list = await listUserTours(fakeDb, "user-123", "ws-1");
      expect(list).toHaveLength(1);
      expect(list[0].title).toBe("Tour 1");
    });

    it("adds scene to tour and sets first_scene_id if initially null", async () => {
      const firstMock = vi
        .fn()
        .mockResolvedValueOnce({ id: "tour-1", workspace_id: null, first_scene_id: null })
        .mockResolvedValueOnce({ id: "asset-kitchen-360", user_id: "user-123", lifecycle: "ready" });
      const runMock = vi.fn().mockResolvedValue({ success: true });
      const bindMock = vi.fn().mockReturnValue({ first: firstMock, run: runMock });
      const prepareMock = vi.fn().mockReturnValue({ bind: bindMock });

      const fakeDb = { prepare: prepareMock } as unknown as D1Database;

      const scene = await addSceneToTour(fakeDb, "tour-1", "user-123", {
        name: "Phòng Bếp",
        assetId: "asset-kitchen-360",
        initialYaw: 0,
        initialPitch: 0,
        initialHfov: 100,
      });

      expect(scene).not.toBeNull();
      expect(scene?.name).toBe("Phòng Bếp");
      expect(scene?.assetId).toBe("asset-kitchen-360");
      expect(prepareMock).toHaveBeenCalledWith(expect.stringContaining("UPDATE panorama_tours SET first_scene_id"));
    });

    it("rejects addSceneToTour if asset belongs to another user outside workspace (BOLA defense)", async () => {
      const firstMock = vi
        .fn()
        .mockResolvedValueOnce({ id: "tour-1", workspace_id: null, first_scene_id: "scene-0" })
        .mockResolvedValueOnce({ id: "asset-victim-secret", user_id: "victim-456", lifecycle: "ready" });
      const runMock = vi.fn().mockResolvedValue({ success: true });
      const bindMock = vi.fn().mockReturnValue({ first: firstMock, run: runMock });
      const prepareMock = vi.fn().mockReturnValue({ bind: bindMock });

      const fakeDb = { prepare: prepareMock } as unknown as D1Database;

      const scene = await addSceneToTour(fakeDb, "tour-1", "attacker-123", {
        name: "Stolen Scene",
        assetId: "asset-victim-secret",
      });

      expect(scene).toBeNull();
      expect(prepareMock).not.toHaveBeenCalledWith(expect.stringContaining("INSERT INTO panorama_scenes"));
    });

    it("allows addSceneToTour if asset belongs to another member within the same workspace", async () => {
      const firstMock = vi
        .fn()
        .mockResolvedValueOnce({ id: "tour-1", workspace_id: "ws-team-1", first_scene_id: "scene-0" })
        .mockResolvedValueOnce({ id: "asset-colleague", user_id: "colleague-456", lifecycle: "ready" })
        .mockResolvedValueOnce({ role: "member" }); // workspace_members check
      const runMock = vi.fn().mockResolvedValue({ success: true });
      const bindMock = vi.fn().mockReturnValue({ first: firstMock, run: runMock });
      const prepareMock = vi.fn().mockReturnValue({ bind: bindMock });

      const fakeDb = { prepare: prepareMock } as unknown as D1Database;

      const scene = await addSceneToTour(fakeDb, "tour-1", "user-123", {
        name: "Team Scene",
        assetId: "asset-colleague",
      });

      expect(scene).not.toBeNull();
      expect(scene?.assetId).toBe("asset-colleague");
    });

    it("rejects addSceneToTour if asset is deleted or rejected", async () => {
      const firstMock = vi
        .fn()
        .mockResolvedValueOnce({ id: "tour-1", workspace_id: null, first_scene_id: null })
        .mockResolvedValueOnce({ id: "asset-deleted", user_id: "user-123", lifecycle: "deleted" });
      const runMock = vi.fn().mockResolvedValue({ success: true });
      const bindMock = vi.fn().mockReturnValue({ first: firstMock, run: runMock });
      const prepareMock = vi.fn().mockReturnValue({ bind: bindMock });

      const fakeDb = { prepare: prepareMock } as unknown as D1Database;

      const scene = await addSceneToTour(fakeDb, "tour-1", "user-123", {
        name: "Dead Scene",
        assetId: "asset-deleted",
      });

      expect(scene).toBeNull();
    });

    it("adds hotspot to an authorized scene", async () => {
      const firstMock = vi.fn().mockResolvedValue({ id: "scene-1" });
      const runMock = vi.fn().mockResolvedValue({ success: true });
      const bindMock = vi.fn().mockReturnValue({ first: firstMock, run: runMock });
      const prepareMock = vi.fn().mockReturnValue({ bind: bindMock });

      const fakeDb = { prepare: prepareMock } as unknown as D1Database;

      const hotspot = await addHotspot(fakeDb, "user-123", {
        sceneId: "scene-1",
        targetSceneId: "scene-2",
        type: "scene",
        pitch: -12.4,
        yaw: 154.2,
        title: "Bước sang Ban Công",
        description: "View toàn cảnh hồ Tây",
      });

      expect(hotspot).not.toBeNull();
      expect(hotspot?.title).toBe("Bước sang Ban Công");
      expect(hotspot?.pitch).toBe(-12.4);
      expect(hotspot?.yaw).toBe(154.2);
    });

    it("prevents unauthorized user from adding hotspot to other user scenes", async () => {
      const firstMock = vi.fn().mockResolvedValue(null); // Not authorized
      const bindMock = vi.fn().mockReturnValue({ first: firstMock });
      const prepareMock = vi.fn().mockReturnValue({ bind: bindMock });

      const fakeDb = { prepare: prepareMock } as unknown as D1Database;

      const result = await addHotspot(fakeDb, "user-attacker", {
        sceneId: "scene-victim",
        type: "info",
        pitch: 0,
        yaw: 0,
        title: "Hacked",
      });

      expect(result).toBeNull();
    });

    it("deletes a tour and checks change count", async () => {
      const runMock = vi.fn().mockResolvedValue({ meta: { changes: 1 } });
      const bindMock = vi.fn().mockReturnValue({ run: runMock });
      const prepareMock = vi.fn().mockReturnValue({ bind: bindMock });

      const fakeDb = { prepare: prepareMock } as unknown as D1Database;

      const deleted = await deleteTour(fakeDb, "tour-1", "user-123");
      expect(deleted).toBe(true);
    });
  });
});
