import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { GET as getUsers } from "@/app/api/admin/users/route";
import { POST as adjustCredits } from "@/app/api/admin/credits/route";
import { GET as getTasks } from "@/app/api/admin/tasks/route";
import {
  GET as getHealth,
  POST as postHealth,
} from "@/app/api/admin/health/route";
import type { ResolvedSession, AuthEnv } from "@/lib/auth/server";
import type {
  AdminApiResponse,
  AdminApiErrorResponse,
  AdminCreditAdjustmentData,
  AdminTasksData,
  AdminUsersData,
  HealthCheckResult,
} from "@/lib/admin/types";

async function readJson<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

// Current mock session state
let mockSession: ResolvedSession | null = null;

const adminSession: ResolvedSession = {
  session: {
    id: "sess-admin",
    userId: "user-admin",
    expiresAt: new Date(Date.now() + 3600000),
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  user: {
    id: "user-admin",
    name: "Admin User",
    email: "minhthang421992@gmail.com",
    emailVerified: true,
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
};

const standardUserSession: ResolvedSession = {
  session: {
    id: "sess-user",
    userId: "user-standard",
    expiresAt: new Date(Date.now() + 3600000),
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  user: {
    id: "user-standard",
    name: "Standard User",
    email: "user@example.com",
    emailVerified: true,
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
};

// In-memory data store for D1 mock
interface MockUser {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: number;
}

interface MockLedgerEntry {
  id: string;
  user_id: string;
  entry_type: string;
  amount: number;
  reason: string;
  created_at: number;
}

interface MockTask {
  id: string;
  scene: string;
  provider: string;
  model: string;
  prompt: string;
  status: string;
  created_at: number;
  updated_at: number;
  cost_credits: number | null;
  error_code: string | null;
}

let mockUsers: MockUser[] = [];
let mockLedger: MockLedgerEntry[] = [];
let mockTasks: MockTask[] = [];

function createMockDb() {
  return {
    prepare(query: string) {
      let boundArgs: any[] = [];
      const stmt = {
        bind(...args: any[]) {
          boundArgs = args;
          return stmt;
        },
        async first<T = any>(): Promise<T | null> {
          const q = query.trim().toUpperCase();
          if (q.includes("COUNT(*)")) {
            return { total: mockUsers.length } as unknown as T;
          }
          if (q.includes("SELECT ID FROM USER WHERE ID = ?1")) {
            const u = mockUsers.find((user) => user.id === boundArgs[0]);
            return u ? ({ id: u.id } as unknown as T) : null;
          }
          if (q.includes("CREDIT_LEDGER") || q.includes("CREDIT_HOLDS") || q.includes("AVAILABLE")) {
            const userId = boundArgs[0];
            const grants = mockLedger
              .filter(
                (l) =>
                  l.user_id === userId &&
                  (l.entry_type === "grant" || l.entry_type === "payment")
              )
              .reduce((sum, l) => sum + l.amount, 0);
            const usage = mockLedger
              .filter(
                (l) => l.user_id === userId && l.entry_type === "usage"
              )
              .reduce((sum, l) => sum + l.amount, 0);
            return { available: Math.max(0, grants - usage) } as unknown as T;
          }
          return null;
        },
        async all<T = any>(): Promise<{ results: T[] }> {
          const q = query.trim().toUpperCase();
          if (q.includes("FROM USER U")) {
            let userList = [...mockUsers];
            if (boundArgs.length >= 2) {
              const limit = boundArgs[0];
              const offset = boundArgs[1];
              userList = userList.slice(offset, offset + limit);
            }
            const results = userList.map((u) => {
              const grants = mockLedger
                .filter(
                  (l) =>
                    l.user_id === u.id &&
                    (l.entry_type === "grant" ||
                      l.entry_type === "payment" ||
                      l.entry_type === "release" ||
                      l.entry_type === "adjustment")
                )
                .reduce((sum, l) => sum + l.amount, 0);
              const usage = mockLedger
                .filter(
                  (l) =>
                    l.user_id === u.id &&
                    (l.entry_type === "usage" || l.entry_type === "hold")
                )
                .reduce((sum, l) => sum + l.amount, 0);
              return {
                id: u.id,
                name: u.name,
                email: u.email,
                role: u.role,
                createdAt: u.createdAt,
                creditBalance: Math.max(0, grants - usage),
              };
            });
            return { results: results as unknown as T[] };
          }
          if (q.includes("FROM AI_TASKS")) {
            return { results: [...mockTasks] as unknown as T[] };
          }
          return { results: [] };
        },
        async run(): Promise<{ success: boolean }> {
          const q = query.trim().toUpperCase();
          if (q.includes("INSERT INTO CREDIT_LEDGER")) {
            const [id, user_id, entry_type, amount, reason, , , , created_at] =
              boundArgs;
            mockLedger.push({
              id,
              user_id,
              entry_type,
              amount,
              reason,
              created_at: created_at || Date.now(),
            });
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
  AI_API_BASE_URL: "https://cliproxy.monet.uno/v1",
  AI_API_KEY: "mock-ai-api-key",
  DB: createMockDb() as unknown as AuthEnv["DB"],
} as unknown as AuthEnv;

vi.mock("@/lib/auth/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/server")>();
  return {
    ...actual,
    requireAdminSession: vi.fn().mockImplementation(async () => {
      if (!mockSession) {
        return {
          authorized: false,
          status: 401,
          error: "UNAUTHORIZED",
          env: {
            ...mockEnv,
            DB: createMockDb(),
          },
        };
      }
      if (mockSession.user.role !== "admin") {
        return {
          authorized: false,
          status: 403,
          error: "FORBIDDEN",
          env: {
            ...mockEnv,
            DB: createMockDb(),
          },
        };
      }
      return {
        authorized: true,
        user: mockSession.user,
        session: mockSession.session,
        env: {
          ...mockEnv,
          DB: createMockDb(),
        },
      };
    }),
  };
});

describe("Admin Operations API Endpoints", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    mockSession = null;
    mockUsers = [
      {
        id: "user-admin",
        name: "Admin User",
        email: "minhthang421992@gmail.com",
        role: "admin",
        createdAt: 1700000000000,
      },
      {
        id: "user-standard",
        name: "Standard User",
        email: "user@example.com",
        role: "user",
        createdAt: 1700000100000,
      },
    ];
    mockLedger = [
      {
        id: "ledger-admin-init",
        user_id: "user-admin",
        entry_type: "grant",
        amount: 99999,
        reason: "Initial Admin Grant",
        created_at: 1700000000000,
      },
      {
        id: "ledger-user-init",
        user_id: "user-standard",
        entry_type: "grant",
        amount: 10,
        reason: "Free Tier Grant",
        created_at: 1700000100000,
      },
    ];
    mockTasks = [
      {
        id: "task-001",
        scene: "interior",
        provider: "gemini",
        model: "gemini-3.1-flash-image",
        prompt: "Modern living room warm lighting",
        status: "ready",
        created_at: 1700000200000,
        updated_at: 1700000215000,
        cost_credits: 5,
        error_code: null,
      },
      {
        id: "task-002",
        scene: "exterior",
        provider: "gemini",
        model: "gemini-3.1-flash-image",
        prompt: "Modern farmhouse facade",
        status: "failed",
        created_at: 1700000300000,
        updated_at: 1700000305000,
        cost_credits: 5,
        error_code: "PROVIDER_RATE_LIMIT",
      },
    ];
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.unstubAllGlobals();
  });

  // 1. GET /api/admin/users
  describe("GET /api/admin/users", () => {
    it("returns 401 when request has no session", async () => {
      mockSession = null;
      const req = new Request("http://localhost:3000/api/admin/users");
      const res = await getUsers(req);

      expect(res.status).toBe(401);
      const json = await readJson<AdminApiErrorResponse>(res);
      expect(json.error).toBe("UNAUTHORIZED");
    });

    it("returns 403 when session user role is 'user'", async () => {
      mockSession = standardUserSession;
      const req = new Request("http://localhost:3000/api/admin/users");
      const res = await getUsers(req);

      expect(res.status).toBe(403);
      const json = await readJson<AdminApiErrorResponse>(res);
      expect(json.error).toBe("FORBIDDEN");
    });

    it("returns 200 with registered user list and credit balances with pagination for admin", async () => {
      mockSession = adminSession;
      const req = new Request("http://localhost:3000/api/admin/users");
      const res = await getUsers(req);

      expect(res.status).toBe(200);
      const json = await readJson<AdminApiResponse<AdminUsersData>>(res);
      expect(json.code).toBe(0);
      expect(Array.isArray(json.data.users)).toBe(true);
      expect(json.data.users.length).toBe(2);
      expect(json.data.pagination).toEqual({
        page: 1,
        limit: 20,
        total: 2,
        totalPages: 1,
      });

      const admin = json.data.users.find((u) => u.email === "minhthang421992@gmail.com");
      expect(admin).toBeDefined();
      expect(admin?.role).toBe("admin");
      expect(admin?.creditBalance).toBe(99999);

      const standard = json.data.users.find((u) => u.email === "user@example.com");
      expect(standard).toBeDefined();
      expect(standard?.role).toBe("user");
      expect(standard?.creditBalance).toBe(10);
    });

    it("respects page and limit search parameters", async () => {
      mockSession = adminSession;
      const req = new Request("http://localhost:3000/api/admin/users?page=1&limit=1");
      const res = await getUsers(req);

      expect(res.status).toBe(200);
      const json = await readJson<AdminApiResponse<AdminUsersData>>(res);
      expect(json.code).toBe(0);
      expect(json.data.users.length).toBe(1);
      expect(json.data.pagination).toEqual({
        page: 1,
        limit: 1,
        total: 2,
        totalPages: 2,
      });
    });
  });

  // 2. POST /api/admin/credits
  describe("POST /api/admin/credits", () => {
    it("returns 401 when request has no session", async () => {
      mockSession = null;
      const req = new Request("http://localhost:3000/api/admin/credits", {
        method: "POST",
        body: JSON.stringify({ userId: "user-standard", amount: 100 }),
      });
      const res = await adjustCredits(req);
      expect(res.status).toBe(401);
    });

    it("returns 403 when session user role is 'user'", async () => {
      mockSession = standardUserSession;
      const req = new Request("http://localhost:3000/api/admin/credits", {
        method: "POST",
        body: JSON.stringify({ userId: "user-standard", amount: 100 }),
      });
      const res = await adjustCredits(req);
      expect(res.status).toBe(403);
    });

    it("returns 400 when body has invalid JSON or missing fields", async () => {
      mockSession = adminSession;
      const req = new Request("http://localhost:3000/api/admin/credits", {
        method: "POST",
        body: "invalid-json",
      });
      const res = await adjustCredits(req);
      expect(res.status).toBe(400);

      const reqMissing = new Request("http://localhost:3000/api/admin/credits", {
        method: "POST",
        body: JSON.stringify({ amount: 0 }),
      });
      const resMissing = await adjustCredits(reqMissing);
      expect(resMissing.status).toBe(400);
    });

    it("returns 404 when userId is not found", async () => {
      mockSession = adminSession;
      const req = new Request("http://localhost:3000/api/admin/credits", {
        method: "POST",
        body: JSON.stringify({ userId: "non-existent-user", amount: 100 }),
      });
      const res = await adjustCredits(req);
      expect(res.status).toBe(404);
      const json = await readJson<AdminApiErrorResponse>(res);
      expect(json.error).toBe("USER_NOT_FOUND");
    });

    it("grants credits and returns updated credit balance for admin", async () => {
      mockSession = adminSession;
      const req = new Request("http://localhost:3000/api/admin/credits", {
        method: "POST",
        body: JSON.stringify({
          userId: "user-standard",
          amount: 500,
          reason: "Support compensation grant",
        }),
      });
      const res = await adjustCredits(req);

      expect(res.status).toBe(200);
      const json = await readJson<AdminApiResponse<AdminCreditAdjustmentData>>(res);
      expect(json.code).toBe(0);
      expect(json.data.userId).toBe("user-standard");
      expect(json.data.creditBalance).toBe(510); // 10 + 500
      expect(json.data.amount).toBe(500);
      expect(json.data.reason).toBe("Support compensation grant");
    });

    it("deducts credits (negative amount) for admin", async () => {
      mockSession = adminSession;
      const req = new Request("http://localhost:3000/api/admin/credits", {
        method: "POST",
        body: JSON.stringify({
          userId: "user-standard",
          amount: -5,
          reason: "Manual penalty deduction",
        }),
      });
      const res = await adjustCredits(req);

      expect(res.status).toBe(200);
      const json = await readJson<AdminApiResponse<AdminCreditAdjustmentData>>(res);
      expect(json.code).toBe(0);
      expect(json.data.userId).toBe("user-standard");
      expect(json.data.creditBalance).toBe(5); // 10 - 5
    });
  });

  // 3. GET /api/admin/tasks
  describe("GET /api/admin/tasks", () => {
    it("returns 401 when request has no session", async () => {
      mockSession = null;
      const req = new Request("http://localhost:3000/api/admin/tasks");
      const res = await getTasks(req);
      expect(res.status).toBe(401);
    });

    it("returns 403 when session user role is 'user'", async () => {
      mockSession = standardUserSession;
      const req = new Request("http://localhost:3000/api/admin/tasks");
      const res = await getTasks(req);
      expect(res.status).toBe(403);
    });

    it("returns 200 with recent AI tasks for admin", async () => {
      mockSession = adminSession;
      const req = new Request("http://localhost:3000/api/admin/tasks");
      const res = await getTasks(req);

      expect(res.status).toBe(200);
      const json = await readJson<AdminApiResponse<AdminTasksData>>(res);
      expect(json.code).toBe(0);
      expect(Array.isArray(json.data.tasks)).toBe(true);
      expect(json.data.tasks.length).toBe(2);

      const task1 = json.data.tasks[0];
      expect(task1.id).toBe("task-001");
      expect(task1.scene).toBe("interior");
      expect(task1.status).toBe("ready");
      expect(task1.duration).toBe(15000);
      expect(task1.durationMs).toBe(15000);

      const task2 = json.data.tasks[1];
      expect(task2.id).toBe("task-002");
      expect(task2.status).toBe("failed");
      expect(task2.error_code).toBe("PROVIDER_RATE_LIMIT");
    });
  });

  // 4. GET & POST /api/admin/health
  describe("GET & POST /api/admin/health", () => {
    it("returns 401 when unauthenticated", async () => {
      mockSession = null;
      const req = new Request("http://localhost:3000/api/admin/health");
      const res = await getHealth(req);
      expect(res.status).toBe(401);
    });

    it("returns 403 when session user role is 'user'", async () => {
      mockSession = standardUserSession;
      const req = new Request("http://localhost:3000/api/admin/health");
      const res = await getHealth(req);
      expect(res.status).toBe(403);
    });

    it("returns healthy status and model list when upstream AI endpoint succeeds", async () => {
      mockSession = adminSession;
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({
            data: [
              { id: "gemini-3.1-flash-image" },
              { id: "gemini-2.5-flash-image" },
            ],
          }),
        })
      );

      const req = new Request("http://localhost:3000/api/admin/health", { method: "POST" });
      const res = await postHealth(req);

      expect(res.status).toBe(200);
      const json = await readJson<AdminApiResponse<HealthCheckResult>>(res);
      expect(json.code).toBe(0);
      expect(json.data.status).toBe("healthy");
      expect(json.data.latencyMs).toBeGreaterThan(0);
      expect(json.data.models).toContain("gemini-3.1-flash-image");
      expect(json.data.models).toContain("gemini-2.5-flash-image");
      expect(json.data.endpoint).toContain("/models");
    });

    it("returns unhealthy status when upstream AI endpoint fails or throws", async () => {
      mockSession = adminSession;
      vi.stubGlobal(
        "fetch",
        vi.fn().mockRejectedValue(new Error("ECONNREFUSED"))
      );

      const req = new Request("http://localhost:3000/api/admin/health", { method: "GET" });
      const res = await getHealth(req);

      expect(res.status).toBe(200);
      const json = await readJson<AdminApiResponse<HealthCheckResult>>(res);
      expect(json.code).toBe(0);
      expect(json.data.status).toBe("unhealthy");
      expect(json.data.models).toEqual([]);
    });
  });
});
