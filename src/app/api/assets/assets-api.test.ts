import { describe, expect, it, vi, beforeEach } from "vitest";
import { POST as handleUploadIntent } from "@/app/api/assets/upload-intent/route";
import { POST as handleFinalize } from "@/app/api/assets/finalize/route";
import { PATCH as handleFavorite } from "@/app/api/projects/[id]/favorite/route";
import type { RouteSession } from "@/lib/ai/http";
import type { AuthEnv } from "@/lib/auth/server";

async function readJson<T = any>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

let mockAuthResult: RouteSession | Response | null = null;
let mockCreateIntentFn = vi.fn();
let mockFinalizeUploadFn = vi.fn();
let mockToggleFavoriteFn = vi.fn();

// In-memory assets & projects for DB queries in route handlers
interface MockAsset {
  id: string;
  user_id: string;
  name: string;
  mime_type: string;
  size: number;
  lifecycle: string;
  storage_key: string;
  declared_size: number;
}

let mockAssets: MockAsset[] = [];

const mockEnv = {
  ENVIRONMENT: "test",
  R2_ACCOUNT_ID: "acct-123",
  R2_ACCESS_KEY_ID: "key-123",
  R2_SECRET_ACCESS_KEY: "secret-123",
  DB: {
    prepare: (query: string) => {
      let boundArgs: any[] = [];
      const stmt = {
        bind: (...args: any[]) => {
          boundArgs = args;
          return stmt;
        },
        first: async <T = any>(): Promise<T | null> => {
          const q = query.trim().toUpperCase();
          if (q.includes("SELECT USER_ID FROM ASSETS WHERE ID = ?1")) {
            const asset = mockAssets.find((a) => a.id === boundArgs[0]);
            return asset ? ({ user_id: asset.user_id } as unknown as T) : null;
          }
          if (q.includes("SELECT ID, STORAGE_KEY, DECLARED_SIZE, MIME_TYPE FROM ASSETS WHERE ID = ?1")) {
            const asset = mockAssets.find((a) => a.id === boundArgs[0]);
            return asset
              ? ({
                  id: asset.id,
                  storage_key: asset.storage_key,
                  declared_size: asset.declared_size,
                  mime_type: asset.mime_type,
                } as unknown as T)
              : null;
          }
          return null;
        },
      };
      return stmt;
    },
  },
  HD_PRIVATE: {},
} as unknown as AuthEnv;

vi.mock("@/lib/ai/http", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/http")>();
  return {
    ...actual,
    authorizeVerified: vi.fn().mockImplementation(async () => {
      if (!mockAuthResult) {
        return Response.json({ error: "UNAUTHENTICATED" }, { status: 401 });
      }
      return mockAuthResult;
    }),
  };
});

vi.mock("@/lib/intake/intake-service", () => ({
  createUploadIntent: vi.fn().mockImplementation((env, input) => mockCreateIntentFn(env, input)),
  finalizeUpload: vi.fn().mockImplementation((env, assetId) => mockFinalizeUploadFn(env, assetId)),
}));

vi.mock("@/lib/intake/presign", () => ({
  presignPutUrl: vi.fn().mockResolvedValue({
    url: "https://homedesign-private.acct-123.r2.cloudflarestorage.com/quarantine/test?signed=true",
    expiresAt: Date.now() + 600_000,
    expiresInSec: 600,
    host: "homedesign-private.acct-123.r2.cloudflarestorage.com",
  }),
}));

vi.mock("@/lib/library/projects", () => ({
  toggleProjectFavorite: vi.fn().mockImplementation((env, userId, id, favorite) =>
    mockToggleFavoriteFn(env, userId, id, favorite)
  ),
}));

const verifiedSession: RouteSession = {
  env: mockEnv,
  userId: "user-test-1",
};

describe("Asset and Project Mutation Commands Validation (Ticket #45)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthResult = verifiedSession;
    mockAssets = [
      {
        id: "asset-owned-1",
        user_id: "user-test-1",
        name: "room.png",
        mime_type: "image/png",
        size: 1024,
        lifecycle: "pending-upload",
        storage_key: "quarantine/asset-owned-1",
        declared_size: 1024,
      },
      {
        id: "asset-other-user",
        user_id: "user-other-99",
        name: "other.png",
        mime_type: "image/png",
        size: 2048,
        lifecycle: "pending-upload",
        storage_key: "quarantine/asset-other-user",
        declared_size: 2048,
      },
    ];

    mockCreateIntentFn = vi.fn().mockResolvedValue({
      assetId: "new-asset-uuid",
      name: "room.png",
      mimeType: "image/png",
      size: 1024,
      key: "quarantine/new-asset-uuid",
      expiresInSec: 600,
      createdAt: Date.now(),
    });

    mockFinalizeUploadFn = vi.fn().mockResolvedValue({
      ok: true,
      lifecycle: "quarantined",
    });

    mockToggleFavoriteFn = vi.fn().mockResolvedValue(undefined);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. POST /api/assets/upload-intent
  // ───────────────────────────────────────────────────────────────────────────
  describe("POST /api/assets/upload-intent", () => {
    it("returns 401 when unauthenticated", async () => {
      mockAuthResult = null;
      const req = new Request("http://localhost:3000/api/assets/upload-intent", {
        method: "POST",
        body: JSON.stringify({ name: "room.png", mimeType: "image/png", size: 1024 }),
      });
      const res = await handleUploadIntent(req);
      expect(res.status).toBe(401);
      const json = await readJson(res);
      expect(json.error).toBe("UNAUTHENTICATED");
      expect(mockCreateIntentFn).not.toHaveBeenCalled();
    });

    it("returns 403 when email is not verified", async () => {
      mockAuthResult = Response.json({ error: "EMAIL_NOT_VERIFIED" }, { status: 403 });
      const req = new Request("http://localhost:3000/api/assets/upload-intent", {
        method: "POST",
        body: JSON.stringify({ name: "room.png", mimeType: "image/png", size: 1024 }),
      });
      const res = await handleUploadIntent(req);
      expect(res.status).toBe(403);
      const json = await readJson(res);
      expect(json.error).toBe("EMAIL_NOT_VERIFIED");
      expect(mockCreateIntentFn).not.toHaveBeenCalled();
    });

    it("returns 400 INVALID_JSON on malformed non-JSON body", async () => {
      const req = new Request("http://localhost:3000/api/assets/upload-intent", {
        method: "POST",
        body: "not-json-content",
      });
      const res = await handleUploadIntent(req);
      expect(res.status).toBe(400);
      const json = await readJson(res);
      expect(json.error).toBe("INVALID_JSON");
      expect(mockCreateIntentFn).not.toHaveBeenCalled();
    });

    it("returns 400 INVALID_INPUT on missing name", async () => {
      const req = new Request("http://localhost:3000/api/assets/upload-intent", {
        method: "POST",
        body: JSON.stringify({ mimeType: "image/png", size: 1024 }),
      });
      const res = await handleUploadIntent(req);
      expect(res.status).toBe(400);
      const json = await readJson(res);
      expect(json.error).toBe("INVALID_INPUT");
      expect(json.details.name).toBeDefined();
      expect(mockCreateIntentFn).not.toHaveBeenCalled();
    });

    it("returns 400 INVALID_INPUT on empty or whitespace-only name", async () => {
      for (const badName of ["", "   ", "\t\n"]) {
        const req = new Request("http://localhost:3000/api/assets/upload-intent", {
          method: "POST",
          body: JSON.stringify({ name: badName, mimeType: "image/png", size: 1024 }),
        });
        const res = await handleUploadIntent(req);
        expect(res.status).toBe(400);
        const json = await readJson(res);
        expect(json.error).toBe("INVALID_INPUT");
        expect(json.details.name).toBeDefined();
      }
      expect(mockCreateIntentFn).not.toHaveBeenCalled();
    });

    it("returns 400 INVALID_INPUT on unsupported MIME type", async () => {
      for (const badMime of ["image/gif", "image/bmp", "text/plain", "application/pdf", ""]) {
        const req = new Request("http://localhost:3000/api/assets/upload-intent", {
          method: "POST",
          body: JSON.stringify({ name: "room.png", mimeType: badMime, size: 1024 }),
        });
        const res = await handleUploadIntent(req);
        expect(res.status).toBe(400);
        const json = await readJson(res);
        expect(json.error).toBe("INVALID_INPUT");
        expect(json.details.mimeType).toBeDefined();
      }
      expect(mockCreateIntentFn).not.toHaveBeenCalled();
    });

    it("returns 400 INVALID_INPUT on invalid sizes (zero, negative, fractional, oversized > 50MB, string)", async () => {
      const badSizes = [0, -10, 1.5, 51 * 1024 * 1024, "1024", null, undefined];
      for (const badSize of badSizes) {
        const req = new Request("http://localhost:3000/api/assets/upload-intent", {
          method: "POST",
          body: JSON.stringify({ name: "room.png", mimeType: "image/png", size: badSize }),
        });
        const res = await handleUploadIntent(req);
        expect(res.status).toBe(400);
        const json = await readJson(res);
        expect(json.error).toBe("INVALID_INPUT");
        expect(json.details.size).toBeDefined();
      }
      expect(mockCreateIntentFn).not.toHaveBeenCalled();
    });

    it("returns 400 INVALID_INPUT when unknown fields are injected (.strict() rejection)", async () => {
      const req = new Request("http://localhost:3000/api/assets/upload-intent", {
        method: "POST",
        body: JSON.stringify({
          name: "room.png",
          mimeType: "image/png",
          size: 1024,
          injectedField: "malicious",
          adminOverride: true,
        }),
      });
      const res = await handleUploadIntent(req);
      expect(res.status).toBe(400);
      const json = await readJson(res);
      expect(json.error).toBe("INVALID_INPUT");
      expect(mockCreateIntentFn).not.toHaveBeenCalled();
    });

    it("creates upload intent and returns 200 with code 0 on valid input", async () => {
      const req = new Request("http://localhost:3000/api/assets/upload-intent", {
        method: "POST",
        body: JSON.stringify({
          name: "   living_room.png   ",
          mimeType: "image/png",
          size: 1024,
        }),
      });
      const res = await handleUploadIntent(req);
      expect(res.status).toBe(200);
      const json = await readJson(res);
      expect(json.code).toBe(0);
      expect(json.data.assetId).toBe("new-asset-uuid");
      expect(json.data.expiresInSec).toBe(600);
      expect(json.data.presignedUrl).toContain("https://homedesign-private");
      expect(mockCreateIntentFn).toHaveBeenCalledWith(mockEnv, {
        userId: "user-test-1",
        name: "living_room.png",
        mimeType: "image/png",
        size: 1024,
      });
    });

    it("creates upload intent for valid image/webp input", async () => {
      const req = new Request("http://localhost:3000/api/assets/upload-intent", {
        method: "POST",
        body: JSON.stringify({
          name: "sample-room.webp",
          mimeType: "image/webp",
          size: 2048,
        }),
      });
      const res = await handleUploadIntent(req);
      expect(res.status).toBe(200);
      const json = await readJson(res);
      expect(json.code).toBe(0);
      expect(mockCreateIntentFn).toHaveBeenCalledWith(mockEnv, {
        userId: "user-test-1",
        name: "sample-room.webp",
        mimeType: "image/webp",
        size: 2048,
      });
    });

    it("returns 429 QUOTA_EXCEEDED when intake quota check throws", async () => {
      mockCreateIntentFn.mockRejectedValueOnce(new Error("quota exceeded: active intake limit (3) reached"));
      const req = new Request("http://localhost:3000/api/assets/upload-intent", {
        method: "POST",
        body: JSON.stringify({ name: "room.png", mimeType: "image/png", size: 1024 }),
      });
      const res = await handleUploadIntent(req);
      expect(res.status).toBe(429);
      const json = await readJson(res);
      expect(json.error).toBe("QUOTA_EXCEEDED");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. POST /api/assets/finalize
  // ───────────────────────────────────────────────────────────────────────────
  describe("POST /api/assets/finalize", () => {
    it("returns 401 when unauthenticated", async () => {
      mockAuthResult = null;
      const req = new Request("http://localhost:3000/api/assets/finalize", {
        method: "POST",
        body: JSON.stringify({ assetId: "asset-owned-1" }),
      });
      const res = await handleFinalize(req);
      expect(res.status).toBe(401);
      const json = await readJson(res);
      expect(json.error).toBe("UNAUTHENTICATED");
      expect(mockFinalizeUploadFn).not.toHaveBeenCalled();
    });

    it("returns 403 when email is not verified", async () => {
      mockAuthResult = Response.json({ error: "EMAIL_NOT_VERIFIED" }, { status: 403 });
      const req = new Request("http://localhost:3000/api/assets/finalize", {
        method: "POST",
        body: JSON.stringify({ assetId: "asset-owned-1" }),
      });
      const res = await handleFinalize(req);
      expect(res.status).toBe(403);
      const json = await readJson(res);
      expect(json.error).toBe("EMAIL_NOT_VERIFIED");
      expect(mockFinalizeUploadFn).not.toHaveBeenCalled();
    });

    it("returns 400 INVALID_JSON on malformed body", async () => {
      const req = new Request("http://localhost:3000/api/assets/finalize", {
        method: "POST",
        body: "bad-json",
      });
      const res = await handleFinalize(req);
      expect(res.status).toBe(400);
      const json = await readJson(res);
      expect(json.error).toBe("INVALID_JSON");
      expect(mockFinalizeUploadFn).not.toHaveBeenCalled();
    });

    it("returns 400 INVALID_INPUT on missing or empty assetId", async () => {
      for (const badBody of [{}, { assetId: "" }, { assetId: "   " }, { assetId: 123 }]) {
        const req = new Request("http://localhost:3000/api/assets/finalize", {
          method: "POST",
          body: JSON.stringify(badBody),
        });
        const res = await handleFinalize(req);
        expect(res.status).toBe(400);
        const json = await readJson(res);
        expect(json.error).toBe("INVALID_INPUT");
      }
      expect(mockFinalizeUploadFn).not.toHaveBeenCalled();
    });

    it("returns 400 INVALID_INPUT on unknown fields (.strict() rejection)", async () => {
      const req = new Request("http://localhost:3000/api/assets/finalize", {
        method: "POST",
        body: JSON.stringify({
          assetId: "asset-owned-1",
          injectedField: "attempt",
        }),
      });
      const res = await handleFinalize(req);
      expect(res.status).toBe(400);
      const json = await readJson(res);
      expect(json.error).toBe("INVALID_INPUT");
      expect(mockFinalizeUploadFn).not.toHaveBeenCalled();
    });

    it("returns 404 when asset does not exist in DB", async () => {
      const req = new Request("http://localhost:3000/api/assets/finalize", {
        method: "POST",
        body: JSON.stringify({ assetId: "non-existent-asset" }),
      });
      const res = await handleFinalize(req);
      expect(res.status).toBe(404);
      const json = await readJson(res);
      expect(json.error).toBe("NOT_FOUND");
      expect(mockFinalizeUploadFn).not.toHaveBeenCalled();
    });

    it("returns 403 FORBIDDEN when attempting to finalize another user's asset (ownership check)", async () => {
      const req = new Request("http://localhost:3000/api/assets/finalize", {
        method: "POST",
        body: JSON.stringify({ assetId: "asset-other-user" }),
      });
      const res = await handleFinalize(req);
      expect(res.status).toBe(403);
      const json = await readJson(res);
      expect(json.error).toBe("FORBIDDEN");
      expect(mockFinalizeUploadFn).not.toHaveBeenCalled();
    });

    it("returns 409 FINALIZE_FAILED when object is not uploaded in R2 yet (stale-state)", async () => {
      mockFinalizeUploadFn.mockResolvedValueOnce({
        ok: false,
        reason: "object not uploaded yet",
      });
      const req = new Request("http://localhost:3000/api/assets/finalize", {
        method: "POST",
        body: JSON.stringify({ assetId: "asset-owned-1" }),
      });
      const res = await handleFinalize(req);
      expect(res.status).toBe(409);
      const json = await readJson(res);
      expect(json.error).toBe("FINALIZE_FAILED");
      expect(json.reason).toContain("not uploaded");
    });

    it("returns 200 on successful finalization", async () => {
      const req = new Request("http://localhost:3000/api/assets/finalize", {
        method: "POST",
        body: JSON.stringify({ assetId: "  asset-owned-1  " }),
      });
      const res = await handleFinalize(req);
      expect(res.status).toBe(200);
      const json = await readJson(res);
      expect(json.code).toBe(0);
      expect(json.data.assetId).toBe("asset-owned-1");
      expect(json.data.lifecycle).toBe("quarantined");
      expect(mockFinalizeUploadFn).toHaveBeenCalledWith(mockEnv, "asset-owned-1");
    });

    it("returns 200 on idempotent retry of already finalized asset", async () => {
      mockFinalizeUploadFn.mockResolvedValueOnce({
        ok: true,
        lifecycle: "quarantined",
      });
      const req = new Request("http://localhost:3000/api/assets/finalize", {
        method: "POST",
        body: JSON.stringify({ assetId: "asset-owned-1" }),
      });
      const res = await handleFinalize(req);
      expect(res.status).toBe(200);
      const json = await readJson(res);
      expect(json.code).toBe(0);
      expect(json.data.lifecycle).toBe("quarantined");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. PATCH /api/projects/[id]/favorite
  // ───────────────────────────────────────────────────────────────────────────
  describe("PATCH /api/projects/[id]/favorite", () => {
    const ctx = { params: Promise.resolve({ id: "proj-1" }) };

    it("returns 401 when unauthenticated", async () => {
      mockAuthResult = null;
      const req = new Request("http://localhost:3000/api/projects/proj-1/favorite", {
        method: "PATCH",
        body: JSON.stringify({ favorite: true }),
      });
      const res = await handleFavorite(req, ctx);
      expect(res.status).toBe(401);
      const json = await readJson(res);
      expect(json.error).toBe("UNAUTHENTICATED");
      expect(mockToggleFavoriteFn).not.toHaveBeenCalled();
    });

    it("returns 403 when email is not verified", async () => {
      mockAuthResult = Response.json({ error: "EMAIL_NOT_VERIFIED" }, { status: 403 });
      const req = new Request("http://localhost:3000/api/projects/proj-1/favorite", {
        method: "PATCH",
        body: JSON.stringify({ favorite: true }),
      });
      const res = await handleFavorite(req, ctx);
      expect(res.status).toBe(403);
      const json = await readJson(res);
      expect(json.error).toBe("EMAIL_NOT_VERIFIED");
      expect(mockToggleFavoriteFn).not.toHaveBeenCalled();
    });

    it("returns 400 INVALID_JSON on malformed body", async () => {
      const req = new Request("http://localhost:3000/api/projects/proj-1/favorite", {
        method: "PATCH",
        body: "bad-json",
      });
      const res = await handleFavorite(req, ctx);
      expect(res.status).toBe(400);
      const json = await readJson(res);
      expect(json.error).toBe("INVALID_JSON");
      expect(mockToggleFavoriteFn).not.toHaveBeenCalled();
    });

    it("returns 400 INVALID_INPUT on missing favorite", async () => {
      const req = new Request("http://localhost:3000/api/projects/proj-1/favorite", {
        method: "PATCH",
        body: JSON.stringify({}),
      });
      const res = await handleFavorite(req, ctx);
      expect(res.status).toBe(400);
      const json = await readJson(res);
      expect(json.error).toBe("INVALID_INPUT");
      expect(json.details.favorite).toBeDefined();
      expect(mockToggleFavoriteFn).not.toHaveBeenCalled();
    });

    it("returns 400 INVALID_INPUT on non-boolean favorite (string, number, array, object, null)", async () => {
      for (const badFav of ["true", "false", 1, 0, null, [], {}]) {
        const req = new Request("http://localhost:3000/api/projects/proj-1/favorite", {
          method: "PATCH",
          body: JSON.stringify({ favorite: badFav }),
        });
        const res = await handleFavorite(req, ctx);
        expect(res.status).toBe(400);
        const json = await readJson(res);
        expect(json.error).toBe("INVALID_INPUT");
        expect(json.details.favorite).toBeDefined();
      }
      expect(mockToggleFavoriteFn).not.toHaveBeenCalled();
    });

    it("returns 400 INVALID_INPUT on unknown/extra fields (.strict() rejection)", async () => {
      const req = new Request("http://localhost:3000/api/projects/proj-1/favorite", {
        method: "PATCH",
        body: JSON.stringify({
          favorite: true,
          visibility: "unlisted",
          injected: "hack",
        }),
      });
      const res = await handleFavorite(req, ctx);
      expect(res.status).toBe(400);
      const json = await readJson(res);
      expect(json.error).toBe("INVALID_INPUT");
      expect(mockToggleFavoriteFn).not.toHaveBeenCalled();
    });

    it("returns 404 NOT_FOUND when project does not exist", async () => {
      mockToggleFavoriteFn.mockRejectedValueOnce(new Error("NOT_FOUND"));
      const req = new Request("http://localhost:3000/api/projects/proj-1/favorite", {
        method: "PATCH",
        body: JSON.stringify({ favorite: true }),
      });
      const res = await handleFavorite(req, ctx);
      expect(res.status).toBe(404);
      const json = await readJson(res);
      expect(json.error).toBe("NOT_FOUND");
    });

    it("returns 403 FORBIDDEN when user does not own the project", async () => {
      mockToggleFavoriteFn.mockRejectedValueOnce(new Error("FORBIDDEN"));
      const req = new Request("http://localhost:3000/api/projects/proj-1/favorite", {
        method: "PATCH",
        body: JSON.stringify({ favorite: true }),
      });
      const res = await handleFavorite(req, ctx);
      expect(res.status).toBe(403);
      const json = await readJson(res);
      expect(json.error).toBe("FORBIDDEN");
    });

    it("toggles favorite to true and returns 200 on valid input", async () => {
      const req = new Request("http://localhost:3000/api/projects/proj-1/favorite", {
        method: "PATCH",
        body: JSON.stringify({ favorite: true }),
      });
      const res = await handleFavorite(req, ctx);
      expect(res.status).toBe(200);
      const json = await readJson(res);
      expect(json.code).toBe(0);
      expect(json.data).toEqual({ id: "proj-1", favorite: true });
      expect(mockToggleFavoriteFn).toHaveBeenCalledWith(mockEnv, "user-test-1", "proj-1", true);
    });

    it("toggles favorite to false and returns 200 on valid input", async () => {
      const req = new Request("http://localhost:3000/api/projects/proj-1/favorite", {
        method: "PATCH",
        body: JSON.stringify({ favorite: false }),
      });
      const res = await handleFavorite(req, ctx);
      expect(res.status).toBe(200);
      const json = await readJson(res);
      expect(json.code).toBe(0);
      expect(json.data).toEqual({ id: "proj-1", favorite: false });
      expect(mockToggleFavoriteFn).toHaveBeenCalledWith(mockEnv, "user-test-1", "proj-1", false);
    });
  });
});
