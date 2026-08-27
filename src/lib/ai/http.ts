import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireVerifiedUser, resolveSession, type AuthEnv } from "@/lib/auth/server";
import { DesignError } from "@/lib/ai/types";
import { FloorPlanError } from "@/lib/floor-plan/errors";

// Shared HTTP plumbing for the generation endpoints (ticket #7).
// Envelope convention: `{ code: 0, data: {...} }` on success, `{ error }` +
// status on failure (same as #4/#5/#6 routes).

export interface RouteSession {
  env: AuthEnv;
  userId: string;
}

export async function authorizeVerified(
  request: Request
): Promise<RouteSession | Response> {
  const cf = await getCloudflareContext({ async: true });
  const env = cf.env as unknown as AuthEnv;

  const session = await resolveSession(env, request);
  if (!session) {
    return Response.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }
  try {
    requireVerifiedUser(session);
  } catch (err) {
    return Response.json(
      { error: "EMAIL_NOT_VERIFIED" },
      { status: (err as { status?: number }).status ?? 403 }
    );
  }
  return { env, userId: session.user.id };
}

/** Map a thrown error to the documented `{ error }` envelope. */
export function designErrorResponse(err: unknown): Response {
  if (err instanceof DesignError) {
    return Response.json(
      err.reason ? { error: err.code, reason: err.reason } : { error: err.code },
      { status: err.status }
    );
  }
  const message = (err as Error)?.message ?? "INTERNAL_ERROR";
  if (message === "IDEMPOTENCY_KEY_REUSED") {
    return Response.json({ error: "IDEMPOTENCY_KEY_REUSED" }, { status: 409 });
  }
  if (message === "INSUFFICIENT_CREDITS") {
    return Response.json({ error: "INSUFFICIENT_CREDITS" }, { status: 402 });
  }
  if (message === "HOLD_ALREADY_ACTIVE") {
    return Response.json({ error: "TASK_ALREADY_ACTIVE" }, { status: 409 });
  }
  return Response.json({ error: "INTERNAL_ERROR" }, { status: 500 });
}

export async function readJson(request: Request): Promise<unknown | Response> {
  try {
    return await request.json();
  } catch {
    return Response.json({ error: "INVALID_JSON" }, { status: 400 });
  }
}

/** Map FloorPlanError to the documented `{ error }` envelope. */
export function floorPlanErrorResponse(err: unknown): Response {
  if (err instanceof FloorPlanError) {
    return Response.json(
      err.reason ? { error: err.code, reason: err.reason } : { error: err.code },
      { status: err.status }
    );
  }
  return designErrorResponse(err);
}
