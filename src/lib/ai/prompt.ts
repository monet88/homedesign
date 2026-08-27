// Ticket 07 — server-side prompt builder (spec §Generation contracts).
//
// The public API never accepts `prompt`; the server builds it from the Design
// Config intent. Interior uses the origin's verbatim template
// (`research/generation-pipeline.md:31`); Exterior uses the clone contract
// snapshot documented in the spec (origin template not recovered).
//
// Local Edit (`mode: "edit"`) skips the template entirely and uses only the
// instruction — same as origin.

import type { ExteriorIntent, FloorPlanIntent, InteriorIntent } from "@/lib/ai/types";

// Fallbacks (origin behavior: empty custom value falls back to these).
const FALLBACK_ROOM_TYPE = "the room";
const FALLBACK_STYLE = "custom design";
const FALLBACK_COLOR_SCHEME = "a custom color palette";
const FALLBACK_AREA = "the exterior";

function pick(preset: string | undefined, custom: string | undefined, fallback: string): string {
  const c = custom?.trim();
  if (c) return c;
  const p = preset?.trim();
  if (p) return p;
  return fallback;
}

/** Interior redesign template — verbatim from origin chunk `6f41c63bad4e9f32.js`. */
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

/**
 * Exterior template — clone contract (spec: origin template not recovered, so
 * this is snapshot-tested as clone behavior, not claimed verbatim).
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
    `Use ${colorScheme}.`,
    `Keep the existing building footprint, roofline, doors, windows, and structural geometry.`,
    `Update facade materials, exterior finishes, landscaping, lighting, and curb appeal.`,
    `Create a photorealistic exterior render with natural scale and realistic daylight.`,
  ];

  const requirements = intent.requirements?.trim();
  if (requirements) lines.push(`Custom requirements: ${requirements}`);

  return lines.join("\n");
}

/** Room Brief stage prompt (ADR 0004). Recognition is input, not a separate billed output. */
export function buildFloorPlanBriefPrompt(intent: FloorPlanIntent): string {
  const roomType =
    (intent.recognition?.roomType as string | undefined) ??
    (intent.intake?.roomType as string | undefined) ??
    "the selected room";

  const lines = [
    `Analyze the floor plan region at marker (${intent.marker.x}%, ${intent.marker.y}%) and prepare a Room Brief for ${roomType}.`,
    intent.style ? `Target style: ${intent.style}.` : "Propose an appropriate style direction.",
  ];

  if (intent.stylePreference) lines.push(`Style preference: ${intent.stylePreference}.`);
  if (intent.intake) lines.push(`Room questionnaire answers: ${JSON.stringify(intent.intake)}.`);
  if (intent.feedback) lines.push(`User feedback: ${intent.feedback}.`);
  if (intent.recognition?.designProposal) {
    lines.push(`Recognition proposal: ${String(intent.recognition.designProposal)}.`);
  }

  lines.push(
    "Create a Design Proposal summarizing room context, openings, layout direction, and recommended design approach."
  );
  lines.push(
    "Do not fabricate measurements; include dimensions only when they are readable from the source floor plan."
  );

  return lines.join("\n");
}
