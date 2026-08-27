import { describe, expect, it } from "vitest";
import {
  requireAdminSession,
  type AdminAuthResult,
  seedAdminDatabase,
  getAdminSeedConfig,
} from "@/lib/auth/admin";
import type { AuthEnv, ResolvedSession } from "@/lib/auth/server";

describe("requireAdminSession (RBAC Auth Middleware)", () => {
  const mockEnv: AuthEnv = {
    ENVIRONMENT: "development",
    BETTER_AUTH_SECRET: "test-secret-at-least-32-chars-long",
    BETTER_AUTH_URL: "http://localhost:3000",
    DB: {} as unknown as AuthEnv["DB"],
  } as unknown as AuthEnv;

  it("returns 401 when request has no session (unauthenticated)", async () => {
    const request = new Request("http://localhost:3000/admin");
    const result = await requireAdminSession(request, mockEnv, async () => null);

    expect(result.authorized).toBe(false);
    if (!result.authorized) {
      expect(result.status).toBe(401);
      expect(result.error).toMatch(/UNAUTH/i);
    }
  });

  it("returns 403 when session user role is 'user' (non-admin)", async () => {
    const request = new Request("http://localhost:3000/admin");
    const userSession: ResolvedSession = {
      session: {
        id: "sess-user-1",
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

    const result = await requireAdminSession(request, mockEnv, async () => userSession);

    expect(result.authorized).toBe(false);
    if (!result.authorized) {
      expect(result.status).toBe(403);
      expect(result.error).toMatch(/FORBIDDEN/i);
    }
  });

  it("returns authorized: true when session user role is 'admin'", async () => {
    const request = new Request("http://localhost:3000/admin");
    const adminSession: ResolvedSession = {
      session: {
        id: "sess-admin-1",
        userId: "admin-1",
        expiresAt: new Date(Date.now() + 3600000),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      user: {
        id: "admin-1",
        name: "Admin User",
        email: "minhthang421992@gmail.com",
        emailVerified: true,
        role: "admin",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    };

    const result = await requireAdminSession(request, mockEnv, async () => adminSession);

    expect(result.authorized).toBe(true);
    if (result.authorized) {
      expect(result.user.email).toBe("minhthang421992@gmail.com");
      expect(result.user.role).toBe("admin");
      expect(result.session.id).toBe("sess-admin-1");
    }
  });

  it("supports (env, request) argument ordering", async () => {
    const request = new Request("http://localhost:3000/admin");
    const adminSession: ResolvedSession = {
      session: {
        id: "sess-admin-2",
        userId: "admin-2",
        expiresAt: new Date(Date.now() + 3600000),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      user: {
        id: "admin-2",
        name: "Admin",
        email: "admin@example.com",
        emailVerified: true,
        role: "admin",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    };

    const result = await requireAdminSession(mockEnv, request, async () => adminSession);
    expect(result.authorized).toBe(true);
  });
});

describe("getAdminSeedConfig", () => {
  it("returns default admin credentials when env vars are not set", () => {
    const config = getAdminSeedConfig({});
    expect(config.email).toBe("minhthang421992@gmail.com");
    expect(config.password).toBeUndefined();
    expect(config.credits).toBe(99999);
    expect(config.role).toBe("admin");
  });

  it("reads custom admin credentials from environment", () => {
    const config = getAdminSeedConfig({
      ADMIN_EMAIL: "custom_admin@example.com",
      ADMIN_PASSWORD: "test-admin-password-123!",
      ADMIN_INITIAL_CREDITS: "50000",
      ADMIN_NAME: "Super Admin",
    });
    expect(config.email).toBe("custom_admin@example.com");
    expect(config.password).toBe("test-admin-password-123!");
    expect(config.credits).toBe(50000);
    expect(config.name).toBe("Super Admin");
  });
});

describe("seedAdminDatabase", () => {
  it("generates idempotent SQL migration statements for admin provisioning", async () => {
    const config = {
      email: "minhthang421992@gmail.com",
      password: "test-admin-password-123!",
      credits: 99999,
      name: "Administrator",
      role: "admin" as const,
    };

    const statements = await seedAdminDatabase.generateSqlStatements(config);
    expect(statements.length).toBeGreaterThan(0);
    const sqlCombined = statements.join("\n");

    expect(sqlCombined).toContain("minhthang421992@gmail.com");
    expect(sqlCombined).toContain("admin");
    expect(sqlCombined).toContain("99999");
    expect(sqlCombined).toContain("credit_ledger");
  });
});
