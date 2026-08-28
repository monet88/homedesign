// Unit tests for pure helpers (no Worker bindings): run via `npm test`.
import { describe, expect, it } from "vitest";
import {
  validPngBytes,
  validJpegBytes,
  invalidImageBytes,
  truncatedPngBytes,
  spoofedMimeBytes,
  MAGIC,
  ASSET_LIFECYCLE,
  VALID_UPLOAD_MIMES,
  MAX_UPLOAD_BYTES,
} from "@/lib/fixtures/images";
import { ALLOWED_LIFECYCLE_TRANSITIONS } from "@/lib/fixtures/upload-intent";
import { FakeAiProvider, fixturePngBytes } from "@/lib/ai/fake-provider";
import {
  MockPaymentSchema,
  UploadIntentSchema,
  FinalizeAssetSchema,
  ProjectFavoriteSchema,
} from "@/lib/validation/schemas";

describe("image fixtures", () => {
  it("valid PNG bytes start with the PNG magic", () => {
    expect(Array.from(validPngBytes().slice(0, 8))).toEqual(Array.from(MAGIC.PNG));
  });

  it("valid JPEG bytes start with JPEG SOI", () => {
    expect(Array.from(validJpegBytes().slice(0, 2))).toEqual([0xff, 0xd8]);
  });

  it("invalid bytes do not match any valid magic", () => {
    const bad = invalidImageBytes();
    expect(Array.from(bad.slice(0, 4))).not.toEqual(Array.from(MAGIC.PNG));
    expect(Array.from(bad.slice(0, 4))).not.toEqual(Array.from(MAGIC.JPEG));
  });

  it("truncated PNG keeps magic but is shorter than the full image", () => {
    const t = truncatedPngBytes();
    expect(Array.from(t.slice(0, 8))).toEqual(Array.from(MAGIC.PNG));
    expect(t.length).toBeLessThan(validPngBytes().length);
  });

  it("spoofed MIME fixture is JPEG bytes labelled PNG", () => {
    const s = spoofedMimeBytes();
    expect(s.mime).toBe("image/png");
    expect(Array.from(s.bytes.slice(0, 4))).toEqual(Array.from(MAGIC.JPEG));
  });

  it("upload contract constants match the spec", () => {
    expect(VALID_UPLOAD_MIMES).toEqual(["image/png", "image/jpeg"]);
    expect(MAX_UPLOAD_BYTES).toBe(50 * 1024 * 1024);
    expect(ASSET_LIFECYCLE).toContain("ready");
    expect(ASSET_LIFECYCLE).toContain("rejected");
  });
});

describe("asset lifecycle state machine", () => {
  it("ready assets cannot transition back to quarantined", () => {
    expect(ALLOWED_LIFECYCLE_TRANSITIONS.ready).not.toContain("quarantined");
  });

  it("deleted is terminal", () => {
    expect(ALLOWED_LIFECYCLE_TRANSITIONS.deleted).toHaveLength(0);
  });

  it("quarantined can go to ready, rejected, or deleted", () => {
    expect(ALLOWED_LIFECYCLE_TRANSITIONS.quarantined.sort()).toEqual(
      ["ready", "rejected", "deleted"].sort()
    );
  });
});

describe("fake AI provider", () => {
  it("produces deterministic valid PNG output", () => {
    const provider = new FakeAiProvider();
    const bytes = provider.getOutputBytes();
    expect(Array.from(bytes.slice(0, 8))).toEqual(Array.from(MAGIC.PNG));
    expect(fixturePngBytes().length).toBe(70);
  });

  it("accepts a task synchronously (submit resolves)", async () => {
    const provider = new FakeAiProvider();
    const res = await provider.submit({
      id: "t1",
      scene: "interior",
      provider: "fake",
      model: "gemini-2.5-flash-image",
      prompt: "p",
      sourceKey: null,
      options: {},
      createdAt: 1,
    });
    expect(res.ok).toBe(true);
  });
});

describe("MockPaymentSchema validation (Ticket #46)", () => {
  it("accepts all documented valid pack enums with non-empty idempotencyKey", () => {
    const validPacks = ["lite", "plus", "pro", "max"] as const;
    for (const pack of validPacks) {
      const result = MockPaymentSchema.safeParse({ pack, idempotencyKey: `key-${pack}` });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.pack).toBe(pack);
        expect(result.data.idempotencyKey).toBe(`key-${pack}`);
      }
    }
  });

  it("trims whitespace from idempotencyKey", () => {
    const result = MockPaymentSchema.safeParse({
      pack: "lite",
      idempotencyKey: "   padded-key-123   ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.idempotencyKey).toBe("padded-key-123");
    }
  });

  it("strips unknown and injected fields (e.g. amount, credits, extra)", () => {
    const result = MockPaymentSchema.safeParse({
      pack: "pro",
      idempotencyKey: "key-1",
      amount: 1000,
      credits: 9999,
      fractional: 0.5,
      extra: "ignored",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ pack: "pro", idempotencyKey: "key-1" });
      expect((result.data as Record<string, unknown>).amount).toBeUndefined();
      expect((result.data as Record<string, unknown>).credits).toBeUndefined();
    }
  });

  it("rejects unknown, malformed, non-positive, or fractional pack values", () => {
    const invalidPacks = [
      "ultra",
      "free",
      "basic",
      "custom",
      "LITE",
      "PLUS",
      "",
      123,
      -1,
      0,
      1.5,
      null,
      undefined,
      true,
      [],
      {},
    ];
    for (const badPack of invalidPacks) {
      const result = MockPaymentSchema.safeParse({ pack: badPack, idempotencyKey: "key-1" });
      expect(result.success).toBe(false);
    }
  });

  it("rejects missing, empty, or whitespace-only idempotencyKey", () => {
    expect(MockPaymentSchema.safeParse({ pack: "lite" }).success).toBe(false);
    expect(MockPaymentSchema.safeParse({ pack: "lite", idempotencyKey: "" }).success).toBe(false);
    expect(MockPaymentSchema.safeParse({ pack: "lite", idempotencyKey: "   " }).success).toBe(false);
    expect(MockPaymentSchema.safeParse({ pack: "lite", idempotencyKey: 123 }).success).toBe(false);
    expect(MockPaymentSchema.safeParse({ pack: "lite", idempotencyKey: null }).success).toBe(false);
  });

  it("rejects missing pack", () => {
    expect(MockPaymentSchema.safeParse({ idempotencyKey: "key-1" }).success).toBe(false);
  });

  it("rejects non-object or null payloads", () => {
    expect(MockPaymentSchema.safeParse(null).success).toBe(false);
    expect(MockPaymentSchema.safeParse("lite").success).toBe(false);
    expect(MockPaymentSchema.safeParse(123).success).toBe(false);
    expect(MockPaymentSchema.safeParse([]).success).toBe(false);
    expect(MockPaymentSchema.safeParse(undefined).success).toBe(false);
  });
});

describe("UploadIntentSchema validation (Ticket #45)", () => {
  it("accepts valid png and jpeg upload intents within bounds", () => {
    const validPng = { name: "room.png", mimeType: "image/png", size: 1024 };
    const res1 = UploadIntentSchema.safeParse(validPng);
    expect(res1.success).toBe(true);
    if (res1.success) {
      expect(res1.data).toEqual(validPng);
    }

    const validJpeg = { name: "photo.jpeg", mimeType: "image/jpeg", size: 50 * 1024 * 1024 };
    const res2 = UploadIntentSchema.safeParse(validJpeg);
    expect(res2.success).toBe(true);
    if (res2.success) {
      expect(res2.data.size).toBe(52428800);
    }
  });

  it("trims whitespace from name", () => {
    const res = UploadIntentSchema.safeParse({
      name: "   living_room.png   ",
      mimeType: "image/png",
      size: 2048,
    });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.name).toBe("living_room.png");
    }
  });

  it("rejects unknown or extra fields (.strict() enforcement)", () => {
    const res = UploadIntentSchema.safeParse({
      name: "room.png",
      mimeType: "image/png",
      size: 1024,
      extraField: "hacked",
      injected: 123,
    });
    expect(res.success).toBe(false);
  });

  it("rejects missing, empty, or whitespace-only name", () => {
    expect(UploadIntentSchema.safeParse({ mimeType: "image/png", size: 100 }).success).toBe(false);
    expect(UploadIntentSchema.safeParse({ name: "", mimeType: "image/png", size: 100 }).success).toBe(false);
    expect(UploadIntentSchema.safeParse({ name: "   ", mimeType: "image/png", size: 100 }).success).toBe(false);
    expect(UploadIntentSchema.safeParse({ name: 123, mimeType: "image/png", size: 100 }).success).toBe(false);
  });

  it("rejects name exceeding 255 characters", () => {
    const longName = "a".repeat(256) + ".png";
    expect(UploadIntentSchema.safeParse({ name: longName, mimeType: "image/png", size: 100 }).success).toBe(false);
  });

  it("rejects unsupported MIME types", () => {
    const invalidMimes = [
      "image/gif",
      "image/webp",
      "image/svg+xml",
      "image/bmp",
      "text/plain",
      "application/pdf",
      "application/octet-stream",
      "IMAGE/PNG",
      "",
      null,
      123,
    ];
    for (const badMime of invalidMimes) {
      const res = UploadIntentSchema.safeParse({ name: "file.png", mimeType: badMime, size: 100 });
      expect(res.success).toBe(false);
    }
  });

  it("rejects non-positive, zero, fractional, NaN, Infinity, or oversized sizes", () => {
    const invalidSizes = [
      0,
      -1,
      -1000,
      1.5,
      NaN,
      Infinity,
      -Infinity,
      50 * 1024 * 1024 + 1,
      100 * 1024 * 1024,
      "1024",
      null,
      undefined,
      [],
      {},
    ];
    for (const badSize of invalidSizes) {
      const res = UploadIntentSchema.safeParse({ name: "file.png", mimeType: "image/png", size: badSize });
      expect(res.success).toBe(false);
    }
  });

  it("rejects non-object or null payloads", () => {
    expect(UploadIntentSchema.safeParse(null).success).toBe(false);
    expect(UploadIntentSchema.safeParse("string").success).toBe(false);
    expect(UploadIntentSchema.safeParse(123).success).toBe(false);
    expect(UploadIntentSchema.safeParse([]).success).toBe(false);
    expect(UploadIntentSchema.safeParse(undefined).success).toBe(false);
  });
});

describe("FinalizeAssetSchema validation (Ticket #45)", () => {
  it("accepts valid assetId", () => {
    const res = FinalizeAssetSchema.safeParse({ assetId: "asset-uuid-12345" });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.assetId).toBe("asset-uuid-12345");
    }
  });

  it("trims whitespace from assetId", () => {
    const res = FinalizeAssetSchema.safeParse({ assetId: "   asset-padded-1   " });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.assetId).toBe("asset-padded-1");
    }
  });

  it("rejects unknown or extra fields (.strict() enforcement)", () => {
    const res = FinalizeAssetSchema.safeParse({
      assetId: "asset-123",
      extraKey: "dangerous",
      lifecycle: "ready",
    });
    expect(res.success).toBe(false);
  });

  it("rejects missing, empty, whitespace-only, or non-string assetId", () => {
    expect(FinalizeAssetSchema.safeParse({}).success).toBe(false);
    expect(FinalizeAssetSchema.safeParse({ assetId: "" }).success).toBe(false);
    expect(FinalizeAssetSchema.safeParse({ assetId: "   " }).success).toBe(false);
    expect(FinalizeAssetSchema.safeParse({ assetId: 12345 }).success).toBe(false);
    expect(FinalizeAssetSchema.safeParse({ assetId: null }).success).toBe(false);
    expect(FinalizeAssetSchema.safeParse({ assetId: true }).success).toBe(false);
  });

  it("rejects assetId exceeding 128 characters", () => {
    expect(FinalizeAssetSchema.safeParse({ assetId: "x".repeat(129) }).success).toBe(false);
  });

  it("rejects non-object or null payloads", () => {
    expect(FinalizeAssetSchema.safeParse(null).success).toBe(false);
    expect(FinalizeAssetSchema.safeParse("asset-123").success).toBe(false);
    expect(FinalizeAssetSchema.safeParse(123).success).toBe(false);
    expect(FinalizeAssetSchema.safeParse([]).success).toBe(false);
  });
});

describe("ProjectFavoriteSchema validation (Ticket #45)", () => {
  it("accepts boolean true and false", () => {
    const resTrue = ProjectFavoriteSchema.safeParse({ favorite: true });
    expect(resTrue.success).toBe(true);
    if (resTrue.success) {
      expect(resTrue.data.favorite).toBe(true);
    }

    const resFalse = ProjectFavoriteSchema.safeParse({ favorite: false });
    expect(resFalse.success).toBe(true);
    if (resFalse.success) {
      expect(resFalse.data.favorite).toBe(false);
    }
  });

  it("rejects unknown or extra fields (.strict() enforcement)", () => {
    const res = ProjectFavoriteSchema.safeParse({
      favorite: true,
      visibility: "unlisted",
      name: "new-name",
    });
    expect(res.success).toBe(false);
  });

  it("rejects non-boolean values and type coercions", () => {
    const invalidFavorites = [
      "true",
      "false",
      "1",
      "0",
      1,
      0,
      null,
      undefined,
      [],
      {},
    ];
    for (const badFav of invalidFavorites) {
      const res = ProjectFavoriteSchema.safeParse({ favorite: badFav });
      expect(res.success).toBe(false);
    }
  });

  it("rejects missing favorite", () => {
    expect(ProjectFavoriteSchema.safeParse({}).success).toBe(false);
  });

  it("rejects non-object or null payloads", () => {
    expect(ProjectFavoriteSchema.safeParse(null).success).toBe(false);
    expect(ProjectFavoriteSchema.safeParse(true).success).toBe(false);
    expect(ProjectFavoriteSchema.safeParse(123).success).toBe(false);
    expect(ProjectFavoriteSchema.safeParse([]).success).toBe(false);
  });
});

