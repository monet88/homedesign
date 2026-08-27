// Shared queue consumer routing for ASSET_VALIDATE and PROVIDER_NOTIFY.
// Used by the production custom worker (`worker.ts`) and the vitest harness
// (`tests/worker-entry.ts`).

import {
  handleProviderNotify,
  handleProviderNotifyDlq,
} from "@/lib/ai/notify-consumer";
import type { AssetValidationJob } from "@/lib/intake/intake-service";
import { validateAsset } from "@/lib/intake/validator";
import type { Env } from "@/lib/bindings";

function isAssetValidateQueue(name: string): boolean {
  return name.endsWith("-asset-validate") || name === "homedesign-asset-validate";
}

function isAssetValidateDlq(name: string): boolean {
  return name.endsWith("-asset-validate-dlq") || name === "homedesign-asset-validate-dlq";
}

function isProviderNotifyQueue(name: string): boolean {
  return name.endsWith("-provider-notify") || name === "homedesign-provider-notify";
}

function isProviderNotifyDlq(name: string): boolean {
  return name.endsWith("-provider-notify-dlq") || name === "homedesign-provider-notify-dlq";
}

/** DLQ: permanent validation failure — reject Asset only (ADR 0003). */
async function rejectAssetOnDlq(env: Env, job: AssetValidationJob): Promise<void> {
  await env.DB.prepare(
    `UPDATE assets SET lifecycle = 'rejected', updated_at = ?2 WHERE id = ?1 AND lifecycle = 'quarantined'`
  )
    .bind(job.assetId, Date.now())
    .run();
  await env.HD_PRIVATE.delete(job.key);
}

/** Route one queue batch. Throws on transient errors so Cloudflare can retry. */
export async function handleQueueBatch(
  batch: MessageBatch<unknown>,
  env: Env
): Promise<void> {
  const queue = batch.queue;

  if (isAssetValidateQueue(queue)) {
    for (const msg of batch.messages) {
      await validateAsset(env, msg.body as AssetValidationJob);
      msg.ack?.();
    }
    return;
  }

  if (isAssetValidateDlq(queue)) {
    for (const msg of batch.messages) {
      await rejectAssetOnDlq(env, msg.body as AssetValidationJob);
      msg.ack?.();
    }
    return;
  }

  if (isProviderNotifyQueue(queue)) {
    for (const msg of batch.messages) {
      try {
        await handleProviderNotify(env, msg.body);
        msg.ack?.();
      } catch {
        msg.retry?.();
      }
    }
    return;
  }

  if (isProviderNotifyDlq(queue)) {
    for (const msg of batch.messages) {
      await handleProviderNotifyDlq(env, msg.body);
      msg.ack?.();
    }
    return;
  }

  for (const msg of batch.messages) {
    await env.DB.prepare(
      `INSERT INTO queue_events (queue, body, received_at) VALUES (?1, ?2, ?3)`
    )
      .bind(queue, JSON.stringify(msg.body), Date.now())
      .run();
    msg.ack?.();
  }
}
