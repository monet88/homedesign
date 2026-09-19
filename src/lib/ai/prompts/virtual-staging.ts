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

export interface StagingPresetPlan {
  name: string;
  furnitureSpecs: string[];
  lightingAndDecor: string[];
}

export const STAGING_PRESET_PLANS: Record<string, StagingPresetPlan> = {
  "living-room-luxury": {
    name: "Living Room Luxury",
    furnitureSpecs: [
      "Seating: Deep-seated Italian leather or textured boucle sectional sofa paired with an accent lounge chair in brushed brass frame.",
      "Centerpiece: Nesting coffee tables featuring Calacatta marble tops and slim champagne-gold metal bases.",
      "Layout & Flow: Open conversational arrangement centered toward the main room focal point with generous 3-foot walking clearance around all seating.",
    ],
    lightingAndDecor: [
      "Floor: Expansive neutral wool area rug anchoring the entire seating group with exposed perimeter hardwood floor margins.",
      "Lighting: Architectural sculptural pendant chandelier emitting warm 2700K illumination, complemented by an arc floor lamp.",
      "Accents: Large format contemporary abstract canvas wall art, minimalist ceramic vases, designer monographs, and a flourishing fiddle-leaf fig or olive tree in a fluted stone planter.",
    ],
  },
  "modern-bedroom": {
    name: "Modern Bedroom",
    furnitureSpecs: [
      "Bed: Upholstered king-size platform bed with an extended channel-tufted fabric headboard.",
      "Bedding: Five-star hotel luxury layered linen bedding in crisp ivory, taupe, and subtle charcoal accent throw pillows.",
      "Side Tables: Floating or slender solid American walnut nightstands flanking the bed symmetrically.",
      "Nook: Cozy reading corner with a soft upholstered armchair and a minimalist brass drink table near the natural window.",
    ],
    lightingAndDecor: [
      "Lighting: Dual minimalist pendant lights or warm sconces hanging over each nightstand at 2700K warm glow.",
      "Floor: Ultra-soft plush wool/viscose area rug extending under the lower two-thirds of the bed.",
      "Accents: Framed minimalist botanical or architectural prints, sheer floor-to-ceiling linen drapery diffusing soft daylight, and subtle tabletop greenery.",
    ],
  },
  "executive-office": {
    name: "Executive Office",
    furnitureSpecs: [
      "Desk: Substantial solid oak or walnut executive desk with integrated cable management and blackened steel accents.",
      "Seating: High-back ergonomic executive chair in supple cognac leather, accompanied by two low-back client guest chairs.",
      "Storage: Floor-to-ceiling architectural open-grid shelving system styled with curated hardcover books, architectural models, and sculpted bronze accents.",
    ],
    lightingAndDecor: [
      "Lighting: Modern linear LED task desk lamp with brushed brass finish, paired with warm perimeter ceiling cove lighting.",
      "Floor: Low-pile geometric textured wool rug framing the executive work zone.",
      "Accents: Framed monochrome city skyline fine-art photography, a matte black ceramic planter with snake plant or bonsai, and elegant leather desktop accessories.",
    ],
  },
};

/**
 * B2B Virtual Staging prompt builder for Real Estate Professionals (Ticket 3.3).
 *
 * Transforms vacant, unfurnished rooms into staged turnkey luxury listings
 * optimized for high-converting real estate marketing (MLS, Zillow, Sotheby's).
 *
 * 4-tier structured architectural specification:
 * 1. Commercial Real Estate Listing Staging Objective
 * 2. Absolute Structural Enclosure Invariants (Lock Walls, Flooring, Openings, Light Angle)
 * 3. Turnkey Luxury Staging & Spatial Furnishing (Preset-specific or Room-type adaptive)
 * 4. High-End Real Estate Photography & Photorealistic Optical Standards
 */
export function buildVirtualStagingPrompt(intent: InteriorIntent): string {
  const roomType = pick(intent.roomType, intent.customRoomType, FALLBACK_ROOM_TYPE);
  const style = pick(intent.style, intent.customStyle, FALLBACK_STYLE);
  const colorScheme = pick(intent.colorScheme, intent.customColorScheme, FALLBACK_COLOR_SCHEME);
  const presetKey = intent.stagingPreset?.toLowerCase().trim();

  const presetPlan = presetKey ? STAGING_PRESET_PLANS[presetKey] : undefined;
  const targetSceneTitle = presetPlan ? presetPlan.name : `${style} ${roomType}`;

  const lines = [
    `TASK: High-end B2B commercial real estate virtual staging of the provided vacant room into a professionally staged, turnkey ${targetSceneTitle} for property listing marketing.`,
    "",
    "1. PRESERVED ARCHITECTURAL ENCLOSURE & STRUCTURAL INTEGRITY (LOCK INVARIANTS):",
    "- Strictly lock and preserve 100% of the room geometry: exact perimeter walls, ceiling height, structural beams, floor planes, baseboards, and room dimensions from the input photo.",
    "- Preserve all architectural openings: windows, mullions, sliding glass doors, interior doorways, radiators, and electrical outlets at their exact scale and positions.",
    "- Preserve the genuine exterior view through windows/balconies (skyline, neighborhood, or nature) and maintain the identical natural sunlight angle and direction.",
    "- Do not alter, add, or demolish structural walls, pillars, or window placements.",
    "",
    "2. TURNKEY LUXURY FURNISHING & SPATIAL STAGING:",
    `- Furnish the empty space using a cohesive ${colorScheme} color scheme with premium designer furniture tailored for luxury real estate marketing.`,
  ];

  if (presetPlan) {
    lines.push(...presetPlan.furnitureSpecs.map((s) => `- ${s}`));
    lines.push(...presetPlan.lightingAndDecor.map((s) => `- ${s}`));
  } else {
    lines.push(
      `- Curate a complete, proportionally accurate ${style} furniture ensemble matching ${roomType} functionality.`,
      "- Anchor the main zone with an expansive high-grade wool or natural-fiber area rug exposing clean floor margins.",
      "- Arrange seating/tables with generous human circulation pathways (minimum 36-inch clearance), ensuring zero obstruction to windows or balcony access.",
      "- Layer warm 2700K ambient, task, and accent lighting with designer fixtures harmonizing with natural daylight.",
      "- Add refined real estate staging styling: framed gallery wall art, sculptural greenery in artisan planters, and curated tabletop books."
    );
  }

  lines.push(
    "",
    "3. COMMERCIAL REAL ESTATE LISTING PHOTOGRAPHY & OPTICAL RIGOR:",
    "- Shot in the style of Architectural Digest and prime luxury real estate listings (MLS, Zillow Premier, Sotheby's International Realty).",
    "- Professional 24mm-28mm wide-angle interior lens at eye-level (4.5 ft / 1.4m height), perfectly straight vertical lines, zero barrel distortion.",
    "- Physically Based Rendering (PBR) materiality with realistic fabric textures, natural wood grains, polished stone, and subtle specular highlights.",
    "- Authentic contact ambient occlusion shadows beneath all furniture legs and rugs; furniture must feel solidly grounded on the floor.",
    "- Zero CGI plastic gloss, zero over-saturation, balanced exposure revealing both indoor furnishings and crisp window views."
  );

  const requirements = intent.requirements?.trim();
  if (requirements) {
    lines.push("", `Custom staging requirements: ${requirements}`);
  }

  return lines.join("\n");
}
