// Test-only Worker entry for the vitest-pool-workers runtime harness.
// Production uses `worker.ts` (OpenNext custom worker + queue consumers).

import type { Env } from "@/lib/bindings";
import { validateAsset, type AssetValidationJob } from "@/lib/intake/validator";
import { handleQueueBatch } from "@/lib/worker/queue-consumer";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/__test/health") {
      return Response.json({
        ok: true,
        environment: env.ENVIRONMENT,
        hasD1: typeof env.DB !== "undefined",
        hasR2: typeof env.HD_PRIVATE !== "undefined",
        hasQueue: typeof env.ASSET_VALIDATE !== "undefined",
      });
    }

    if (url.pathname === "/__test/consume-asset-validate") {
      const job = (await request.json()) as AssetValidationJob;
      const result = await validateAsset(env, job);
      return Response.json(result);
    }

    return Response.json({ ok: false, error: "not found" }, { status: 404 });
  },

  async queue(batch: MessageBatch<unknown>, env: Env): Promise<void> {
    await handleQueueBatch(batch, env);
  },
};
