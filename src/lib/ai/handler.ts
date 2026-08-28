import { authorizeVerified, designErrorResponse, readJson } from "@/lib/ai/http";
import { createDesign, getDesignStatus } from "@/lib/ai/lifecycle";
import { DesignQuerySchema } from "@/lib/validation/schemas";
import type { Env } from "@/lib/bindings";

// Ticket #44 — Shared Design Generation & Query orchestration handler.
//
// Canonical endpoint (`POST /api/designs`) and compatibility alias
// (`POST /api/ai/generate`) share this single application handler so auth,
// validation, idempotency, local dev loops, and error responses cannot drift.

export type GenerationResponseEnvelope = "canonical" | "compat";

export interface DesignGenerationOptions {
  envelope?: GenerationResponseEnvelope;
}

/**
 * Executes local development background generation loop once.
 * In Next.js local development without background queue consumers, drives
 * the task lifecycle from accepted → quarantined → ready/failed.
 */
export function triggerLocalDevGeneration(env: Env, taskId: string): void {
  if (
    process.env.NODE_ENV === "development" &&
    (env.ENVIRONMENT === "local" || !env.ENVIRONMENT)
  ) {
    void (async () => {
      try {
        console.log("[DEV-GEN] Starting generation for task:", taskId);
        const { runGeneration, completeGeneration } = await import(
          "@/lib/ai/lifecycle"
        );
        const runResult = await runGeneration(env, taskId);
        console.log("[DEV-GEN] runGeneration result:", runResult);
        if (runResult.status === "quarantined") {
          const completeResult = await completeGeneration(env, taskId);
          console.log("[DEV-GEN] completeGeneration result:", completeResult);
        }
      } catch (e) {
        console.error(
          "[DEV-GEN] Background generation error for task:",
          taskId,
          e
        );
      }
    })();
  }
}

/**
 * Shared application handler for POST /api/designs and POST /api/ai/generate.
 */
export async function handleDesignGeneration(
  request: Request,
  options: DesignGenerationOptions = {}
): Promise<Response> {
  const envelope = options.envelope ?? "canonical";

  const auth = await authorizeVerified(request);
  if (auth instanceof Response) return auth;

  const body = await readJson(request);
  if (body instanceof Response) return body;

  try {
    const result = await createDesign(
      auth.env as unknown as Env,
      auth.userId,
      body
    );

    triggerLocalDevGeneration(auth.env as unknown as Env, result.id);

    if (envelope === "compat") {
      return Response.json({
        code: 0,
        message: "ok",
        data: { id: result.id },
      });
    }

    return Response.json({
      code: 0,
      data: {
        id: result.id,
        status: result.status,
        cost: result.cost,
        projectId: result.projectId,
        cached: result.cached,
      },
    });
  } catch (err) {
    return designErrorResponse(err);
  }
}

/**
 * Shared application handler for querying design task status by ID.
 * Used by GET /api/designs/[id].
 */
export async function handleDesignQuery(
  request: Request,
  taskId: string
): Promise<Response> {
  const auth = await authorizeVerified(request);
  if (auth instanceof Response) return auth;

  const parsed = DesignQuerySchema.safeParse({ taskId });
  if (!parsed.success) {
    return Response.json(
      { error: "INVALID_REQUEST", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  try {
    const view = await getDesignStatus(
      auth.env as unknown as Env,
      auth.userId,
      parsed.data.taskId
    );
    return Response.json(
      { code: 0, data: view },
      { headers: { "cache-control": "no-store" } }
    );
  } catch (err) {
    return designErrorResponse(err);
  }
}
