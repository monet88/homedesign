import { handleDesignGeneration } from "@/lib/ai/handler";

// `POST /api/ai/generate` — origin-compatible alias of `POST /api/designs`
// (issue #7 / ticket #44). Same gates, same idempotency: the origin client
// only reads `data.id`.
//
// Delegates to the shared application handler with compatibility response envelope.

export async function POST(request: Request) {
  return handleDesignGeneration(request, { envelope: "compat" });
}

