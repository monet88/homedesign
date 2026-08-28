import { authorizeVerified } from "@/lib/ai/http";
import { createUploadIntent } from "@/lib/intake/intake-service";
import { presignPutUrl, type PresignCredentials } from "@/lib/intake/presign";
import { UploadIntentSchema } from "@/lib/validation/schemas";

// `POST /api/assets/upload-intent` (ADR 0003 / Ticket 06 AC1).
// Authenticated (verified user only). Creates an Asset `pending-upload` and
// returns a 10-minute presigned PUT to the R2 S3 API quarantine key. The
// browser PUTs the bytes directly; the server never sees the body.
//
// Request:  { name, mimeType, size }
// Response: { code:0, data:{ assetId, presignedUrl, expiresInSec } }

export async function POST(request: Request) {
  const auth = await authorizeVerified(request);
  if (auth instanceof Response) return auth;
  const env = auth.env;
  const userId = auth.userId;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const parsed = UploadIntentSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "INVALID_INPUT", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { name, mimeType, size } = parsed.data;

  try {
    const intent = await createUploadIntent(env, { userId, name, mimeType, size });

    // Presigned PUT to the R2 S3 API domain (not CDN). Credentials come from
    // env/secrets: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY.
    const creds: PresignCredentials = {
      accountId: env.R2_ACCOUNT_ID ?? "",
      accessKeyId: env.R2_ACCESS_KEY_ID ?? "",
      secretAccessKey: env.R2_SECRET_ACCESS_KEY ?? "",
    };
    let presignedUrl: string | null = null;
    if (
      env.ENVIRONMENT === "local" ||
      env.R2_ACCOUNT_ID === "local-dev-account" ||
      !creds.accountId
    ) {
      presignedUrl = `/api/assets/${intent.assetId}/upload`;
    } else if (creds.accountId && creds.accessKeyId && creds.secretAccessKey) {
      const presigned = await presignPutUrl(creds, {
        bucket: "homedesign-private",
        key: intent.key,
        contentType: mimeType,
        expiresInSec: intent.expiresInSec,
      });
      presignedUrl = presigned.url;
    }

    return Response.json({
      code: 0,
      data: {
        assetId: intent.assetId,
        presignedUrl,
        expiresInSec: intent.expiresInSec,
      },
    });
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.includes("quota exceeded")) {
      return Response.json({ error: "QUOTA_EXCEEDED", reason: msg }, { status: 429 });
    }
    if (msg.includes("unsupported mime") || msg.includes("size exceeds")) {
      return Response.json({ error: "INVALID_INPUT", reason: msg }, { status: 400 });
    }
    return Response.json({ error: "INTERNAL" }, { status: 500 });
  }
}