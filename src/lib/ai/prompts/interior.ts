import type { InteriorIntent } from "@/lib/ai/types";
import {
  FALLBACK_COLOR_SCHEME,
  FALLBACK_ROOM_TYPE,
  FALLBACK_STYLE,
} from "./constants";

function pick(preset: string | undefined, custom: string | undefined, fallback: string): string {
  const c = custom?.trim();
  if (c) return c;
  const p = preset?.trim();
  if (p) return p;
  return fallback;
}

/**
 * Interior redesign template (Ticket #27, ADR 0007).
 * Structured 4-layer prompt: Task & Scene, PBR Materiality & Palette,
 * Structural Invariants, Quality/Daylight & Optics, plus optional Custom Requirements.
 */
export function buildInteriorPrompt(intent: InteriorIntent): string {
  if (intent.mode === "edit") {
    return (intent.editInstruction ?? intent.requirements ?? "").trim();
  }

  const roomType = pick(intent.roomType, intent.customRoomType, FALLBACK_ROOM_TYPE);
  const style = pick(intent.style, intent.customStyle, FALLBACK_STYLE);
  const colorScheme = pick(intent.colorScheme, intent.customColorScheme, FALLBACK_COLOR_SCHEME);

  const lines = [
    `Redesign this ${roomType} in a ${style} direction.`,
    `Apply ${colorScheme} with high-detail physically based rendering (PBR) materials, tactile fabrics, natural wood grains, and realistic surface finishes across updated furniture, lighting, and decor.`,
    `Strictly preserve existing walls, ceiling heights, doors, window placements, structural columns, and room layout without geometric warping.`,
    `Create a photorealistic interior render with natural scale, balanced daylight entering naturally through openings, accurate global illumination, and eye-level architectural perspective.`,
  ];

  const requirements = intent.requirements?.trim();
  if (requirements) lines.push(`Custom requirements: ${requirements}`);

  return lines.join("\n");
}

