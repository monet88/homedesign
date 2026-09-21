import { describe, expect, it, vi, beforeEach } from "vitest";
import { POST as handleCheckout } from "./checkout/route";
import { POST as handleWebhook } from "./webhook/route";
import * as httpUtils from "@/lib/ai/http";
import * as stripeLib from "@/lib/payments/stripe";

let mockContextEnv: Record<string, any> = {};

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: vi.fn().mockImplementation(async () => ({
    env: mockContextEnv,
  })),
}));

describe("Stripe API Routes (Ticket 3.1)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockContextEnv = {};
  });

  describe("POST /api/payments/stripe/checkout", () => {
    it("returns 401 when user is not authenticated", async () => {
      vi.spyOn(httpUtils, "authorizeVerified").mockResolvedValue(
        Response.json({ error: "UNAUTHENTICATED" }, { status: 401 })
      );

      const req = new Request("http://localhost/api/payments/stripe/checkout", {
        method: "POST",
        body: JSON.stringify({ pack: "lite" }),
      });

      const res = await handleCheckout(req);
      expect(res.status).toBe(401);
      const json = (await res.json()) as { error: string };
      expect(json.error).toBe("UNAUTHENTICATED");
    });

    it("returns 400 on invalid input payload", async () => {
      vi.spyOn(httpUtils, "authorizeVerified").mockResolvedValue({
        env: { BETTER_AUTH_URL: "http://localhost:3000" } as any,
        userId: "user-123",
      });

      const req = new Request("http://localhost/api/payments/stripe/checkout", {
        method: "POST",
        body: JSON.stringify({ pack: "invalid-pack" }),
      });

      const res = await handleCheckout(req);
      expect(res.status).toBe(400);
      const json = (await res.json()) as { error: string };
      expect(json.error).toBe("INVALID_INPUT");
    });

    it("creates checkout session and returns 200 envelope on valid input", async () => {
      vi.spyOn(httpUtils, "authorizeVerified").mockResolvedValue({
        env: { BETTER_AUTH_URL: "http://localhost:3000" } as any,
        userId: "user-123",
        userEmail: "user@example.com",
      });

      vi.spyOn(stripeLib, "createStripeCheckoutSession").mockResolvedValue({
        orderId: "order-123",
        sessionId: "cs_123",
        checkoutUrl: "https://checkout.stripe.com/c/pay/cs_123",
      });

      const req = new Request("http://localhost/api/payments/stripe/checkout", {
        method: "POST",
        body: JSON.stringify({ pack: "pro" }),
      });

      const res = await handleCheckout(req);
      expect(res.status).toBe(200);
      const json = (await res.json()) as { code: number; data: any };
      expect(json.code).toBe(0);
      expect(json.data.orderId).toBe("order-123");
      expect(json.data.sessionId).toBe("cs_123");
      expect(json.data.checkoutUrl).toBe("https://checkout.stripe.com/c/pay/cs_123");
    });

    it("rejects open redirect attempts with external domain in successUrl", async () => {
      vi.spyOn(httpUtils, "authorizeVerified").mockResolvedValue({
        env: { BETTER_AUTH_URL: "https://design.7app.online" } as any,
        userId: "user-123",
        userEmail: "user@example.com",
      });

      const req = new Request("http://localhost/api/payments/stripe/checkout", {
        method: "POST",
        body: JSON.stringify({
          pack: "lite",
          successUrl: "https://phishing-attacker.com/steal-creds",
        }),
      });

      const res = await handleCheckout(req);
      expect(res.status).toBe(400);
      const json = (await res.json()) as { error: string };
      expect(json.error).toBe("INVALID_RETURN_URL");
    });

    it("allows same-origin return URL without error", async () => {
      vi.spyOn(httpUtils, "authorizeVerified").mockResolvedValue({
        env: { BETTER_AUTH_URL: "https://design.7app.online" } as any,
        userId: "user-123",
        userEmail: "user@example.com",
      });

      const mockCreate = vi.spyOn(stripeLib, "createStripeCheckoutSession").mockResolvedValue({
        orderId: "order-123",
        sessionId: "cs_123",
        checkoutUrl: "https://checkout.stripe.com/c/pay/cs_123",
      });

      const req = new Request("http://localhost/api/payments/stripe/checkout", {
        method: "POST",
        body: JSON.stringify({
          pack: "lite",
          successUrl: "https://design.7app.online/activity?payment=custom_success",
        }),
      });

      const res = await handleCheckout(req);
      expect(res.status).toBe(200);
      expect(mockCreate).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          successUrl: "https://design.7app.online/activity?payment=custom_success",
        })
      );
    });
  });

  describe("POST /api/payments/stripe/webhook", () => {
    it("returns 503 when STRIPE_WEBHOOK_SECRET is not configured", async () => {
      mockContextEnv = { STRIPE_WEBHOOK_SECRET: undefined };

      const req = new Request("http://localhost/api/payments/stripe/webhook", {
        method: "POST",
        body: "{}",
      });

      const res = await handleWebhook(req);
      expect(res.status).toBe(503);
      const json = (await res.json()) as { error: string };
      expect(json.error).toBe("STRIPE_WEBHOOK_SECRET_NOT_CONFIGURED");
    });

    it("returns 400 when stripe-signature header is missing", async () => {
      mockContextEnv = { STRIPE_WEBHOOK_SECRET: "test-whsec-secret" };

      const req = new Request("http://localhost/api/payments/stripe/webhook", {
        method: "POST",
        body: "{}",
      });

      const res = await handleWebhook(req);
      expect(res.status).toBe(400);
      const json = (await res.json()) as { error: string };
      expect(json.error).toBe("MISSING_STRIPE_SIGNATURE_HEADER");
    });

    it("returns 400 when signature is invalid", async () => {
      mockContextEnv = { STRIPE_WEBHOOK_SECRET: "test-whsec-secret" };

      vi.spyOn(stripeLib, "verifyStripeWebhookSignature").mockRejectedValue(
        new Error("INVALID_STRIPE_SIGNATURE")
      );

      const req = new Request("http://localhost/api/payments/stripe/webhook", {
        method: "POST",
        headers: { "stripe-signature": "t=1,v1=bad" },
        body: "{}",
      });

      const res = await handleWebhook(req);
      expect(res.status).toBe(400);
      const json = (await res.json()) as { error: string };
      expect(json.error).toBe("INVALID_STRIPE_SIGNATURE");
    });

    it("returns 200 with fulfillment details on valid webhook", async () => {
      mockContextEnv = { STRIPE_WEBHOOK_SECRET: "test-whsec-secret" };

      vi.spyOn(stripeLib, "verifyStripeWebhookSignature").mockResolvedValue({
        type: "checkout.session.completed",
        data: { object: { id: "cs_valid" } },
      });

      vi.spyOn(stripeLib, "handleStripeWebhook").mockResolvedValue({
        ok: true,
        orderId: "order-123",
        creditsGranted: 160,
        ledgerEntryId: "ledger-456",
      });

      const req = new Request("http://localhost/api/payments/stripe/webhook", {
        method: "POST",
        headers: { "stripe-signature": "t=1,v1=valid" },
        body: '{"type":"checkout.session.completed"}',
      });

      const res = await handleWebhook(req);
      expect(res.status).toBe(200);
      const json = (await res.json()) as { received: boolean; creditsGranted: number };
      expect(json.received).toBe(true);
      expect(json.creditsGranted).toBe(160);
    });
  });
});
