import { authorizeVerified } from "@/lib/ai/http";
import { finalizeUpload } from "@/lib/intake/intake-service";

// `POST /api/assets/finalize` (ADR 0003 / Ticket 06 AC2).
// Authenticated (verified user only). Verifies the object exists at the
// quarantine key, atomically moves the Asset pending-upload → quarantined,
// and converges to a single validation job (idempotent replay is a no-op).
//
// Request:  { assetId }
// Response: { code:0, data:{ assetId, lifecycle } }
//            { code:1, error } on failure

export async function POST(request: Request) {
  const auth = await authorizeVerified(request);
  if (auth instanceof Response) return auth;
  const env = auth.env;

  let body: { assetId?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const assetId = body.assetId ?? "";
  if (!assetId) {
    return Response.json({ error: "INVALID_INPUT" }, { status: 400 });
  }

  // Ownership check: the finalizer must own the Asset.
  const owner = await env.DB.prepare(
    `SELECT user_id FROM assets WHERE id = ?1`
  ).bind(assetId).first<{ user_id: string | null }>();

  if (!owner) {
    return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  if (owner.user_id !== auth.userId) {
    return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const res = await finalizeUpload(env, assetId);
  if (!res.ok) {
    const status = res.reason.includes("not uploaded") ? 409 : 404;
    return Response.json({ error: "FINALIZE_FAILED", reason: res.reason }, { status });
  }

  return Response.json({ code: 0, data: { assetId, lifecycle: res.lifecycle } });
}