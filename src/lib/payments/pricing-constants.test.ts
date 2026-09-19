import { describe, it, expect } from "vitest";
import { UNIFIED_PRICING_TIERS } from "./pricing-constants";
import { CREDIT_PACKS } from "./stripe";
import { SEPAY_CREDIT_PACKS } from "./sepay";
import { PRICING_TIERS } from "@/lib/catalog";

describe("Unified Pricing Single Source of Truth", () => {
  it("exports all 4 canonical tiers", () => {
    const tierKeys = Object.keys(UNIFIED_PRICING_TIERS);
    expect(tierKeys).toEqual(["lite", "plus", "pro", "max"]);
  });

  it("ensures Stripe CREDIT_PACKS strictly matches UNIFIED_PRICING_TIERS", () => {
    for (const [key, tier] of Object.entries(UNIFIED_PRICING_TIERS)) {
      const stripePack = CREDIT_PACKS[key as keyof typeof CREDIT_PACKS];
      expect(stripePack).toBeDefined();
      expect(stripePack.credits).toBe(tier.credits);
      expect(stripePack.amountCents).toBe(tier.usdAmountCents);
      expect(stripePack.currency).toBe("usd");
      expect(stripePack.name).toBe(tier.name);
    }
  });

  it("ensures SePay SEPAY_CREDIT_PACKS strictly matches UNIFIED_PRICING_TIERS", () => {
    for (const [key, tier] of Object.entries(UNIFIED_PRICING_TIERS)) {
      const sepayPack = SEPAY_CREDIT_PACKS[key as keyof typeof SEPAY_CREDIT_PACKS];
      expect(sepayPack).toBeDefined();
      expect(sepayPack.credits).toBe(tier.credits);
      expect(sepayPack.amountVnd).toBe(tier.vndAmount);
      expect(sepayPack.currency).toBe("vnd");
      expect(sepayPack.name).toBe(tier.nameVi);
    }
  });

  it("ensures catalog.ts PRICING_TIERS matches UNIFIED_PRICING_TIERS", () => {
    expect(PRICING_TIERS).toHaveLength(4);
    expect(PRICING_TIERS[0].credits).toBe(UNIFIED_PRICING_TIERS.lite.credits);
    expect(PRICING_TIERS[1].credits).toBe(UNIFIED_PRICING_TIERS.plus.credits);
    expect(PRICING_TIERS[2].credits).toBe(UNIFIED_PRICING_TIERS.pro.credits);
    expect(PRICING_TIERS[3].credits).toBe(UNIFIED_PRICING_TIERS.max.credits);
  });

  it("ensures all tiers state that credits never expire (matching D1 ledger)", () => {
    for (const tier of Object.values(UNIFIED_PRICING_TIERS)) {
      expect(tier.expiryNotice).toBe("Never expire");
      expect(tier.expiryNoticeVi).toBe("Không giới hạn thời gian");
      const hasNeverExpireFeature = tier.features.some((f) =>
        f.toLowerCase().includes("never expire")
      );
      expect(hasNeverExpireFeature).toBe(true);
    }
  });
});
