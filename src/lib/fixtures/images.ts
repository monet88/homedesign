// Fixture helpers for the Workers runtime harness + later tickets (spec
// Testing Decisions seam 3: fixture bytes, presigned upload intent, lifecycle).

/** Known asset lifecycle states (CONTEXT.md glossary, ADR 0003). */
export const ASSET_LIFECYCLE = [
  "pending-upload",
  "quarantined",
  "ready",
  "rejected",
  "deleted",
] as const;
export type AssetLifecycle = (typeof ASSET_LIFECYCLE)[number];

/** Valid magic bytes for each intake format. */
export const MAGIC = {
  PNG: Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  JPEG: Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]),
  // BMP / GIF for negative fixture cases
  BMP: Uint8Array.from([0x42, 0x4d]),
  GIF: Uint8Array.from([0x47, 0x49, 0x46, 0x38]),
} as const;

/** Build a valid 1x1 PNG of a given solid color. */
export function validPngBytes(): Uint8Array {
  // 1x1 red PNG (67 bytes).
  const b64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  return base64ToBytes(b64);
}

/** Minimal valid JPEG: SOI + a tiny (1x1) JFIF-encoded stream. */
export function validJpegBytes(): Uint8Array {
  const b64 =
    "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD//2Q==";
  return base64ToBytes(b64);
}

/** Truncated/invalid bytes: wrong magic, so validation must reject. */
export function invalidImageBytes(): Uint8Array {
  return new TextEncoder().encode("not-an-image");
}

/** Truncated PNG: valid magic but no IEND chunk. */
export function truncatedPngBytes(): Uint8Array {
  const full = validPngBytes();
  return full.slice(0, full.length - 12);
}

/** Spoofed extension test: JPEG bytes, but declared as PNG. */
export function spoofedMimeBytes(): { bytes: Uint8Array; mime: string; name: string } {
  return {
    bytes: validJpegBytes(),
    mime: "image/png",
    name: "spoofed.png",
  };
}

/** 50MB ceiling from the spec (ADR 0003). */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

/** Valid MIME types accepted for intake. */
export const VALID_UPLOAD_MIMES = ["image/png", "image/jpeg"] as const;

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/**
 * Synthetic PNG stream generator: creates a valid PNG stream of arbitrary size
 * (e.g. 50MB) without allocating the full object in memory.
 * Emits valid PNG magic + IHDR in the head, dummy chunks in the middle, and IEND at the tail.
 */
export function createSyntheticPngStream(
  totalSize = 50 * 1024 * 1024,
  chunkSize = 64 * 1024
): ReadableStream<Uint8Array> {
  const IEND_BYTES = new Uint8Array([0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);

  // Valid PNG magic + 100x100 RGB IHDR chunk
  const header = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG magic
    0x00, 0x00, 0x00, 0x0d,                         // IHDR len 13
    0x49, 0x48, 0x44, 0x52,                         // "IHDR"
    0x00, 0x00, 0x00, 0x64,                         // width 100
    0x00, 0x00, 0x00, 0x64,                         // height 100
    0x08, 0x02, 0x00, 0x00, 0x00,                   // 8-bit RGB
    0x59, 0x73, 0x22, 0x0b,                         // CRC
  ]);

  let bytesEmitted = 0;
  const dummyChunk = new Uint8Array(chunkSize);

  const rawStream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (bytesEmitted >= totalSize) {
        controller.close();
        return;
      }

      if (bytesEmitted === 0) {
        const remaining = totalSize - bytesEmitted - IEND_BYTES.length;
        const firstChunkLen = Math.min(chunkSize, remaining + header.length);
        const chunk = new Uint8Array(firstChunkLen);
        chunk.set(header, 0);
        bytesEmitted += firstChunkLen;
        controller.enqueue(chunk);
        return;
      }

      const remainingBeforeIend = totalSize - IEND_BYTES.length - bytesEmitted;
      if (remainingBeforeIend > 0) {
        const len = Math.min(chunkSize, remainingBeforeIend);
        const chunk = dummyChunk.subarray(0, len);
        bytesEmitted += len;
        controller.enqueue(chunk);
        return;
      }

      if (bytesEmitted < totalSize) {
        bytesEmitted += IEND_BYTES.length;
        controller.enqueue(IEND_BYTES);
        controller.close();
      }
    },
  });

  // Wrap in FixedLengthStream if available in Workers runtime
  if (typeof FixedLengthStream !== "undefined") {
    return rawStream.pipeThrough(new FixedLengthStream(totalSize));
  }
  return rawStream;
}
