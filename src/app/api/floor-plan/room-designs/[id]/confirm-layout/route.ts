import { authorizeVerified, floorPlanErrorResponse } from "@/lib/ai/http";
import type { Env } from "@/lib/bindings";
import { confirmRoomLayout } from "@/lib/floor-plan/stages";

// POST /api/floor-plan/room-designs/[id]/confirm-layout

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await authorizeVerified(request);
  if (auth instanceof Response) return auth;

  const { id } = await ctx.params;
  let designId: string | undefined;
  try {
    const body = (await request.json().catch(() => ({}))) as { designId?: string };
    designId = typeof body.designId === "string" ? body.designId.trim() : undefined;
  } catch {
    designId = undefined;
  }

  try {
    const room = await confirmRoomLayout(auth.env as unknown as Env, auth.userId, id, designId);
    return Response.json({ code: 0, data: room });
  } catch (err) {
    return floorPlanErrorResponse(err);
  }
}
