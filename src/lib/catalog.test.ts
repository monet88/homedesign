// Unit tests for the static landing catalog seed (ticket 12). The catalog is
// the data contract behind the landing page ACs: 12 Popular Styles, 10 Ideas,
// 5 Before/After comparisons, 4 Pricing tiers, and a FAQ — all English-only.
import { describe, expect, it } from "vitest";
import {
  BEFORE_AFTER_PAIRS,
  POPULAR_STYLES,
  IDEAS,
  PRICING_TIERS,
  FAQ_ITEMS,
} from "@/lib/catalog";

const ENGLISH_ONLY = /^[A-Za-z0-9 ,.'&()/:;!?—–-]+$/;

describe("landing catalog seed (ticket 12)", () => {
  it("has exactly 12 popular styles", () => {
    expect(POPULAR_STYLES).toHaveLength(12);
    const titles = POPULAR_STYLES.map((s) => s.title);
    expect(new Set(titles).size).toBe(12); // unique
    expect(titles).toContain("Modern Warm");
    expect(titles).toContain("Luxury Wood");
  });

  it("has exactly 10 ideas for every room", () => {
    expect(IDEAS).toHaveLength(10);
    const titles = IDEAS.map((i) => i.title);
    expect(new Set(titles).size).toBe(10);
    expect(titles).toContain("Living Room");
    expect(titles).toContain("Balcony");
  });

  it("has exactly 5 before/after comparisons", () => {
    expect(BEFORE_AFTER_PAIRS).toHaveLength(5);
    for (const pair of BEFORE_AFTER_PAIRS) {
      expect(pair.label).toBeTruthy();
      expect(pair.before).toMatch(/^https:\/\//);
      expect(pair.after).toMatch(/^https:\/\//);
      expect(pair.before).not.toBe(pair.after);
    }
  });

  it("pricing has 4 tiers with mock labels, free-first", () => {
    expect(PRICING_TIERS).toHaveLength(4);
    const names = PRICING_TIERS.map((t) => t.name);
    expect(names).toEqual(["Lite", "Plus", "Pro", "Max"]);
    for (const tier of PRICING_TIERS) {
      expect(tier.credits).toBeGreaterThan(0);
      expect(tier.priceNote).toMatch(/mock/i);
      expect(tier.cta).toBe("Buy Credits");
    }
  });

  it("FAQ has questions and answers", () => {
    expect(FAQ_ITEMS.length).toBeGreaterThanOrEqual(4);
    for (const item of FAQ_ITEMS) {
      expect(item.question).toBeTruthy();
      expect(item.answer).toBeTruthy();
    }
  });

  it("catalog content is English-only", () => {
    const text = [
      ...POPULAR_STYLES.map((s) => s.title),
      ...IDEAS.map((i) => i.title),
      ...BEFORE_AFTER_PAIRS.map((p) => p.label),
      ...FAQ_ITEMS.map((f) => `${f.question} ${f.answer}`),
    ].join(" ");
    expect(text).toMatch(ENGLISH_ONLY);
  });

  it("every style and idea card links to a design-flow route", () => {
    for (const item of [...POPULAR_STYLES, ...IDEAS]) {
      expect(item.href).toMatch(/^\/(ai-interior-design|ai-exterior-design)$/);
      expect(item.previewLabel).toBeTruthy();
      expect(item.useLabel).toBeTruthy();
    }
  });
});
