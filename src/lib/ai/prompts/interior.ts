import type { InteriorIntent } from "@/lib/ai/types";
import {
  FALLBACK_COLOR_SCHEME,
  FALLBACK_ROOM_TYPE,
  FALLBACK_STYLE,
} from "./constants";
import { buildVirtualStagingPrompt } from "./virtual-staging";

export { buildVirtualStagingPrompt };

function pick(preset: string | undefined, custom: string | undefined, fallback: string): string {
  const c = custom?.trim();
  if (c) return c;
  const p = preset?.trim();
  if (p) return p;
  return fallback;
}

/**
 * Interior redesign template (Ticket #27, ADR 0007, Ticket 3.3).
 * Structured 3-tier architectural prompt:
 * 1. Task & Preserved Architectural Enclosure (Structural Invariants)
 * 2. Spatial Furnishing & Materiality (PBR, Lighting, Layout, Accents)
 * 3. Photographic Standards & Optics (Digest Realism, Occlusion)
 */
export function buildInteriorPrompt(intent: InteriorIntent): string {
  if (intent.mode === "virtual-staging") {
    return buildVirtualStagingPrompt(intent);
  }

  if (intent.mode === "edit") {
    return (intent.editInstruction ?? intent.requirements ?? "").trim();
  }

  const roomType = pick(intent.roomType, intent.customRoomType, FALLBACK_ROOM_TYPE);
  const style = pick(intent.style, intent.customStyle, FALLBACK_STYLE);
  const colorScheme = pick(intent.colorScheme, intent.customColorScheme, FALLBACK_COLOR_SCHEME);

  const lines = [
    `TASK: Photorealistic architectural interior redesign of the provided room image into a ${style} ${roomType}.`,
    "",
    "1. PRESERVED ARCHITECTURAL ENCLOSURE (LOCK INVARIANTS):",
    "- Strictly lock and preserve the exact existing wall planes, ceiling height, corner boundaries, and floor level from the input photo.",
    "- Keep all existing window openings, mullion grids, radiator units, and doorways at their exact location, dimension, and scale; daylight must enter strictly through existing openings.",
    "- Do not add, remove, or reposition structural walls, columns, or architectural boundaries.",
    "",
    "2. SPATIAL FURNISHING & MATERIAL SPECIFICATION:",
    `- Apply ${colorScheme} with high-detail physically based rendering (PBR) materials, tactile fabrics, natural wood grains, and realistic surface finishes across updated furniture, lighting, and decor.`,
    "- Main Seating & Layout: Select low-profile, ergonomic seating tailored to the room volume, leaving natural traffic circulation paths.",
    "- Centerpiece & Styling: Incorporate a complementary coffee table or centerpiece with tasteful tabletop accessories (e.g. ceramic vessel, design monograph).",
    "- Floor Anchoring: Ground the seating arrangement with a large textured natural-fiber or wool area rug, exposing perimeter wood/stone floor margins.",
    "- Lighting & Ambiance: Install a sculptural designer pendant or chandelier from ceiling center emitting warm 2700K ambient illumination, balanced with natural daylight.",
    "- Accents & Biophilic: Add an artisanal indoor plant in a textured planter in an alcove or corner, paired with minimalist wall art tailored to the style.",
    "",
    "3. PHOTOGRAPHIC & MATERIALITY STANDARDS:",
    "- High-end architectural digest interior photography, eye-level 28mm lens, balanced natural exposure.",
    "- PBR textures with visible fabric micro-weave, authentic matte wood grains, tactile stone/plaster, and soft contact ambient occlusion shadows under all furniture.",
    "- Perfectly straight vertical architectural lines, crisp focus, zero lens distortion, zero CGI plastic glare.",
  ];
  const requirements = intent.requirements?.trim();
  if (requirements) lines.push(`Custom requirements: ${requirements}`);

  return lines.join("\n");
}

/**
 * Inpainting prompt builder (Sprint 5, Ticket 5.1).
 * Guides Gemini 2.5 Flash / multimodal image generator to modify strictly
 * the highlighted masked area while preserving the rest of the scene intact.
 */
export function buildInpaintingPrompt(instruction: string): string {
  const clean = instruction.trim();
  return [
    "TASK: Photorealistic architectural inpainting and selective modification.",
    "1. INPAINTING TARGET & MASK REFERENCE:",
    "- The input contains the original room photograph (Image 1) and the inpainting mask showing the target modification area (Image 2).",
    `- Apply this instruction strictly within the marked/masked region: "${clean || "update and replace this area with modern styling"}".`,
    "",
    "2. ARCHITECTURAL PRESERVATION INVARIANTS:",
    "- Absolutely PRESERVE all unmasked areas: unmasked walls, flooring outside the mask, windows, doors, existing lighting, perspective, and camera viewpoint must remain 100% unchanged.",
    "- Do not alter the surrounding room geometry or architectural structure.",
    "",
    "3. MATERIALITY & SEAMLESS BLENDING:",
    "- Seamlessly blend the edges of the modified region into the surrounding room environment with realistic contact ambient occlusion shadows, matching lighting direction, and authentic textures.",
  ].join("\n");
}

