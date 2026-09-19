import { describe, expect, it, vi, beforeEach } from "vitest";
import { POST as handleCheckout } from "./checkout/route";
import { GET as handleOrderStatus } from "./order/route";
import { POST as handleWebhook } from "../sepay-webhook/route";
import * as httpUtils from "@/lib/ai/http";
import * as sepayLib from "@/lib/payments/sepay";

let mockContextEnv: Record<string, any> = {};

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: vi.fn().mockImplementation(async () => ({
    env: mockContextEnv,
  })),
}));

describe("SePay API Routes (Ticket 3.2)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockContextEnv = {};
  });

  describe("POST /api/payments/sepay/checkout", () => {
    it("returns 401 when user is not authenticated", async () => {
      vi.spyOn(httpUtils, "authorizeVerified").mockResolvedValue(
        Response.json({ error: "UNAUTHENTICATED" }, { status: 401 })
      );

      const req = new Request("http://localhost/api/payments/sepay/checkout", {
        method: "POST",
        body: JSON.stringify({ pack: "lite" }),
      });

      const res = await handleCheckout(req);
      expect(res.status).toBe(401);
      const json = (await res.json()) as { error: string };
      expect(json.error).toBe("UNAUTHENTICATED");
    });

    it("returns 400 on invalid input pack", async () => {
      vi.spyOn(httpUtils, "authorizeVerified").mockResolvedValue({
        env: {} as any,
        userId: "user-123",
      });

      const req = new Request("http://localhost/api/payments/sepay/checkout", {
        method: "POST",
        body: JSON.stringify({ pack: "invalid-pack" }),
      });

      const res = await handleCheckout(req);
      expect(res.status).toBe(400);
      const json = (await res.json()) as { error: string };
      expect(json.error).toBe("INVALID_INPUT");
    });

    it("creates pending order and returns VietQR details on valid input", async () => {
      vi.spyOn(httpUtils, "authorizeVerified").mockResolvedValue({
        env: {} as any,
        userId: "user-123",
      });

      vi.spyOn(sepayLib, "createSepayVietQROrder").mockResolvedValue({
        orderId: "8F2E4A9C1D",
        transferCode: "HD8F2E4A9C1D",
        pack: "pro",
        amount: 700_000,
        currency: "vnd",
        credits: 320,
        bankId: "MBBank",
        accountNo: "0123456789",
        accountName: "HOMEDESIGN AI",
        qrUrl: "https://img.vietqr.io/image/MBBank-0123456789-compact2.png?amount=700000&addInfo=HD8F2E4A9C1D&accountName=HOMEDESIGN+AI",
      });

      const req = new Request("http://localhost/api/payments/sepay/checkout", {
        method: "POST",
        body: JSON.stringify({ pack: "pro" }),
      });

      const res = await handleCheckout(req);
      expect(res.status).toBe(200);
      const json = (await res.json()) as { code: number; data: any };
      expect(json.code).toBe(0);
      expect(json.data.orderId).toBe("8F2E4A9C1D");
      expect(json.data.transferCode).toBe("HD8F2E4A9C1D");
      expect(json.data.amount).toBe(700_000);
      expect(json.data.credits).toBe(320);
      expect(json.data.qrUrl).toContain("img.vietqr.io");
    });
  });

  describe("GET /api/payments/sepay/order", () => {
    it("returns 400 when orderId query param is missing", async () => {
      vi.spyOn(httpUtils, "authorizeVerified").mockResolvedValue({
        env: {} as any,
        userId: "user-123",
      });

      const req = new Request("http://localhost/api/payments/sepay/order", {
        method: "GET",
      });

      const res = await handleOrderStatus(req);
      expect(res.status).toBe(400);
      const json = (await res.json()) as { error: string };
      expect(json.error).toBe("MISSING_ORDER_ID");
    });

    it("returns 404 when order is not found", async () => {
      vi.spyOn(httpUtils, "authorizeVerified").mockResolvedValue({
        env: {} as any,
        userId: "user-123",
      });

      vi.spyOn(sepayLib, "getSepayOrderStatus").mockResolvedValue(null);

      const req = new Request("http://localhost/api/payments/sepay/order?orderId=non-existent", {
        method: "GET",
      });

      const res = await handleOrderStatus(req);
      expect(res.status).toBe(404);
      const json = (await res.json()) as { error: string };
      expect(json.error).toBe("ORDER_NOT_FOUND");
    });

    it("returns 200 with order info for polling", async () => {
      vi.spyOn(httpUtils, "authorizeVerified").mockResolvedValue({
        env: {} as any,
        userId: "user-123",
      });

      vi.spyOn(sepayLib, "getSepayOrderStatus").mockResolvedValue({
        id: "8F2E4A9C1D",
        status: "completed",
        pack: "pro",
        amount: 700_000,
        credits: 320,
        completed: true,
        providerPaymentId: "tx_12345",
        updatedAt: 1726300000000,
      });

      const req = new Request("http://localhost/api/payments/sepay/order?orderId=8F2E4A9C1D", {
        method: "GET",
      });

      const res = await handleOrderStatus(req);
      expect(res.status).toBe(200);
      const json = (await res.json()) as { code: number; data: any };
      expect(json.code).toBe(0);
      expect(json.data.completed).toBe(true);
      expect(json.data.status).toBe("completed");
    });
  });

  describe("POST /api/payments/sepay-webhook", () => {
    it("returns 503 when SEPAY_WEBHOOK_TOKEN is not configured", async () => {
      mockContextEnv = { SEPAY_WEBHOOK_TOKEN: undefined, SEPAY_API_KEY: undefined };

      const req = new Request("http://localhost/api/payments/sepay-webhook", {
        method: "POST",
        body: JSON.stringify({}),
      });

      const res = await handleWebhook(req);
      expect(res.status).toBe(503);
      const json = (await res.json()) as { error: string };
      expect(json.error).toBe("SEPAY_WEBHOOK_TOKEN_NOT_CONFIGURED");
    });

    it("returns 401 when authorization header is missing or token is invalid", async () => {
      mockContextEnv = { SEPAY_WEBHOOK_TOKEN: "test-valid-secret-token" };

      const req1 = new Request("http://localhost/api/payments/sepay-webhook", {
        method: "POST",
        body: JSON.stringify({}),
      });

      const res1 = await handleWebhook(req1);
      expect(res1.status).toBe(401);

      const req2 = new Request("http://localhost/api/payments/sepay-webhook", {
        method: "POST",
        headers: { Authorization: "Apikey wrong_token" },
        body: JSON.stringify({}),
      });

      const res2 = await handleWebhook(req2);
      expect(res2.status).toBe(401);
      const json = (await res2.json()) as { error: string };
      expect(json.error).toBe("UNAUTHORIZED_SEPAY_TOKEN");
    });

    it("returns 200 with settlement details on valid webhook payload", async () => {
      mockContextEnv = { SEPAY_WEBHOOK_TOKEN: "test-valid-secret-token" };

      vi.spyOn(sepayLib, "handleSepayWebhook").mockResolvedValue({
        ok: true,
        orderId: "8F2E4A9C1D",
        creditsGranted: 320,
        ledgerEntryId: "ledger-789",
      });

      const req = new Request("http://localhost/api/payments/sepay-webhook", {
        method: "POST",
        headers: { Authorization: "Apikey test-valid-secret-token" },
        body: JSON.stringify({
          id: 998877,
          gateway: "MBBank",
          content: "HD8F2E4A9C1D chuyen khoan mua goi pro",
          transferType: "in",
          transferAmount: 700_000,
        }),
      });

      const res = await handleWebhook(req);
      expect(res.status).toBe(200);
      const json = (await res.json()) as { success: boolean; creditsGranted: number };
      expect(json.success).toBe(true);
      expect(json.creditsGranted).toBe(320);
    });
  });
});
