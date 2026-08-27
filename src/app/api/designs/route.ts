import { authorizeVerified, designErrorResponse, readJson } from "@/lib/ai/http";
import { createDesign } from "@/lib/ai/lifecycle";
import type { Env } from "@/lib/bindings";

// `POST /api/designs` (ticket #7 AC1 / spec §Generation contracts).
//
// Verified user only. Validates the public Design Config (no prompt, no
// image_input, no base64/object key/URL), authorizes the source Asset (`ready`
// + owned), checks Available Credits ≥ cost, then atomically creates the task
// row + Credit Hold and dispatches the run. Nothing is created when any gate
// rejects — no dangling task, no dangling hold.
//
// Request:  { sourceAssetId, scene, intent, options?, provider?, model?, idempotencyKey }
// Response: 200 { code:0, data:{ id, cost, projectId, status, cached } }
//           400 INVALID_CONFIG | INVALID_SCENE | INVALID_INTENT | INVALID_OPTIONS
//               | PROMPT_NOT_ALLOWED | IMAGE_INPUT_NOT_ALLOWED
//               | INLINE_IMAGE_NOT_ALLOWED | OBJECT_KEY_NOT_ALLOWED
//               | URL_NOT_ALLOWED | IDEMPOTENCY_KEY_REQUIRED
//           401 UNAUTHENTICATED · 403 EMAIL_NOT_VERIFIED | FORBIDDEN
//           402 INSUFFICIENT_CREDITS · 404 ASSET_NOT_FOUND
//           409 SOURCE_ASSET_NOT_READY | IDEMPOTENCY_KEY_REUSED
//           501 SCENE_NOT_IMPLEMENTED (floor-plan stages — #15/#10)

export async function POST(request: Request) {
  const auth = await authorizeVerified(request);
  if (auth instanceof Response) return auth;

  const body = await readJson(request);
  if (body instanceof Response) return body;

  try {
    const result = await createDesign(auth.env as unknown as Env, auth.userId, body);

    // In Next.js local development without background queue consumers, run generation loop
    if (process.env.NODE_ENV === "development" && (auth.env.ENVIRONMENT === "local" || !auth.env.ENVIRONMENT)) {
      void (async () => {
        try {
          console.log("[DEV-GEN] Starting generation for task:", result.id);
          const { runGeneration, completeGeneration } = await import("@/lib/ai/lifecycle");
          const runResult = await runGeneration(auth.env as unknown as Env, result.id);
          console.log("[DEV-GEN] runGeneration result:", runResult);
          if (runResult.status === "quarantined") {
            const completeResult = await completeGeneration(auth.env as unknown as Env, result.id);
            console.log("[DEV-GEN] completeGeneration result:", completeResult);
          }
        } catch (e) {
          console.error("[DEV-GEN] error:", e);
        }
      })();
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
