// Unit tests for bounded PNG/JPEG header parser.
import { describe, expect, it } from "vitest";
import {
  parseImageHeader,
  parsePngDimensions,
  parseJpegDimensions,
  parseWebpDimensions,
  hasPngMagic,
  hasJpegMagic,
  hasWebpMagic,
  hasPngIend,
  validateDimensions,
  MAX_MEGAPIXELS,
  MAX_DIMENSION_PX,
  PNG_MAGIC,
  JPEG_MAGIC,
} from "@/lib/intake/header-parser";
import { validPngBytes, validJpegBytes, validWebpBytes, MAGIC, truncatedPngBytes } from "@/lib/fixtures/images";

describe("header parser — magic detection", () => {
  it("detects PNG magic", () => {
    expect(hasPngMagic(validPngBytes())).toBe(true);
  });

  it("detects JPEG magic", () => {
    expect(hasJpegMagic(validJpegBytes())).toBe(true);
  });

  it("detects WebP magic", () => {
    expect(hasWebpMagic(validWebpBytes())).toBe(true);
  });

  it("rejects too-short buffer", () => {
    expect(hasPngMagic(new Uint8Array(0))).toBe(false);
    expect(hasPngMagic(new Uint8Array([0x89]))).toBe(false);
    expect(hasJpegMagic(new Uint8Array(0))).toBe(false);
    expect(hasWebpMagic(new Uint8Array(0))).toBe(false);
    expect(hasWebpMagic(new Uint8Array([0x52, 0x49, 0x46, 0x46]))).toBe(false);
  });

  it("rejects invalid magic", () => {
    const bad = new TextEncoder().encode("not-an-image");
    expect(hasPngMagic(bad)).toBe(false);
    expect(hasJpegMagic(bad)).toBe(false);
    expect(hasWebpMagic(bad)).toBe(false);
  });
});

describe("header parser — PNG dimensions", () => {
  it("parses valid 1x1 PNG (67 bytes)", () => {
    const dims = parsePngDimensions(validPngBytes());
    expect(dims).not.toBeNull();
    expect(dims!.width).toBe(1);
    expect(dims!.height).toBe(1);
    expect(dims!.megapixels).toBeCloseTo(0.000001, 6);
  });

  it("rejects truncated PNG (valid magic, no IEND tail)", () => {
    const t = truncatedPngBytes();
    // IHDR parses (header intact) but the tail IEND check must fail.
    expect(parsePngDimensions(t)).not.toBeNull();
    const tail = t.slice(Math.max(0, t.length - 12));
    expect(hasPngIend(tail)).toBe(false);
  });

  it("accepts full PNG IEND tail", () => {
    const full = validPngBytes();
    const tail = full.slice(Math.max(0, full.length - 12));
    expect(hasPngIend(tail)).toBe(true);
  });

  it("rejects PNG with spoofed first chunk (not IHDR)", () => {
    // Build a buffer: magic + length + wrong type "sRGB" (very unusual)
    const buf = new Uint8Array(29);
    buf.set(PNG_MAGIC, 0);
    buf[8] = 0x00; buf[9] = 0x00; buf[10] = 0x00; buf[11] = 0x01; // length 1
    buf[12] = 0x73; buf[13] = 0x52; buf[14] = 0x47; buf[15] = 0x42; // "sRGB"
    expect(parsePngDimensions(buf)).toBeNull();
  });

  it("rejects buffer too short for IHDR", () => {
    const buf = new Uint8Array(20);
    buf.set(PNG_MAGIC, 0);
    expect(parsePngDimensions(buf)).toBeNull();
  });

  it("rejects oversized dimensions when parsed then validated", () => {
    // Build a fake IHDR with oversized dimensions
    const buf = new Uint8Array(8 + 4 + 4 + 13 + 4);
    buf.set(PNG_MAGIC, 0);
    // IHDR chunk length = 13
    buf[8] = 0x00; buf[9] = 0x00; buf[10] = 0x00; buf[11] = 13;
    // "IHDR"
    buf[12] = 0x49; buf[13] = 0x48; buf[14] = 0x44; buf[15] = 0x52;
    // width = 12001 (exceeds MAX_DIMENSION_PX)
    buf[16] = 0x00; buf[17] = 0x00; buf[18] = 0x2e; buf[19] = 0xe1;
    // height = 1
    buf[20] = 0x00; buf[21] = 0x00; buf[22] = 0x00; buf[23] = 0x01;
    // bit depth, color type, compression, filter, interlace
    buf[24] = 8; buf[25] = 2; buf[26] = 0; buf[27] = 0; buf[28] = 0;

    const dims = parsePngDimensions(buf);
    expect(dims).not.toBeNull();
    const result = validateDimensions(dims!);
    expect(result.ok).toBe(false);
  });
});

describe("header parser — JPEG dimensions", () => {
  it("parses valid 1x1 JPEG", () => {
    const dims = parseJpegDimensions(validJpegBytes());
    expect(dims).not.toBeNull();
    expect(dims!.width).toBe(1);
    expect(dims!.height).toBe(1);
  });

  it("rejects truncated JPEG (no SOF)", () => {
    const buf = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
    expect(parseJpegDimensions(buf)).toBeNull();
  });

  it("rejects JPEG with wrong sync byte", () => {
    // SOI + 0xff + 0x00 (not a valid marker since 0x00 is not a JPEG marker)
    const buf = new Uint8Array([0xff, 0xd8, 0xff, 0x00]);
    expect(parseJpegDimensions(buf)).toBeNull();
  });

  it("rejects oversized JPEG dimensions", () => {
    // Build a minimal JPEG with SOF + oversized dimensions
    // SOI + APP0 (JFIF) + DQT + SOF
    const buf = new Uint8Array(41);
    let off = 0;
    buf[off++] = 0xff; buf[off++] = 0xd8; // SOI
    // APP0 (JFIF)
    buf[off++] = 0xff; buf[off++] = 0xe0;
    buf[off++] = 0x00; buf[off++] = 0x10; // length 16
    buf[off++] = 0x4a; buf[off++] = 0x46; buf[off++] = 0x49; buf[off++] = 0x46; buf[off++] = 0x00; // "JFIF\0"
    buf[off++] = 0x01; buf[off++] = 0x01; buf[off++] = 0x00; buf[off++] = 0x00;
    buf[off++] = 0x01; buf[off++] = 0x00; buf[off++] = 0x01; buf[off++] = 0x00; // 0x00 0x01 0x00 0x01
    // DQT
    buf[off++] = 0xff; buf[off++] = 0xdb;
    buf[off++] = 0x00; buf[off++] = 0x05; // length 5
    buf[off++] = 0x00; buf[off++] = 0x01; buf[off++] = 0x02; buf[off++] = 0x03; buf[off++] = 0x04;
    // SOF0 — width 12001, height 1 => 12001 > 12000
    buf[off++] = 0xff; buf[off++] = 0xc0;
    buf[off++] = 0x00; buf[off++] = 0x0b; // length 11
    buf[off++] = 0x08; // precision 8
    buf[off++] = 0x00; buf[off++] = 0x01; // height 1
    buf[off++] = 0x2e; buf[off++] = 0xe1; // width 12001
    buf[off++] = 0x03; // 3 components
    buf[off++] = 0x01; buf[off++] = 0x11; buf[off++] = 0x00; // component 1

    const dims = parseJpegDimensions(buf);
    expect(dims).not.toBeNull();
    expect(dims!.width).toBe(12001);
    const result = validateDimensions(dims!);
    expect(result.ok).toBe(false);
  });
});

describe("header parser — WebP dimensions", () => {
  it("parses valid 1x1 lossless WebP", () => {
    const dims = parseWebpDimensions(validWebpBytes());
    expect(dims).not.toBeNull();
    expect(dims!.width).toBe(1);
    expect(dims!.height).toBe(1);
  });

  it("rejects buffer too short for WebP header", () => {
    expect(parseWebpDimensions(new Uint8Array(14))).toBeNull();
  });
});

describe("header parser — parseImageHeader (format detection)", () => {
  it("detects and parses PNG", () => {
    const result = parseImageHeader(validPngBytes());
    expect(result).not.toBeNull();
    expect(result!.format).toBe("png");
    expect(result!.dimensions.width).toBe(1);
  });

  it("detects and parses JPEG", () => {
    const result = parseImageHeader(validJpegBytes());
    expect(result).not.toBeNull();
    expect(result!.format).toBe("jpeg");
    expect(result!.dimensions.width).toBe(1);
  });

  it("detects and parses WebP", () => {
    const result = parseImageHeader(validWebpBytes());
    expect(result).not.toBeNull();
    expect(result!.format).toBe("webp");
    expect(result!.dimensions.width).toBe(1);
    expect(result!.dimensions.height).toBe(1);
  });

  it("rejects invalid image bytes", () => {
    expect(parseImageHeader(new TextEncoder().encode("not-an-image"))).toBeNull();
  });

  it("rejects empty buffer", () => {
    expect(parseImageHeader(new Uint8Array(0))).toBeNull();
  });
});

describe("header parser — validateDimensions", () => {
  it("accepts 1x1 image", () => {
    const result = validateDimensions({ width: 1, height: 1, megapixels: 0.000001 });
    expect(result.ok).toBe(true);
  });

  it("accepts 12000x4000 (48MP, within limits)", () => {
    const result = validateDimensions({ width: 12000, height: 4000, megapixels: 48 });
    expect(result.ok).toBe(true);
  });

  it("rejects width > 12000", () => {
    const result = validateDimensions({ width: 12001, height: 1, megapixels: 0.012001 });
    expect(result.ok).toBe(false);
  });

  it("rejects height > 12000", () => {
    const result = validateDimensions({ width: 1, height: 12001, megapixels: 0.012001 });
    expect(result.ok).toBe(false);
  });

  it("rejects > 50 megapixels", () => {
    const result = validateDimensions({ width: 8000, height: 8000, megapixels: 64 });
    expect(result.ok).toBe(false);
  });
});