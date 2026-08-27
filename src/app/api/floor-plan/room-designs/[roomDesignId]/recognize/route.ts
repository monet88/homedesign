import { authorizeVerified, readJson } from "@/lib/ai/http";
import { proposeRoomBrief } from "@/lib/floor-plan";
import { FloorPlanError } from "@/lib/floor-plan/errors";
import type { Env } from "@/lib/bindings";

function floorPlanErrorResponse(err: unknown): Response {
  if (err instanceof FloorPlanError) {
    return Response.json(
      err.reason ? { error: err.code, reason: err.reason } : { error: err.code },
      { status: err.status }
    );
  }
  return Response.json({ error: "INTERNAL_ERROR" }, { status: 500 });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ roomDesignId: string }> }
) {
  const auth = await authorizeVerified(request);
  if (auth instanceof Response) return auth;

  const { roomDesignId } = await params;
  const body = await readJson(request);
  if (body instanceof Response) return body;

  const opts = body as {
    style?: string;
    stylePreference?: string;
    freeformRequirements?: string;
  };

  try {
    const proposal = await proposeRoomBrief(auth.env as unknown as Env, auth.userId, roomDesignId, opts);
    return Response.json({ code: 0, data: proposal });
  } catch (err) {
    return floorPlanErrorResponse(err);
  }
}
