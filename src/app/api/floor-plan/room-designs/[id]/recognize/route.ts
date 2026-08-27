import { authorizeVerified, floorPlanErrorResponse } from "@/lib/ai/http";
import type { Env } from "@/lib/bindings";
import { proposeRoomBrief } from "@/lib/floor-plan/brief";

// POST /api/floor-plan/room-designs/[id]/recognize — free recognition + brief proposal.

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await authorizeVerified(request);
  if (auth instanceof Response) return auth;

  const { id } = await ctx.params;
  let options: { style?: string; stylePreference?: string; freeformRequirements?: string } = {};
  try {
    const body = (await request.json()) as Record<string, unknown>;
    if (typeof body.style === "string") options.style = body.style;
    if (typeof body.stylePreference === "string") options.stylePreference = body.stylePreference;
    if (typeof body.freeformRequirements === "string") options.freeformRequirements = body.freeformRequirements;
  } catch {
    // empty body is fine
  }

  try {
    const proposal = await proposeRoomBrief(auth.env as unknown as Env, auth.userId, id, options);
    return Response.json({ code: 0, data: proposal });
  } catch (err) {
    return floorPlanErrorResponse(err);
  }
}
