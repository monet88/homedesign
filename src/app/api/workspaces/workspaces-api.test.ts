import { describe, expect, it, vi, beforeEach } from "vitest";
import { GET as getWorkspaces, POST as createWorkspaceRoute } from "./route";
import { GET as getWorkspaceDetail, DELETE as deleteWorkspaceRoute } from "./[id]/route";
import { POST as inviteMemberRoute } from "./[id]/invites/route";
import { GET as checkInviteRoute, POST as acceptInviteRoute } from "./invites/accept/route";
import { DELETE as removeMemberRoute, PATCH as updateMemberRoleRoute } from "./[id]/members/[memberId]/route";
import { POST as allocateCreditsRoute } from "./[id]/credits/allocate/route";
import { GET as listCustomPresetsRoute, POST as createCustomPresetRoute } from "@/app/api/presets/custom/route";
import { GET as getCustomPresetRoute, DELETE as deleteCustomPresetRoute } from "@/app/api/presets/custom/[id]/route";
import type { ResolvedSession, AuthEnv } from "@/lib/auth/server";

let mockSession: ResolvedSession | null = null;

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
    name: "Alex Architect",
    email: "alex@studio.com",
    emailVerified: true,
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
};

const mockEnv = {
  DB: {
    prepare: vi.fn().mockImplementation((query: string) => ({
      bind: vi.fn().mockReturnThis(),
      first: vi.fn().mockImplementation(async () => {
        if (query.includes("FROM workspaces w") && query.includes("wm.user_id = ?2")) {
          return {
            id: "ws-1",
            name: "Vibe Studio",
            slug: "vibe-studio-123456",
            owner_id: "user-1",
            credit_pool_enabled: 1,
            created_at: 1000,
            updated_at: 1000,
            role: "owner",
          };
        }
        if (query.includes("FROM workspace_invites wi") && query.includes("wi.token = ?1")) {
          return {
            id: "inv-1",
            workspace_id: "ws-1",
            email: "alex@studio.com",
            role: "architect",
            token: "test-token-123",
            expires_at: Date.now() + 100000,
            invited_by: "user-owner",
            created_at: Date.now() - 1000,
            workspaceName: "Vibe Studio",
            inviterName: "Owner User",
          };
        }
        if (query.includes("FROM custom_presets WHERE id = ?1")) {
          return {
            id: "cp-1",
            workspace_id: "ws-1",
            user_id: "user-1",
            name: "Nordic Minimalist",
            description: "Nordic style",
            scene: "interior",
            preferred_materials: JSON.stringify(["Oak", "Linen"]),
            created_at: 1000,
            updated_at: 1000,
          };
        }
        if (query.includes("AS available")) {
          return { available: 50 };
        }
        return null;
      }),
      all: vi.fn().mockImplementation(async () => {
        if (query.includes("FROM workspaces w")) {
          return {
            results: [
              {
                id: "ws-1",
                name: "Vibe Studio",
                slug: "vibe-studio-123456",
                owner_id: "user-1",
                credit_pool_enabled: 1,
                created_at: 1000,
                updated_at: 1000,
                role: "owner",
                memberCount: 2,
              },
            ],
          };
        }
        if (query.includes("FROM workspace_members wm")) {
          return {
            results: [
              {
                id: "wm-1",
                workspace_id: "ws-1",
                user_id: "user-1",
                role: "owner",
                joined_at: 1000,
                name: "Alex Architect",
                email: "alex@studio.com",
              },
            ],
          };
        }
        if (query.includes("FROM custom_presets")) {
          return {
            results: [
              {
                id: "cp-1",
                workspace_id: "ws-1",
                user_id: "user-1",
                name: "Nordic Minimalist",
                description: "Nordic style",
                scene: "interior",
                preferred_materials: JSON.stringify(["Oak", "Linen"]),
                created_at: 1000,
                updated_at: 1000,
              },
            ],
          };
        }
        return { results: [] };
      }),
      run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
    })),
    batch: vi.fn().mockImplementation(async (statements: unknown[]) => {
      return statements.map(() => ({ results: [], meta: { changes: 1 } }));
    }),
  },
};

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: vi.fn(async () => ({ env: mockEnv })),
}));

vi.mock("@/lib/auth/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/server")>();
  return {
    ...actual,
    resolveSession: vi.fn(async () => mockSession),
  };
});

describe("Workspaces API Routes (Sprint 8)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSession = userSession;
  });

  it("GET /api/workspaces returns workspaces for authenticated user", async () => {
    const req = new Request("http://localhost/api/workspaces");
    const res = await getWorkspaces(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.code).toBe(0);
    expect(json.data.workspaces.length).toBe(1);
    expect(json.data.workspaces[0].name).toBe("Vibe Studio");
  });

  it("POST /api/workspaces creates a new workspace", async () => {
    const req = new Request("http://localhost/api/workspaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Studio Zen Design", slug: "studio-zen" }),
    });
    const res = await createWorkspaceRoute(req);
    expect(res.status).toBe(201);
    const json = (await res.json()) as any;
    expect(json.code).toBe(0);
    expect(json.data.workspace.name).toBe("Studio Zen Design");
    expect(json.data.workspace.role).toBe("owner");
  });

  it("GET /api/workspaces/[id] returns workspace detail with permissions and members", async () => {
    const req = new Request("http://localhost/api/workspaces/ws-1");
    const res = await getWorkspaceDetail(req, { params: Promise.resolve({ id: "ws-1" }) });
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.code).toBe(0);
    expect(json.data.workspace.id).toBe("ws-1");
    expect(json.data.workspace.permissions.canManageMembers).toBe(true);
    expect(json.data.workspace.members.length).toBe(1);
  });

  it("POST /api/workspaces/[id]/invites creates invite token", async () => {
    const req = new Request("http://localhost/api/workspaces/ws-1/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "collaborator@studio.com", role: "architect" }),
    });
    const res = await inviteMemberRoute(req, { params: Promise.resolve({ id: "ws-1" }) });
    expect(res.status).toBe(201);
    const json = (await res.json()) as any;
    expect(json.code).toBe(0);
    expect(json.data.invite.email).toBe("collaborator@studio.com");
    expect(json.data.invite.role).toBe("architect");
  });

  it("GET /api/workspaces/invites/accept verifies invite token", async () => {
    const req = new Request("http://localhost/api/workspaces/invites/accept?token=valid-token-123");
    const res = await checkInviteRoute(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.code).toBe(0);
    expect(json.data.invite.workspaceName).toBe("Vibe Studio");
  });

  it("POST /api/workspaces/invites/accept joins workspace when email matches", async () => {
    const req = new Request("http://localhost/api/workspaces/invites/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "test-token-123" }),
    });
    const res = await acceptInviteRoute(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.code).toBe(0);
    expect(json.data.workspaceId).toBe("ws-1");
  });

  it("POST /api/workspaces/[id]/credits/allocate allocates credits to shared pool", async () => {
    const req = new Request("http://localhost/api/workspaces/ws-1/credits/allocate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: 20 }),
    });
    const res = await allocateCreditsRoute(req, { params: Promise.resolve({ id: "ws-1" }) });
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.code).toBe(0);
    expect(json.data.success).toBe(true);
  });

  it("DELETE /api/workspaces/[id]/members/[memberId] removes a member", async () => {
    const req = new Request("http://localhost/api/workspaces/ws-1/members/user-2", { method: "DELETE" });
    const res = await removeMemberRoute(req, {
      params: Promise.resolve({ id: "ws-1", memberId: "user-2" }),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.code).toBe(0);
    expect(json.data.success).toBe(true);
  });

  it("POST & GET /api/presets/custom manages custom styling presets (Ticket 8.3)", async () => {
    const postReq = new Request("http://localhost/api/presets/custom", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Nordic Minimalist",
        scene: "interior",
        baseStyle: "Scandinavian",
        preferredMaterials: ["Oak", "Linen"],
      }),
    });
    const postRes = await createCustomPresetRoute(postReq);
    expect(postRes.status).toBe(201);
    const postJson = (await postRes.json()) as any;
    expect(postJson.code).toBe(0);
    expect(postJson.data.preset.name).toBe("Nordic Minimalist");

    const getReq = new Request("http://localhost/api/presets/custom?workspaceId=ws-1&scene=interior");
    const getRes = await listCustomPresetsRoute(getReq);
    expect(getRes.status).toBe(200);
    const getJson = (await getRes.json()) as any;
    expect(getJson.code).toBe(0);
    expect(getJson.data.presets.length).toBe(1);
  });

  it("GET & DELETE /api/presets/custom/[id] manages specific preset", async () => {
    const getReq = new Request("http://localhost/api/presets/custom/cp-1");
    const getRes = await getCustomPresetRoute(getReq, { params: Promise.resolve({ id: "cp-1" }) });
    expect(getRes.status).toBe(200);
    const getJson = (await getRes.json()) as any;
    expect(getJson.data.preset.id).toBe("cp-1");

    const delReq = new Request("http://localhost/api/presets/custom/cp-1", { method: "DELETE" });
    const delRes = await deleteCustomPresetRoute(delReq, { params: Promise.resolve({ id: "cp-1" }) });
    expect(delRes.status).toBe(200);
  });
});
