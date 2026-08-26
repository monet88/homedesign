import { authorizeVerified, designErrorResponse } from "@/lib/ai/http";
import { getDesignStatus } from "@/lib/ai/lifecycle";
import type { Env } from "@/lib/bindings";

// `GET /api/designs/[id]` (ticket #7 AC3): the task status lifecycle is
// observable to the owner —
//   accepted → processing → output → quarantined → notified → ready
//   plus terminal `failed` and `expired`.
//
// The response never contains a provider URL, an R2 key or a presigned URL:
// `outputAssetId` appears only once the Generated Asset is `ready`, and the UI
// downloads it through the authorized `{assetId}` endpoint.
//
// Client polling (2.5s interval, 120s max wait) is NOT terminal — a timeout
// stops the client only; the task keeps running and a late completion still
// settles exactly once.
//
// Response: { code:0, data:{ id, status, internalStatus, ..., outputAssetId, errorCode } }

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authorizeVerified(request);
  if (auth instanceof Response) return auth;

  const { id } = await ctx.params;

  try {
    const view = await getDesignStatus(auth.env as unknown as Env, auth.userId, id);
    return Response.json(
      { code: 0, data: view },
      { headers: { "cache-control": "no-store" } }
    );
  } catch (err) {
    return designErrorResponse(err);
  }
}
