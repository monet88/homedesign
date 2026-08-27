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

/** Exterior template — clone contract (facade & footprint preservation) */
export function buildExteriorPrompt(intent: ExteriorIntent): string {
  if (intent.mode === "edit") {
    return (intent.editInstruction ?? intent.requirements ?? "").trim();
  }

  const area = pick(intent.area, intent.customArea, FALLBACK_AREA);
  const style = pick(intent.style, intent.customStyle, FALLBACK_STYLE);
  const colorScheme = pick(intent.colorScheme, intent.customColorScheme, FALLBACK_COLOR_SCHEME);

  const lines = [
    `Redesign this ${area} exterior in a ${style} direction.`,
    `Use ${colorScheme}.`,
    `Keep the existing building footprint, roofline, doors, windows, and structural geometry.`,
    `Update facade materials, exterior finishes, landscaping, lighting, and curb appeal.`,
    `Create a photorealistic exterior render with natural scale and realistic daylight.`,
  ];

  const requirements = intent.requirements?.trim();
  if (requirements) lines.push(`Custom requirements: ${requirements}`);

  return lines.join("\n");
}
