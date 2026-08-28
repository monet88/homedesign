import { handleDesignQuery } from "@/lib/ai/handler";

// `GET /api/designs/[id]` (ticket #7 AC3 / ticket #44): the task status
// lifecycle is observable to the owner —
//   accepted → processing → output → quarantined → notified → ready
//   plus terminal `failed` and `expired`.
//
// Validates taskId with DesignQuerySchema before domain lookup.
//
// Response: { code:0, data:{ id, status, internalStatus, ..., outputAssetId, errorCode } }

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handleDesignQuery(request, id);
}

