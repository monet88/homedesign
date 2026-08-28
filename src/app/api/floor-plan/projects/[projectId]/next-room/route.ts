import { authorizeVerified, floorPlanErrorResponse, readJson } from "@/lib/ai/http";
import type { Env } from "@/lib/bindings";
import { addNextRoomMarker } from "@/lib/floor-plan/markers";

// POST /api/floor-plan/projects/[projectId]/next-room — Add Next Room marker (ADR 0004).

export async function POST(
  request: Request,
  ctx: { params: Promise<{ projectId: string }> }
) {
  const auth = await authorizeVerified(request);
  if (auth instanceof Response) return auth;

  const { projectId } = await ctx.params;
  const body = await readJson(request);
  if (body instanceof Response) return body;

  const raw = body as { x?: unknown; y?: unknown };
  const x = Number(raw.x);
  const y = Number(raw.y);

  try {
    const room = await addNextRoomMarker(auth.env as unknown as Env, auth.userId, projectId, { x, y });
    return Response.json({ code: 0, data: room });
  } catch (err) {
    return floorPlanErrorResponse(err);
  }
}
