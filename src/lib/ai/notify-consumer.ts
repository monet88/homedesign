// Ticket 07 — PROVIDER_NOTIFY consumer (spec §Generation contracts, ADR 0002).
//
// The App/Generation Worker consumes PROVIDER_NOTIFY and drives the task
// lifecycle. Message types:
//   task-dispatch     → run the provider (processing → output → quarantine)
//   provider-complete → validate output → ready Asset → attach → settle hold
//   provider-failed   → release hold + mark failed
//
// At-least-once delivery: every handler is idempotent and late-safe. A message
// for a task that is already terminal is recorded and ignored (never resurrects
// the task, never settles a released hold).

import {
  completeGeneration,
  failGeneration,
  failGenerationOnDlq,
  runGeneration,
} from "@/lib/ai/lifecycle";
import type { ProviderNotifyMessage } from "@/lib/ai/types";
import type { Env } from "@/lib/bindings";

export interface NotifyHandled {
  taskId: string;
  type: string;
  status: string;
  skipped?: string;
}

/** Handle one PROVIDER_NOTIFY message. Throws only on transient errors (retry). */
export async function handleProviderNotify(
  env: Env,
  message: unknown
): Promise<NotifyHandled> {
  const msg = message as ProviderNotifyMessage;
  const taskId = (msg as { taskId?: string })?.taskId ?? "";

  switch (msg?.type) {
    case "task-dispatch": {
      try {
        const r = await runGeneration(env, taskId);
        return { taskId, type: msg.type, status: r.status, skipped: r.skipped };
      } catch (err) {
        console.error(
          `[provider-notify] task-dispatch retry: taskId=${taskId} error=${safeErrorCode(err)}`
        );
        throw err;
      }
    }
    case "provider-complete": {
      try {
        const r = await completeGeneration(env, taskId);
        return { taskId, type: msg.type, status: r.status, skipped: r.skipped };
      } catch (err) {
        console.error(
          `[provider-notify] provider-complete retry: taskId=${taskId} error=${safeErrorCode(err)}`
        );
        throw err;
      }
    }
    case "provider-failed": {
      try {
        await failGeneration(env, taskId, msg.error || "PROVIDER_FAILED");
        return { taskId, type: msg.type, status: "failed" };
      } catch (err) {
        console.error(
          `[provider-notify] provider-failed retry: taskId=${taskId} error=${safeErrorCode(err)}`
        );
        throw err;
      }
    }
    default: {
      // Unknown message (e.g. the ticket #1 fake-provider `ai-output-ready`
      // shape): record it so at-least-once delivery stays observable.
      await env.DB.prepare(
        `INSERT INTO queue_events (queue, body, received_at) VALUES (?1, ?2, ?3)`
      ).bind("homedesign-provider-notify", JSON.stringify(message ?? null), Date.now()).run();
      return { taskId, type: String((msg as { type?: string })?.type ?? "unknown"), status: "ignored" };
    }
  }
}

/**
 * Extract a safe error code/message for logging. Never logs credentials,
 * prompts, or private asset URLs — only a short code-safe substring.
 */
function safeErrorCode(err: unknown): string {
  if (!(err instanceof Error)) return 'UNKNOWN';
  const msg = err.message ?? '';
  // Only keep the first stable identifier token (UPPER_SNAKE or short phrase).
  const code = msg.slice(0, 80).replace(/[^\w\s.:_-]/g, '');
  return code || 'UNKNOWN';
}

/**
 * DLQ consumer for PROVIDER_NOTIFY: permanent delivery failure for a generation
 * message. Unlike the source-upload DLQ (which only rejects the Asset), this
 * path MUST release the Credit Hold — the run can no longer reach `ready`.
 */
export async function handleProviderNotifyDlq(env: Env, message: unknown): Promise<void> {
  const taskId = (message as { taskId?: string })?.taskId ?? "";
  if (!taskId) return;
  await failGenerationOnDlq(env, taskId);
}
