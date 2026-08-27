import { describe, expect, it, vi, beforeEach } from "vitest";
import { GET as getOutbox } from "@/app/api/auth/test-outbox/route";
import {
  deliverVerificationEmail,
  listOutbox,
  authorizeOutboxRequest,
  type AuthEnv,
  type ResolvedSession,
} from "@/lib/auth/server";

interface MockOutboxRow {
  id: number;
  to_email: string;
  subject: string;
  body: string;
  verification_url: string;
  token_fingerprint: string;
  created_at: number;
  expires_at: number;
  user_id: string | null;
  environment: string;
}

let mockOutboxRows: MockOutboxRow[] = [];
let nextId = 1;

function createMockDb() {
  return {
    prepare(query: string) {
      let boundArgs: unknown[] = [];
      const stmt = {
        bind(...args: unknown[]) {
          boundArgs = args;
          return stmt;
        },
        async first<T = unknown>(): Promise<T | null> {
          const q = query.trim().toUpperCase();
          if (q.includes("COUNT(*)")) {
            const email = String(boundArgs[0]);
            const envName = boundArgs.length > 2 ? String(boundArgs[1]) : null;
            const since = Number(boundArgs.length > 2 ? boundArgs[2] : boundArgs[1]);
            const matching = mockOutboxRows.filter((r) => {
              if (r.to_email !== email) return false;
              if (r.created_at <= since) return false;
              if (envName && r.environment !== envName && r.environment) return false;
              return true;
            });
            return { cnt: matching.length } as unknown as T;
          }
          return null;
        },
        async all<T = unknown>(): Promise<{ results: T[] }> {
          const q = query.trim().toUpperCase();
          if (q.includes("FROM EMAIL_OUTBOX")) {
            const email = q.includes("TO_EMAIL = ?1") ? String(boundArgs[0]) : undefined;
            const envName = email ? String(boundArgs[1]) : String(boundArgs[0]);
            const filtered = mockOutboxRows.filter((r) => {
              if (email && r.to_email !== email) return false;
              if (envName && r.environment && r.environment !== envName) return false;
              return true;
            });
            return { results: filtered as unknown as T[] };
          }
          return { results: [] };
        },
        async run(): Promise<{ success: boolean }> {
          const q = query.trim().toUpperCase();
          if (q.includes("DELETE FROM EMAIL_OUTBOX WHERE EXPIRES_AT < ?1")) {
            const expireThreshold = Number(boundArgs[0]);
            mockOutboxRows = mockOutboxRows.filter((r) => r.expires_at >= expireThreshold);
            return { success: true };
          }
          if (q.includes("INSERT INTO EMAIL_OUTBOX")) {
            const [
              to_email,
              subject,
              body,
              verification_url,
              token_fingerprint,
              created_at,
              expires_at,
              user_id,
              environment,
            ] = boundArgs;
            mockOutboxRows.push({
              id: nextId++,
              to_email: String(to_email),
              subject: String(subject),
              body: String(body),
              verification_url: String(verification_url),
              token_fingerprint: String(token_fingerprint),
              created_at: Number(created_at),
              expires_at: Number(expires_at),
              user_id: user_id ? String(user_id) : null,
              environment: environment ? String(environment) : "development",
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

const baseEnv: AuthEnv = {
  ENVIRONMENT: "development",
  BETTER_AUTH_SECRET: "test-auth-secret-32-chars-minimum-length",
  BETTER_AUTH_URL: "http://localhost:3000",
  OUTBOX_ACCESS_SECRET: "test-outbox-secret-key-12345",
  DB: createMockDb() as unknown as AuthEnv["DB"],
  HD_PRIVATE: {} as unknown as AuthEnv["HD_PRIVATE"],
  HD_PUBLIC: {} as unknown as AuthEnv["HD_PUBLIC"],
  NEXT_INC_CACHE_R2_BUCKET: {} as unknown as AuthEnv["NEXT_INC_CACHE_R2_BUCKET"],
  ASSET_VALIDATE: {} as unknown as AuthEnv["ASSET_VALIDATE"],
  PROVIDER_NOTIFY: {} as unknown as AuthEnv["PROVIDER_NOTIFY"],
  WORKER_SELF_REFERENCE: {} as unknown as AuthEnv["WORKER_SELF_REFERENCE"],
  ASSETS: {} as unknown as AuthEnv["ASSETS"],
};

const adminSession: ResolvedSession = {
  session: {
    id: "sess-admin",
    userId: "admin-1",
    expiresAt: new Date(Date.now() + 3600000),
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  user: {
    id: "admin-1",
    name: "Admin User",
    email: "admin@example.com",
    emailVerified: true,
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
};

const standardUserSession: ResolvedSession = {
  session: {
    id: "sess-user",
    userId: "user-1",
    expiresAt: new Date(Date.now() + 3600000),
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  user: {
    id: "user-1",
    name: "Standard User",
    email: "user@example.com",
    emailVerified: true,
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
};

describe("Authentication test outbox security (Ticket #32)", () => {
  beforeEach(() => {
    mockOutboxRows = [];
    nextId = 1;
  });

  describe("AC 1: Anonymous read denied", () => {
    it("rejects anonymous GET request in development with 401 UNAUTHORIZED", async () => {
      const req = new Request("http://localhost:3000/api/auth/test-outbox");
      const res = await getOutbox(req, { ...baseEnv, DB: createMockDb() as unknown as AuthEnv["DB"] });
      expect(res.status).toBe(401);
      expect(res.headers.get("cache-control")).toBe("no-store");
      const data = (await res.json()) as { error: string };
      expect(data).toEqual({ error: "UNAUTHORIZED" });
    });

    it("rejects anonymous GET request in preview environment with 401", async () => {
      const previewEnv: AuthEnv = {
        ...baseEnv,
        ENVIRONMENT: "preview",
        DB: createMockDb() as unknown as AuthEnv["DB"],
      };
      const req = new Request("https://preview.example.com/api/auth/test-outbox");
      const res = await getOutbox(req, previewEnv);
      expect(res.status).toBe(401);
      expect(res.headers.get("cache-control")).toBe("no-store");
    });

    it("rejects anonymous GET request in staging environment with 401", async () => {
      const stagingEnv: AuthEnv = {
        ...baseEnv,
        ENVIRONMENT: "staging",
        DB: createMockDb() as unknown as AuthEnv["DB"],
      };
      const req = new Request("https://staging.example.com/api/auth/test-outbox");
      const res = await getOutbox(req, stagingEnv);
      expect(res.status).toBe(401);
      expect(res.headers.get("cache-control")).toBe("no-store");
    });
  });

  describe("AC 1 & AC 2: Spoofed headers denied", () => {
    it("rejects invalid Bearer token with 401", async () => {
      const req = new Request("http://localhost:3000/api/auth/test-outbox", {
        headers: { Authorization: "Bearer invalid-token" },
      });
      const res = await getOutbox(req, { ...baseEnv, DB: createMockDb() as unknown as AuthEnv["DB"] });
      expect(res.status).toBe(401);
      expect(res.headers.get("cache-control")).toBe("no-store");
    });

    it("rejects invalid x-outbox-secret header with 401", async () => {
      const req = new Request("http://localhost:3000/api/auth/test-outbox", {
        headers: { "x-outbox-secret": "wrong-secret" },
      });
      const res = await getOutbox(req, { ...baseEnv, DB: createMockDb() as unknown as AuthEnv["DB"] });
      expect(res.status).toBe(401);
    });

    it("rejects spoofed role / access headers without valid session or capability secret", async () => {
      const req = new Request("http://localhost:3000/api/auth/test-outbox", {
        headers: {
          "x-role": "admin",
          "x-admin": "true",
          "cf-access-authenticated-user-email": "admin@example.com",
          "x-forwarded-for": "127.0.0.1",
        },
      });
      const res = await getOutbox(req, { ...baseEnv, DB: createMockDb() as unknown as AuthEnv["DB"] });
      expect(res.status).toBe(401);
      expect(res.headers.get("cache-control")).toBe("no-store");
    });

    it("rejects authenticated standard user (non-admin) with 403 FORBIDDEN", async () => {
      const req = new Request("http://localhost:3000/api/auth/test-outbox");
      const customResolver = vi.fn().mockResolvedValue(standardUserSession);
      const auth = await authorizeOutboxRequest(baseEnv, req, customResolver);
      expect(auth.authorized).toBe(false);
      if (!auth.authorized) {
        expect(auth.status).toBe(403);
        expect(auth.error).toBe("FORBIDDEN");
      }
    });
  });

  describe("AC 2: Authorized reads succeed", () => {
    it("allows access with OUTBOX_ACCESS_SECRET Bearer token", async () => {
      const db = createMockDb();
      const env: AuthEnv = { ...baseEnv, DB: db as unknown as AuthEnv["DB"] };
      await deliverVerificationEmail(
        env,
        "user@example.com",
        "http://localhost:3000/verify-email?token=t1",
        "t1",
        "test-outbox"
      );

      const req = new Request("http://localhost:3000/api/auth/test-outbox", {
        headers: { Authorization: `Bearer ${baseEnv.OUTBOX_ACCESS_SECRET}` },
      });
      const res = await getOutbox(req, env);
      expect(res.status).toBe(200);
      expect(res.headers.get("cache-control")).toBe("no-store");
      const data = (await res.json()) as { messages: Array<{ to_email: string }> };
      expect(data.messages).toHaveLength(1);
      expect(data.messages[0].to_email).toBe("user@example.com");
    });

    it("allows access with x-outbox-secret header", async () => {
      const db = createMockDb();
      const env: AuthEnv = { ...baseEnv, DB: db as unknown as AuthEnv["DB"] };
      await deliverVerificationEmail(
        env,
        "user2@example.com",
        "http://localhost:3000/verify-email?token=t2",
        "t2",
        "test-outbox"
      );

      const req = new Request("http://localhost:3000/api/auth/test-outbox", {
        headers: { "x-outbox-secret": baseEnv.OUTBOX_ACCESS_SECRET! },
      });
      const res = await getOutbox(req, env);
      expect(res.status).toBe(200);
      const data = (await res.json()) as { messages: Array<{ to_email: string }> };
      expect(data.messages).toHaveLength(1);
      expect(data.messages[0].to_email).toBe("user2@example.com");
    });

    it("allows access with BETTER_AUTH_SECRET credential", async () => {
      const db = createMockDb();
      const env: AuthEnv = { ...baseEnv, DB: db as unknown as AuthEnv["DB"] };
      await deliverVerificationEmail(
        env,
        "user3@example.com",
        "http://localhost:3000/verify-email?token=t3",
        "t3",
        "test-outbox"
      );

      const req = new Request("http://localhost:3000/api/auth/test-outbox", {
        headers: { Authorization: `Bearer ${baseEnv.BETTER_AUTH_SECRET}` },
      });
      const res = await getOutbox(req, env);
      expect(res.status).toBe(200);
      const data = (await res.json()) as { messages: Array<{ to_email: string }> };
      expect(data.messages).toHaveLength(1);
    });

    it("allows access for authenticated admin session", async () => {
      const req = new Request("http://localhost:3000/api/auth/test-outbox");
      const customResolver = vi.fn().mockResolvedValue(adminSession);
      const auth = await authorizeOutboxRequest(baseEnv, req, customResolver);
      expect(auth.authorized).toBe(true);
      if (auth.authorized) {
        expect(auth.user?.role).toBe("admin");
        expect(auth.authMethod).toBe("admin-session");
      }
    });

    it("allows access in local environment with local dev credential", async () => {
      const localEnv: AuthEnv = {
        ...baseEnv,
        ENVIRONMENT: "local",
        ALLOW_LOCAL_OUTBOX_ACCESS: "1",
        DB: createMockDb() as unknown as AuthEnv["DB"],
      };
      const req = new Request("http://localhost:3000/api/auth/test-outbox", {
        headers: { "x-outbox-secret": "local-outbox-secret" },
      });
      const res = await getOutbox(req, localEnv);
      expect(res.status).toBe(200);
      expect(res.headers.get("cache-control")).toBe("no-store");
    });
  });

  describe("AC 2: Cross-environment access isolation and rejection", () => {
    it("rejects cross-environment read via ?environment query parameter with 403", async () => {
      const env: AuthEnv = { ...baseEnv, ENVIRONMENT: "development", DB: createMockDb() as unknown as AuthEnv["DB"] };
      const req = new Request("http://localhost:3000/api/auth/test-outbox?environment=staging", {
        headers: { Authorization: `Bearer ${baseEnv.OUTBOX_ACCESS_SECRET}` },
      });
      const res = await getOutbox(req, env);
      expect(res.status).toBe(403);
      expect(res.headers.get("cache-control")).toBe("no-store");
      const data = (await res.json()) as { error: string };
      expect(data).toEqual({ error: "CROSS_ENVIRONMENT_FORBIDDEN" });
    });

    it("rejects cross-environment read via x-environment header with 403", async () => {
      const env: AuthEnv = { ...baseEnv, ENVIRONMENT: "preview", DB: createMockDb() as unknown as AuthEnv["DB"] };
      const req = new Request("https://preview.example.com/api/auth/test-outbox", {
        headers: {
          Authorization: `Bearer ${baseEnv.OUTBOX_ACCESS_SECRET}`,
          "x-environment": "production",
        },
      });
      const res = await getOutbox(req, env);
      expect(res.status).toBe(403);
      expect(res.headers.get("cache-control")).toBe("no-store");
    });

    it("filters out messages belonging to other environment namespaces", async () => {
      const db = createMockDb();
      const devEnv: AuthEnv = { ...baseEnv, ENVIRONMENT: "development", DB: db as unknown as AuthEnv["DB"] };
      const stagingEnv: AuthEnv = { ...baseEnv, ENVIRONMENT: "staging", DB: db as unknown as AuthEnv["DB"] };

      await deliverVerificationEmail(
        devEnv,
        "dev-user@example.com",
        "http://localhost:3000/verify-email?token=dev1",
        "dev1"
      );
      await deliverVerificationEmail(
        stagingEnv,
        "staging-user@example.com",
        "https://staging.example.com/verify-email?token=stage1",
        "stage1"
      );

      const devOutbox = await listOutbox(devEnv);
      expect(devOutbox.results).toHaveLength(1);
      const devRow = devOutbox.results[0] as { to_email: string };
      expect(devRow.to_email).toBe("dev-user@example.com");

      const stagingOutbox = await listOutbox(stagingEnv);
      expect(stagingOutbox.results).toHaveLength(1);
      const stagingRow = stagingOutbox.results[0] as { to_email: string };
      expect(stagingRow.to_email).toBe("staging-user@example.com");
    });
  });

  describe("AC 3: Production hides outbox entirely (404 semantics)", () => {
    const prodEnv: AuthEnv = {
      ...baseEnv,
      ENVIRONMENT: "production",
      DB: createMockDb() as unknown as AuthEnv["DB"],
    };

    it("returns 404 for anonymous request in production", async () => {
      const req = new Request("https://homedesign.com/api/auth/test-outbox");
      const res = await getOutbox(req, prodEnv);
      expect(res.status).toBe(404);
      expect(res.headers.get("cache-control")).toBe("no-store");
      const data = (await res.json()) as { error: string };
      expect(data).toEqual({ error: "not found" });
    });

    it("returns 404 for request with valid capability secret in production", async () => {
      const req = new Request("https://homedesign.com/api/auth/test-outbox", {
        headers: { Authorization: `Bearer ${baseEnv.OUTBOX_ACCESS_SECRET}` },
      });
      const res = await getOutbox(req, prodEnv);
      expect(res.status).toBe(404);
      expect(res.headers.get("cache-control")).toBe("no-store");
      const data = (await res.json()) as { error: string };
      expect(data).toEqual({ error: "not found" });
    });

    it("returns 404 for request with admin credentials in production", async () => {
      const req = new Request("https://homedesign.com/api/auth/test-outbox", {
        headers: {
          Authorization: `Bearer ${baseEnv.BETTER_AUTH_SECRET}`,
          "x-outbox-secret": baseEnv.OUTBOX_ACCESS_SECRET!,
        },
      });
      const res = await getOutbox(req, prodEnv);
      expect(res.status).toBe(404);
      expect(res.headers.get("cache-control")).toBe("no-store");
    });

    it("returns 404 for spoofed headers in production", async () => {
      const req = new Request("https://homedesign.com/api/auth/test-outbox", {
        headers: {
          "x-role": "admin",
          "x-admin": "true",
          "cf-access-authenticated-user-email": "admin@example.com",
        },
      });
      const res = await getOutbox(req, prodEnv);
      expect(res.status).toBe(404);
      expect(res.headers.get("cache-control")).toBe("no-store");
    });
  });

  describe("AC 4: Non-cacheable responses", () => {
    it("ensures all response types include cache-control: no-store", async () => {
      const env = { ...baseEnv, DB: createMockDb() as unknown as AuthEnv["DB"] };

      // 401
      const res401 = await getOutbox(new Request("http://localhost:3000/api/auth/test-outbox"), env);
      expect(res401.headers.get("cache-control")).toBe("no-store");

      // 403 cross-env
      const res403 = await getOutbox(
        new Request("http://localhost:3000/api/auth/test-outbox?environment=staging", {
          headers: { Authorization: `Bearer ${baseEnv.OUTBOX_ACCESS_SECRET}` },
        }),
        env
      );
      expect(res403.headers.get("cache-control")).toBe("no-store");

      // 404 production
      const res404 = await getOutbox(
        new Request("http://localhost:3000/api/auth/test-outbox"),
        { ...env, ENVIRONMENT: "production" }
      );
      expect(res404.headers.get("cache-control")).toBe("no-store");

      // 200 success
      const res200 = await getOutbox(
        new Request("http://localhost:3000/api/auth/test-outbox", {
          headers: { Authorization: `Bearer ${baseEnv.OUTBOX_ACCESS_SECRET}` },
        }),
        env
      );
      expect(res200.headers.get("cache-control")).toBe("no-store");
    });
  });
});
