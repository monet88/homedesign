// Custom OpenNext worker: re-uses the generated fetch handler and adds queue
// consumers + scheduled reconcilers (ADR 0006 / ticket #18 review fix).
//
// @see https://opennext.js.org/cloudflare/howtos/custom-worker

// @ts-expect-error generated at build time by opennextjs-cloudflare
import { default as openNextHandler } from "./.open-next/worker.js";
import { reconcileTasks } from "@/lib/ai/lifecycle";
import { reconcileIntakeExpiry } from "@/lib/intake/expiry";
import type { Env } from "@/lib/bindings";
import { handleQueueBatch } from "@/lib/worker/queue-consumer";

export default {
  fetch: openNextHandler.fetch,

  async queue(batch: MessageBatch<unknown>, env: Env): Promise<void> {
    await handleQueueBatch(batch, env);
  },

  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    await reconcileTasks(env);
    await reconcileIntakeExpiry(env);
  },
} satisfies ExportedHandler<Env>;

// @ts-expect-error generated at build time
export { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from "./.open-next/worker.js";
