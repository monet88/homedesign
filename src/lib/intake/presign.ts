// R2 S3 API SigV4 presigned PUT URL (ADR 0003: presigned PUT to quarantine key).
// Pure function: deterministic for a fixed input, uses Web Crypto HMAC-SHA256.
// The browser PUTs the file bytes directly to this URL (10-minute expiry);
// the URL is a bearer token scoped to exactly one object key + method.
//
// The Workers R2 binding does not expose presigning, so the App Worker builds
// the URL with R2 S3 API credentials supplied via env/secrets:
//   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
// The signature is the standard AWS SigV4 (S3 uses `s3` service + host header).

export interface PresignCredentials {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export interface PresignPutParams {
  bucket: string;
  key: string;
  contentType?: string;
  /** Seconds until expiry (ADR 0003: 10 minutes = 600). */
  expiresInSec: number;
}

export interface PresignedPut {
  url: string;
  /** R2 S3 API endpoint domain (custom CDN domain is NOT used for uploads). */
  host: string;
  key: string;
  expiresInSec: number;
  expiresAt: number;
}

const SHA256 = "SHA-256";

function hex(bytes: BufferSource): string {
  return Array.from(new Uint8Array(bytes as ArrayBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hmac(key: BufferSource, data: string): Promise<ArrayBuffer> {
  return crypto.subtle.importKey("raw", key, { name: "HMAC", hash: SHA256 }, false, ["sign"]).then((k) =>
    crypto.subtle.sign("HMAC", k, new TextEncoder().encode(data))
  );
}

async function sha256Hex(data: string): Promise<string> {
  const digest = await crypto.subtle.digest(SHA256, new TextEncoder().encode(data));
  return hex(digest);
}

function encodePath(key: string): string {
  return key.split("/").map(encodeURIComponent).join("/");
}

function uriEncode(s: string): string {
  // AWS requires RFC 3986 unreserved chars unencoded; everything else %XX.
  return encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
}

/**
 * Build an AWS SigV4 presigned PUT URL for an R2 object.
 * Deterministic for a fixed timestamp (testable); in production the caller
 * passes `Date.now()`.
 */
export function presignPutUrl(
  creds: PresignCredentials,
  params: PresignPutParams,
  now = Date.now()
): Promise<PresignedPut> {
  return presignUrl("PUT", creds, params, now);
}

/**
 * Build an AWS SigV4 presigned GET URL for an R2 object (ticket #7:
 * short-lived private access to the source Asset, resolved server-side and
 * handed to the provider adapter as `options.image_input`). Never returned to
 * a browser.
 */
export function presignGetUrl(
  creds: PresignCredentials,
  params: Omit<PresignPutParams, "contentType">,
  now = Date.now()
): Promise<PresignedPut> {
  return presignUrl("GET", creds, params, now);
}

async function presignUrl(
  method: "PUT" | "GET",
  creds: PresignCredentials,
  params: PresignPutParams,
  now = Date.now()
): Promise<PresignedPut> {
  const { accountId, accessKeyId, secretAccessKey } = creds;
  const { bucket, key, contentType, expiresInSec } = params;

  const host = `${bucket}.${accountId}.r2.cloudflarestorage.com`;
  const path = `/${encodePath(key)}`;

  const amzDate = new Date(now).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const dateStamp = amzDate.slice(0, 8);

  // Canonical request: PUT /<key> with host + (optional) content-type headers.
  const headers: Array<[string, string]> = [["host", host]];
  if (contentType) headers.push(["content-type", contentType]);
  const canonicalHeaders = headers
    .map(([k, v]) => `${k.toLowerCase()}:${v}\n`)
    .join("");
  const signedHeaders = headers.map(([k]) => k.toLowerCase()).join(";");

  const canonicalQuery = [
    `X-Amz-Algorithm=AWS4-HMAC-SHA256`,
    `X-Amz-Credential=${uriEncode(`${accessKeyId}/${dateStamp}/${"auto"}/s3/aws4_request`)}`,
    `X-Amz-Date=${amzDate}`,
    `X-Amz-Expires=${expiresInSec}`,
    `X-Amz-SignedHeaders=${signedHeaders}`,
  ].join("&");

  const canonicalRequest = [
    method,
    path,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const scope = `${dateStamp}/auto/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    await sha256Hex(canonicalRequest),
  ].join("\n");

  const kDate = await hmac(new TextEncoder().encode(`AWS4${secretAccessKey}`), dateStamp);
  const kRegion = await hmac(kDate, "auto");
  const kService = await hmac(kRegion, "s3");
  const kSigning = await hmac(kService, "aws4_request");
  const signature = hex(await hmac(kSigning, stringToSign));

  const url = `https://${host}${path}?${canonicalQuery}&X-Amz-Signature=${signature}`;

  return {
    url,
    host,
    key,
    expiresInSec,
    expiresAt: now + expiresInSec * 1000,
  };
}