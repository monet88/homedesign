import { authorizeVerified, floorPlanErrorResponse } from "@/lib/ai/http";
import type { Env } from "@/lib/bindings";
import { confirmRoomBrief } from "@/lib/floor-plan/brief";

// POST /api/floor-plan/room-designs/[id]/confirm-brief

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await authorizeVerified(request);
  if (auth instanceof Response) return auth;

  const { id } = await ctx.params;
  try {
    const room = await confirmRoomBrief(auth.env as unknown as Env, auth.userId, id);
    return Response.json({ code: 0, data: room });
  } catch (err) {
    return floorPlanErrorResponse(err);
  }
}
