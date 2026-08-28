// Ticket 07 — billable generation lifecycle (App Worker side).
//
// One file owns the whole task lifecycle so the credit contract can be read in
// one place:
//
//   POST /api/designs
//     validate config → authorize source Asset (`ready`, owned)
//     → ensure free grant → check Available ≥ cost
//     → createTaskWithHold (atomic task row + Credit Hold, #5)
//     → insert Design row + Project linkage
//     → dispatch PROVIDER_NOTIFY {type:"task-dispatch"} (instance id == task id)
//
//   runGeneration        accepted → processing → output → quarantined → notify
//   completeGeneration   quarantined → validateAsset (#6) → ready Asset
//                        → attach to Project → settleHoldOnReady → `ready`
//   failGeneration       any error → releaseHoldOnTerminal → `failed`
//   reconcileTasks       expireStaleTasks (30 min) + re-dispatch same id
//
// Fail-closed invariants:
//   * A hold is only ever settled when the Generated Asset is `ready` AND
//     attached to the Project (settleHoldOnReady checks both).
//   * Every other terminal path (provider failure, validation rejection,
//     validation-exhausted, DLQ, 30-min expiry) releases the hold exactly once.
//   * A late callback for an already-terminal task is recorded and ignored —
//     it never resurrects the task and never settles a released hold.

import { getProvider } from "@/lib/ai/provider-adapter";
import { buildExteriorPrompt, buildInteriorPrompt } from "@/lib/ai/prompt";
import {
  DesignError,
  isTerminal,
  publicErrorCode,
  toPublicStatus,
  type DesignConfig,
  type ExteriorIntent,
  type FloorPlanIntent,
  type InteriorIntent,
  type ProviderRequest,
  type PublicTaskStatus,
} from "@/lib/ai/types";
import {
  handleFloorPlanTerminal,
  resolveFloorPlanStagePlan,
  type ResolvedFloorPlanStagePlan,
} from "@/lib/floor-plan";
import type { Env } from "@/lib/bindings";
import { ensureFreeCreditGrant, getAvailableCredits } from "@/lib/credits/ledger";
import { presignGetUrl } from "@/lib/intake/presign";
import { validateAsset, type AssetValidationJob } from "@/lib/intake/validator";
import {
  createTaskWithHold,
  releaseHoldOnTerminal,
  settleHoldOnReady,
  expireStaleTasks,
} from "@/lib/payments/core";
import { validateDesignConfig } from "@/lib/ai/config";
import { assertGenerationAllowed } from "@/lib/env/policy";

const PRIVATE_BUCKET = "homedesign-private";
/** Short-lived private access handed to the provider adapter (never to a browser). */
const SOURCE_ACCESS_TTL_SEC = 600;
/** Initial attempt + 3 retries, then validation-exhausted (ADR 0003). */
export const MAX_VALIDATION_ATTEMPTS = 4;

// ── Row types ────────────────────────────────────────────────────────────────

export interface TaskRow {
  id: string;
  scene: string;
  provider: string;
  model: string;
  prompt: string;
  source_key: string | null;
  status: string;
  created_at: number;
  updated_at: number;
  user_id: string | null;
  hold_id: string | null;
  cost_credits: number | null;
  expires_at: number | null;
  expired_at: number | null;
  provider_task_id: string | null;
  error_code: string | null;
  validation_attempts: number;
  dispatched_at: number | null;
}

export interface DesignRow {
  id: string;
  user_id: string;
  project_id: string;
  scene: string;
  stage: string | null;
  provider: string;
  model: string;
  provider_scene: string;
  prompt: string;
  config_json: string;
  source_asset_id: string;
  output_asset_id: string | null;
  cost_credits: number;
  idempotency_key: string;
  created_at: number;
  updated_at: number;
  completed_at: number | null;
}

// ── Prompt ───────────────────────────────────────────────────────────────────

/** Server-side prompt build. The public API never accepts a prompt. */
export function buildPrompt(config: DesignConfig): string {
  if (config.scene === "interior") return buildInteriorPrompt(config.intent as InteriorIntent);
  if (config.scene === "exterior") return buildExteriorPrompt(config.intent as ExteriorIntent);
  throw new DesignError("SCENE_NOT_IMPLEMENTED", 501, "unknown scene");
}

// ── Create ───────────────────────────────────────────────────────────────────

export interface CreateDesignResult {
  id: string;
  cached: boolean;
  status: string;
  cost: number;
  projectId: string;
}

/**
 * Create a Design: validate → authorize → check credits → atomic task+hold →
 * Design row + Project linkage → dispatch.
 *
 * Nothing is created (no task, no hold, no Design, no Project) unless every
 * gate passes — rejections happen before the ledger is touched.
 */
export async function createDesign(
  env: Env,
  userId: string,
  rawBody: unknown
): Promise<CreateDesignResult> {
  assertGenerationAllowed(env);
  const config = validateDesignConfig(rawBody);

  let floorPlanStagePlan: ResolvedFloorPlanStagePlan | null = null;
  let effectiveSourceAssetId = config.sourceAssetId;
  let prompt = "";
  let effectiveConfig = config;
  if (config.scene === "floor-plan") {
    floorPlanStagePlan = await resolveFloorPlanStagePlan(env, userId, config);
    effectiveSourceAssetId = floorPlanStagePlan.effectiveSourceAssetId;
    prompt = floorPlanStagePlan.prompt;
    effectiveConfig = floorPlanStagePlan.finalizedConfig;
  } else {
    prompt = buildPrompt(config);
  }

  if (!prompt) throw new DesignError("INVALID_INTENT", 400, "empty prompt");

  // Authorize the source Asset: exists, owned by the caller, lifecycle `ready`.
  const asset = await env.DB.prepare(
    `SELECT id, user_id, lifecycle, storage_key, mime_type FROM assets WHERE id = ?1`
  ).bind(effectiveSourceAssetId).first<{
    id: string;
    user_id: string | null;
    lifecycle: string;
    storage_key: string | null;
    mime_type: string;
  }>();

  if (!asset) throw new DesignError("ASSET_NOT_FOUND", 404);
  if (asset.user_id !== userId) throw new DesignError("FORBIDDEN", 403);
  if (asset.lifecycle !== "ready" || !asset.storage_key) {
    throw new DesignError("SOURCE_ASSET_NOT_READY", 409, `asset lifecycle is ${asset.lifecycle}`);
  }

  // Free grant is ensured on every verified task path (ADR 0002); idempotent.
  await ensureFreeCreditGrant(env, userId);

  // Credit gate BEFORE the hold. createTaskWithHold re-checks atomically.
  const available = await getAvailableCredits(env, userId);
  if (available < effectiveConfig.cost) {
    throw new DesignError(
      "INSUFFICIENT_CREDITS",
      402,
      `available ${available} < cost ${effectiveConfig.cost}`
    );
  }

  // Atomic task row + Credit Hold (#5). Idempotent by (user, task_create, key).
  let created: { taskId: string; cached: boolean };
  try {
    created = await createTaskWithHold(
      env,
      userId,
      {
        scene: effectiveConfig.providerScene,
        provider: effectiveConfig.provider,
        model: effectiveConfig.model,
        prompt,
        sourceKey: asset.storage_key,
        options: effectiveConfig.options as Record<string, unknown>,
      },
      effectiveConfig.cost,
      effectiveConfig.idempotencyKey
    );
  } catch (err) {
    const message = (err as Error).message;
    if (message === "IDEMPOTENCY_KEY_REUSED") {
      throw new DesignError("IDEMPOTENCY_KEY_REUSED", 409);
    }
    if (message === "INSUFFICIENT_CREDITS") {
      throw new DesignError("INSUFFICIENT_CREDITS", 402);
    }
    throw err;
  }

  const taskId = created.taskId;

  if (created.cached) {
    const existing = await getDesign(env, taskId);
    const task = await getTask(env, taskId);
    return {
      id: taskId,
      cached: true,
      status: task?.status ?? "accepted",
      cost: existing?.cost_credits ?? effectiveConfig.cost,
      projectId: existing?.project_id ?? "",
    };
  }

  // Project linkage (ADR 0005): a draft Project is created the first time a
  // ready Source Asset is used for this kind.
  const projectId = await ensureProject(env, userId, effectiveConfig, asset.id);

  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO designs (id, user_id, project_id, scene, stage, provider, model, provider_scene, prompt,
       config_json, source_asset_id, output_asset_id, cost_credits, idempotency_key, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, NULL, ?12, ?13, ?14, ?14)`
  ).bind(
    taskId,
    userId,
    projectId,
    effectiveConfig.scene,
    effectiveConfig.stage ?? null,
    effectiveConfig.provider,
    effectiveConfig.model,
    effectiveConfig.providerScene,
    prompt,
    JSON.stringify(effectiveConfig),
    asset.id,
    effectiveConfig.cost,
    effectiveConfig.idempotencyKey,
    now
  ).run();

  if (floorPlanStagePlan) {
    await floorPlanStagePlan.recordStageRun(env, taskId);
  }
  // Dispatch. The Workflow/queue instance identity IS the task id, so a
  // re-dispatch by the reconciler converges instead of duplicating work.
  await dispatchTask(env, taskId);

  return { id: taskId, cached: false, status: "accepted", cost: effectiveConfig.cost, projectId };
}

export async function dispatchTask(env: Env, taskId: string): Promise<void> {
  await env.DB.prepare(`UPDATE ai_tasks SET dispatched_at = ?2 WHERE id = ?1`)
    .bind(taskId, Date.now())
    .run();
  await env.PROVIDER_NOTIFY.send({ type: "task-dispatch", taskId });
}

async function ensureProject(
  env: Env,
  userId: string,
  config: DesignConfig,
  sourceAssetId: string
): Promise<string> {
  const existing = await env.DB.prepare(
    `SELECT id FROM projects WHERE user_id = ?1 AND kind = ?2 AND source_asset_id = ?3`
  ).bind(userId, config.scene, sourceAssetId).first<{ id: string }>();

  if (existing) return existing.id;

  const projectId = crypto.randomUUID();
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO projects (id, user_id, kind, name, status, source_asset_id, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, 'draft', ?5, ?6, ?6)`
  ).bind(projectId, userId, config.scene, defaultProjectName(config), sourceAssetId, now).run();

  await attachAsset(env, projectId, sourceAssetId, "source");
  return projectId;
}

function defaultProjectName(config: DesignConfig): string {
  if (config.scene === "exterior") return "Exterior design";
  if (config.scene === "floor-plan") return "Floor plan";
  return "Interior design";
}

async function attachAsset(
  env: Env,
  projectId: string,
  assetId: string,
  role: "source" | "generated" | "share-selected"
): Promise<void> {
  await env.DB.prepare(
    `INSERT OR IGNORE INTO project_assets (project_id, asset_id, role, created_at)
     VALUES (?1, ?2, ?3, ?4)`
  ).bind(projectId, assetId, role, Date.now()).run();
}

// ── Run (provider) ───────────────────────────────────────────────────────────

/**
 * Drive a dispatched task through the provider: processing → output →
 * quarantine → notify. Every failure path releases the hold.
 *
 * Idempotent + late-safe: a terminal task (ready/failed/expired) is a no-op, so
 * a re-delivered dispatch after expiry cannot resurrect it.
 */
export async function runGeneration(
  env: Env,
  taskId: string
): Promise<{ status: string; skipped?: string }> {
  const task = await getTask(env, taskId);
  if (!task) return { status: "unknown", skipped: "TASK_NOT_FOUND" };
  if (isTerminal(task.status)) return { status: task.status, skipped: "TERMINAL" };
  if (task.expires_at !== null && task.expires_at < Date.now()) {
    // Past server expiry: let the reconciler own the terminal transition.
    return { status: task.status, skipped: "EXPIRED" };
  }
  const design = await getDesign(env, taskId);
  if (!design) {
    await failGeneration(env, taskId, "DESIGN_ROW_MISSING");
    return { status: "failed" };
  }

  await setTaskStatus(env, taskId, "processing");

  const provider = getProvider(task.provider, env);
  const req = await buildProviderRequest(env, task);

  let providerTaskId: string;
  try {
    const accepted = await provider.submit(req);
    if (!accepted.ok) {
      await failGeneration(env, taskId, accepted.error);
      return { status: "failed" };
    }
    providerTaskId = accepted.providerTaskId;
  } catch (err) {
    await failGeneration(env, taskId, providerErrorCode(err));
    return { status: "failed" };
  }

  await env.DB.prepare(`UPDATE ai_tasks SET provider_task_id = ?2, updated_at = ?3 WHERE id = ?1`)
    .bind(taskId, providerTaskId, Date.now())
    .run();

  let output;
  try {
    output = await provider.fetchOutput(req, providerTaskId);
  } catch (err) {
    await failGeneration(env, taskId, providerErrorCode(err));
    return { status: "failed" };
  }

  if (!output) {
    // Provider still working — stay `processing`. The 30-min reconciler owns
    // the deadline; client polling never decides the lifecycle.
    return { status: "processing" };
  }

  // Output → quarantine (never returned to the browser, never trusted).
  const assetId = crypto.randomUUID();
  const quarantineKey = `quarantine/${assetId}`;
  await env.HD_PRIVATE.put(quarantineKey, output.bytes, {
    httpMetadata: { contentType: output.contentType },
  });
  await setTaskStatus(env, taskId, "output");

  // Generated Asset starts `quarantined`: the shared validator decides ready.
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO assets (id, name, mime_type, size, lifecycle, storage_key, user_id,
       declared_size, actual_size, created_by, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, 'quarantined', ?5, ?6, ?4, ?4, ?7, ?8, ?8)`
  ).bind(
    assetId,
    `generated-${taskId}.png`,
    output.contentType,
    output.bytes.length,
    quarantineKey,
    task.user_id,
    `ai:${provider.name}`,
    now
  ).run();

  await env.DB.prepare(`UPDATE designs SET output_asset_id = ?2, updated_at = ?3 WHERE id = ?1`)
    .bind(taskId, assetId, now)
    .run();
  await setTaskStatus(env, taskId, "quarantined");

  // Notify: provider completion is only a signal — the App Worker decides.
  await env.PROVIDER_NOTIFY.send({ type: "provider-complete", taskId, providerTaskId });

  return { status: "quarantined" };
}

async function buildProviderRequest(env: Env, task: TaskRow): Promise<ProviderRequest> {
  const options: ProviderRequest["options"] = {};
  const imageInput = task.source_key ? await resolveSourceAccess(env, task.source_key) : null;
  if (imageInput) options.image_input = [imageInput];

  return {
    taskId: task.id,
    mediaType: "image",
    scene: task.scene as ProviderRequest["scene"],
    provider: task.provider,
    model: task.model,
    prompt: task.prompt,
    options,
  };
}

/**
 * Resolve the source object to short-lived private access for the provider.
 * Presigned GET when R2 S3 credentials are configured; otherwise an internal
 * `private:` reference (local/test). Either way this value never leaves the
 * Worker and is never persisted on the Design row.
 */
async function resolveSourceAccess(env: Env, key: string): Promise<string> {
  if (
    env.ENVIRONMENT !== "local" &&
    env.R2_ACCOUNT_ID !== "local-dev-account" &&
    env.R2_ACCOUNT_ID &&
    env.R2_ACCESS_KEY_ID &&
    env.R2_SECRET_ACCESS_KEY
  ) {
    const signed = await presignGetUrl(
      {
        accountId: env.R2_ACCOUNT_ID,
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      },
      { bucket: PRIVATE_BUCKET, key, expiresInSec: SOURCE_ACCESS_TTL_SEC }
    );
    return signed.url;
  }
  return `private:${key}`;
}

// ── Complete (validation → ready → attach → settle) ──────────────────────────

/**
 * Handle a provider-complete notification: run the SHARED intake validator on
 * the quarantined output, attach the ready Asset to the Project, then settle
 * the hold exactly once.
 *
 * Late callback: if the task is already terminal (expired by the reconciler,
 * or failed), the notification is recorded and ignored — the released hold is
 * never settled and the task never resurrects.
 */
export async function completeGeneration(
  env: Env,
  taskId: string
): Promise<{ status: string; skipped?: string }> {
  const task = await getTask(env, taskId);
  if (!task) return { status: "unknown", skipped: "TASK_NOT_FOUND" };
  if (isTerminal(task.status)) {
    await recordLateCallback(env, taskId, task.status);
    return { status: task.status, skipped: "TERMINAL" };
  }

  const design = await getDesign(env, taskId);
  if (!design?.output_asset_id) {
    await failGeneration(env, taskId, "OUTPUT_ASSET_MISSING");
    return { status: "failed" };
  }

  const asset = await env.DB.prepare(
    `SELECT id, lifecycle, storage_key, mime_type, declared_size FROM assets WHERE id = ?1`
  ).bind(design.output_asset_id).first<{
    id: string;
    lifecycle: string;
    storage_key: string;
    mime_type: string;
    declared_size: number | null;
  }>();
  if (!asset) {
    await failGeneration(env, taskId, "OUTPUT_ASSET_MISSING");
    return { status: "failed" };
  }

  // Re-validate provider output with the SAME bounded validator as uploads
  // (#6). AI output is provider-generated, not user-uploaded, but it is equally
  // untrusted: bounded header parse only, no raster decode.
  if (asset.lifecycle === "quarantined") {
    const job: AssetValidationJob = {
      assetId: asset.id,
      key: asset.storage_key,
      declaredSize: asset.declared_size ?? 0,
      declaredMime: asset.mime_type,
      attempt: task.validation_attempts + 1,
    };
    const result = await validateAsset(env, job);

    if (!result.ok) {
      // Transient validator error → retry budget; exhausted → release hold.
      const attempts = task.validation_attempts + 1;
      await env.DB.prepare(
        `UPDATE ai_tasks SET validation_attempts = ?2, updated_at = ?3 WHERE id = ?1`
      ).bind(taskId, attempts, Date.now()).run();

      if (attempts >= MAX_VALIDATION_ATTEMPTS) {
        await failGeneration(env, taskId, "VALIDATION_EXHAUSTED", "validation-exhausted");
        return { status: "failed" };
      }
      throw new Error(`validation transient failure: ${result.error}`);
    }

    if (result.outcome.lifecycle === "rejected") {
      // Permanent rejection of the generated bytes → fail closed.
      await failGeneration(env, taskId, "OUTPUT_REJECTED", "validation-exhausted");
      return { status: "failed" };
    }
  } else if (asset.lifecycle === "rejected") {
    await failGeneration(env, taskId, "OUTPUT_REJECTED", "validation-exhausted");
    return { status: "failed" };
  }

  // Asset is `ready`. Attach it to the Project — settle needs ready AND attached.
  await attachAsset(env, design.project_id, asset.id, "generated");

  const attached = await env.DB.prepare(
    `SELECT 1 AS ok FROM project_assets WHERE project_id = ?1 AND asset_id = ?2 AND role = 'generated'`
  ).bind(design.project_id, asset.id).first<{ ok: number }>();
  const readyRow = await env.DB.prepare(
    `SELECT lifecycle FROM assets WHERE id = ?1`
  ).bind(asset.id).first<{ lifecycle: string }>();

  const assetReady = readyRow?.lifecycle === "ready";
  const assetAttached = Boolean(attached?.ok);

  // Re-read the task: the reconciler may have expired it while we validated.
  const fresh = await getTask(env, taskId);
  if (!fresh || isTerminal(fresh.status)) {
    await recordLateCallback(env, taskId, fresh?.status ?? "unknown");
    return { status: fresh?.status ?? "unknown", skipped: "TERMINAL" };
  }

  try {
    // Settles only when both conditions hold; sets status `notified`.
    await settleHoldOnReady(env, taskId, assetReady, assetAttached);
  } catch (err) {
    if ((err as Error).message === "HOLD_NOT_ACTIVE") {
      // Hold already released (expiry) or already settled — never settle twice.
      await recordLateCallback(env, taskId, fresh.status);
      return { status: fresh.status, skipped: "HOLD_NOT_ACTIVE" };
    }
    await failGeneration(env, taskId, "SETTLE_FAILED");
    return { status: "failed" };
  }

  if (!assetReady || !assetAttached) {
    // settleHoldOnReady was a no-op; stay non-terminal so a later signal can
    // settle. The 30-min reconciler is the backstop.
    return { status: "notified", skipped: "NOT_SETTLEABLE" };
  }

  const now = Date.now();
  await env.DB.prepare(
    `UPDATE ai_tasks SET status = 'ready', updated_at = ?2 WHERE id = ?1 AND status = 'notified'`
  ).bind(taskId, now).run();
  await env.DB.prepare(
    `UPDATE designs SET completed_at = ?2, updated_at = ?2 WHERE id = ?1`
  ).bind(taskId, now).run();

  await env.DB.prepare(
    `UPDATE projects SET status = 'ready', updated_at = ?2 WHERE id = ?1`
  ).bind(design.project_id, now).run();

  await handleFloorPlanTerminal(env, taskId, "ready");

  return { status: "ready" };
}

// ── Fail (always releases the hold) ──────────────────────────────────────────

/**
 * Terminal failure: record the stable error code, then release the hold via the
 * #5 contract. Safe to call twice — releaseHoldOnTerminal swallows an
 * already-released hold and the task lands on `failed` either way.
 */
export async function failGeneration(
  env: Env,
  taskId: string,
  errorCode: string,
  terminalReason: "failed" | "canceled" | "validation-exhausted" | "dlq" = "failed"
): Promise<void> {
  await handleFloorPlanTerminal(env, taskId, "failed");
  await env.DB.prepare(`UPDATE ai_tasks SET error_code = ?2, updated_at = ?3 WHERE id = ?1`)
    .bind(taskId, errorCode, Date.now())
    .run();
  try {
    await releaseHoldOnTerminal(env, taskId, terminalReason);
  } catch (err) {
    const errMsg = (err as Error).message ?? '';
    if (/^TASK_/.test(errMsg)) {
      // TASK_HAS_NO_HOLD / TASK_NOT_FOUND — no active hold to worry about.
      // Force terminal status so the task can never dangle non-terminal.
      await env.DB.prepare(
        `UPDATE ai_tasks SET status = 'failed', updated_at = ?2 WHERE id = ?1 AND status NOT IN ('ready','failed','expired')`
      ).bind(taskId, Date.now()).run();
    } else {
      // Transient release failure: the hold may still be active.
      // Do NOT force terminal status — re-throw so the caller retries.
      throw err;
    }
  }
}

/** DLQ handler for generation output: reject the Asset AND release the hold. */
export async function failGenerationOnDlq(env: Env, taskId: string): Promise<void> {
  const design = await getDesign(env, taskId);
  if (design?.output_asset_id) {
    await env.DB.prepare(
      `UPDATE assets SET lifecycle = 'rejected', updated_at = ?2 WHERE id = ?1 AND lifecycle = 'quarantined'`
    ).bind(design.output_asset_id, Date.now()).run();
  }
  await failGeneration(env, taskId, "OUTPUT_DLQ", "dlq");
}

/** Late callbacks are observable but inert (ADR 0002 §server expiry). */
async function recordLateCallback(env: Env, taskId: string, status: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO queue_events (queue, body, received_at) VALUES (?1, ?2, ?3)`
  ).bind(
    "late-callback",
    JSON.stringify({ taskId, status, note: "late callback ignored — task terminal" }),
    Date.now()
  ).run();
}

// ── Reconciler ───────────────────────────────────────────────────────────────

export interface ReconcileResult {
  expired: number;
  redispatched: number;
}

/**
 * Reconciler (safe to run on a schedule):
 *   1. Expire every non-terminal task past its 30-minute wall-clock deadline
 *      and release its hold (#5 `expireStaleTasks`).
 *   2. Re-dispatch non-terminal tasks that appear stuck — same task id, so the
 *      workflow/queue instance converges instead of duplicating work.
 */
export async function reconcileTasks(
  env: Env,
  stuckAfterMs = 60_000
): Promise<ReconcileResult> {
  const expired = await expireStaleTasks(env);

  const now = Date.now();
  const stuck = await env.DB.prepare(
    `SELECT id FROM ai_tasks
     WHERE status IN ('accepted', 'processing')
       AND (expires_at IS NULL OR expires_at > ?1)
       AND (dispatched_at IS NULL OR dispatched_at < ?2)`
  ).bind(now, now - stuckAfterMs).all<{ id: string }>();

  let redispatched = 0;
  for (const row of stuck.results ?? []) {
    await dispatchTask(env, row.id);
    redispatched++;
  }

  return { expired, redispatched };
}

// ── Query (public poll view) ─────────────────────────────────────────────────

export interface DesignStatusView {
  id: string;
  /** Internal lifecycle status — observable for owner GETs and tests. */
  internalStatus: string;
  /** Public poll status: processing | success | failed. */
  status: PublicTaskStatus;
  scene: string;
  provider: string;
  model: string;
  prompt: string;
  cost: number;
  projectId: string | null;
  sourceAssetId: string | null;
  /** Ready Generated Asset id only — never an R2/provider URL. */
  outputAssetId: string | null;
  errorCode: string | null;
  createdAt: number;
  updatedAt: number;
  expiresAt: number | null;
}

/**
 * Owner-scoped status view. `outputAssetId` is only exposed once the Asset is
 * `ready`; no provider URL, R2 key or presigned URL ever appears here.
 */
export async function getDesignStatus(
  env: Env,
  userId: string,
  taskId: string
): Promise<DesignStatusView> {
  const task = await getTask(env, taskId);
  if (!task) throw new DesignError("TASK_NOT_FOUND", 404);
  if (task.user_id !== userId) throw new DesignError("FORBIDDEN", 403);

  const design = await getDesign(env, taskId);

  let outputAssetId: string | null = null;
  if (design?.output_asset_id) {
    const out = await env.DB.prepare(
      `SELECT lifecycle FROM assets WHERE id = ?1`
    ).bind(design.output_asset_id).first<{ lifecycle: string }>();
    if (out?.lifecycle === "ready") outputAssetId = design.output_asset_id;
  }

  return {
    id: task.id,
    internalStatus: task.status,
    status: toPublicStatus(task.status),
    scene: design?.scene ?? task.scene,
    provider: task.provider,
    model: task.model,
    prompt: task.prompt,
    cost: task.cost_credits ?? design?.cost_credits ?? 0,
    projectId: design?.project_id ?? null,
    sourceAssetId: design?.source_asset_id ?? null,
    outputAssetId,
    errorCode: publicErrorCode(task.status, task.error_code),
    createdAt: task.created_at,
    updatedAt: task.updated_at,
    expiresAt: task.expires_at,
  };
}

/** Origin-compatible `POST /api/ai/query` payload built from the status view. */
export function toQueryEnvelope(view: DesignStatusView) {
  const taskInfo: Record<string, unknown> = {};
  if (view.errorCode) taskInfo.errorMessage = view.errorCode;
  if (view.status === "failed") taskInfo.code = view.errorCode;

  const taskResult =
    view.status === "success" && view.outputAssetId
      ? { assetIds: [view.outputAssetId] }
      : {};

  return {
    id: view.id,
    status: view.status,
    provider: view.provider,
    model: view.model,
    prompt: view.prompt,
    taskInfo: JSON.stringify(taskInfo),
    taskResult: JSON.stringify(taskResult),
  };
}

// ── Row helpers ──────────────────────────────────────────────────────────────

export async function getTask(env: Env, taskId: string): Promise<TaskRow | null> {
  const row = await env.DB.prepare(`SELECT * FROM ai_tasks WHERE id = ?1`)
    .bind(taskId)
    .first<TaskRow>();
  return row ?? null;
}

export async function getDesign(env: Env, designId: string): Promise<DesignRow | null> {
  const row = await env.DB.prepare(`SELECT * FROM designs WHERE id = ?1`)
    .bind(designId)
    .first<DesignRow>();
  return row ?? null;
}

async function setTaskStatus(env: Env, taskId: string, status: string): Promise<void> {
  await env.DB.prepare(
    `UPDATE ai_tasks SET status = ?2, updated_at = ?3
     WHERE id = ?1 AND status NOT IN ('ready', 'failed', 'expired')`
  ).bind(taskId, status, Date.now()).run();
}

function providerErrorCode(err: unknown): string {
  const msg = (err as Error)?.message ?? "PROVIDER_ERROR";
  return /^[A-Z0-9_]+$/.test(msg) ? msg : "PROVIDER_ERROR";
}

