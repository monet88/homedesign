// Ticket 07 — public Design Config validation (spec §Generation contracts +
// §Lifecycle assertions).
//
// Fail-closed input gate that runs BEFORE any task/hold exists. The public
// schema rejects:
//   * `prompt`                  — server-built only
//   * `options.image_input`     — server-resolved only
//   * base64 / data URLs        — no inline image transport (ADR 0003)
//   * R2 object keys            — browser never names storage
//   * arbitrary URLs            — no SSRF surface
// Only `sourceAssetId` (a `ready` Asset owned by the caller) identifies input.

import {
  ASPECT_RATIOS,
  DEFAULT_MODEL,
  DEFAULT_PROVIDER,
  DESIGN_SCENES,
  DesignError,
  FLOOR_PLAN_STAGES,
  FLOOR_PLAN_STAGE_COST,
  IMAGE_TO_IMAGE_COST,
  providerSceneFor,
  type DesignConfig,
  type DesignConfigInput,
  type DesignOptions,
  type DesignScene,
  type ExteriorIntent,
  type FloorPlanIntent,
  type FloorPlanStage,
  type GenerationMode,
  type InteriorIntent,
} from "@/lib/ai/types";

const MAX_TEXT_LEN = 2_000;
const MAX_NUM_OUTPUTS = 4;

// Anything that looks like inline image bytes, a storage key or a URL.
const DATA_URL_RE = /^data:/i;
const URL_RE = /^[a-z][a-z0-9+.-]*:\/\//i;
const BASE64_BLOB_RE = /^[A-Za-z0-9+/=\s]{256,}$/;
const OBJECT_KEY_RE = /^(quarantine|ready|public)\//i;

function assertSafeText(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") {
    throw new DesignError("INVALID_CONFIG", 400, `${field} must be a string`);
  }
  const v = value.trim();
  if (!v) return undefined;
  if (v.length > MAX_TEXT_LEN) {
    throw new DesignError("INVALID_CONFIG", 400, `${field} exceeds ${MAX_TEXT_LEN} chars`);
  }
  if (DATA_URL_RE.test(v)) {
    throw new DesignError("INLINE_IMAGE_NOT_ALLOWED", 400, `${field} must not contain a data URL`);
  }
  if (URL_RE.test(v)) {
    throw new DesignError("URL_NOT_ALLOWED", 400, `${field} must not contain a URL`);
  }
  if (OBJECT_KEY_RE.test(v)) {
    throw new DesignError("OBJECT_KEY_NOT_ALLOWED", 400, `${field} must not contain an object key`);
  }
  if (BASE64_BLOB_RE.test(v)) {
    throw new DesignError("INLINE_IMAGE_NOT_ALLOWED", 400, `${field} must not contain inline image data`);
  }
  return v;
}

function assertMode(value: unknown): GenerationMode {
  if (value === undefined || value === null || value === "redesign") return "redesign";
  if (value === "edit") return "edit";
  throw new DesignError("INVALID_INTENT", 400, `unknown mode: ${String(value)}`);
}

function validateOptions(raw: unknown): DesignOptions {
  if (raw === undefined || raw === null) return {};
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new DesignError("INVALID_OPTIONS", 400, "options must be an object");
  }
  const o = raw as Record<string, unknown>;

  // Reserved internal field — the browser must never supply it.
  if ("image_input" in o) {
    throw new DesignError("IMAGE_INPUT_NOT_ALLOWED", 400, "options.image_input is server-resolved");
  }

  const out: DesignOptions = {};

  if (o.aspect_ratio !== undefined) {
    if (!(ASPECT_RATIOS as readonly string[]).includes(String(o.aspect_ratio))) {
      throw new DesignError("INVALID_OPTIONS", 400, `unsupported aspect_ratio: ${String(o.aspect_ratio)}`);
    }
    out.aspect_ratio = String(o.aspect_ratio);
  }

  if (o.num_outputs !== undefined) {
    const n = Number(o.num_outputs);
    if (!Number.isInteger(n) || n < 1 || n > MAX_NUM_OUTPUTS) {
      throw new DesignError("INVALID_OPTIONS", 400, `num_outputs must be 1..${MAX_NUM_OUTPUTS}`);
    }
    out.num_outputs = n;
  }

  if (o.resolution !== undefined) out.resolution = assertSafeText(o.resolution, "options.resolution");
  if (o.quality !== undefined) out.quality = assertSafeText(o.quality, "options.quality");

  return out;
}

function validateInteriorIntent(raw: Record<string, unknown>): InteriorIntent {
  const mode = assertMode(raw.mode);
  const intent: InteriorIntent = {
    mode,
    roomType: assertSafeText(raw.roomType, "intent.roomType"),
    customRoomType: assertSafeText(raw.customRoomType, "intent.customRoomType"),
    style: assertSafeText(raw.style, "intent.style"),
    customStyle: assertSafeText(raw.customStyle, "intent.customStyle"),
    colorScheme: assertSafeText(raw.colorScheme, "intent.colorScheme"),
    customColorScheme: assertSafeText(raw.customColorScheme, "intent.customColorScheme"),
    requirements: assertSafeText(raw.requirements, "intent.requirements"),
    editInstruction: assertSafeText(raw.editInstruction, "intent.editInstruction"),
  };
  if (mode === "edit" && !intent.editInstruction && !intent.requirements) {
    throw new DesignError("INVALID_INTENT", 400, "edit mode requires editInstruction");
  }
  return intent;
}

function validateExteriorIntent(raw: Record<string, unknown>): ExteriorIntent {
  const mode = assertMode(raw.mode);
  const intent: ExteriorIntent = {
    mode,
    area: assertSafeText(raw.area, "intent.area"),
    customArea: assertSafeText(raw.customArea, "intent.customArea"),
    style: assertSafeText(raw.style, "intent.style"),
    customStyle: assertSafeText(raw.customStyle, "intent.customStyle"),
    colorScheme: assertSafeText(raw.colorScheme, "intent.colorScheme"),
    customColorScheme: assertSafeText(raw.customColorScheme, "intent.customColorScheme"),
    requirements: assertSafeText(raw.requirements, "intent.requirements"),
    editInstruction: assertSafeText(raw.editInstruction, "intent.editInstruction"),
  };
  if (mode === "edit" && !intent.editInstruction && !intent.requirements) {
    throw new DesignError("INVALID_INTENT", 400, "edit mode requires editInstruction");
  }
  return intent;
}

/** Forward-declared floor-plan stage intent (ADR 0004); stages ship in #15/#10. */
function validateFloorPlanIntent(raw: Record<string, unknown>): FloorPlanIntent {
  const stage = String(raw.stage ?? "");
  if (!(FLOOR_PLAN_STAGES as readonly string[]).includes(stage)) {
    throw new DesignError("INVALID_INTENT", 400, `unknown floor-plan stage: ${stage}`);
  }
  const marker = raw.marker as { x?: unknown; y?: unknown } | undefined;
  const x = Number(marker?.x);
  const y = Number(marker?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 100 || y < 0 || y > 100) {
    throw new DesignError("INVALID_INTENT", 400, "marker {x,y} must be within 0..100");
  }
  return {
    stage: stage as FloorPlanStage,
    marker: { x, y },
    roomId: assertSafeText(raw.roomId, "intent.roomId"),
    style: assertSafeText(raw.style, "intent.style"),
    stylePreference: assertSafeText(raw.stylePreference, "intent.stylePreference"),
    feedback: assertSafeText(raw.feedback, "intent.feedback"),
    recognition: (raw.recognition ?? undefined) as Record<string, unknown> | undefined,
    intake: (raw.intake ?? undefined) as Record<string, unknown> | undefined,
  };
}

/** Cost for a validated scene/stage pair (ADR 0002 §model-pricing v2). */
export function costFor(scene: DesignScene, stage?: FloorPlanStage): number {
  if (scene === "floor-plan") return FLOOR_PLAN_STAGE_COST[stage ?? "brief"];
  return IMAGE_TO_IMAGE_COST;
}

/**
 * Validate + normalize a public Design Config. Throws `DesignError` (with an
 * HTTP status) on any violation; never touches credits or the DB.
 */
export function validateDesignConfig(raw: unknown): DesignConfig {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new DesignError("INVALID_CONFIG", 400, "body must be a JSON object");
  }
  const body = raw as Record<string, unknown>;

  // Server-only fields must be absent from the public payload.
  if ("prompt" in body) {
    throw new DesignError("PROMPT_NOT_ALLOWED", 400, "prompt is built server-side");
  }
  if ("sourceKey" in body || "storageKey" in body || "imageUrl" in body || "image_input" in body) {
    throw new DesignError("OBJECT_KEY_NOT_ALLOWED", 400, "source is identified by sourceAssetId only");
  }

  const sourceAssetId = typeof body.sourceAssetId === "string" ? body.sourceAssetId.trim() : "";
  if (!sourceAssetId) {
    throw new DesignError("INVALID_CONFIG", 400, "sourceAssetId is required");
  }
  if (DATA_URL_RE.test(sourceAssetId) || BASE64_BLOB_RE.test(sourceAssetId)) {
    throw new DesignError("INLINE_IMAGE_NOT_ALLOWED", 400, "sourceAssetId must not be inline image data");
  }
  if (URL_RE.test(sourceAssetId)) {
    throw new DesignError("URL_NOT_ALLOWED", 400, "sourceAssetId must not be a URL");
  }
  if (OBJECT_KEY_RE.test(sourceAssetId)) {
    throw new DesignError("OBJECT_KEY_NOT_ALLOWED", 400, "sourceAssetId must not be an object key");
  }

  const mediaType = body.mediaType === undefined ? "image" : String(body.mediaType);
  if (mediaType !== "image") {
    throw new DesignError("INVALID_CONFIG", 400, `unsupported mediaType: ${mediaType}`);
  }

  const scene = String(body.scene ?? "");
  if (!(DESIGN_SCENES as readonly string[]).includes(scene)) {
    throw new DesignError("INVALID_SCENE", 400, `unknown scene: ${scene}`);
  }
  const designScene = scene as DesignScene;

  const rawIntent = body.intent;
  if (rawIntent === null || typeof rawIntent !== "object" || Array.isArray(rawIntent)) {
    throw new DesignError("INVALID_INTENT", 400, "intent must be an object");
  }
  const intentObj = rawIntent as Record<string, unknown>;
  if ("prompt" in intentObj) {
    throw new DesignError("PROMPT_NOT_ALLOWED", 400, "prompt is built server-side");
  }

  let stage: FloorPlanStage | undefined;
  const intent =
    designScene === "interior"
      ? validateInteriorIntent(intentObj)
      : designScene === "exterior"
        ? validateExteriorIntent(intentObj)
        : ((): FloorPlanIntent => {
            const fp = validateFloorPlanIntent(intentObj);
            stage = fp.stage;
            return fp;
          })();

  const options = validateOptions(body.options);

  const idempotencyKey = typeof body.idempotencyKey === "string" ? body.idempotencyKey.trim() : "";
  if (!idempotencyKey) {
    throw new DesignError("IDEMPOTENCY_KEY_REQUIRED", 400, "idempotencyKey is required");
  }

  const provider = assertSafeText(body.provider, "provider") ?? DEFAULT_PROVIDER;
  const model = assertSafeText(body.model, "model") ?? DEFAULT_MODEL;

  return {
    sourceAssetId,
    mediaType: "image",
    scene: designScene,
    stage,
    provider,
    model,
    providerScene: providerSceneFor(designScene, stage),
    intent,
    options,
    cost: costFor(designScene, stage),
    idempotencyKey,
  };
}
