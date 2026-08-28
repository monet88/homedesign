import { describe, expect, it, vi, beforeEach } from "vitest";
import { POST as recognizeRoute } from "@/app/api/floor-plan/room-designs/[id]/recognize/route";
import { POST as confirmBriefRoute } from "@/app/api/floor-plan/room-designs/[id]/confirm-brief/route";
import { POST as confirmLayoutRoute } from "@/app/api/floor-plan/room-designs/[id]/confirm-layout/route";
import { POST as confirmRenderRoute } from "@/app/api/floor-plan/room-designs/[id]/confirm-render/route";
import { FloorPlanError } from "@/lib/floor-plan/errors";

async function readJson<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

let mockAuthUser: { userId: string } | Response = { userId: "user-test" };

const mockEnv = {
  DB: {},
  HD_PRIVATE: {},
};

vi.mock("@/lib/ai/http", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/http")>();
  return {
    ...actual,
    authorizeVerified: vi.fn().mockImplementation(async () => {
      if (mockAuthUser instanceof Response) {
        return mockAuthUser;
      }
      return {
        env: mockEnv,
        userId: mockAuthUser.userId,
      };
    }),
  };
});

vi.mock("@/lib/floor-plan/brief", () => ({
  proposeRoomBrief: vi.fn().mockImplementation(async (_env, userId, roomId, options) => {
    if (roomId === "not-found") throw new FloorPlanError("NOT_FOUND", 404, "room design not found");
    if (roomId === "forbidden") throw new FloorPlanError("FORBIDDEN", 403, "forbidden");
    return {
      recognition: { roomType: "bedroom", openings: [], shape: "rectangular", regionHint: "center" },
      style: options?.style,
      stylePreference: options?.stylePreference,
      questionnaire: [],
      freeformRequirements: options?.freeformRequirements,
      designProposal: "Modern bedroom design",
    };
  }),
  confirmRoomBrief: vi.fn().mockImplementation(async (_env, userId, roomId) => {
    if (roomId === "not-found") throw new FloorPlanError("NOT_FOUND", 404, "room design not found");
    if (roomId === "not-ready") throw new FloorPlanError("BRIEF_NOT_READY", 409, "propose brief first");
    return {
      id: roomId,
      projectId: "proj-1",
      markerId: "m-1",
      marker: { x: 50, y: 50 },
      markerLocked: true,
      briefConfirmedAt: Date.now(),
      progress: "analyzed",
      proposal: null,
    };
  }),
}));

vi.mock("@/lib/floor-plan/stages", () => ({
  confirmRoomLayout: vi.fn().mockImplementation(async (_env, userId, roomId, designId) => {
    if (roomId === "not-found") throw new FloorPlanError("NOT_FOUND", 404, "layout run not found");
    if (roomId === "not-ready") throw new FloorPlanError("STAGE_NOT_READY", 409, "layout run not successful");
    return {
      id: roomId,
      projectId: "proj-1",
      markerId: "m-1",
      marker: { x: 50, y: 50 },
      markerLocked: true,
      briefConfirmedAt: 1000,
      progress: "layout-ready",
      proposal: null,
    };
  }),
  confirmRoomRender: vi.fn().mockImplementation(async (_env, userId, roomId, designId) => {
    if (roomId === "not-found") throw new FloorPlanError("NOT_FOUND", 404, "render run not found");
    if (roomId === "not-ready") throw new FloorPlanError("STAGE_NOT_READY", 409, "render run not successful");
    return {
      id: roomId,
      projectId: "proj-1",
      markerId: "m-1",
      marker: { x: 50, y: 50 },
      markerLocked: true,
      briefConfirmedAt: 1000,
      progress: "render-ready",
      proposal: null,
    };
  }),
}));

describe("Floor Plan Stage Commands Validation (Ticket #47)", () => {
  beforeEach(() => {
    mockAuthUser = { userId: "user-test" };
    vi.clearAllMocks();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. POST /api/floor-plan/room-designs/[id]/recognize
  // ───────────────────────────────────────────────────────────────────────────
  describe("POST /api/floor-plan/room-designs/[id]/recognize", () => {
    it("returns 401 when user is unauthenticated", async () => {
      mockAuthUser = Response.json({ error: "UNAUTHENTICATED" }, { status: 401 });
      const req = new Request("http://localhost:3000/api/floor-plan/room-designs/room-1/recognize", {
        method: "POST",
      });
      const res = await recognizeRoute(req, { params: Promise.resolve({ id: "room-1" }) });
      expect(res.status).toBe(401);
      const json = await readJson<{ error: string }>(res);
      expect(json.error).toBe("UNAUTHENTICATED");
    });

    it("returns 403 when email is not verified", async () => {
      mockAuthUser = Response.json({ error: "EMAIL_NOT_VERIFIED" }, { status: 403 });
      const req = new Request("http://localhost:3000/api/floor-plan/room-designs/room-1/recognize", {
        method: "POST",
      });
      const res = await recognizeRoute(req, { params: Promise.resolve({ id: "room-1" }) });
      expect(res.status).toBe(403);
      const json = await readJson<{ error: string }>(res);
      expect(json.error).toBe("EMAIL_NOT_VERIFIED");
    });

    it("returns 400 on malformed JSON body", async () => {
      const req = new Request("http://localhost:3000/api/floor-plan/room-designs/room-1/recognize", {
        method: "POST",
        body: "{ style: broken json",
      });
      const res = await recognizeRoute(req, { params: Promise.resolve({ id: "room-1" }) });
      expect(res.status).toBe(400);
      const json = await readJson<{ error: string }>(res);
      expect(json.error).toBe("INVALID_JSON");
    });

    it("returns 400 on non-object JSON body (e.g. number/array)", async () => {
      const req = new Request("http://localhost:3000/api/floor-plan/room-designs/room-1/recognize", {
        method: "POST",
        body: JSON.stringify([1, 2, 3]),
      });
      const res = await recognizeRoute(req, { params: Promise.resolve({ id: "room-1" }) });
      expect(res.status).toBe(400);
      const json = await readJson<{ error: string }>(res);
      expect(json.error).toBe("INVALID_INPUT");
    });

    it("returns 400 on unknown/unrecognized fields (.strict rejection)", async () => {
      const req = new Request("http://localhost:3000/api/floor-plan/room-designs/room-1/recognize", {
        method: "POST",
        body: JSON.stringify({ style: "Modern", unknownField: "bad" }),
      });
      const res = await recognizeRoute(req, { params: Promise.resolve({ id: "room-1" }) });
      expect(res.status).toBe(400);
      const json = await readJson<{ error: string }>(res);
      expect(json.error).toBe("INVALID_INPUT");
    });

    it("returns 400 on invalid field types", async () => {
      const req = new Request("http://localhost:3000/api/floor-plan/room-designs/room-1/recognize", {
        method: "POST",
        body: JSON.stringify({ style: 12345 }),
      });
      const res = await recognizeRoute(req, { params: Promise.resolve({ id: "room-1" }) });
      expect(res.status).toBe(400);
      const json = await readJson<{ error: string }>(res);
      expect(json.error).toBe("INVALID_INPUT");
    });

    it("succeeds with empty body", async () => {
      const req = new Request("http://localhost:3000/api/floor-plan/room-designs/room-1/recognize", {
        method: "POST",
      });
      const res = await recognizeRoute(req, { params: Promise.resolve({ id: "room-1" }) });
      expect(res.status).toBe(200);
      const json = await readJson<{ code: number; data: { designProposal: string } }>(res);
      expect(json.code).toBe(0);
      expect(json.data.designProposal).toBe("Modern bedroom design");
    });

    it("succeeds with valid style and options", async () => {
      const req = new Request("http://localhost:3000/api/floor-plan/room-designs/room-1/recognize", {
        method: "POST",
        body: JSON.stringify({
          style: "Minimalist",
          stylePreference: "Warm wood",
          freeformRequirements: "Must have desk",
        }),
      });
      const res = await recognizeRoute(req, { params: Promise.resolve({ id: "room-1" }) });
      expect(res.status).toBe(200);
      const json = await readJson<{ code: number; data: { style: string } }>(res);
      expect(json.code).toBe(0);
      expect(json.data.style).toBe("Minimalist");
    });

    it("maps domain errors properly", async () => {
      const req = new Request("http://localhost:3000/api/floor-plan/room-designs/not-found/recognize", {
        method: "POST",
      });
      const res = await recognizeRoute(req, { params: Promise.resolve({ id: "not-found" }) });
      expect(res.status).toBe(404);
      const json = await readJson<{ error: string }>(res);
      expect(json.error).toBe("NOT_FOUND");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. POST /api/floor-plan/room-designs/[id]/confirm-brief
  // ───────────────────────────────────────────────────────────────────────────
  describe("POST /api/floor-plan/room-designs/[id]/confirm-brief", () => {
    it("returns 401 when user is unauthenticated", async () => {
      mockAuthUser = Response.json({ error: "UNAUTHENTICATED" }, { status: 401 });
      const req = new Request("http://localhost:3000/api/floor-plan/room-designs/room-1/confirm-brief", {
        method: "POST",
      });
      const res = await confirmBriefRoute(req, { params: Promise.resolve({ id: "room-1" }) });
      expect(res.status).toBe(401);
    });

    it("returns 400 on malformed JSON", async () => {
      const req = new Request("http://localhost:3000/api/floor-plan/room-designs/room-1/confirm-brief", {
        method: "POST",
        body: "{ malformed json",
      });
      const res = await confirmBriefRoute(req, { params: Promise.resolve({ id: "room-1" }) });
      expect(res.status).toBe(400);
      const json = await readJson<{ error: string }>(res);
      expect(json.error).toBe("INVALID_JSON");
    });

    it("returns 400 on unknown input payload (.strict rejection)", async () => {
      const req = new Request("http://localhost:3000/api/floor-plan/room-designs/room-1/confirm-brief", {
        method: "POST",
        body: JSON.stringify({ unexpectedField: "should-fail" }),
      });
      const res = await confirmBriefRoute(req, { params: Promise.resolve({ id: "room-1" }) });
      expect(res.status).toBe(400);
      const json = await readJson<{ error: string }>(res);
      expect(json.error).toBe("INVALID_INPUT");
    });

    it("succeeds with empty body or empty object", async () => {
      const req = new Request("http://localhost:3000/api/floor-plan/room-designs/room-1/confirm-brief", {
        method: "POST",
        body: JSON.stringify({}),
      });
      const res = await confirmBriefRoute(req, { params: Promise.resolve({ id: "room-1" }) });
      expect(res.status).toBe(200);
      const json = await readJson<{ code: number; data: { markerLocked: boolean } }>(res);
      expect(json.code).toBe(0);
      expect(json.data.markerLocked).toBe(true);
    });

    it("maps domain error BRIEF_NOT_READY with 409", async () => {
      const req = new Request("http://localhost:3000/api/floor-plan/room-designs/not-ready/confirm-brief", {
        method: "POST",
      });
      const res = await confirmBriefRoute(req, { params: Promise.resolve({ id: "not-ready" }) });
      expect(res.status).toBe(409);
      const json = await readJson<{ error: string }>(res);
      expect(json.error).toBe("BRIEF_NOT_READY");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. POST /api/floor-plan/room-designs/[id]/confirm-layout
  // ───────────────────────────────────────────────────────────────────────────
  describe("POST /api/floor-plan/room-designs/[id]/confirm-layout", () => {
    it("returns 401 when user is unauthenticated", async () => {
      mockAuthUser = Response.json({ error: "UNAUTHENTICATED" }, { status: 401 });
      const req = new Request("http://localhost:3000/api/floor-plan/room-designs/room-1/confirm-layout", {
        method: "POST",
      });
      const res = await confirmLayoutRoute(req, { params: Promise.resolve({ id: "room-1" }) });
      expect(res.status).toBe(401);
    });

    it("returns 400 on malformed JSON", async () => {
      const req = new Request("http://localhost:3000/api/floor-plan/room-designs/room-1/confirm-layout", {
        method: "POST",
        body: "{ designId: broken",
      });
      const res = await confirmLayoutRoute(req, { params: Promise.resolve({ id: "room-1" }) });
      expect(res.status).toBe(400);
      const json = await readJson<{ error: string }>(res);
      expect(json.error).toBe("INVALID_JSON");
    });

    it("returns 400 on unknown input payload (.strict rejection)", async () => {
      const req = new Request("http://localhost:3000/api/floor-plan/room-designs/room-1/confirm-layout", {
        method: "POST",
        body: JSON.stringify({ designId: "d-1", extraParam: true }),
      });
      const res = await confirmLayoutRoute(req, { params: Promise.resolve({ id: "room-1" }) });
      expect(res.status).toBe(400);
      const json = await readJson<{ error: string }>(res);
      expect(json.error).toBe("INVALID_INPUT");
    });

    it("returns 400 on empty string designId", async () => {
      const req = new Request("http://localhost:3000/api/floor-plan/room-designs/room-1/confirm-layout", {
        method: "POST",
        body: JSON.stringify({ designId: "   " }),
      });
      const res = await confirmLayoutRoute(req, { params: Promise.resolve({ id: "room-1" }) });
      expect(res.status).toBe(400);
      const json = await readJson<{ error: string }>(res);
      expect(json.error).toBe("INVALID_INPUT");
    });

    it("returns 400 on non-string designId", async () => {
      const req = new Request("http://localhost:3000/api/floor-plan/room-designs/room-1/confirm-layout", {
        method: "POST",
        body: JSON.stringify({ designId: 12345 }),
      });
      const res = await confirmLayoutRoute(req, { params: Promise.resolve({ id: "room-1" }) });
      expect(res.status).toBe(400);
      const json = await readJson<{ error: string }>(res);
      expect(json.error).toBe("INVALID_INPUT");
    });

    it("succeeds with empty body or valid designId", async () => {
      const req = new Request("http://localhost:3000/api/floor-plan/room-designs/room-1/confirm-layout", {
        method: "POST",
        body: JSON.stringify({ designId: "d-101" }),
      });
      const res = await confirmLayoutRoute(req, { params: Promise.resolve({ id: "room-1" }) });
      expect(res.status).toBe(200);
      const json = await readJson<{ code: number; data: { progress: string } }>(res);
      expect(json.code).toBe(0);
      expect(json.data.progress).toBe("layout-ready");
    });

    it("maps domain error STAGE_NOT_READY with 409", async () => {
      const req = new Request("http://localhost:3000/api/floor-plan/room-designs/not-ready/confirm-layout", {
        method: "POST",
      });
      const res = await confirmLayoutRoute(req, { params: Promise.resolve({ id: "not-ready" }) });
      expect(res.status).toBe(409);
      const json = await readJson<{ error: string }>(res);
      expect(json.error).toBe("STAGE_NOT_READY");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. POST /api/floor-plan/room-designs/[id]/confirm-render
  // ───────────────────────────────────────────────────────────────────────────
  describe("POST /api/floor-plan/room-designs/[id]/confirm-render", () => {
    it("returns 401 when user is unauthenticated", async () => {
      mockAuthUser = Response.json({ error: "UNAUTHENTICATED" }, { status: 401 });
      const req = new Request("http://localhost:3000/api/floor-plan/room-designs/room-1/confirm-render", {
        method: "POST",
      });
      const res = await confirmRenderRoute(req, { params: Promise.resolve({ id: "room-1" }) });
      expect(res.status).toBe(401);
    });

    it("returns 400 on malformed JSON", async () => {
      const req = new Request("http://localhost:3000/api/floor-plan/room-designs/room-1/confirm-render", {
        method: "POST",
        body: "{ bad json",
      });
      const res = await confirmRenderRoute(req, { params: Promise.resolve({ id: "room-1" }) });
      expect(res.status).toBe(400);
      const json = await readJson<{ error: string }>(res);
      expect(json.error).toBe("INVALID_JSON");
    });

    it("returns 400 on unknown input payload (.strict rejection)", async () => {
      const req = new Request("http://localhost:3000/api/floor-plan/room-designs/room-1/confirm-render", {
        method: "POST",
        body: JSON.stringify({ designId: "d-2", hackerField: 999 }),
      });
      const res = await confirmRenderRoute(req, { params: Promise.resolve({ id: "room-1" }) });
      expect(res.status).toBe(400);
      const json = await readJson<{ error: string }>(res);
      expect(json.error).toBe("INVALID_INPUT");
    });

    it("returns 400 on empty string designId", async () => {
      const req = new Request("http://localhost:3000/api/floor-plan/room-designs/room-1/confirm-render", {
        method: "POST",
        body: JSON.stringify({ designId: "   " }),
      });
      const res = await confirmRenderRoute(req, { params: Promise.resolve({ id: "room-1" }) });
      expect(res.status).toBe(400);
      const json = await readJson<{ error: string }>(res);
      expect(json.error).toBe("INVALID_INPUT");
    });

    it("succeeds with empty body or valid designId", async () => {
      const req = new Request("http://localhost:3000/api/floor-plan/room-designs/room-1/confirm-render", {
        method: "POST",
        body: JSON.stringify({ designId: "d-202" }),
      });
      const res = await confirmRenderRoute(req, { params: Promise.resolve({ id: "room-1" }) });
      expect(res.status).toBe(200);
      const json = await readJson<{ code: number; data: { progress: string } }>(res);
      expect(json.code).toBe(0);
      expect(json.data.progress).toBe("render-ready");
    });

    it("maps domain error STAGE_NOT_READY with 409", async () => {
      const req = new Request("http://localhost:3000/api/floor-plan/room-designs/not-ready/confirm-render", {
        method: "POST",
      });
      const res = await confirmRenderRoute(req, { params: Promise.resolve({ id: "not-ready" }) });
      expect(res.status).toBe(409);
      const json = await readJson<{ error: string }>(res);
      expect(json.error).toBe("STAGE_NOT_READY");
    });
  });
});
