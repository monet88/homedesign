import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET as listTours, POST as createTourRoute } from "./route";
import { GET as getTourRoute, PATCH as updateTourRoute, DELETE as deleteTourRoute } from "./[id]/route";
import { POST as addSceneRoute } from "./[id]/scenes/route";
import { POST as addHotspotRoute } from "./[id]/hotspots/route";
import { GET as shareTourRoute } from "./share/[token]/route";

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

vi.mock("@/lib/panorama/tour-service", () => ({
  createTour: vi.fn(),
  getTourById: vi.fn(),
  getTourByShareToken: vi.fn(),
  listUserTours: vi.fn(),
  updateTour: vi.fn(),
  deleteTour: vi.fn(),
  addSceneToTour: vi.fn(),
  deleteScene: vi.fn(),
  addHotspot: vi.fn(),
  deleteHotspot: vi.fn(),
}));

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { authorizeVerified, readJson } from "@/lib/ai/http";
import {
  createTour,
  getTourById,
  getTourByShareToken,
  listUserTours,
  updateTour,
  deleteTour,
  addSceneToTour,
  addHotspot,
} from "@/lib/panorama/tour-service";

describe("3D Panorama & VR 360 Tour API Routes (Sprint 10)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("POST /api/tours rejects unauthenticated callers with 401", async () => {
    vi.mocked(authorizeVerified).mockResolvedValue(
      Response.json({ error: "UNAUTHORIZED" }, { status: 401 }) as any
    );

    const req = new Request("http://localhost/api/tours", { method: "POST" });
    const res = await createTourRoute(req);

    expect(res.status).toBe(401);
  });

  it("POST /api/tours validates payload and creates tour (HTTP 200)", async () => {
    vi.mocked(authorizeVerified).mockResolvedValue({ userId: "user-123", env: {} } as any);
    vi.mocked(getCloudflareContext).mockResolvedValue({ env: { DB: {} } } as any);
    vi.mocked(readJson).mockResolvedValue({
      title: "Biệt Thự Gamuda VR Tour",
      description: "Tour mẫu",
      isPublic: true,
    } as any);

    vi.mocked(createTour).mockResolvedValue({
      id: "tour-gamuda",
      workspaceId: null,
      projectId: null,
      userId: "user-123",
      title: "Biệt Thự Gamuda VR Tour",
      description: "Tour mẫu",
      firstSceneId: null,
      isPublic: true,
      shareToken: "tokengamuda123",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const req = new Request("http://localhost/api/tours", { method: "POST" });
    const res = await createTourRoute(req);

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.code).toBe(0);
    expect(body.data.tour.title).toBe("Biệt Thự Gamuda VR Tour");
  });

  it("GET /api/tours lists user tours (HTTP 200)", async () => {
    vi.mocked(authorizeVerified).mockResolvedValue({ userId: "user-123", env: {} } as any);
    vi.mocked(getCloudflareContext).mockResolvedValue({ env: { DB: {} } } as any);
    vi.mocked(listUserTours).mockResolvedValue([
      {
        id: "tour-1",
        workspaceId: null,
        projectId: null,
        userId: "user-123",
        title: "Villa 1",
        description: null,
        firstSceneId: null,
        isPublic: true,
        shareToken: "tok1",
        createdAt: 1000,
        updatedAt: 1000,
      },
    ]);

    const req = new Request("http://localhost/api/tours");
    const res = await listTours(req);

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.data.items).toHaveLength(1);
  });

  it("GET /api/tours/[id] rejects unauthenticated callers with 401", async () => {
    vi.mocked(authorizeVerified).mockResolvedValue(
      Response.json({ error: "UNAUTHORIZED" }, { status: 401 }) as any
    );

    const req = new Request("http://localhost/api/tours/tour-1");
    const res = await getTourRoute(req, { params: Promise.resolve({ id: "tour-1" }) });

    expect(res.status).toBe(401);
  });

  it("GET /api/tours/[id] rejects unauthorized users with 403 (IDOR defense)", async () => {
    vi.mocked(authorizeVerified).mockResolvedValue({ userId: "attacker-456", env: {} } as any);
    vi.mocked(getCloudflareContext).mockResolvedValue({
      env: {
        DB: {
          prepare: vi.fn().mockReturnValue({
            bind: vi.fn().mockReturnValue({
              first: vi.fn().mockResolvedValue(null),
            }),
          }),
        },
      },
    } as any);
    vi.mocked(getTourById).mockResolvedValue({
      id: "tour-private-1",
      workspaceId: null,
      projectId: null,
      userId: "victim-123",
      title: "Private Secret Villa",
      description: null,
      firstSceneId: "scene-1",
      isPublic: false,
      shareToken: "tok-secret",
      createdAt: 1000,
      updatedAt: 1000,
      scenes: [],
    });

    const req = new Request("http://localhost/api/tours/tour-private-1");
    const res = await getTourRoute(req, { params: Promise.resolve({ id: "tour-private-1" }) });

    expect(res.status).toBe(403);
    const body = (await res.json()) as any;
    expect(body.error).toBe("FORBIDDEN");
  });

  it("GET /api/tours/[id] allows authorized tour owner (HTTP 200)", async () => {
    vi.mocked(authorizeVerified).mockResolvedValue({ userId: "user-123", env: {} } as any);
    vi.mocked(getCloudflareContext).mockResolvedValue({ env: { DB: {} } } as any);
    vi.mocked(getTourById).mockResolvedValue({
      id: "tour-1",
      workspaceId: null,
      projectId: null,
      userId: "user-123",
      title: "Villa 1",
      description: null,
      firstSceneId: "scene-1",
      isPublic: false,
      shareToken: "tok1",
      createdAt: 1000,
      updatedAt: 1000,
      scenes: [],
    });

    const req = new Request("http://localhost/api/tours/tour-1");
    const res = await getTourRoute(req, { params: Promise.resolve({ id: "tour-1" }) });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.data.tour.title).toBe("Villa 1");
  });

  it("GET /api/tours/[id] returns 404 for missing tour", async () => {
    vi.mocked(authorizeVerified).mockResolvedValue({ userId: "user-123", env: {} } as any);
    vi.mocked(getCloudflareContext).mockResolvedValue({ env: { DB: {} } } as any);
    vi.mocked(getTourById).mockResolvedValue(null);

    const req = new Request("http://localhost/api/tours/tour-missing");
    const res = await getTourRoute(req, { params: Promise.resolve({ id: "tour-missing" }) });

    expect(res.status).toBe(404);
  });

  it("POST /api/tours/[id]/scenes adds a scene to the tour (HTTP 200)", async () => {
    vi.mocked(authorizeVerified).mockResolvedValue({ userId: "user-123", env: {} } as any);
    vi.mocked(getCloudflareContext).mockResolvedValue({ env: { DB: {} } } as any);
    vi.mocked(readJson).mockResolvedValue({
      name: "Phòng Khách Master",
      assetId: "asset-room-360",
      initialYaw: 45,
      initialPitch: 0,
      initialHfov: 100,
    } as any);

    vi.mocked(addSceneToTour).mockResolvedValue({
      id: "scene-1",
      tourId: "tour-1",
      name: "Phòng Khách Master",
      assetId: "asset-room-360",
      initialYaw: 45,
      initialPitch: 0,
      initialHfov: 100,
      orderIndex: 0,
      createdAt: 1000,
    });

    const req = new Request("http://localhost/api/tours/tour-1/scenes", { method: "POST" });
    const res = await addSceneRoute(req, { params: Promise.resolve({ id: "tour-1" }) });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.data.scene.name).toBe("Phòng Khách Master");
  });

  it("POST /api/tours/[id]/hotspots validates and adds hotspot (HTTP 200)", async () => {
    vi.mocked(authorizeVerified).mockResolvedValue({ userId: "user-123", env: {} } as any);
    vi.mocked(getCloudflareContext).mockResolvedValue({ env: { DB: {} } } as any);
    vi.mocked(readJson).mockResolvedValue({
      sceneId: "scene-1",
      targetSceneId: "scene-2",
      type: "scene",
      pitch: -15,
      yaw: 80,
      title: "Cửa vào Phòng Bếp",
    } as any);

    vi.mocked(addHotspot).mockResolvedValue({
      id: "hotspot-1",
      sceneId: "scene-1",
      targetSceneId: "scene-2",
      type: "scene",
      pitch: -15,
      yaw: 80,
      title: "Cửa vào Phòng Bếp",
      description: null,
      createdAt: 1000,
    });

    const req = new Request("http://localhost/api/tours/tour-1/hotspots", { method: "POST" });
    const res = await addHotspotRoute(req);

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.data.hotspot.title).toBe("Cửa vào Phòng Bếp");
  });

  it("GET /api/tours/share/[token] serves public tour for anonymous viewers", async () => {
    vi.mocked(getCloudflareContext).mockResolvedValue({ env: { DB: {} } } as any);
    vi.mocked(getTourByShareToken).mockResolvedValue({
      id: "tour-public",
      workspaceId: null,
      projectId: null,
      userId: "user-1",
      title: "Biệt Thự Đơn Lập Public Tour",
      description: null,
      firstSceneId: "scene-1",
      isPublic: true,
      shareToken: "token-public-123",
      createdAt: 1000,
      updatedAt: 1000,
      scenes: [],
    });

    const req = new Request("http://localhost/api/tours/share/token-public-123");
    const res = await shareTourRoute(req, { params: Promise.resolve({ token: "token-public-123" }) });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.data.tour.shareToken).toBe("token-public-123");
  });
});
