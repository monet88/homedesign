import { describe, expect, it, vi, beforeEach } from "vitest";
import { GET as getOrders } from "./orders/route";
import { GET as getReferrals } from "./referrals/route";
import type { ResolvedSession, AuthEnv } from "@/lib/auth/server";

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
    email: "admin@example.com",
    emailVerified: true,
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
};

const userSession: ResolvedSession = {
  session: {
    id: "sess-user",
    userId: "user-normal",
    expiresAt: new Date(Date.now() + 3600000),
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  user: {
    id: "user-normal",
    name: "Normal User",
    email: "user@example.com",
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
        if (query.includes("total_orders")) {
          return {
            total_orders: 12,
            completed_orders: 10,
            pending_orders: 2,
            total_revenue_cents: 9900,
            stripe_revenue_cents: 5000,
            sepay_revenue_cents: 4900,
            total_credits_granted: 500,
          };
        }
        if (query.includes("total_codes")) {
          return {
            total_codes: 8,
            total_clicks: 45,
            total_referrals: 15,
            activated_referrals: 6,
            total_reward_credits: 60,
          };
        }
        return null;
      }),
      all: vi.fn().mockImplementation(async () => {
        if (query.includes("FROM payment_orders")) {
          return {
            results: [
              {
                id: "ord_1",
                user_id: "u_1",
                user_email: "test@example.com",
                provider: "stripe",
                pack: "pro",
                amount_cents: 2900,
                currency: "usd",
                credits_granted: 150,
                status: "completed",
                created_at: Date.now(),
              },
            ],
          };
        }
        if (query.includes("FROM referral_codes")) {
          return {
            results: [
              {
                user_id: "u_1",
                code: "alex88",
                clicks: 25,
                email: "alex@example.com",
                name: "Alex",
                referred_count: 5,
                activated_count: 3,
                credits_earned: 30,
              },
            ],
          };
        }
        return { results: [] };
      }),
    })),
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

describe("Admin Orders & Referral Analytics (Ticket 7.4)", () => {
  beforeEach(() => {
    mockSession = null;
  });

  it("rejects unauthorized anonymous visitor on GET /api/admin/orders", async () => {
    const res = await getOrders(new Request("https://design.7app.online/api/admin/orders"));
    expect(res.status).toBe(401);
  });

  it("rejects non-admin users with 403 on GET /api/admin/orders", async () => {
    mockSession = userSession;
    const res = await getOrders(new Request("https://design.7app.online/api/admin/orders"));
    expect(res.status).toBe(403);
  });

  it("allows admin session and returns revenue metrics and orders", async () => {
    mockSession = adminSession;
    const res = await getOrders(new Request("https://design.7app.online/api/admin/orders"));
    expect(res.status).toBe(200);

    const json = (await res.json()) as any;
    expect(json.code).toBe(0);
    expect(json.data.metrics.totalOrders).toBe(12);
    expect(json.data.metrics.totalRevenueCents).toBe(9900);
    expect(json.data.orders.length).toBe(1);
  });

  it("rejects non-admin on GET /api/admin/referrals", async () => {
    mockSession = userSession;
    const res = await getReferrals(new Request("https://design.7app.online/api/admin/referrals"));
    expect(res.status).toBe(403);
  });

  it("allows admin session and returns referral growth metrics & leaderboard", async () => {
    mockSession = adminSession;
    const res = await getReferrals(new Request("https://design.7app.online/api/admin/referrals"));
    expect(res.status).toBe(200);

    const json = (await res.json()) as any;
    expect(json.code).toBe(0);
    expect(json.data.metrics.totalCodes).toBe(8);
    expect(json.data.metrics.totalClicks).toBe(45);
    expect(json.data.topReferrers.length).toBe(1);
    expect(json.data.topReferrers[0].code).toBe("alex88");
  });
});
