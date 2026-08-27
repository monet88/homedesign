// Ticket 07 — Generation backend contracts (spec §Generation contracts,
// ADR 0002 credits, ADR 0003 storage, ADR 0004 floor-plan stages).
//
// This module holds the *contracts only* (no I/O) so later tickets can depend
// on the shapes without pulling the lifecycle implementation:
//   * Design Config      — public browser → App Worker payload (#8/#14 UI)
//   * Provider request   — internal App Worker → provider adapter payload (#15)
//   * Cost table         — Interior/Exterior 1 Credit, floor-plan stages 1/2/3/4
//   * Status maps        — internal task lifecycle → public poll status
//
// Security boundary (spec §Generation contracts / §Lifecycle assertions):
// the PUBLIC schema never accepts `prompt`, `options.image_input`, base64/data
// URLs, R2 object keys or arbitrary URLs. Only `sourceAssetId` of a `ready`
// Asset owned by the caller. The server builds the prompt and resolves
// `image_input` to short-lived private access inside the adapter.

// ── Scenes ───────────────────────────────────────────────────────────────────

/** Public design scene (== `Project.kind`, ADR 0005). */
export const DESIGN_SCENES = ["interior", "exterior", "floor-plan"] as const;
export type DesignScene = (typeof DESIGN_SCENES)[number];

/** Floor-plan stages (ADR 0004). Forward-declared here; stages ship in #15/#10. */
export const FLOOR_PLAN_STAGES = ["brief", "layout", "render", "panorama"] as const;
export type FloorPlanStage = (typeof FLOOR_PLAN_STAGES)[number];

/**
 * Provider-facing scene (origin-compatible). Interior and Exterior share the
 * single `image-to-image` scene; each floor-plan stage is its own scene.
 */
export type ProviderScene =
  | "image-to-image"
  | "room-design-brief"
  | "room-design-layout"
  | "room-design-render"
  | "room-design-panorama";

export function providerSceneFor(scene: DesignScene, stage?: FloorPlanStage): ProviderScene {
  if (scene === "floor-plan") {
    return `room-design-${stage ?? "brief"}` as ProviderScene;
  }
  return "image-to-image";
}

// ── Cost (ADR 0002 §model-pricing v2) ────────────────────────────────────────

/** Interior / Exterior image-to-image cost. */
export const IMAGE_TO_IMAGE_COST = 1;

/** Floor-plan per-stage cost — brief 1, layout 2, render 3, panorama 4. */
export const FLOOR_PLAN_STAGE_COST: Record<FloorPlanStage, number> = {
  brief: 1,
  layout: 2,
  render: 3,
  panorama: 4,
};

// ── Design Config (public contract) ──────────────────────────────────────────

export type GenerationMode = "redesign" | "edit";

export interface InteriorIntent {
  mode: GenerationMode;
  roomType?: string;
  customRoomType?: string;
  style?: string;
  customStyle?: string;
  colorScheme?: string;
  customColorScheme?: string;
  requirements?: string;
  /** Local Edit only — replaces the whole template with this instruction. */
  editInstruction?: string;
}

export interface ExteriorIntent {
  mode: GenerationMode;
  area?: string;
  customArea?: string;
  style?: string;
  customStyle?: string;
  colorScheme?: string;
  customColorScheme?: string;
  requirements?: string;
  editInstruction?: string;
}

/**
 * Floor-plan stage intent — forward-declared shape (ADR 0004 §Stage contract).
 * Validated here so stage runners can depend on the contract without changing
 * the public API shape.
 */
export interface FloorPlanIntent {
  stage: FloorPlanStage;
  /** Room marker in 0–100 space (stable identity, ADR 0004). */
  marker: { x: number; y: number };
  roomId?: string;
  style?: string;
  stylePreference?: string;
  feedback?: string;
  recognition?: Record<string, unknown>;
  intake?: Record<string, unknown>;
  /** Confirmed layout stage run id — set server-side for render lineage (ADR 0004). */
  layoutRunId?: string;
  /** Confirmed render stage run id — set server-side for panorama lineage (ADR 0004). */
  renderRunId?: string;
  /** Initial viewer orientation — persisted with panorama artifact (ADR 0004). */
  panoramaOrientation?: PanoramaOrientation;
}

/** Pannellum-compatible initial view (degrees). */
export interface PanoramaOrientation {
  yaw: number;
  pitch: number;
  hfov: number;
}

export const DEFAULT_PANORAMA_ORIENTATION: PanoramaOrientation = {
  yaw: 0,
  pitch: 0,
  hfov: 100,
};

export type DesignIntent = InteriorIntent | ExteriorIntent | FloorPlanIntent;

/** Public generation options (origin-compatible minus `image_input`). */
export interface DesignOptions {
  aspect_ratio?: string;
  num_outputs?: number;
  resolution?: string;
  quality?: string;
}

export const ASPECT_RATIOS = ["1:1", "4:3", "16:9", "3:4", "9:16", "2:1"] as const;

/** Browser → App Worker payload for `POST /api/designs` (`/api/ai/generate`). */
export interface DesignConfigInput {
  sourceAssetId: string;
  mediaType?: "image";
  scene: DesignScene;
  provider?: string;
  model?: string;
  intent: DesignIntent;
  options?: DesignOptions;
  idempotencyKey: string;
}

/** Server-normalized Design Config (persisted on the Design row). */
export interface DesignConfig {
  sourceAssetId: string;
  mediaType: "image";
  scene: DesignScene;
  stage?: FloorPlanStage;
  provider: string;
  model: string;
  providerScene: ProviderScene;
  intent: DesignIntent;
  options: DesignOptions;
  cost: number;
  idempotencyKey: string;
}

export const DEFAULT_MODEL = "gemini-2.5-flash-image";
export const DEFAULT_PROVIDER = "fake";

// ── Provider adapter contract (internal) ─────────────────────────────────────

/**
 * Internal App Worker → provider payload. Origin-compatible; `image_input`
 * carries short-lived private access resolved server-side and NEVER leaves the
 * Worker (spec §App → provider adapter).
 */
export interface ProviderRequest {
  taskId: string;
  mediaType: "image";
  scene: ProviderScene;
  provider: string;
  model: string;
  prompt: string;
  options: DesignOptions & { image_input?: string[] };
}

export type ProviderSubmitResult =
  | { ok: true; providerTaskId: string }
  | { ok: false; error: string; retryable?: boolean };

export interface ProviderOutput {
  bytes: Uint8Array;
  contentType: string;
}

// ── Task lifecycle ───────────────────────────────────────────────────────────

/**
 * Internal task lifecycle (observable via `GET /api/designs/{id}`):
 *   accepted → processing → output → quarantined → notified → ready
 * plus the terminal `failed` and `expired`.
 */
export const TASK_STATUSES = [
  "accepted",
  "processing",
  "output",
  "quarantined",
  "notified",
  "ready",
  "failed",
  "expired",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TERMINAL_STATUSES: readonly TaskStatus[] = ["ready", "failed", "expired"];

export function isTerminal(status: string): boolean {
  return (TERMINAL_STATUSES as readonly string[]).includes(status);
}

/** Public poll status (origin `AITaskStatus` subset). */
export type PublicTaskStatus = "processing" | "success" | "failed";

/**
 * Internal → public status map. Everything before terminal success collapses to
 * `processing` (internal `quarantined`/`notified` validation states must not
 * leak); `expired` collapses to `failed` + stable `TASK_EXPIRED` error code.
 */
export function toPublicStatus(status: string): PublicTaskStatus {
  switch (status) {
    case "ready":
      return "success";
    case "failed":
    case "expired":
      return "failed";
    default:
      return "processing";
  }
}

/** Stable public error code for an internal terminal status. */
export function publicErrorCode(status: string, errorCode: string | null): string | null {
  if (status === "expired") return "TASK_EXPIRED";
  if (status === "failed") return errorCode ?? "TASK_FAILED";
  return null;
}

/** Client polling contract (ADR 0002: timeout is NOT terminal). */
export const CLIENT_POLL_INTERVAL_MS = 2_500;
export const CLIENT_POLL_MAX_WAIT_MS = 120_000;

// ── Errors ───────────────────────────────────────────────────────────────────

export type DesignErrorCode =
  | "UNAUTHENTICATED"
  | "EMAIL_NOT_VERIFIED"
  | "INVALID_CONFIG"
  | "INVALID_SCENE"
  | "INVALID_INTENT"
  | "INVALID_OPTIONS"
  | "PROMPT_NOT_ALLOWED"
  | "IMAGE_INPUT_NOT_ALLOWED"
  | "INLINE_IMAGE_NOT_ALLOWED"
  | "OBJECT_KEY_NOT_ALLOWED"
  | "URL_NOT_ALLOWED"
  | "IDEMPOTENCY_KEY_REQUIRED"
  | "IDEMPOTENCY_KEY_REUSED"
  | "ASSET_NOT_FOUND"
  | "FORBIDDEN"
  | "SOURCE_ASSET_NOT_READY"
  | "INSUFFICIENT_CREDITS"
  | "GENERATION_DISABLED"
  | "SCENE_NOT_IMPLEMENTED"
  | "TASK_NOT_FOUND";

export class DesignError extends Error {
  readonly code: DesignErrorCode;
  readonly status: number;
  readonly reason?: string;

  constructor(code: DesignErrorCode, status: number, reason?: string) {
    super(code);
    this.name = "DesignError";
    this.code = code;
    this.status = status;
    this.reason = reason;
  }
}

// ── Queue messages (PROVIDER_NOTIFY) ─────────────────────────────────────────

/** Dispatch: App Worker → generation runner. Instance identity = `taskId`. */
export interface TaskDispatchMessage {
  type: "task-dispatch";
  taskId: string;
}

/** Provider completion callback (fake provider or real webhook). */
export interface ProviderCompleteMessage {
  type: "provider-complete";
  taskId: string;
  providerTaskId?: string;
}

/** Provider terminal failure callback. */
export interface ProviderFailedMessage {
  type: "provider-failed";
  taskId: string;
  error: string;
}

export type ProviderNotifyMessage =
  | TaskDispatchMessage
  | ProviderCompleteMessage
  | ProviderFailedMessage;
