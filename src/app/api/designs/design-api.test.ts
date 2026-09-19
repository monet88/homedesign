import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { POST as postDesigns } from "@/app/api/designs/route";
import { POST as postGenerate } from "@/app/api/ai/generate/route";
import { POST as postQuery } from "@/app/api/ai/query/route";
import { GET as getDesignById } from "@/app/api/designs/[id]/route";
import type { ResolvedSession, AuthEnv } from "@/lib/auth/server";

async function readJson<T = any>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

// Current mock session state
let mockSession: ResolvedSession | null = null;

const verifiedUserSession: ResolvedSession = {
  session: {
    id: "sess-verified",
    userId: "user-verified",
    expiresAt: new Date(Date.now() + 3600000),
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  user: {
    id: "user-verified",
    name: "Verified User",
    email: "user@example.com",
    emailVerified: true,
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
};

const unverifiedUserSession: ResolvedSession = {
  session: {
    id: "sess-unverified",
    userId: "user-unverified",
    expiresAt: new Date(Date.now() + 3600000),
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  user: {
    id: "user-unverified",
    name: "Unverified User",
    email: "unverified@example.com",
    emailVerified: false,
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
};

// In-memory data store for D1 mock
interface MockAsset {
  id: string;
  user_id: string | null;
  lifecycle: string;
  storage_key: string | null;
  mime_type: string;
  size: number;
}

interface MockTask {
  id: string;
  scene: string;
  provider: string;
  model: string;
  prompt: string;
  source_key: string | null;
  status: string;
  created_at: number;
  updated_at: number;
  user_id: string | null;
  hold_id: string | null;
  cost_credits: number | null;
  expires_at: number | null;
  expired_at: number | null;
  provider_task_id: string | null;
  error_code: string | null;
  validation_attempts: number;
  dispatched_at: number | null;
}

interface MockDesign {
  id: string;
  user_id: string;
  project_id: string;
  scene: string;
  stage: string | null;
  provider: string;
  model: string;
  provider_scene: string;
  prompt: string;
  config_json: string;
  source_asset_id: string;
  output_asset_id: string | null;
  cost_credits: number;
  idempotency_key: string;
  created_at: number;
  updated_at: number;
  completed_at: number | null;
}

interface MockIdempotencyRow {
  id: string;
  user_id: string;
  operation: string;
  idempotency_key: string;
  request_fingerprint: string;
  result_type: string;
  result_id: string;
  created_at: number;
}

let mockAssets: MockAsset[] = [];
let mockTasks: MockTask[] = [];
let mockDesigns: MockDesign[] = [];
let mockIdempotencyKeys: MockIdempotencyRow[] = [];
let userCredits = 10;
let queueMessages: unknown[] = [];

function createMockDb() {
  return {
    async batch(stmts: Array<{ run: () => Promise<{ success: boolean }> }>) {
      for (const s of stmts) {
        await s.run();
      }
      return [];
    },
    prepare(query: string) {
      let boundArgs: any[] = [];
      const stmt = {
        bind(...args: any[]) {
          boundArgs = args;
          return stmt;
        },
        async first<T = any>(): Promise<T | null> {
          const q = query.trim().toUpperCase();

          // Asset query
          if (q.includes("FROM ASSETS WHERE ID = ?1")) {
            const assetId = boundArgs[0];
            const found = mockAssets.find((a) => a.id === assetId);
            return (found as unknown as T) ?? null;
          }

          // Available credits check
          if (q.includes("CREDIT_LEDGER") || q.includes("CREDIT_HOLDS")) {
            return { available: userCredits } as unknown as T;
          }

          // Free grant check
          if (q.includes("SELECT 1 FROM CREDIT_LEDGER WHERE USER_ID = ?1 AND REASON = 'FREE_GRANT'")) {
            return { 1: 1 } as unknown as T;
          }

          // Idempotency check
          if (q.includes("FROM IDEMPOTENCY_KEYS WHERE USER_ID = ?1 AND OPERATION = ?2 AND IDEMPOTENCY_KEY = ?3")) {
            const [userId, op, key] = boundArgs;
            const found = mockIdempotencyKeys.find(
              (r) => r.user_id === userId && r.operation === op && r.idempotency_key === key
            );
            return (found as unknown as T) ?? null;
          }

          // Project lookup
          if (q.includes("SELECT ID FROM PROJECTS WHERE USER_ID = ?1 AND KIND = ?2 AND SOURCE_ASSET_ID = ?3")) {
            return { id: "proj-1" } as unknown as T;
          }

          // Task lookup
          if (q.includes("FROM AI_TASKS WHERE ID = ?1")) {
            const taskId = boundArgs[0];
            const found = mockTasks.find((t) => t.id === taskId);
            return (found as unknown as T) ?? null;
          }

          // Design lookup
          if (q.includes("FROM DESIGNS WHERE ID = ?1")) {
            const designId = boundArgs[0];
            const found = mockDesigns.find((d) => d.id === designId);
            return (found as unknown as T) ?? null;
          }

          return null;
        },
        async all<T = any>(): Promise<{ results: T[] }> {
          return { results: [] };
        },
        async run(): Promise<{ success: boolean }> {
          const q = query.trim().toUpperCase();

          if (q.includes("INSERT INTO AI_TASKS")) {
            const [id, scene, provider, model, prompt, source_key, user_id, hold_id, cost_credits, expires_at, now] = boundArgs;
            mockTasks.push({
              id,
              scene,
              provider,
              model,
              prompt,
              source_key,
              status: "accepted",
              created_at: now || Date.now(),
              updated_at: now || Date.now(),
              user_id,
              hold_id,
              cost_credits,
              expires_at,
              expired_at: null,
              provider_task_id: null,
              error_code: null,
              validation_attempts: 0,
              dispatched_at: null,
            });
            return { success: true };
          }

          if (q.includes("INSERT INTO IDEMPOTENCY_KEYS")) {
            const [id, userId, op, key, fingerprint, resultType, resultId, now] = boundArgs;
            mockIdempotencyKeys.push({
              id,
              user_id: userId,
              operation: op,
              idempotency_key: key,
              request_fingerprint: fingerprint,
              result_type: resultType,
              result_id: resultId,
              created_at: now,
            });
            return { success: true };
          }

          if (q.includes("INSERT INTO DESIGNS")) {
            const [id, user_id, project_id, scene, stage, provider, model, provider_scene, prompt, config_json, source_asset_id, cost_credits, idempotency_key, now] = boundArgs;
            mockDesigns.push({
              id,
              user_id,
              project_id,
              scene,
              stage,
              provider,
              model,
              provider_scene,
              prompt,
              config_json,
              source_asset_id,
              output_asset_id: null,
              cost_credits,
              idempotency_key,
              created_at: now,
              updated_at: now,
              completed_at: null,
            });
            return { success: true };
          }

          if (q.includes("UPDATE AI_TASKS SET DISPATCHED_AT")) {
            const [taskId, dispatchedAt] = boundArgs;
            const t = mockTasks.find((item) => item.id === taskId);
            if (t) t.dispatched_at = dispatchedAt;
            return { success: true };
          }

          return { success: true };
        },
      };
      return stmt;
    },
  };
}

const mockEnv: AuthEnv = {
  ENVIRONMENT: "development",
  BETTER_AUTH_SECRET: "test-secret-at-least-32-chars-long",
  BETTER_AUTH_URL: "http://localhost:3000",
  AI_API_BASE_URL: "https://pro.autommo.online/v1",
  AI_API_KEY: "mock-ai-api-key",
  DB: createMockDb() as unknown as AuthEnv["DB"],
  HD_PRIVATE: {
    put: vi.fn().mockResolvedValue({}),
    get: vi.fn().mockResolvedValue(null),
    delete: vi.fn().mockResolvedValue({}),
  } as unknown as AuthEnv["HD_PRIVATE"],
  HD_PUBLIC: {} as unknown as AuthEnv["HD_PUBLIC"],
  NEXT_INC_CACHE_R2_BUCKET: {} as unknown as AuthEnv["NEXT_INC_CACHE_R2_BUCKET"],
  ASSET_VALIDATE: {} as unknown as AuthEnv["ASSET_VALIDATE"],
  PROVIDER_NOTIFY: {
    send: vi.fn().mockImplementation(async (msg: unknown) => {
      queueMessages.push(msg);
    }),
  } as unknown as AuthEnv["PROVIDER_NOTIFY"],
  WORKER_SELF_REFERENCE: {} as unknown as AuthEnv["WORKER_SELF_REFERENCE"],
  ASSETS: {} as unknown as AuthEnv["ASSETS"],
} as unknown as AuthEnv;

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: vi.fn().mockImplementation(async () => ({
    env: {
      ...mockEnv,
      DB: createMockDb(),
    },
  })),
}));

vi.mock("@/lib/auth/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/server")>();
  return {
    ...actual,
    resolveSession: vi.fn().mockImplementation(async () => mockSession),
    requireVerifiedUser: vi.fn().mockImplementation((session: ResolvedSession | null) => {
      if (!session) throw Object.assign(new Error("UNAUTHENTICATED"), { status: 401 });
      if (!session.user.emailVerified) throw Object.assign(new Error("EMAIL_NOT_VERIFIED"), { status: 403 });
    }),
  };
});

function validInteriorPayload(overrides: Record<string, unknown> = {}) {
  return {
    sourceAssetId: "asset-valid-1",
    scene: "interior",
    intent: { mode: "redesign", roomType: "living room", style: "modern" },
    options: { aspect_ratio: "1:1", num_outputs: 1 },
    idempotencyKey: `idem-${Math.random()}`,
    ...overrides,
  };
}

function validExteriorPayload(overrides: Record<string, unknown> = {}) {
  return {
    sourceAssetId: "asset-valid-1",
    scene: "exterior",
    intent: { mode: "redesign", area: "backyard", style: "modern" },
    options: { aspect_ratio: "16:9", num_outputs: 2 },
    idempotencyKey: `idem-${Math.random()}`,
    ...overrides,
  };
}

describe("Design Generation Entry Points Contract Matrix (Ticket #44)", () => {
  beforeEach(() => {
    mockSession = verifiedUserSession;
    userCredits = 10;
    mockTasks = [];
    mockDesigns = [];
    mockIdempotencyKeys = [];
    queueMessages = [];
    mockAssets = [
      {
        id: "asset-valid-1",
        user_id: "user-verified",
        lifecycle: "ready",
        storage_key: "ready/asset-valid-1.png",
        mime_type: "image/png",
        size: 1024,
      },
      {
        id: "asset-not-ready",
        user_id: "user-verified",
        lifecycle: "quarantined",
        storage_key: "quarantine/asset-not-ready.png",
        mime_type: "image/png",
        size: 1024,
      },
      {
        id: "asset-other-user",
        user_id: "other-user",
        lifecycle: "ready",
        storage_key: "ready/asset-other-user.png",
        mime_type: "image/png",
        size: 1024,
      },
    ];
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // Entry points to test with the same matrix
  const entryPoints = [
    {
      name: "POST /api/designs (Canonical)",
      endpoint: postDesigns,
      expectedEnvelope: "canonical",
    },
    {
      name: "POST /api/ai/generate (Compat Alias)",
      endpoint: postGenerate,
      expectedEnvelope: "compat",
    },
  ] as const;

  for (const { name, endpoint, expectedEnvelope } of entryPoints) {
    describe(name, () => {
      // 1. Success cases
      it("succeeds for valid interior generation and returns documented response envelope", async () => {
        const payload = validInteriorPayload();
        const req = new Request("http://localhost:3000", {
          method: "POST",
          body: JSON.stringify(payload),
        });

        const res = await endpoint(req);
        expect(res.status).toBe(200);
        const json = await readJson(res);

        expect(json.code).toBe(0);
        expect(json.data?.id).toBeDefined();

        if (expectedEnvelope === "canonical") {
          expect(json.data.status).toBe("accepted");
          expect(json.data.cost).toBe(1);
          expect(json.data.projectId).toBeDefined();
          expect(json.data.cached).toBe(false);
        } else {
          expect(json.message).toBe("ok");
          expect(json.data.status).toBeUndefined();
        }
      });

      it("succeeds for valid exterior generation", async () => {
        const payload = validExteriorPayload();
        const req = new Request("http://localhost:3000", {
          method: "POST",
          body: JSON.stringify(payload),
        });

        const res = await endpoint(req);
        expect(res.status).toBe(200);
        const json = await readJson(res);
        expect(json.code).toBe(0);
        expect(json.data?.id).toBeDefined();
      });

      // 2. Auth rejections
      it("rejects unauthenticated requests with 401", async () => {
        mockSession = null;
        const req = new Request("http://localhost:3000", {
          method: "POST",
          body: JSON.stringify(validInteriorPayload()),
        });

        const res = await endpoint(req);
        expect(res.status).toBe(401);
        const json = await readJson(res);
        expect(json.error).toBe("UNAUTHENTICATED");
      });

      it("rejects unverified email users with 403", async () => {
        mockSession = unverifiedUserSession;
        const req = new Request("http://localhost:3000", {
          method: "POST",
          body: JSON.stringify(validInteriorPayload()),
        });

        const res = await endpoint(req);
        expect(res.status).toBe(403);
        const json = await readJson(res);
        expect(json.error).toBe("EMAIL_NOT_VERIFIED");
      });

      // 3. Validation rejections (Zod strict schema)
      it("rejects invalid JSON body with 400 INVALID_JSON", async () => {
        const req = new Request("http://localhost:3000", {
          method: "POST",
          body: "invalid-json-body",
        });

        const res = await endpoint(req);
        expect(res.status).toBe(400);
        const json = await readJson(res);
        expect(json.error).toBe("INVALID_JSON");
      });

      it("rejects unknown fields at root level with 400 INVALID_CONFIG", async () => {
        const req = new Request("http://localhost:3000", {
          method: "POST",
          body: JSON.stringify(validInteriorPayload({ unexpectedRoot: "value" })),
        });

        const res = await endpoint(req);
        expect(res.status).toBe(400);
        const json = await readJson(res);
        expect(json.error).toBe("INVALID_CONFIG");
      });

      it("rejects unknown fields in options with 400 INVALID_OPTIONS", async () => {
        const req = new Request("http://localhost:3000", {
          method: "POST",
          body: JSON.stringify(
            validInteriorPayload({ options: { aspect_ratio: "1:1", badOption: 123 } })
          ),
        });

        const res = await endpoint(req);
        expect(res.status).toBe(400);
        const json = await readJson(res);
        expect(json.error).toBe("INVALID_OPTIONS");
      });

      it("rejects unknown fields in intent with 400 INVALID_INTENT", async () => {
        const req = new Request("http://localhost:3000", {
          method: "POST",
          body: JSON.stringify(
            validInteriorPayload({
              intent: { mode: "redesign", roomType: "living room", badIntentField: true },
            })
          ),
        });

        const res = await endpoint(req);
        expect(res.status).toBe(400);
        const json = await readJson(res);
        expect(json.error).toBe("INVALID_INTENT");
      });

      it("rejects client prompts with 400 PROMPT_NOT_ALLOWED", async () => {
        const req = new Request("http://localhost:3000", {
          method: "POST",
          body: JSON.stringify(
            validInteriorPayload({ prompt: "make it modern and luxury" })
          ),
        });

        const res = await endpoint(req);
        expect(res.status).toBe(400);
        const json = await readJson(res);
        expect(json.error).toBe("PROMPT_NOT_ALLOWED");
      });

      it("rejects client image_input with 400 IMAGE_INPUT_NOT_ALLOWED", async () => {
        const req = new Request("http://localhost:3000", {
          method: "POST",
          body: JSON.stringify(
            validInteriorPayload({ options: { image_input: ["https://evil.com/img.png"] } })
          ),
        });

        const res = await endpoint(req);
        expect(res.status).toBe(400);
        const json = await readJson(res);
        expect(json.error).toBe("IMAGE_INPUT_NOT_ALLOWED");
      });

      it("rejects storage keys in sourceAssetId with 400 OBJECT_KEY_NOT_ALLOWED", async () => {
        const req = new Request("http://localhost:3000", {
          method: "POST",
          body: JSON.stringify(
            validInteriorPayload({ sourceAssetId: "ready/asset-123.png" })
          ),
        });

        const res = await endpoint(req);
        expect(res.status).toBe(400);
        const json = await readJson(res);
        expect(json.error).toBe("OBJECT_KEY_NOT_ALLOWED");
      });

      it("rejects URLs in sourceAssetId with 400 URL_NOT_ALLOWED", async () => {
        const req = new Request("http://localhost:3000", {
          method: "POST",
          body: JSON.stringify(
            validInteriorPayload({ sourceAssetId: "https://evil.com/source.png" })
          ),
        });

        const res = await endpoint(req);
        expect(res.status).toBe(400);
        const json = await readJson(res);
        expect(json.error).toBe("URL_NOT_ALLOWED");
      });

      it("rejects inline images in sourceAssetId with 400 INLINE_IMAGE_NOT_ALLOWED", async () => {
        const req = new Request("http://localhost:3000", {
          method: "POST",
          body: JSON.stringify(
            validInteriorPayload({ sourceAssetId: "data:image/png;base64,iVBORw0KGgo=" })
          ),
        });

        const res = await endpoint(req);
        expect(res.status).toBe(400);
        const json = await readJson(res);
        expect(json.error).toBe("INLINE_IMAGE_NOT_ALLOWED");
      });

      it("rejects unknown scene with 400 INVALID_SCENE", async () => {
        const req = new Request("http://localhost:3000", {
          method: "POST",
          body: JSON.stringify(validInteriorPayload({ scene: "kitchen-3d" })),
        });

        const res = await endpoint(req);
        expect(res.status).toBe(400);
        const json = await readJson(res);
        expect(json.error).toBe("INVALID_SCENE");
      });

      it("rejects missing idempotencyKey with 400 IDEMPOTENCY_KEY_REQUIRED", async () => {
        const req = new Request("http://localhost:3000", {
          method: "POST",
          body: JSON.stringify(validInteriorPayload({ idempotencyKey: "   " })),
        });

        const res = await endpoint(req);
        expect(res.status).toBe(400);
        const json = await readJson(res);
        expect(json.error).toBe("IDEMPOTENCY_KEY_REQUIRED");
      });

      // 4. Domain & Resource Gates
      it("returns 404 ASSET_NOT_FOUND when sourceAssetId does not exist", async () => {
        const req = new Request("http://localhost:3000", {
          method: "POST",
          body: JSON.stringify(validInteriorPayload({ sourceAssetId: "non-existent" })),
        });

        const res = await endpoint(req);
        expect(res.status).toBe(404);
        const json = await readJson(res);
        expect(json.error).toBe("ASSET_NOT_FOUND");
      });

      it("returns 403 FORBIDDEN when source asset is owned by another user", async () => {
        const req = new Request("http://localhost:3000", {
          method: "POST",
          body: JSON.stringify(validInteriorPayload({ sourceAssetId: "asset-other-user" })),
        });

        const res = await endpoint(req);
        expect(res.status).toBe(403);
        const json = await readJson(res);
        expect(json.error).toBe("FORBIDDEN");
      });

      it("returns 409 SOURCE_ASSET_NOT_READY when source asset is not in ready state", async () => {
        const req = new Request("http://localhost:3000", {
          method: "POST",
          body: JSON.stringify(validInteriorPayload({ sourceAssetId: "asset-not-ready" })),
        });

        const res = await endpoint(req);
        expect(res.status).toBe(409);
        const json = await readJson(res);
        expect(json.error).toBe("SOURCE_ASSET_NOT_READY");
      });

      it("returns 402 INSUFFICIENT_CREDITS when available credits is less than cost", async () => {
        userCredits = 0;
        const req = new Request("http://localhost:3000", {
          method: "POST",
          body: JSON.stringify(validInteriorPayload()),
        });

        const res = await endpoint(req);
        expect(res.status).toBe(402);
        const json = await readJson(res);
        expect(json.error).toBe("INSUFFICIENT_CREDITS");
      });
    });
  }
});

describe("Design Query Endpoints Contract Matrix (Ticket #44)", () => {
  beforeEach(() => {
    mockSession = verifiedUserSession;
    mockTasks = [
      {
        id: "task-001",
        scene: "interior",
        provider: "gemini",
        model: "gemini-3.1-flash-image",
        prompt: "Modern living room",
        source_key: "ready/asset-1.png",
        status: "ready",
        created_at: 1700000000000,
        updated_at: 1700000010000,
        user_id: "user-verified",
        hold_id: "hold-1",
        cost_credits: 1,
        expires_at: null,
        expired_at: null,
        provider_task_id: "prov-1",
        error_code: null,
        validation_attempts: 1,
        dispatched_at: 1700000001000,
      },
      {
        id: "task-other-user",
        scene: "interior",
        provider: "gemini",
        model: "gemini-3.1-flash-image",
        prompt: "Other room",
        source_key: "ready/asset-2.png",
        status: "ready",
        created_at: 1700000000000,
        updated_at: 1700000010000,
        user_id: "other-user",
        hold_id: "hold-2",
        cost_credits: 1,
        expires_at: null,
        expired_at: null,
        provider_task_id: "prov-2",
        error_code: null,
        validation_attempts: 1,
        dispatched_at: 1700000001000,
      },
    ];
    mockDesigns = [
      {
        id: "task-001",
        user_id: "user-verified",
        project_id: "proj-1",
        scene: "interior",
        stage: null,
        provider: "gemini",
        model: "gemini-3.1-flash-image",
        provider_scene: "image-to-image",
        prompt: "Modern living room",
        config_json: "{}",
        source_asset_id: "asset-1",
        output_asset_id: "asset-output-1",
        cost_credits: 1,
        idempotency_key: "idem-001",
        created_at: 1700000000000,
        updated_at: 1700000010000,
        completed_at: 1700000010000,
      },
    ];
    mockAssets = [
      {
        id: "asset-output-1",
        user_id: "user-verified",
        lifecycle: "ready",
        storage_key: "ready/asset-output-1.png",
        mime_type: "image/png",
        size: 1024,
      },
    ];
  });

  describe("POST /api/ai/query", () => {
    it("returns 200 with status view for valid taskId", async () => {
      const req = new Request("http://localhost:3000/api/ai/query", {
        method: "POST",
        body: JSON.stringify({ taskId: "task-001" }),
      });

      const res = await postQuery(req);
      expect(res.status).toBe(200);
      const json = await readJson(res);
      expect(json.code).toBe(0);
      expect(json.data.id).toBe("task-001");
      expect(json.data.status).toBe("success");
      expect(json.data.outputAssetId).toBe("asset-output-1");
    });

    it("rejects missing taskId with 400 INVALID_REQUEST", async () => {
      const req = new Request("http://localhost:3000/api/ai/query", {
        method: "POST",
        body: JSON.stringify({}),
      });

      const res = await postQuery(req);
      expect(res.status).toBe(400);
      const json = await readJson(res);
      expect(json.error).toBe("INVALID_REQUEST");
    });

    it("rejects unknown fields in query body with 400 INVALID_REQUEST", async () => {
      const req = new Request("http://localhost:3000/api/ai/query", {
        method: "POST",
        body: JSON.stringify({ taskId: "task-001", unexpectedField: "bad" }),
      });

      const res = await postQuery(req);
      expect(res.status).toBe(400);
      const json = await readJson(res);
      expect(json.error).toBe("INVALID_REQUEST");
    });

    it("rejects unsafe taskId (e.g. data URL, URL, object key) with 400 INVALID_REQUEST", async () => {
      const req = new Request("http://localhost:3000/api/ai/query", {
        method: "POST",
        body: JSON.stringify({ taskId: "https://evil.com/task" }),
      });

      const res = await postQuery(req);
      expect(res.status).toBe(400);
      const json = await readJson(res);
      expect(json.error).toBe("INVALID_REQUEST");
    });

    it("returns 404 TASK_NOT_FOUND when task does not exist", async () => {
      const req = new Request("http://localhost:3000/api/ai/query", {
        method: "POST",
        body: JSON.stringify({ taskId: "task-non-existent" }),
      });

      const res = await postQuery(req);
      expect(res.status).toBe(404);
      const json = await readJson(res);
      expect(json.error).toBe("TASK_NOT_FOUND");
    });

    it("returns 403 FORBIDDEN when task belongs to another user", async () => {
      const req = new Request("http://localhost:3000/api/ai/query", {
        method: "POST",
        body: JSON.stringify({ taskId: "task-other-user" }),
      });

      const res = await postQuery(req);
      expect(res.status).toBe(403);
      const json = await readJson(res);
      expect(json.error).toBe("FORBIDDEN");
    });
  });

  describe("GET /api/designs/[id]", () => {
    it("returns 200 with status view for valid id", async () => {
      const req = new Request("http://localhost:3000/api/designs/task-001");
      const res = await getDesignById(req, { params: Promise.resolve({ id: "task-001" }) });

      expect(res.status).toBe(200);
      const json = await readJson(res);
      expect(json.code).toBe(0);
      expect(json.data.id).toBe("task-001");
      expect(json.data.status).toBe("success");
      expect(json.data.outputAssetId).toBe("asset-output-1");
    });

    it("rejects unsafe id with 400 INVALID_REQUEST", async () => {
      const req = new Request("http://localhost:3000/api/designs/invalid");
      const res = await getDesignById(req, {
        params: Promise.resolve({ id: "https://evil.com/task" }),
      });

      expect(res.status).toBe(400);
      const json = await readJson(res);
      expect(json.error).toBe("INVALID_REQUEST");
    });

    it("returns 404 TASK_NOT_FOUND when task does not exist", async () => {
      const req = new Request("http://localhost:3000/api/designs/task-non-existent");
      const res = await getDesignById(req, {
        params: Promise.resolve({ id: "task-non-existent" }),
      });

      expect(res.status).toBe(404);
      const json = await readJson(res);
      expect(json.error).toBe("TASK_NOT_FOUND");
    });

    it("returns 403 FORBIDDEN when task belongs to another user", async () => {
      const req = new Request("http://localhost:3000/api/designs/task-other-user");
      const res = await getDesignById(req, {
        params: Promise.resolve({ id: "task-other-user" }),
      });

      expect(res.status).toBe(403);
      const json = await readJson(res);
      expect(json.error).toBe("FORBIDDEN");
    });
  });
});
