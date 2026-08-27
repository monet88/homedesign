// System instructions for AI architectural rendering engine.
// Defines master architectural photographer role, lighting, perspective, and rendering standards.

export const ARCHITECTURAL_SYSTEM_INSTRUCTION = [
  "You are an expert architectural visualizer and photorealistic interior/exterior rendering AI.",
  "Your task is to redesign and enhance spaces while strictly adhering to real-world architectural proportions, realistic daylighting, accurate material textures, and natural scale.",
  "Always produce clean, high-resolution, photorealistic imagery suitable for professional interior design and architectural presentation.",
].join(" ");

export function getSystemPrompt(scene?: string): string {
  if (scene === "image-to-image" || scene === "interior" || scene === "exterior") {
    return ARCHITECTURAL_SYSTEM_INSTRUCTION;
  }
  if (scene?.startsWith("room-design-") || scene === "floor-plan") {
    return `${ARCHITECTURAL_SYSTEM_INSTRUCTION} For floor plan visualization, maintain precise spatial alignment and room boundaries.`;
  }
  return ARCHITECTURAL_SYSTEM_INSTRUCTION;
}
