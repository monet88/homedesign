import type { ExteriorIntent } from "@/lib/ai/types";

export const FALLBACK_AREA = "the exterior";
export const FALLBACK_STYLE = "custom design";
export const FALLBACK_COLOR_SCHEME = "a custom color palette";

function pick(preset: string | undefined, custom: string | undefined, fallback: string): string {
  const c = custom?.trim();
  if (c) return c;
  const p = preset?.trim();
  if (p) return p;
  return fallback;
}

/**
 * Exterior redesign template (Ticket #27, ADR 0007).
 * Structured 4-layer prompt: Facade & Area, Facade Materials & Palette (PBR),
 * Geometry Invariants, Landscaping & Daylight (Curb Appeal), plus optional Custom Requirements.
 */
export function buildExteriorPrompt(intent: ExteriorIntent): string {
  if (intent.mode === "edit") {
    return (intent.editInstruction ?? intent.requirements ?? "").trim();
  }

  const area = pick(intent.area, intent.customArea, FALLBACK_AREA);
  const style = pick(intent.style, intent.customStyle, FALLBACK_STYLE);
  const colorScheme = pick(intent.colorScheme, intent.customColorScheme, FALLBACK_COLOR_SCHEME);

  const lines = [
    `Redesign this ${area} exterior in a ${style} direction.`,
    `Apply ${colorScheme} with high-detail physically based rendering (PBR) facade materials, authentic siding, stone, brick, or timber textures, and refined exterior finishes.`,
    `Strictly preserve the existing building footprint, rooflines, structural massing, window and door placements, and architectural geometry.`,
    `Create a photorealistic exterior render with natural scale, realistic outdoor daylighting, soft global illumination, refined landscaping, and enhanced curb appeal.`,
  ];

  const requirements = intent.requirements?.trim();
  if (requirements) lines.push(`Custom requirements: ${requirements}`);

  return lines.join("\n");
}

