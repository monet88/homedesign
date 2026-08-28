import { authorizeVerified, floorPlanErrorResponse, readJson } from "@/lib/ai/http";
import type { Env } from "@/lib/bindings";
import { updateRoomMarker } from "@/lib/floor-plan/markers";

// PATCH /api/floor-plan/room-designs/[id]/marker

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await authorizeVerified(request);
  if (auth instanceof Response) return auth;

  const { id } = await ctx.params;
  const body = await readJson(request);
  if (body instanceof Response) return body;

  const raw = body as { x?: unknown; y?: unknown };
  try {
    const room = await updateRoomMarker(auth.env as unknown as Env, auth.userId, id, {
      x: Number(raw.x),
      y: Number(raw.y),
    });
    return Response.json({ code: 0, data: room });
  } catch (err) {
    return floorPlanErrorResponse(err);
  }
}
