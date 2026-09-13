// Ticket 07 — server-side prompt builder unit tests (AC: "server builds the
// prompt; the public API never accepts one").
//
// Interior redesign uses the origin's verbatim template
// (research/generation-pipeline.md:31); Local Edit (`mode: "edit"`) skips the
// template entirely and sends the instruction only; Exterior uses the clone
// contract snapshot (origin template not recovered — snapshot-tested as clone
// behavior, not claimed verbatim).
import { describe, expect, it } from "vitest";
import { buildPrompt } from "@/lib/ai/lifecycle";
import {
  buildExteriorPrompt,
  buildInteriorPrompt,
  buildFloorPlanBriefPrompt,
  buildFloorPlanLayoutPrompt,
  buildFloorPlanRenderPrompt,
  buildFloorPlanPanoramaPrompt,
  getSystemPrompt,
  getNegativeConstraints,
  ARCHITECTURAL_SYSTEM_INSTRUCTION,
  DEFAULT_NEGATIVE_CONSTRAINTS,
} from "@/lib/ai/prompt";
import {
  DesignError,
  type DesignConfig,
  type ExteriorIntent,
  type InteriorIntent,
  type FloorPlanIntent,
} from "@/lib/ai/types";
import type { RoomBriefProposal } from "@/lib/floor-plan/types";

const INTERIOR_TEMPLATE = [
  "TASK: Photorealistic architectural interior redesign of the provided room image into a modern living room.",
  "",
  "1. PRESERVED ARCHITECTURAL ENCLOSURE (LOCK INVARIANTS):",
  "- Strictly lock and preserve the exact existing wall planes, ceiling height, corner boundaries, and floor level from the input photo.",
  "- Keep all existing window openings, mullion grids, radiator units, and doorways at their exact location, dimension, and scale; daylight must enter strictly through existing openings.",
  "- Do not add, remove, or reposition structural walls, columns, or architectural boundaries.",
  "",
  "2. SPATIAL FURNISHING & MATERIAL SPECIFICATION:",
  "- Apply warm neutrals with high-detail physically based rendering (PBR) materials, tactile fabrics, natural wood grains, and realistic surface finishes across updated furniture, lighting, and decor.",
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
].join("\n");

const EXTERIOR_TEMPLATE = [
  "Redesign this front yard exterior in a farmhouse direction.",
  "Apply earth tones with high-detail physically based rendering (PBR) facade materials, authentic siding, stone, brick, or timber textures, and refined exterior finishes.",
  "Strictly preserve the existing building footprint, rooflines, structural massing, window and door placements, and architectural geometry.",
  "Create a photorealistic exterior render with natural scale, realistic outdoor daylighting, soft global illumination, refined landscaping, and enhanced curb appeal.",
].join("\n");

describe("interior prompt template (structured 4-layer PBR & Optics)", () => {
  it("builds the structured 4-layer redesign template from the intent", () => {
    const intent: InteriorIntent = {
      mode: "redesign",
      roomType: "living room",
      style: "modern",
      colorScheme: "warm neutrals",
    };
    expect(buildInteriorPrompt(intent)).toBe(INTERIOR_TEMPLATE);
  });

  it("falls back to origin defaults when nothing is selected", () => {
    expect(buildInteriorPrompt({ mode: "redesign" })).toBe(
      [
        "TASK: Photorealistic architectural interior redesign of the provided room image into a custom design the room.",
        "",
        "1. PRESERVED ARCHITECTURAL ENCLOSURE (LOCK INVARIANTS):",
        "- Strictly lock and preserve the exact existing wall planes, ceiling height, corner boundaries, and floor level from the input photo.",
        "- Keep all existing window openings, mullion grids, radiator units, and doorways at their exact location, dimension, and scale; daylight must enter strictly through existing openings.",
        "- Do not add, remove, or reposition structural walls, columns, or architectural boundaries.",
        "",
        "2. SPATIAL FURNISHING & MATERIAL SPECIFICATION:",
        "- Apply a custom color palette with high-detail physically based rendering (PBR) materials, tactile fabrics, natural wood grains, and realistic surface finishes across updated furniture, lighting, and decor.",
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
      ].join("\n")
    );
  });

  it("custom values win over presets (origin behavior)", () => {
    const prompt = buildInteriorPrompt({
      mode: "redesign",
      roomType: "living room",
      customRoomType: "reading nook",
      style: "modern",
      customStyle: "wabi-sabi",
      colorScheme: "warm neutrals",
      customColorScheme: "muted greens",
    });
    expect(prompt).toContain("into a wabi-sabi reading nook.");
    expect(prompt).toContain("Apply muted greens with high-detail");
    expect(prompt).not.toContain("living room");
    expect(prompt).not.toContain("modern");
  });

  it("appends custom requirements as an extra line", () => {
    const prompt = buildInteriorPrompt({
      mode: "redesign",
      roomType: "living room",
      style: "modern",
      colorScheme: "warm neutrals",
      requirements: "keep the piano",
    });
    expect(prompt).toBe(`${INTERIOR_TEMPLATE}\nCustom requirements: keep the piano`);
  });

  it("Local Edit skips the template entirely — instruction only", () => {
    const prompt = buildInteriorPrompt({
      mode: "edit",
      roomType: "living room",
      style: "modern",
      colorScheme: "warm neutrals",
      editInstruction: "replace the rug with oak flooring",
    });
    expect(prompt).toBe("replace the rug with oak flooring");
    expect(prompt).not.toContain("Redesign this");
    expect(prompt).not.toContain("photorealistic");
  });

  it("Local Edit falls back to requirements when no editInstruction", () => {
    expect(buildInteriorPrompt({ mode: "edit", requirements: "brighten the ceiling" })).toBe(
      "brighten the ceiling"
    );
  });
});

describe("exterior prompt template (structured 4-layer Facade & Curb Appeal)", () => {
  it("builds the structured 4-layer exterior template from the intent", () => {
    const intent: ExteriorIntent = {
      mode: "redesign",
      area: "front yard",
      style: "farmhouse",
      colorScheme: "earth tones",
    };
    expect(buildExteriorPrompt(intent)).toBe(EXTERIOR_TEMPLATE);
  });

  it("preserves structural geometry invariants and falls back", () => {
    const prompt = buildExteriorPrompt({ mode: "redesign" });
    // Fallback area is "the exterior" (origin-style fallback), so the first
    // line reads "…the exterior exterior…" — snapshotted as clone behavior.
    expect(prompt.split("\n")[0]).toBe(
      "Redesign this the exterior exterior in a custom design direction."
    );
    expect(prompt).toContain(
      "Strictly preserve the existing building footprint, rooflines, structural massing, window and door placements, and architectural geometry."
    );
  });

  it("Local Edit skips the exterior template too", () => {
    expect(
      buildExteriorPrompt({
        mode: "edit",
        area: "front yard",
        editInstruction: "add a stone path",
      })
    ).toBe("add a stone path");
  });
});

describe("buildPrompt dispatch by scene", () => {
  function config(scene: DesignConfig["scene"], intent: DesignConfig["intent"]): DesignConfig {
    const stage =
      scene === "floor-plan" && "stage" in intent ? (intent as { stage?: string }).stage : undefined;
    return {
      sourceAssetId: "asset-1",
      mediaType: "image",
      scene,
      stage: stage as DesignConfig["stage"],
      provider: "fake",
      model: "gemini-2.5-flash-image",
      providerScene:
        scene === "floor-plan"
          ? (`room-design-${stage ?? "brief"}` as DesignConfig["providerScene"])
          : "image-to-image",
      intent,
      options: {},
      cost: 1,
      idempotencyKey: "k1",
    };
  }

  it("interior scene uses the interior template", () => {
    const prompt = buildPrompt(
      config("interior", { mode: "redesign", roomType: "living room", style: "modern", colorScheme: "warm neutrals" })
    );
    expect(prompt).toBe(INTERIOR_TEMPLATE);
  });

  it("exterior scene uses the exterior template", () => {
    const prompt = buildPrompt(
      config("exterior", { mode: "redesign", area: "front yard", style: "farmhouse", colorScheme: "earth tones" })
    );
    expect(prompt).toBe(EXTERIOR_TEMPLATE);
  });

  it("builds a floor-plan brief prompt", () => {
    const prompt = buildFloorPlanBriefPrompt({
      stage: "brief",
      marker: { x: 10, y: 10 },
      roomId: "room-1",
    });
    expect(prompt).toContain("marker (10%, 10%)");
    expect(prompt).toContain("Do not fabricate measurements");
  });

  it("floor-plan layout/render/panorama build prompts", () => {
    const layoutPrompt = buildFloorPlanLayoutPrompt({
      stage: "layout",
      marker: { x: 10, y: 10 },
      roomId: "room-1",
    });
    expect(layoutPrompt).toContain("2D furniture layout");

    const panoramaPrompt = buildFloorPlanPanoramaPrompt({
      stage: "panorama",
      marker: { x: 10, y: 10 },
      roomId: "room-1",
      panoramaOrientation: { yaw: 0, pitch: 0, hfov: 100 },
    });
    expect(panoramaPrompt).toContain("equirectangular");
    expect(panoramaPrompt).toContain("4096×2048");
  });
});

describe("Floor Plan 4-Stage Prompt Suite (Ticket #28)", () => {
  const sampleProposal: RoomBriefProposal = {
    recognition: {
      roomType: "primary bedroom",
      openings: ["north window", "south door"],
      shape: "rectangular",
      regionHint: "top-right quadrant",
      dimensions: { widthPx: 1400, heightPx: 1000, source: "asset-metadata" },
    },
    style: "japandi",
    stylePreference: "minimalist zen with light oak",
    questionnaire: [{ id: "bed-size", question: "Preferred bed size?", options: ["King", "Queen"] }],
    freeformRequirements: "Include a reading corner near window",
    designProposal: "Open flow with king bed on west wall and reading nook by north window",
  };

  it("builds structured Room Brief prompt with style guidance, questionnaire integration, and strict dimensions", () => {
    const intent: FloorPlanIntent = {
      stage: "brief",
      marker: { x: 45, y: 55 },
      roomId: "room-101",
      style: "japandi",
      stylePreference: "minimalist zen with light oak",
      intake: { bedSize: "King", naturalLight: "High" },
      feedback: "Ensure adequate wardrobe space",
      recognition: {
        roomType: "primary bedroom",
        designProposal: "Spacious master bedroom with ensuite access",
      },
    };

    const prompt = buildFloorPlanBriefPrompt(intent);
    expect(prompt).toContain("marker (45%, 55%)");
    expect(prompt).toContain("structured Room Brief for primary bedroom");
    expect(prompt).toContain("Style guidance: Target style is japandi");
    expect(prompt).toContain("Style preference: minimalist zen with light oak");
    expect(prompt).toContain('Room questionnaire integration: {"bedSize":"King","naturalLight":"High"}');
    expect(prompt).toContain("User feedback: Ensure adequate wardrobe space");
    expect(prompt).toContain("Recognition proposal: Spacious master bedroom with ensuite access");
    expect(prompt).toContain("Strict dimension verification: Do not fabricate measurements");
  });

  it("builds default style guidance when no explicit style is provided for brief", () => {
    const prompt = buildFloorPlanBriefPrompt({
      stage: "brief",
      marker: { x: 20, y: 30 },
    });
    expect(prompt).toContain("marker (20%, 30%)");
    expect(prompt).toContain("Style guidance: Propose a cohesive and context-appropriate aesthetic style direction");
  });

  it("builds 2D Layout prompt with ergonomic furniture layout, circulation/traffic flow, and zone labels", () => {
    const intent: FloorPlanIntent = {
      stage: "layout",
      marker: { x: 45, y: 55 },
      roomId: "room-101",
      feedback: "Wider passage between bed and dresser",
    };

    const prompt = buildFloorPlanLayoutPrompt(intent, sampleProposal);
    expect(prompt).toContain("ergonomic 2D architectural furniture layout board for primary bedroom");
    expect(prompt).toContain("marker (45%, 55%)");
    expect(prompt).toContain("Layout & Ergonomics: Design an optimized, ergonomic 2D furniture layout");
    expect(prompt).toContain("unobstructed circulation/traffic flow");
    expect(prompt).toContain("Visual Annotations: Show furniture placement with clear annotations and readable zone labels");
    expect(prompt).toContain("Room Brief: Open flow with king bed on west wall and reading nook by north window");
    expect(prompt).toContain("Target style: japandi");
    expect(prompt).toContain("User feedback: Wider passage between bed and dresser");
    expect(prompt).toContain("Source dimensions (metadata only): 1400x1000px");
    expect(prompt).toContain("Strict dimension verification: Do not fabricate measurements");
    expect(prompt).toContain("This is a generated design board — not an editable CAD drawing");
  });

  it("builds 3D Render prompt with confirmed 2D placement, realistic daylight, and PBR textures", () => {
    const intent: FloorPlanIntent = {
      stage: "render",
      marker: { x: 45, y: 55 },
      roomId: "room-101",
      feedback: "Warm afternoon lighting",
    };

    const prompt = buildFloorPlanRenderPrompt(intent, sampleProposal);
    expect(prompt).toContain("photorealistic 3D interior render for primary bedroom");
    expect(prompt).toContain("aligned with the confirmed 2D furniture layout and spatial placement");
    expect(prompt).toContain("marker (45%, 55%)");
    expect(prompt).toContain("Optics & Perspective: Eye-level architectural perspective, 24-35mm lens");
    expect(prompt).toContain("Lighting & Atmosphere: Balanced realistic daylight");
    expect(prompt).toContain("Materials & Shading: High-detail physically based rendering (PBR) textures");
    expect(prompt).toContain("Room Brief: Open flow with king bed on west wall and reading nook by north window");
    expect(prompt).toContain("Target style: japandi");
    expect(prompt).toContain("User feedback: Warm afternoon lighting");
    expect(prompt).toContain("Strictly respect the confirmed 2D furniture placement");
    expect(prompt).toContain("This is a photorealistic image — not a 3D mesh");
  });

  it("builds 360° Panorama prompt with 2:1 equirectangular projection, viewer orientation, and spatial continuity", () => {
    const intent: FloorPlanIntent = {
      stage: "panorama",
      marker: { x: 45, y: 55 },
      roomId: "room-101",
      panoramaOrientation: { yaw: 45, pitch: -5, hfov: 95 },
      feedback: "Keep chandelier visible in initial view",
    };

    const prompt = buildFloorPlanPanoramaPrompt(intent, sampleProposal);
    expect(prompt).toContain("seamless 360° equirectangular panorama for primary bedroom");
    expect(prompt).toContain("marker (45%, 55%)");
    expect(prompt).toContain("Strict 2:1 equirectangular projection (4096×2048 pixels)");
    expect(prompt).toContain("360° Spatial Continuity: Ensure full spherical 360° spatial continuity");
    expect(prompt).toContain("Initial viewer orientation (degrees): yaw 45, pitch -5, hfov 95");
    expect(prompt).toContain("Room Brief: Open flow with king bed on west wall and reading nook by north window");
    expect(prompt).toContain("Target style: japandi");
    expect(prompt).toContain("User feedback: Keep chandelier visible in initial view");
    expect(prompt).toContain("Preserve the confirmed render's materials, PBR textures, daylighting, and spatial coherence");
    expect(prompt).toContain("This is a single-room panorama — not a tour");
  });
});

describe("System Prompt Engine (Ticket #26)", () => {
  it("defines master architectural visualizer role and core optics/lighting invariants", () => {
    expect(ARCHITECTURAL_SYSTEM_INSTRUCTION).toContain("master architectural visualizer");
    expect(ARCHITECTURAL_SYSTEM_INSTRUCTION).toContain("24-35mm architectural lens");
    expect(ARCHITECTURAL_SYSTEM_INSTRUCTION).toContain("two-point perspective");
    expect(ARCHITECTURAL_SYSTEM_INSTRUCTION).toContain("straight vertical lines");
    expect(ARCHITECTURAL_SYSTEM_INSTRUCTION).toContain("daylighting");
    expect(ARCHITECTURAL_SYSTEM_INSTRUCTION).toContain("global illumination");
    expect(ARCHITECTURAL_SYSTEM_INSTRUCTION).toContain("PBR");
    expect(ARCHITECTURAL_SYSTEM_INSTRUCTION).toContain("Structural Preservation Invariants");
  });

  it("returns base instruction for default and generic scenes", () => {
    expect(getSystemPrompt()).toBe(ARCHITECTURAL_SYSTEM_INSTRUCTION);
    expect(getSystemPrompt("image-to-image")).toBe(ARCHITECTURAL_SYSTEM_INSTRUCTION);
  });

  it("customizes system prompt for interior scene", () => {
    const prompt = getSystemPrompt("interior");
    expect(prompt).toContain(ARCHITECTURAL_SYSTEM_INSTRUCTION);
    expect(prompt).toContain("interior renderings");
    expect(prompt).toContain("room enclosure");
  });

  it("customizes system prompt for exterior scene", () => {
    const prompt = getSystemPrompt("exterior");
    expect(prompt).toContain(ARCHITECTURAL_SYSTEM_INSTRUCTION);
    expect(prompt).toContain("exterior renderings");
    expect(prompt).toContain("building footprint");
  });

  it("customizes system prompt for floor plan stages", () => {
    const floorPlanPrompt = getSystemPrompt("floor-plan");
    expect(floorPlanPrompt).toContain("floor plan visualization");
    expect(floorPlanPrompt).toContain("orthogonal room boundaries");

    const roomDesignPrompt = getSystemPrompt("room-design-layout");
    expect(roomDesignPrompt).toContain("floor plan visualization");
  });
});

describe("Negative Constraints Engine (Ticket #26)", () => {
  it("defines comprehensive anti-distortion, anti-CGI, and unwanted element constraints", () => {
    const negative = getNegativeConstraints();
    expect(negative).toBe(DEFAULT_NEGATIVE_CONSTRAINTS);
    expect(negative).toContain("warped structural lines");
    expect(negative).toContain("crooked walls");
    expect(negative).toContain("impossible geometry");
    expect(negative).toContain("3D CGI plastic look");
    expect(negative).toContain("duplicate openings");
    expect(negative).toContain("people");
    expect(negative).toContain("animals");
    expect(negative).toContain("clutter");
    expect(negative).toContain("text");
    expect(negative).toContain("logos");
    expect(negative).toContain("watermarks");
    expect(negative).toContain("frame borders");
  });
});

