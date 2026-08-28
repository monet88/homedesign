import { describe, expect, it, vi, beforeEach } from "vitest";
import { POST as handleMockPayment } from "@/app/api/payments/mock/route";
import type { RouteSession } from "@/lib/ai/http";
import type { AuthEnv } from "@/lib/auth/server";
import type { MockPurchaseResult } from "@/lib/payments/core";

let mockAuthResult: RouteSession | Response | null = null;
let mockPurchaseFn = vi.fn();

vi.mock("@/lib/ai/http", () => ({
  authorizeVerified: vi.fn().mockImplementation(async () => {
    if (!mockAuthResult) {
      return Response.json({ error: "UNAUTHENTICATED" }, { status: 401 });
    }
    return mockAuthResult;
  }),
}));

vi.mock("@/lib/payments/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/payments/core")>();
  return {
    ...actual,
    mockPurchase: vi.fn().mockImplementation((env, userId, pack, idempotencyKey) => {
      return mockPurchaseFn(env, userId, pack, idempotencyKey);
    }),
  };
});

const mockEnv: AuthEnv = {
  ENVIRONMENT: "development",
  BETTER_AUTH_SECRET: "test-auth-secret-32-chars-minimum-length",
  BETTER_AUTH_URL: "http://localhost:3000",
  DB: {} as unknown as AuthEnv["DB"],
  HD_PRIVATE: {} as unknown as AuthEnv["HD_PRIVATE"],
  HD_PUBLIC: {} as unknown as AuthEnv["HD_PUBLIC"],
  NEXT_INC_CACHE_R2_BUCKET: {} as unknown as AuthEnv["NEXT_INC_CACHE_R2_BUCKET"],
  ASSET_VALIDATE: {} as unknown as AuthEnv["ASSET_VALIDATE"],
  PROVIDER_NOTIFY: {} as unknown as AuthEnv["PROVIDER_NOTIFY"],
  WORKER_SELF_REFERENCE: {} as unknown as AuthEnv["WORKER_SELF_REFERENCE"],
  ASSETS: {} as unknown as AuthEnv["ASSETS"],
};

const verifiedSession: RouteSession = {
  env: mockEnv,
  userId: "user-test-123",
};

describe("POST /api/payments/mock (Ticket #46)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthResult = verifiedSession;
    mockPurchaseFn = vi.fn().mockImplementation(async (_env, _userId, pack, idempotencyKey) => {
      const amounts = { lite: 80, plus: 160, pro: 320, max: 640 };
      const res: MockPurchaseResult = {
        id: "purchase-1",
        pack,
        label: `Mock purchase — no charge (${pack})`,
        amount: amounts[pack as keyof typeof amounts] ?? 80,
        idempotencyKey,
        ledgerEntryId: "ledger-1",
        created_at: Date.now(),
        cached: false,
      };
      return res;
    });
  });

  describe("Authorization", () => {
    it("returns 401 when unauthenticated", async () => {
      mockAuthResult = null;
      const req = new Request("http://localhost:3000/api/payments/mock", {
        method: "POST",
        body: JSON.stringify({ pack: "lite", idempotencyKey: "k1" }),
      });
      const res = await handleMockPayment(req);
      expect(res.status).toBe(401);
      const data = (await res.json()) as { error: string };
      expect(data.error).toBe("UNAUTHENTICATED");
    });

    it("returns 403 when email is not verified", async () => {
      mockAuthResult = Response.json({ error: "EMAIL_NOT_VERIFIED" }, { status: 403 });
      const req = new Request("http://localhost:3000/api/payments/mock", {
        method: "POST",
        body: JSON.stringify({ pack: "lite", idempotencyKey: "k1" }),
      });
      const res = await handleMockPayment(req);
      expect(res.status).toBe(403);
      const data = (await res.json()) as { error: string };
      expect(data.error).toBe("EMAIL_NOT_VERIFIED");
    });
  });

  describe("Environment policy", () => {
    it("returns 403 MOCK_PAYMENT_BANNED_IN_PRODUCTION in production", async () => {
      mockPurchaseFn.mockRejectedValueOnce(
        Object.assign(new Error("MOCK_PAYMENT_BANNED_IN_PRODUCTION"), { status: 403 })
      );

      const req = new Request("http://localhost:3000/api/payments/mock", {
        method: "POST",
        body: JSON.stringify({ pack: "lite", idempotencyKey: "k1" }),
      });
      const res = await handleMockPayment(req);
      expect(res.status).toBe(403);
      const data = (await res.json()) as { error: string };
      expect(data.error).toBe("MOCK_PAYMENT_BANNED_IN_PRODUCTION");
    });
  });

  describe("Input validation (Zod parse-or-400)", () => {
    it("returns 400 INVALID_JSON on non-JSON body", async () => {
      const req = new Request("http://localhost:3000/api/payments/mock", {
        method: "POST",
        body: "invalid-not-json",
      });
      const res = await handleMockPayment(req);
      expect(res.status).toBe(400);
      const data = (await res.json()) as { error: string };
      expect(data.error).toBe("INVALID_JSON");
      expect(mockPurchaseFn).not.toHaveBeenCalled();
    });

    it("returns 400 INVALID_INPUT on missing pack", async () => {
      const req = new Request("http://localhost:3000/api/payments/mock", {
        method: "POST",
        body: JSON.stringify({ idempotencyKey: "k1" }),
      });
      const res = await handleMockPayment(req);
      expect(res.status).toBe(400);
      const data = (await res.json()) as { error: string; details: Record<string, string[]> };
      expect(data.error).toBe("INVALID_INPUT");
      expect(data.details.pack).toBeDefined();
      expect(mockPurchaseFn).not.toHaveBeenCalled();
    });

    it("returns 400 INVALID_INPUT on invalid pack enum", async () => {
      for (const badPack of ["ultra", "free", "basic", "custom", 123, -1, 1.5, null, true]) {
        const req = new Request("http://localhost:3000/api/payments/mock", {
          method: "POST",
          body: JSON.stringify({ pack: badPack, idempotencyKey: "k1" }),
        });
        const res = await handleMockPayment(req);
        expect(res.status).toBe(400);
        const data = (await res.json()) as { error: string; details: Record<string, string[]> };
        expect(data.error).toBe("INVALID_INPUT");
        expect(data.details.pack).toBeDefined();
      }
      expect(mockPurchaseFn).not.toHaveBeenCalled();
    });

    it("returns 400 INVALID_INPUT on missing idempotencyKey", async () => {
      const req = new Request("http://localhost:3000/api/payments/mock", {
        method: "POST",
        body: JSON.stringify({ pack: "lite" }),
      });
      const res = await handleMockPayment(req);
      expect(res.status).toBe(400);
      const data = (await res.json()) as { error: string; details: Record<string, string[]> };
      expect(data.error).toBe("INVALID_INPUT");
      expect(data.details.idempotencyKey).toBeDefined();
      expect(mockPurchaseFn).not.toHaveBeenCalled();
    });

    it("returns 400 INVALID_INPUT on empty or whitespace-only idempotencyKey", async () => {
      for (const badKey of ["", "   ", "\t\n"]) {
        const req = new Request("http://localhost:3000/api/payments/mock", {
          method: "POST",
          body: JSON.stringify({ pack: "lite", idempotencyKey: badKey }),
        });
        const res = await handleMockPayment(req);
        expect(res.status).toBe(400);
        const data = (await res.json()) as { error: string; details: Record<string, string[]> };
        expect(data.error).toBe("INVALID_INPUT");
        expect(data.details.idempotencyKey).toBeDefined();
      }
      expect(mockPurchaseFn).not.toHaveBeenCalled();
    });

    it("returns 400 INVALID_INPUT on non-string idempotencyKey", async () => {
      for (const badKey of [123, null, true, [], {}]) {
        const req = new Request("http://localhost:3000/api/payments/mock", {
          method: "POST",
          body: JSON.stringify({ pack: "lite", idempotencyKey: badKey }),
        });
        const res = await handleMockPayment(req);
        expect(res.status).toBe(400);
        const data = (await res.json()) as { error: string; details: Record<string, string[]> };
        expect(data.error).toBe("INVALID_INPUT");
        expect(data.details.idempotencyKey).toBeDefined();
      }
      expect(mockPurchaseFn).not.toHaveBeenCalled();
    });

    it("strips unknown fields and passes only valid pack and trimmed idempotencyKey", async () => {
      const req = new Request("http://localhost:3000/api/payments/mock", {
        method: "POST",
        body: JSON.stringify({
          pack: "pro",
          idempotencyKey: "  pay-key-pro-1  ",
          amount: 9999,
          injected: "exploit",
          credits: 100000,
        }),
      });
      const res = await handleMockPayment(req);
      expect(res.status).toBe(200);
      expect(mockPurchaseFn).toHaveBeenCalledWith(
        mockEnv,
        "user-test-123",
        "pro",
        "pay-key-pro-1"
      );
    });
  });

  describe("Success, Idempotency & Retries", () => {
    it("returns 200 with purchase data and cache-control: no-store on success", async () => {
      const req = new Request("http://localhost:3000/api/payments/mock", {
        method: "POST",
        body: JSON.stringify({ pack: "plus", idempotencyKey: "k-plus-1" }),
      });
      const res = await handleMockPayment(req);
      expect(res.status).toBe(200);
      expect(res.headers.get("cache-control")).toBe("no-store");
      const json = (await res.json()) as { code: number; data: MockPurchaseResult };
      expect(json.code).toBe(0);
      expect(json.data.pack).toBe("plus");
      expect(json.data.amount).toBe(160);
      expect(json.data.cached).toBe(false);
    });

    it("returns 200 with cached: true on retry with exact same key", async () => {
      mockPurchaseFn.mockResolvedValueOnce({
        id: "purchase-1",
        pack: "plus",
        label: "Mock purchase — no charge (plus)",
        amount: 160,
        idempotencyKey: "k-plus-retry",
        ledgerEntryId: "ledger-1",
        created_at: 1000,
        cached: true,
      });

      const req = new Request("http://localhost:3000/api/payments/mock", {
        method: "POST",
        body: JSON.stringify({ pack: "plus", idempotencyKey: "k-plus-retry" }),
      });
      const res = await handleMockPayment(req);
      expect(res.status).toBe(200);
      const json = (await res.json()) as { code: number; data: MockPurchaseResult };
      expect(json.code).toBe(0);
      expect(json.data.cached).toBe(true);
    });

    it("returns 409 IDEMPOTENCY_KEY_REUSED on collision (same key, different payload)", async () => {
      mockPurchaseFn.mockRejectedValueOnce(
        Object.assign(new Error("IDEMPOTENCY_KEY_REUSED"), { status: 409 })
      );

      const req = new Request("http://localhost:3000/api/payments/mock", {
        method: "POST",
        body: JSON.stringify({ pack: "max", idempotencyKey: "reused-key" }),
      });
      const res = await handleMockPayment(req);
      expect(res.status).toBe(409);
      const data = (await res.json()) as { error: string };
      expect(data.error).toBe("IDEMPOTENCY_KEY_REUSED");
    });
  });
});
