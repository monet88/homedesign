import { describe, expect, it } from "vitest";
import {
  generateOrderCode,
  buildVietQRUrl,
  verifySepayWebhookToken,
  extractOrderCode,
  timingSafeEqual,
  SEPAY_CREDIT_PACKS,
} from "./sepay";

describe("SePay & VietQR Unit Tests (Ticket 3.2)", () => {
  describe("Credit Packs & Pricing", () => {
    it("defines 4 credit packs with correct VND pricing and credits", () => {
      expect(SEPAY_CREDIT_PACKS.lite.credits).toBe(80);
      expect(SEPAY_CREDIT_PACKS.lite.amountVnd).toBe(200_000);

      expect(SEPAY_CREDIT_PACKS.plus.credits).toBe(160);
      expect(SEPAY_CREDIT_PACKS.plus.amountVnd).toBe(400_000);

      expect(SEPAY_CREDIT_PACKS.pro.credits).toBe(320);
      expect(SEPAY_CREDIT_PACKS.pro.amountVnd).toBe(700_000);

      expect(SEPAY_CREDIT_PACKS.max.credits).toBe(640);
      expect(SEPAY_CREDIT_PACKS.max.amountVnd).toBe(1_200_000);
    });
  });

  describe("generateOrderCode", () => {
    it("generates a 10-character uppercase alphanumeric code", () => {
      const code = generateOrderCode();
      expect(code).toMatch(/^[A-Z0-9]{10}$/);
    });

    it("generates unique codes on subsequent calls", () => {
      const code1 = generateOrderCode();
      const code2 = generateOrderCode();
      expect(code1).not.toBe(code2);
    });
  });

  describe("buildVietQRUrl", () => {
    it("builds a properly encoded VietQR Quicklink URL", () => {
      const urlStr = buildVietQRUrl({
        bankId: "MBBank",
        accountNo: "0987654321",
        template: "compact2",
        amountVnd: 400_000,
        transferCode: "HD8F2E4A9C",
        accountName: "CONG TY HOMEDESIGN",
      });

      const url = new URL(urlStr);
      expect(url.origin).toBe("https://img.vietqr.io");
      expect(url.pathname).toBe("/image/MBBank-0987654321-compact2.png");
      expect(url.searchParams.get("amount")).toBe("400000");
      expect(url.searchParams.get("addInfo")).toBe("HD8F2E4A9C");
      expect(url.searchParams.get("accountName")).toBe("CONG TY HOMEDESIGN");
    });
  });

  describe("timingSafeEqual", () => {
    it("returns true for identical strings", () => {
      expect(timingSafeEqual("my-secret-token", "my-secret-token")).toBe(true);
      expect(timingSafeEqual("", "")).toBe(true);
    });

    it("returns false for different lengths or characters", () => {
      expect(timingSafeEqual("short", "longer-string")).toBe(false);
      expect(timingSafeEqual("token-a", "token-b")).toBe(false);
    });
  });

  describe("verifySepayWebhookToken", () => {
    const validSecret = "test-sepay-sec-1234567890abcdef";

    it("accepts valid token with 'Apikey ' prefix", () => {
      expect(
        verifySepayWebhookToken(`Apikey ${validSecret}`, validSecret)
      ).toBe(true);
    });

    it("accepts valid token with 'Bearer ' prefix", () => {
      expect(
        verifySepayWebhookToken(`Bearer ${validSecret}`, validSecret)
      ).toBe(true);
    });

    it("accepts valid raw token without prefix", () => {
      expect(verifySepayWebhookToken(validSecret, validSecret)).toBe(true);
    });

    it("rejects invalid or mismatched token", () => {
      expect(
        verifySepayWebhookToken("Apikey wrong_token", validSecret)
      ).toBe(false);
      expect(verifySepayWebhookToken("bad_token", validSecret)).toBe(false);
    });

    it("rejects null or empty token header", () => {
      expect(verifySepayWebhookToken(null, validSecret)).toBe(false);
      expect(verifySepayWebhookToken("", validSecret)).toBe(false);
    });
  });

  describe("extractOrderCode", () => {
    it("extracts order code from SePay code field directly if present", () => {
      const result = extractOrderCode("noi dung chuyen khoan", "HD8F2E4A9C");
      expect(result).toEqual({
        orderId: "8F2E4A9C",
        transferCode: "HD8F2E4A9C",
      });
    });

    it("extracts order code from transfer content with HD prefix", () => {
      const result1 = extractOrderCode("HD8F2E4A9C");
      expect(result1).toEqual({
        orderId: "8F2E4A9C",
        transferCode: "HD8F2E4A9C",
      });

      const result2 = extractOrderCode("CK MUA CREDIT HD8F2E4A9C GOI PRO");
      expect(result2).toEqual({
        orderId: "8F2E4A9C",
        transferCode: "HD8F2E4A9C",
      });

      const result3 = extractOrderCode("Nguyen Van A ck tien hd8f2e4a9c qua techcombank");
      expect(result3).toEqual({
        orderId: "8F2E4A9C",
        transferCode: "HD8F2E4A9C",
      });
    });

    it("returns null when transfer content does not contain a valid HD code", () => {
      expect(extractOrderCode("Chuyen khoan mua hang khong co ma")).toBeNull();
      expect(extractOrderCode("HD")).toBeNull();
      expect(extractOrderCode("")).toBeNull();
    });
  });
});
