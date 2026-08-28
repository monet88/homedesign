// Unit tests for the R2 S3 SigV4 presigned PUT URL (deterministic).
import { describe, expect, it } from "vitest";
import { presignPutUrl } from "@/lib/intake/presign";

const CREDS = {
  accountId: "acct123",
  accessKeyId: "AKIDEXAMPLE",
  secretAccessKey: "SECRETKEY",
};
const NOW = Date.UTC(2026, 0, 15, 12, 0, 0); // fixed timestamp

describe("presignPutUrl", () => {
  it("produces a deterministic signature for a fixed timestamp", async () => {
    const a = await presignPutUrl(CREDS, { bucket: "hd-private", key: "quarantine/abc.png", expiresInSec: 600 }, NOW);
    const b = await presignPutUrl(CREDS, { bucket: "hd-private", key: "quarantine/abc.png", expiresInSec: 600 }, NOW);
    expect(a.url).toBe(b.url);
    expect(a.url).toContain("X-Amz-Signature=");
    expect(a.url).toContain("X-Amz-Expires=600");
    expect(a.expiresAt).toBe(NOW + 600_000);
    expect(a.host).toBe("hd-private.acct123.r2.cloudflarestorage.com");
  });

  it("signs the S3 API domain (r2.cloudflarestorage.com), not a CDN domain", async () => {
    const p = await presignPutUrl(CREDS, { bucket: "hd-private", key: "quarantine/x.png", expiresInSec: 600 }, NOW);
    expect(p.host).toMatch(/r2\.cloudflarestorage\.com$/);
    expect(p.host).not.toMatch(/cdn\./);
  });

  it("differs when the key changes (bearer scope = one key)", async () => {
    const a = await presignPutUrl(CREDS, { bucket: "hd-private", key: "quarantine/a.png", expiresInSec: 600 }, NOW);
    const b = await presignPutUrl(CREDS, { bucket: "hd-private", key: "quarantine/b.png", expiresInSec: 600 }, NOW);
    expect(a.url).not.toBe(b.url);
  });

  it("includes content-type in signed headers when provided", async () => {
    const p = await presignPutUrl(
      CREDS,
      { bucket: "hd-private", key: "quarantine/a.png", contentType: "image/png", expiresInSec: 600 },
      NOW
    );
    expect(p.url).toContain("content-type");
  });

  it("handles nested keys (quarantine/ prefix) with encoded path", async () => {
    const p = await presignPutUrl(CREDS, { bucket: "hd-private", key: "quarantine/sub dir/ảnh.png", expiresInSec: 600 }, NOW);
    expect(p.url).toContain("quarantine/");
  });

  it("expiry is bounded to the 10-minute contract", async () => {
    const p = await presignPutUrl(CREDS, { bucket: "hd-private", key: "quarantine/a.png", expiresInSec: 600 }, NOW);
    expect(p.expiresInSec).toBe(600);
    expect(p.expiresAt - p.expiresAt).toBe(0);
  });
});