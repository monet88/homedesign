import type { InteriorIntent } from "@/lib/ai/types";

// Fallbacks (origin behavior: empty custom value falls back to these)
export const FALLBACK_ROOM_TYPE = "the room";
export const FALLBACK_STYLE = "custom design";
export const FALLBACK_COLOR_SCHEME = "a custom color palette";

function pick(preset: string | undefined, custom: string | undefined, fallback: string): string {
  const c = custom?.trim();
  if (c) return c;
  const p = preset?.trim();
  if (p) return p;
  return fallback;
}

/** Interior redesign template — verbatim from origin chunk 6f41c63bad4e9f32.js */
export function buildInteriorPrompt(intent: InteriorIntent): string {
  if (intent.mode === "edit") {
    return (intent.editInstruction ?? intent.requirements ?? "").trim();
  }

  const roomType = pick(intent.roomType, intent.customRoomType, FALLBACK_ROOM_TYPE);
  const style = pick(intent.style, intent.customStyle, FALLBACK_STYLE);
  const colorScheme = pick(intent.colorScheme, intent.customColorScheme, FALLBACK_COLOR_SCHEME);

  const lines = [
    `Redesign this ${roomType} in a ${style} direction.`,
    `Use ${colorScheme}.`,
    `Keep the existing walls, doors, windows, and structural layout.`,
    `Update furniture, materials, lighting, decor, and styling.`,
    `Create a photorealistic interior render with natural scale and realistic daylight.`,
  ];

  const requirements = intent.requirements?.trim();
  if (requirements) lines.push(`Custom requirements: ${requirements}`);

  return lines.join("\n");
}
