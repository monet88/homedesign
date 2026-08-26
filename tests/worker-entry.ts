// Test-only Worker entry for the vitest-pool-workers runtime harness.
// The real app entry is `.open-next/worker.js` (OpenNext build output); tests
// must not depend on a full OpenNext build, so this minimal worker exposes the
// bindings, the fake-provider pipeline, and the ASSET_VALIDATE consumer
// directly. Later tickets keep using this entry for Workers-runtime
// integration tests.

import { runFakeProviderPipeline } from "@/lib/ai/fake-provider";
import type { Env } from "@/lib/bindings";
import { validateAsset, type AssetValidationJob } from "@/lib/intake/validator";

// The real App Worker consumes ASSET_VALIDATE via this queue handler. The
// validation worker is shared with the AI-output path (ticket #7), which
// writes provider outputs into quarantine and lets this same consumer promote
// them to ready.
const ASSET_VALIDATE_QUEUE = "homedesign-asset-validate";
const ASSET_VALIDATE_DLQ = "homedesign-asset-validate-dlq";

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

    // Test-only: manually consume one ASSET_VALIDATE message to drive the
    // validator without waiting for queue delivery timing.
    if (url.pathname === "/__test/consume-asset-validate") {
      const job = (await request.json()) as AssetValidationJob;
      const result = await validateAsset(env, job);
      return Response.json(result);
    }

    return Response.json({ ok: false, error: "not found" }, { status: 404 });
  },

  // Queue consumer: ASSET_VALIDATE runs the validation worker; the DLQ
  // rejects ONLY the Asset (ADR 0003 — never touches credits/holds);
  // everything else (PROVIDER_NOTIFY) records into queue_events.
  async queue(batch: MessageBatch<unknown>, env: Env): Promise<void> {
    if (batch.queue === ASSET_VALIDATE_QUEUE) {
      for (const msg of batch.messages) {
        const job = msg.body as AssetValidationJob;
        await validateAsset(env, job);
      }
      return;
    }

    if (batch.queue === ASSET_VALIDATE_DLQ) {
      for (const msg of batch.messages) {
        const job = msg.body as AssetValidationJob;
        await rejectAssetOnDlq(env, job);
      }
      return;
    }

    for (const msg of batch.messages) {
      await env.DB.prepare(
        `INSERT INTO queue_events (queue, body, received_at) VALUES (?1, ?2, ?3)`
      )
        .bind(batch.queue, JSON.stringify(msg.body), Date.now())
        .run();
    }
  },
};

/**
 * DLQ: permanent validation failure after retries. Reject the Asset (and
 * delete its quarantine object) — nothing else. Source upload has no Credit
 * Hold, so there is nothing to release. (Ticket #7's generated-output path
 * reuses the same reject helper; it has no hold here either.)
 */
async function rejectAssetOnDlq(env: Env, job: AssetValidationJob): Promise<void> {
  await env.DB.prepare(
    `UPDATE assets SET lifecycle = 'rejected', updated_at = ?2 WHERE id = ?1 AND lifecycle = 'quarantined'`
  ).bind(job.assetId, Date.now()).run();
  await env.HD_PRIVATE.delete(job.key);
}