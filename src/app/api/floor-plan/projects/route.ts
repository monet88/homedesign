import { authorizeVerified, readJson } from "@/lib/ai/http";
import { createFloorPlanProject } from "@/lib/floor-plan";
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

export async function POST(request: Request) {
  const auth = await authorizeVerified(request);
  if (auth instanceof Response) return auth;

  const body = await readJson(request);
  if (body instanceof Response) return body;

  const sourceAssetId =
    typeof (body as { sourceAssetId?: unknown }).sourceAssetId === "string"
      ? (body as { sourceAssetId: string }).sourceAssetId.trim()
      : "";

  if (!sourceAssetId) {
    return Response.json({ error: "INVALID_CONFIG", reason: "sourceAssetId is required" }, { status: 400 });
  }

  try {
    const project = await createFloorPlanProject(auth.env as unknown as Env, auth.userId, sourceAssetId);
    return Response.json({ code: 0, data: project });
  } catch (err) {
    return floorPlanErrorResponse(err);
  }
}
