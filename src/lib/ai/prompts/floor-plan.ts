import type { FloorPlanIntent } from "@/lib/ai/types";
import type { RoomBriefProposal } from "@/lib/floor-plan/types";

/** Room Brief stage prompt (ADR 0004) */
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

/** Room Layout stage prompt (ADR 0004) — 2D furniture layout board */
export function buildFloorPlanLayoutPrompt(
  intent: FloorPlanIntent,
  proposal?: RoomBriefProposal | null
): string {
  const roomType = proposal?.recognition?.roomType ?? "the selected room";
  const lines = [
    `Generate a 2D furniture layout board for ${roomType} at marker (${intent.marker.x}%, ${intent.marker.y}%) on the source floor plan.`,
    "Show furniture placement with clear annotations and readable labels.",
    "This is a generated design board — not an editable CAD drawing.",
  ];

  if (proposal?.designProposal) lines.push(`Room Brief: ${proposal.designProposal}.`);
  if (proposal?.style) lines.push(`Target style: ${proposal.style}.`);
  if (intent.feedback) lines.push(`User feedback: ${intent.feedback}.`);
  if (proposal?.recognition?.dimensions) {
    const d = proposal.recognition.dimensions;
    lines.push(`Source dimensions (metadata only): ${d.widthPx}x${d.heightPx}px.`);
  }
  lines.push(
    "Do not fabricate measurements; include dimensions on the layout only when readable from the source floor plan."
  );

  return lines.join("\n");
}

/** Room Render stage prompt (ADR 0004) — photorealistic interior image */
export function buildFloorPlanRenderPrompt(
  intent: FloorPlanIntent,
  proposal?: RoomBriefProposal | null
): string {
  const roomType = proposal?.recognition?.roomType ?? "the selected room";
  const lines = [
    `Create a photorealistic interior render for ${roomType} based on the confirmed 2D layout at marker (${intent.marker.x}%, ${intent.marker.y}%).`,
    "Use natural scale, realistic daylight, and coherent materials.",
    "This is a photorealistic image — not a 3D mesh, camera graph, or editable scene.",
  ];

  if (proposal?.designProposal) lines.push(`Room Brief: ${proposal.designProposal}.`);
  if (proposal?.style) lines.push(`Target style: ${proposal.style}.`);
  if (intent.feedback) lines.push(`User feedback: ${intent.feedback}.`);
  lines.push("Respect the confirmed furniture layout and room context from prior stages.");

  return lines.join("\n");
}

/** Room Panorama stage prompt (ADR 0004) — equirectangular 360° image */
export function buildFloorPlanPanoramaPrompt(
  intent: FloorPlanIntent,
  proposal?: RoomBriefProposal | null
): string {
  const roomType = proposal?.recognition?.roomType ?? "the selected room";
  const orientation = intent.panoramaOrientation;
  const lines = [
    `Generate an equirectangular 360° panorama for ${roomType} from the confirmed photorealistic render at marker (${intent.marker.x}%, ${intent.marker.y}%).`,
    "Output must be a 2:1 equirectangular image; prefer 4096×2048 pixels for clarity and WebGL performance.",
    "This is a single-room panorama — not a tour, hotspot graph, or 360° video.",
  ];

  if (proposal?.designProposal) lines.push(`Room Brief: ${proposal.designProposal}.`);
  if (proposal?.style) lines.push(`Target style: ${proposal.style}.`);
  if (intent.feedback) lines.push(`User feedback: ${intent.feedback}.`);
  if (orientation) {
    lines.push(
      `Initial viewer orientation (degrees): yaw ${orientation.yaw}, pitch ${orientation.pitch}, hfov ${orientation.hfov}.`
    );
  }
  lines.push("Preserve the confirmed render's materials, lighting, and spatial coherence.");

  return lines.join("\n");
}
