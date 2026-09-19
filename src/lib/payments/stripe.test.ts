import { describe, expect, it } from "vitest";
import {
  CREDIT_PACKS,
  verifyStripeWebhookSignature,
} from "./stripe";
import { StripeCheckoutSchema } from "@/lib/validation/schemas";

// Helper to generate a valid Stripe signature header using Web Crypto HMAC-SHA256
async function generateTestSignatureHeader(
  payload: string,
  secret: string,
  timestamp = Math.floor(Date.now() / 1000)
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signed = `${timestamp}.${payload}`;
  const sigBuf = await crypto.subtle.sign("HMAC", key, encoder.encode(signed));
  const hexSig = Array.from(new Uint8Array(sigBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return `t=${timestamp},v1=${hexSig}`;
}

describe("Stripe Monetization Core (Ticket 3.1)", () => {
  it("credit packs have positive credits and amounts", () => {
    const packs = Object.entries(CREDIT_PACKS);
    expect(packs.length).toBe(4);
    for (const [, def] of packs) {
      expect(def.credits).toBeGreaterThan(0);
      expect(def.amountCents).toBeGreaterThan(0);
      expect(def.currency).toBe("usd");
      expect(def.name).toBeTruthy();
    }
  });

  describe("verifyStripeWebhookSignature", () => {
    const secret = "test-whsec-secret-1234567890abcdef";
    const payload = JSON.stringify({
      id: "evt_123",
      type: "checkout.session.completed",
      data: { object: { id: "cs_test_abc" } },
    });

    it("verifies a valid signature and returns parsed event", async () => {
      const header = await generateTestSignatureHeader(payload, secret);
      const event = await verifyStripeWebhookSignature(payload, header, secret);
      expect(event.id).toBe("evt_123");
      expect(event.type).toBe("checkout.session.completed");
    });

    it("rejects tampered payload", async () => {
      const header = await generateTestSignatureHeader(payload, secret);
      const tampered = payload + " ";
      await expect(
        verifyStripeWebhookSignature(tampered, header, secret)
      ).rejects.toThrow("INVALID_STRIPE_SIGNATURE");
    });

    it("rejects invalid secret", async () => {
      const header = await generateTestSignatureHeader(payload, "wrong_secret");
      await expect(
        verifyStripeWebhookSignature(payload, header, secret)
      ).rejects.toThrow("INVALID_STRIPE_SIGNATURE");
    });

    it("rejects expired signature when timestamp is older than tolerance", async () => {
      const oldTimestamp = Math.floor(Date.now() / 1000) - 400; // 400s ago (> 300s)
      const header = await generateTestSignatureHeader(payload, secret, oldTimestamp);
      await expect(
        verifyStripeWebhookSignature(payload, header, secret, 300)
      ).rejects.toThrow("STRIPE_SIGNATURE_EXPIRED");
    });

    it("rejects malformed signature header", async () => {
      await expect(
        verifyStripeWebhookSignature(payload, "invalid_header", secret)
      ).rejects.toThrow("MALFORMED_STRIPE_SIGNATURE_HEADER");
    });
  });

  describe("StripeCheckoutSchema validation", () => {
    it("accepts valid pack and optional valid URLs", () => {
      const valid = StripeCheckoutSchema.safeParse({
        pack: "lite",
        successUrl: "https://homedesign.ai/activity",
        cancelUrl: "https://homedesign.ai/pricing",
      });
      expect(valid.success).toBe(true);
    });

    it("accepts valid pack without URLs", () => {
      const valid = StripeCheckoutSchema.safeParse({ pack: "pro" });
      expect(valid.success).toBe(true);
    });

    it("rejects invalid pack", () => {
      const invalid = StripeCheckoutSchema.safeParse({ pack: "ultra" });
      expect(invalid.success).toBe(false);
    });

    it("rejects malformed URL", () => {
      const invalid = StripeCheckoutSchema.safeParse({
        pack: "lite",
        successUrl: "not-a-url",
      });
      expect(invalid.success).toBe(false);
    });

    it("rejects unknown fields via .strict()", () => {
      const invalid = StripeCheckoutSchema.safeParse({
        pack: "lite",
        extraField: "hack",
      });
      expect(invalid.success).toBe(false);
    });
  });
});
