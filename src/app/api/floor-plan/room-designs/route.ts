import { authorizeVerified, floorPlanErrorResponse, readJson } from "@/lib/ai/http";
import type { Env } from "@/lib/bindings";
import { placeRoomMarker } from "@/lib/floor-plan/markers";

// POST /api/floor-plan/room-designs — place a Room Marker (creates a Room Design).

export async function POST(request: Request) {
  const auth = await authorizeVerified(request);
  if (auth instanceof Response) return auth;

  const body = await readJson(request);
  if (body instanceof Response) return body;

  const raw = body as { projectId?: unknown; x?: unknown; y?: unknown };
  const projectId = typeof raw.projectId === "string" ? raw.projectId.trim() : "";
  const x = Number(raw.x);
  const y = Number(raw.y);
  if (!projectId) {
    return Response.json({ error: "INVALID_CONFIG", reason: "projectId is required" }, { status: 400 });
  }

  try {
    const room = await placeRoomMarker(auth.env as unknown as Env, auth.userId, projectId, { x, y });
    return Response.json({ code: 0, data: room });
  } catch (err) {
    return floorPlanErrorResponse(err);
  }
}
