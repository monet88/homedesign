import type { FloorPlanIntent } from "@/lib/ai/types";
import type { RoomBriefProposal } from "@/lib/floor-plan/types";

/**
 * Room Brief stage prompt (Ticket #28, ADR 0004).
 * Structured room brief analysis at marker (x%, y%), style guidance,
 * room questionnaire integration, and strict dimension verification.
 */
export function buildFloorPlanBriefPrompt(intent: FloorPlanIntent): string {
  const roomType =
    (intent.recognition?.roomType as string | undefined) ??
    (intent.intake?.roomType as string | undefined) ??
    "the selected room";

  const lines = [
    `Analyze the floor plan region at marker (${intent.marker.x}%, ${intent.marker.y}%) and prepare a structured Room Brief for ${roomType}.`,
    intent.style
      ? `Style guidance: Target style is ${intent.style}.`
      : "Style guidance: Propose a cohesive and context-appropriate aesthetic style direction.",
  ];

  if (intent.stylePreference) {
    lines.push(`Style preference: ${intent.stylePreference}.`);
  }
  if (intent.intake) {
    lines.push(`Room questionnaire integration: ${JSON.stringify(intent.intake)}.`);
  }
  if (intent.feedback) {
    lines.push(`User feedback: ${intent.feedback}.`);
  }
  if (intent.recognition?.designProposal) {
    lines.push(`Recognition proposal: ${String(intent.recognition.designProposal)}.`);
  }

  lines.push(
    "Synthesize a comprehensive Design Proposal summarizing room context, openings, zoning, and recommended layout direction."
  );
  lines.push(
    "Strict dimension verification: Do not fabricate measurements; include dimensions only when they are readable from the source floor plan."
  );

  return lines.join("\n");
}

/**
 * Room Layout stage prompt (Ticket #28, ADR 0004) — 2D furniture layout board.
 * Ergonomic 2D furniture layout, circulation/traffic flow, clear annotations and readable zone labels.
 */
export function buildFloorPlanLayoutPrompt(
  intent: FloorPlanIntent,
  proposal?: RoomBriefProposal | null
): string {
  const roomType = proposal?.recognition?.roomType ?? "the selected room";
  const lines = [
    `Generate an ergonomic 2D architectural furniture layout board for ${roomType} at marker (${intent.marker.x}%, ${intent.marker.y}%) on the source floor plan.`,
    "Layout & Ergonomics: Design an optimized, ergonomic 2D furniture layout with functional clearances, space efficiency, and unobstructed circulation/traffic flow.",
    "Visual Annotations: Show furniture placement with clear annotations and readable zone labels distinguishing functional areas and circulation paths.",
    "This is a generated design board — not an editable CAD drawing.",
  ];

  if (proposal?.designProposal) {
    lines.push(`Room Brief: ${proposal.designProposal}.`);
  }
  if (proposal?.style) {
    lines.push(`Target style: ${proposal.style}.`);
  }
  if (intent.feedback) {
    lines.push(`User feedback: ${intent.feedback}.`);
  }
  if (proposal?.recognition?.dimensions) {
    const d = proposal.recognition.dimensions;
    lines.push(`Source dimensions (metadata only): ${d.widthPx}x${d.heightPx}px.`);
  }
  lines.push(
    "Strict dimension verification: Do not fabricate measurements; include dimensions on the layout only when readable from the source floor plan."
  );

  return lines.join("\n");
}

/**
 * Room Render stage prompt (Ticket #28, ADR 0004) — photorealistic interior image.
 * Photorealistic 3D interior render aligned with confirmed 2D placement, realistic daylight, and PBR textures.
 */
export function buildFloorPlanRenderPrompt(
  intent: FloorPlanIntent,
  proposal?: RoomBriefProposal | null
): string {
  const roomType = proposal?.recognition?.roomType ?? "the selected room";
  const lines = [
    `Create a photorealistic 3D interior render for ${roomType} aligned with the confirmed 2D furniture layout and spatial placement at marker (${intent.marker.x}%, ${intent.marker.y}%).`,
    "Optics & Perspective: Eye-level architectural perspective, 24-35mm lens, and true two-point perspective with straight vertical lines.",
    "Lighting & Atmosphere: Balanced realistic daylight entering naturally through openings, soft ambient shadows, and accurate global illumination.",
    "Materials & Shading: High-detail physically based rendering (PBR) textures with natural wood grain, tactile fabrics, stone, and realistic reflections.",
    "This is a photorealistic image — not a 3D mesh, camera graph, or editable scene.",
  ];

  if (proposal?.designProposal) {
    lines.push(`Room Brief: ${proposal.designProposal}.`);
  }
  if (proposal?.style) {
    lines.push(`Target style: ${proposal.style}.`);
  }
  if (intent.feedback) {
    lines.push(`User feedback: ${intent.feedback}.`);
  }
  lines.push(
    "Strictly respect the confirmed 2D furniture placement, architectural boundaries, and room context from prior stages."
  );

  return lines.join("\n");
}

/**
 * Room Panorama stage prompt (Ticket #28, ADR 0004) — equirectangular 360° image.
 * 2:1 equirectangular projection (4096x2048), viewer orientation, and 360° spatial continuity.
 */
export function buildFloorPlanPanoramaPrompt(
  intent: FloorPlanIntent,
  proposal?: RoomBriefProposal | null
): string {
  const roomType = proposal?.recognition?.roomType ?? "the selected room";
  const orientation = intent.panoramaOrientation;
  const lines = [
    `Generate a seamless 360° equirectangular panorama for ${roomType} from the confirmed photorealistic render at marker (${intent.marker.x}%, ${intent.marker.y}%).`,
    "Output projection: Strict 2:1 equirectangular projection (4096×2048 pixels) optimized for interactive WebGL panorama viewing.",
    "360° Spatial Continuity: Ensure full spherical 360° spatial continuity, seamless horizontal wrap boundaries (-180° to +180°), and continuous floor/ceiling planes.",
    "This is a single-room panorama — not a tour, hotspot graph, or 360° video.",
  ];

  if (proposal?.designProposal) {
    lines.push(`Room Brief: ${proposal.designProposal}.`);
  }
  if (proposal?.style) {
    lines.push(`Target style: ${proposal.style}.`);
  }
  if (intent.feedback) {
    lines.push(`User feedback: ${intent.feedback}.`);
  }
  if (orientation) {
    lines.push(
      `Initial viewer orientation (degrees): yaw ${orientation.yaw}, pitch ${orientation.pitch}, hfov ${orientation.hfov}.`
    );
  }
  lines.push(
    "Preserve the confirmed render's materials, PBR textures, daylighting, and spatial coherence across all viewing angles."
  );

  return lines.join("\n");
}
