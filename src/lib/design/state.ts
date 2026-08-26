// Design-flow form state → public Design Config body (ticket #14).
//
// The server (validateDesignConfig) owns the fail-closed schema; this module only
// shapes the client payload to match it exactly. The UI never sends a prompt.

import {
  ASPECT_RATIOS,
  type DesignScene,
  type GenerationMode,
} from "@/lib/ai/types";
import {
  EXTERIOR_AREAS,
  EXTERIOR_PALETTES,
  EXTERIOR_STYLES,
  INTERIOR_PALETTES,
  INTERIOR_ROOM_TYPES,
  INTERIOR_STYLES,
} from "./options";

export interface DesignFormState {
  mode: GenerationMode;
  roomType: string;
  customRoomType: string;
  area: string;
  customArea: string;
  style: string;
  customStyle: string;
  colorScheme: string;
  customColorScheme: string;
  aspectRatio: string;
  requirements: string;
  editInstruction: string;
}

export interface DesignPreset {
  scene?: DesignScene;
  mode?: GenerationMode;
  roomType?: string;
  area?: string;
  style?: string;
  colorScheme?: string;
  aspectRatio?: string;
  requirements?: string;
}

const MAX_REQUIREMENTS_LEN = 300;

export function initialDesignFormState(scene: DesignScene): DesignFormState {
  return {
    mode: "redesign",
    roomType: INTERIOR_ROOM_TYPES[0],
    customRoomType: "",
    area: EXTERIOR_AREAS[0],
    customArea: "",
    style: INTERIOR_STYLES[0],
    customStyle: "",
    colorScheme: INTERIOR_PALETTES[0],
    customColorScheme: "",
    aspectRatio: "1:1",
    requirements: "",
    editInstruction: "",
  };
}

function clampRequirements(value: string): string {
  return value.slice(0, MAX_REQUIREMENTS_LEN);
}

/**
 * Apply a landing-page preset (style/room/palette etc.) and force the mode to
 * Full Redesign, matching the origin behavior documented in the spec.
 */
export function applyPreset(
  state: DesignFormState,
  preset: DesignPreset
): DesignFormState {
  const next: DesignFormState = {
    ...state,
    mode: "redesign",
    customStyle: "",
    customColorScheme: "",
  };

  if (preset.roomType) {
    next.roomType = preset.roomType;
    next.customRoomType = "";
  }
  if (preset.area) {
    next.area = preset.area;
    next.customArea = "";
  }
  if (preset.style) {
    next.style = preset.style;
  }
  if (preset.colorScheme) {
    next.colorScheme = preset.colorScheme;
  }
  if (
    preset.aspectRatio &&
    (ASPECT_RATIOS as readonly string[]).includes(preset.aspectRatio)
  ) {
    next.aspectRatio = preset.aspectRatio;
  }
  if (typeof preset.requirements === "string") {
    next.requirements = clampRequirements(preset.requirements);
  }

  return next;
}

function sceneIntent(scene: DesignScene, state: DesignFormState) {
  const style = state.style;
  const customStyle = state.customStyle.trim();
  const colorScheme = state.colorScheme;
  const customColorScheme = state.customColorScheme.trim();
  const requirements = state.requirements.trim();

  const base = {
    mode: state.mode,
    style,
    customStyle,
    colorScheme,
    customColorScheme,
    requirements,
  };

  if (scene === "interior") {
    return {
      ...base,
      roomType: state.roomType,
      customRoomType: state.customRoomType.trim(),
    };
  }

  return {
    ...base,
    area: state.area,
    customArea: state.customArea.trim(),
  };
}

/**
 * Build the exact POST /api/designs body from the current form state.
 * The caller must supply a `ready` source Asset id owned by the logged-in user.
 */
export function buildDesignConfig(
  scene: DesignScene,
  state: DesignFormState,
  sourceAssetId: string
): Record<string, unknown> {
  const idempotencyKey = crypto.randomUUID();
  const requirements = clampRequirements(state.requirements);
  const editInstruction = clampRequirements(
    state.editInstruction.trim() || state.requirements.trim()
  );

  const intent: Record<string, unknown> =
    state.mode === "edit"
      ? {
          mode: "edit" as const,
          editInstruction,
        }
      : sceneIntent(scene, { ...state, requirements });

  return {
    sourceAssetId,
    mediaType: "image",
    scene,
    intent,
    options: {
      aspect_ratio: state.aspectRatio,
      num_outputs: 1,
    },
    idempotencyKey,
  };
}

function readParam(params: URLSearchParams, key: string): string | undefined {
  const value = params.get(key);
  return value ?? undefined;
}

/**
 * Parse preset query parameters from a landing-page "Use" link.
 * Supported: `?style=...&roomType=...&area=...&colorScheme=...&palette=...&aspectRatio=...&requirements=...`
 */
export function parseDesignSearchParams(
  params: URLSearchParams,
  scene: DesignScene
): DesignPreset {
  const preset: DesignPreset = {};

  const style = readParam(params, "style");
  const roomType = readParam(params, "roomType");
  const area = readParam(params, "area");
  const colorScheme = readParam(params, "colorScheme") ?? readParam(params, "palette");
  const aspectRatio = readParam(params, "aspectRatio");
  const requirements = readParam(params, "requirements");

  if (style) preset.style = style;
  if (scene === "interior" && roomType) preset.roomType = roomType;
  if (scene === "exterior" && area) preset.area = area;
  if (colorScheme) preset.colorScheme = colorScheme;
  if (aspectRatio) preset.aspectRatio = aspectRatio;
  if (requirements) preset.requirements = requirements;

  return preset;
}
