// Fake AI provider adapter seam (spec Testing Decisions seam 2 + ADR 0006
// Generation module). Every later ticket plugs a real provider behind this
// interface. The seam contract is:
//
//   accept(task)       → task is recorded, transitioned to `processing`
//   run(task, output)  → fake provider "generates" bytes → written to R2
//                        quarantine → queue a PROVIDER_NOTIFY message so the
//                        rest of the pipeline observes completion
//
// The provider itself never decides success: output lands in quarantine and
// the validation/delivery path (later tickets) decides `ready` vs `rejected`.
// The harness proves the full seam: accept → processing → output → quarantine
// → notify.

import type { Env } from "@/lib/bindings";

/** Scene discriminates image-to-image vs floor-plan stages (ADR 0004). */
export type Scene =
  | "interior"
  | "exterior"
  | "room-design-brief"
  | "room-design-layout"
  | "room-design-render"
  | "room-design-panorama";

/** Provider task accepted into the generation pipeline. */
export interface AiTask {
  id: string;
  scene: Scene;
  provider: string;
  model: string;
  /** Server-resolved prompt; never user-supplied arbitrary text (spec §App→provider). */
  prompt: string;
  /** Short-lived private access to the source image (resolved server-side). */
  sourceKey: string | null;
  options: {
    aspect_ratio?: string;
    num_outputs?: number;
    resolution?: string;
    quality?: string;
  };
  createdAt: number;
}

export type TaskStatus =
  | "accepted"
  | "processing"
  | "output"
  | "quarantined"
  | "notified"
  | "failed";

export interface TaskRecord extends AiTask {
  status: TaskStatus;
}

/**
 * Provider adapter interface. `submit` is the only thing a real provider
 * implements; the harness drives the rest through `complete` (the notify
 * callback) to keep the seam observable and testable.
 */
export interface AiProviderAdapter {
  readonly name: string;
  submit(task: AiTask): Promise<{ ok: true; taskId: string } | { ok: false; error: string }>;
}

/**
 * Fake provider: deterministic output bytes so tests can assert on quarantine
 * content. Returns a tiny valid PNG (1x1) as the "generated" image.
 */
export class FakeAiProvider implements AiProviderAdapter {
  readonly name = "fake";
  private readonly outputBytes: Uint8Array;

  constructor(outputBytes: Uint8Array = fixturePngBytes()) {
    this.outputBytes = outputBytes;
  }

  async submit(task: AiTask): Promise<{ ok: true; taskId: string }> {
    // A real provider would call out over HTTP here. The fake resolves the
    // generation synchronously; the pipeline still drives quarantine + notify.
    return { ok: true, taskId: task.id };
  }

  getOutputBytes(): Uint8Array {
    return this.outputBytes;
  }
}

/** Minimal valid 1x1 PNG (67 bytes) used as deterministic fake AI output. */
export function fixturePngBytes(): Uint8Array {
  // 1x1 red PNG, hand-rolled; valid magic bytes + IHDR + IDAT + IEND.
  const b64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/**
 * Runs the fake provider end-to-end against real bindings:
 * accept → processing (D1) → output → quarantine (R2) → notify (Queue).
 */
export async function runFakeProviderPipeline(
  env: Env,
  task: AiTask
): Promise<{ taskId: string; status: TaskStatus }> {
  const provider = new FakeAiProvider();

  // accept
  const accepted = await provider.submit(task);
  if (!accepted.ok) {
    await recordTask(env, task, "failed");
    return { taskId: task.id, status: "failed" };
  }

  // processing
  await recordTask(env, task, "processing");

  // output → quarantine: write provider bytes under the quarantine key.
  const quarantineKey = `quarantine/${task.id}.png`;
  await env.HD_PRIVATE.put(quarantineKey, provider.getOutputBytes(), {
    httpMetadata: { contentType: "image/png" },
  });
  await recordTask(env, task, "quarantined");

  // notify: queue a message so validation/delivery (later tickets) reacts.
  await env.PROVIDER_NOTIFY.send({
    type: "ai-output-ready",
    taskId: task.id,
    quarantineKey,
    provider: provider.name,
    scene: task.scene,
    model: task.model,
  });
  await recordTask(env, task, "notified");

  return { taskId: task.id, status: "notified" };
}

/** Persists task status to D1 (the task/hold source of truth, ADR 0002). */
export async function recordTask(
  env: Env,
  task: AiTask,
  status: TaskStatus
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO ai_tasks (id, scene, provider, model, prompt, source_key, status, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)
     ON CONFLICT(id) DO UPDATE SET status = ?7, updated_at = ?8`
  )
    .bind(
      task.id,
      task.scene,
      task.provider,
      task.model,
      task.prompt,
      task.sourceKey,
      status,
      task.createdAt
    )
    .run();
}
