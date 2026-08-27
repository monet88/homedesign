import { authorizeVerified, floorPlanErrorResponse } from "@/lib/ai/http";
import type { Env } from "@/lib/bindings";
import { getFloorPlanProjectDetail } from "@/lib/floor-plan/overview";

// GET /api/floor-plan/projects/[projectId] — overview, rooms, stage runs, processing tasks.

export async function GET(
  request: Request,
  ctx: { params: Promise<{ projectId: string }> }
) {
  const auth = await authorizeVerified(request);
  if (auth instanceof Response) return auth;

  const { projectId } = await ctx.params;

  try {
    const detail = await getFloorPlanProjectDetail(
      auth.env as unknown as Env,
      auth.userId,
      projectId
    );
    return Response.json({ code: 0, data: detail }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return floorPlanErrorResponse(err);
  }
}
