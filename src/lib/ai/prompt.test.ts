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
import { buildExteriorPrompt, buildInteriorPrompt } from "@/lib/ai/prompt";
import {
  DesignError,
  type DesignConfig,
  type ExteriorIntent,
  type InteriorIntent,
} from "@/lib/ai/types";

const INTERIOR_TEMPLATE = [
  "Redesign this living room in a modern direction.",
  "Use warm neutrals.",
  "Keep the existing walls, doors, windows, and structural layout.",
  "Update furniture, materials, lighting, decor, and styling.",
  "Create a photorealistic interior render with natural scale and realistic daylight.",
].join("\n");

const EXTERIOR_TEMPLATE = [
  "Redesign this front yard exterior in a farmhouse direction.",
  "Use earth tones.",
  "Keep the existing building footprint, roofline, doors, windows, and structural geometry.",
  "Update facade materials, exterior finishes, landscaping, lighting, and curb appeal.",
  "Create a photorealistic exterior render with natural scale and realistic daylight.",
].join("\n");

describe("interior prompt template (verbatim origin snapshot)", () => {
  it("builds the 5-line redesign template from the intent", () => {
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
        "Redesign this the room in a custom design direction.",
        "Use a custom color palette.",
        "Keep the existing walls, doors, windows, and structural layout.",
        "Update furniture, materials, lighting, decor, and styling.",
        "Create a photorealistic interior render with natural scale and realistic daylight.",
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
    expect(prompt).toContain("Redesign this reading nook in a wabi-sabi direction.");
    expect(prompt).toContain("Use muted greens.");
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

describe("exterior prompt template (clone contract snapshot)", () => {
  it("builds the 5-line exterior template from the intent", () => {
    const intent: ExteriorIntent = {
      mode: "redesign",
      area: "front yard",
      style: "farmhouse",
      colorScheme: "earth tones",
    };
    expect(buildExteriorPrompt(intent)).toBe(EXTERIOR_TEMPLATE);
  });

  it("preserves structural geometry wording (clone contract) and falls back", () => {
    const prompt = buildExteriorPrompt({ mode: "redesign" });
    // Fallback area is "the exterior" (origin-style fallback), so the first
    // line reads "…the exterior exterior…" — snapshotted as clone behavior.
    expect(prompt.split("\n")[0]).toBe(
      "Redesign this the exterior exterior in a custom design direction."
    );
    expect(prompt).toContain(
      "Keep the existing building footprint, roofline, doors, windows, and structural geometry."
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
    const prompt = buildPrompt(
      config("floor-plan", { stage: "brief", marker: { x: 10, y: 10 }, roomId: "room-1" })
    );
    expect(prompt).toContain("marker (10%, 10%)");
    expect(prompt).toContain("Do not fabricate measurements");
  });

  it("floor-plan layout/render/panorama remain 501", () => {
    try {
      buildPrompt({
        ...config("floor-plan", { stage: "layout", marker: { x: 10, y: 10 } }),
        stage: "layout",
        providerScene: "room-design-layout",
        cost: 2,
      });
      throw new Error("expected SCENE_NOT_IMPLEMENTED");
    } catch (err) {
      expect(err).toBeInstanceOf(DesignError);
      expect((err as DesignError).code).toBe("SCENE_NOT_IMPLEMENTED");
      expect((err as DesignError).status).toBe(501);
    }
  });
});
