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
