import { handleDesignGeneration } from "@/lib/ai/handler";

// `POST /api/designs` (ticket #7 AC1 / spec §Generation contracts / ticket #44).
//
// Verified user only. Validates the public Design Config (no prompt, no
// image_input, no base64/object key/URL), authorizes the source Asset (`ready`
// + owned), checks Available Credits ≥ cost, then atomically creates the task
// row + Credit Hold and dispatches the run. Nothing is created when any gate
// rejects — no dangling task, no dangling hold.
//
// Delegates to the shared application handler with canonical response envelope.
//
// Request:  { sourceAssetId, scene, intent, options?, provider?, model?, idempotencyKey }
// Response: 200 { code:0, data:{ id, cost, projectId, status, cached } }

export async function POST(request: Request) {
  return handleDesignGeneration(request, { envelope: "canonical" });
}

