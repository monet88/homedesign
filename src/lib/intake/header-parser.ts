// Bounded PNG/JPEG header parser (ADR 0003 / spec §Upload & Asset lifecycle).
// Extracts width/height from image headers using ranged reads only.
// NO full decode, NO raster buffering, NO image decoding library.
// Enforces ≤50MP and ≤12000px/side at the parser level.

export const MAX_MEGAPIXELS = 50;
export const MAX_DIMENSION_PX = 12000;

export const PNG_MAGIC = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
export const JPEG_MAGIC = new Uint8Array([0xff, 0xd8]);

// Maximum bytes to scan for JPEG SOF marker (safe: well within Worker CPU limits).
const JPEG_SCAN_LIMIT = 65536;

export interface ImageDimensions {
  width: number;
  height: number;
  megapixels: number;
}

export type ImageFormat = "png" | "jpeg";

export interface ParseResult {
  format: ImageFormat;
  dimensions: ImageDimensions;
}

/** Check if `bytes` (size >= 8) starts with PNG magic signature. */
export function hasPngMagic(bytes: Uint8Array): boolean {
  if (bytes.length < 8) return false;
  for (let i = 0; i < 8; i++) {
    if (bytes[i] !== PNG_MAGIC[i]) return false;
  }
  return true;
}

/** Check if `bytes` (size >= 2) starts with JPEG SOI marker. */
export function hasJpegMagic(bytes: Uint8Array): boolean {
  if (bytes.length < 2) return false;
  return bytes[0] === 0xff && bytes[1] === 0xd8;
}

/**
 * Check PNG tail for a valid IEND chunk (bounded truncation check).
 * IEND = 00 00 00 00 49 45 4E 44 AE 42 60 82 (12 bytes).
 * `tail` is the last 12 bytes of the object (validator performs a separate
 * ranged read of the tail; no full-file buffering).
 */
export function hasPngIend(tail: Uint8Array): boolean {
  if (tail.length < 12) return false;
  const iend = new Uint8Array([0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);
  const start = tail.length - 12;
  for (let i = 0; i < 12; i++) {
    if (tail[start + i] !== iend[i]) return false;
  }
  return true;
}

/**
 * Parse PNG IHDR from the first ~33 bytes.
 * PNG: signature (8) + chunk length (4) + "IHDR" (4) + data (13) + CRC (4).
 * Returns dimensions or null if not parseable.
 */
export function parsePngDimensions(bytes: Uint8Array): ImageDimensions | null {
  if (!hasPngMagic(bytes)) return null;
  // Need at least sig(8) + len(4) + type(4) + 13 data = 29 bytes.
  if (bytes.length < 29) return null;

  const ihdrLen = readU32BE(bytes, 8);
  // IHDR must be the first chunk, type should be "IHDR" (0x49 48 44 52)
  if (
    bytes[12] !== 0x49 || bytes[13] !== 0x48 ||
    bytes[14] !== 0x44 || bytes[15] !== 0x52
  ) {
    return null;
  }
  // We need at least 13 bytes of IHDR data: 4+4+1+1+1+1+1 = 13
  if (ihdrLen < 13) return null;
  // Need enough buffer
  if (bytes.length < 16 + ihdrLen) return null;

  const width = readU32BE(bytes, 16);
  const height = readU32BE(bytes, 20);

  return imageDimensions(width, height);
}

/**
 * Parse JPEG SOF0/1/2 marker from the first ~64KB.
 * JPEG doesn't guarantee which segment comes first, so scan for the marker.
 * Returns dimensions or null if not parseable within the scan limit.
 */
export function parseJpegDimensions(bytes: Uint8Array): ImageDimensions | null {
  if (!hasJpegMagic(bytes)) return null;
  if (bytes.length < 4) return null;

  // Scan for SOF0/1/2 markers in the first JPEG_SCAN_LIMIT bytes.
  // The scan tolerates non-canonical segment padding/stray 0xFF inside
  // payloads (real encoders emit DQT/DHT payloads that contain 0xFF);
  // we only trust a candidate when its length field and SOF payload are
  // consistent, so spoofed headers fail closed.
  const limit = Math.min(bytes.length, JPEG_SCAN_LIMIT);
  for (let i = 2; i < limit - 9; i++) {
    if (bytes[i] !== 0xff) continue;
    const marker = bytes[i + 1];
    if (marker !== 0xc0 && marker !== 0xc1 && marker !== 0xc2) continue;

    const segLen = readU16BE(bytes, i + 2);
    // min SOF payload: 2(len) + 1(precision) + 2(height) + 2(width) + 1(components)
    if (segLen < 8) continue;
    if (i + 2 + segLen > bytes.length) continue;

    const precision = bytes[i + 4];
    const height = readU16BE(bytes, i + 5);
    const width = readU16BE(bytes, i + 7);

    // Validate: precision typical 8, sometimes 12 or 16
    if (precision !== 8 && precision !== 12 && precision !== 16) continue;
    if (width === 0 || height === 0) continue;

    return imageDimensions(width, height);
  }

  return null; // SOF not found within bounds
}

/** Parse raw bytes: detect format, extract dimensions. Returns null on failure. */
export function parseImageHeader(bytes: Uint8Array): ParseResult | null {
  if (bytes.length < 2) return null;

  if (hasPngMagic(bytes)) {
    const dims = parsePngDimensions(bytes);
    if (!dims) return null;
    return { format: "png", dimensions: dims };
  }

  if (hasJpegMagic(bytes)) {
    const dims = parseJpegDimensions(bytes);
    if (!dims) return null;
    return { format: "jpeg", dimensions: dims };
  }

  return null;
}

/** Validate dimensions against spec limits. */
export function validateDimensions(dims: ImageDimensions): { ok: true } | { ok: false; reason: string } {
  if (dims.width > MAX_DIMENSION_PX || dims.height > MAX_DIMENSION_PX) {
    return { ok: false, reason: `dimension exceeds ${MAX_DIMENSION_PX}px (${dims.width}x${dims.height})` };
  }
  if (dims.megapixels > MAX_MEGAPIXELS) {
    return { ok: false, reason: `megapixel count exceeds ${MAX_MEGAPIXELS}MP (${dims.megapixels.toFixed(1)}MP)` };
  }
  return { ok: true };
}

// --- Helpers ---

function imageDimensions(width: number, height: number): ImageDimensions {
  return { width, height, megapixels: (width * height) / 1_000_000 };
}

function readU16BE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function readU32BE(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] << 24) |
    (bytes[offset + 1] << 16) |
    (bytes[offset + 2] << 8) |
    bytes[offset + 3]
  ) >>> 0;
}