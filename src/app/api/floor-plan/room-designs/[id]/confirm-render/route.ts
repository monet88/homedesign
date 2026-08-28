import { authorizeVerified, floorPlanErrorResponse } from "@/lib/ai/http";
import type { Env } from "@/lib/bindings";
import { confirmRoomRender } from "@/lib/floor-plan/stages";
import { FloorPlanConfirmRenderSchema } from "@/lib/validation/schemas";

// POST /api/floor-plan/room-designs/[id]/confirm-render

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await authorizeVerified(request);
  if (auth instanceof Response) return auth;

  let body: unknown = {};
  try {
    const text = await request.text();
    if (text.trim()) {
      body = JSON.parse(text);
    }
  } catch {
    return Response.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const parsed = FloorPlanConfirmRenderSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "INVALID_INPUT", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { id } = await ctx.params;
  try {
    const room = await confirmRoomRender(
      auth.env as unknown as Env,
      auth.userId,
      id,
      parsed.data.designId
    );
    return Response.json({ code: 0, data: room });
  } catch (err) {
    return floorPlanErrorResponse(err);
  }
}

