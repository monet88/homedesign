import { authorizeVerified, floorPlanErrorResponse } from "@/lib/ai/http";
import type { Env } from "@/lib/bindings";
import { restoreStageRun } from "@/lib/floor-plan/stages";

// POST /api/floor-plan/stage-runs/[stageRunId]/restore — select a successful run as current lineage.

export async function POST(
  request: Request,
  ctx: { params: Promise<{ stageRunId: string }> }
) {
  const auth = await authorizeVerified(request);
  if (auth instanceof Response) return auth;

  const { stageRunId } = await ctx.params;

  try {
    const room = await restoreStageRun(auth.env as unknown as Env, auth.userId, stageRunId);
    return Response.json({ code: 0, data: room });
  } catch (err) {
    return floorPlanErrorResponse(err);
  }
}
