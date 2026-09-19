import { describe, expect, it } from "vitest";
import {
  applyPreset,
  buildDesignConfig,
  initialDesignFormState,
  parseDesignSearchParams,
} from "@/lib/design/state";
import {
  EXTERIOR_AREAS,
  EXTERIOR_PALETTES,
  EXTERIOR_STYLES,
  INTERIOR_PALETTES,
  INTERIOR_ROOM_TYPES,
  INTERIOR_STYLES,
} from "@/lib/design/options";

function pickInteriorConfig(body: Record<string, unknown>) {
  return {
    sourceAssetId: body.sourceAssetId,
    mediaType: body.mediaType,
    scene: body.scene,
    intent: body.intent as Record<string, unknown>,
    options: body.options,
    idempotencyKey: body.idempotencyKey,
  };
}

describe("design form state builder", () => {
  it("builds the exact interior redesign API body", () => {
    const state = initialDesignFormState("interior");
    state.roomType = "Bedroom";
    state.style = "Japandi";
    state.colorScheme = "Warm";
    state.aspectRatio = "16:9";
    state.requirements = "keep the piano";

    const body = buildDesignConfig("interior", state, "asset-1");
    const picked = pickInteriorConfig(body);

    expect(picked).toMatchObject({
      sourceAssetId: "asset-1",
      mediaType: "image",
      scene: "interior",
      intent: {
        mode: "redesign",
        roomType: "Bedroom",
        style: "Japandi",
        colorScheme: "Warm",
        requirements: "keep the piano",
      },
      options: { aspect_ratio: "16:9", num_outputs: 1 },
    });
    expect(typeof picked.idempotencyKey).toBe("string");
    expect(picked.idempotencyKey).toHaveLength(36);
    expect(picked.intent).not.toHaveProperty("prompt");
  });

  it("builds the exact exterior redesign API body", () => {
    const state = initialDesignFormState("exterior");
    state.area = "Front Yard";
    state.style = "Modern";
    state.colorScheme = "Warm Earth";
    state.aspectRatio = "4:3";

    const body = buildDesignConfig("exterior", state, "asset-2");

    expect(body).toMatchObject({
      sourceAssetId: "asset-2",
      mediaType: "image",
      scene: "exterior",
      intent: {
        mode: "redesign",
        area: "Front Yard",
        style: "Modern",
        colorScheme: "Warm Earth",
      },
      options: { aspect_ratio: "4:3", num_outputs: 1 },
    });
  });

  it("uses editInstruction for Local Edit mode", () => {
    const state = initialDesignFormState("interior");
    state.mode = "edit";
    state.editInstruction = "replace the rug with oak flooring";

    const body = buildDesignConfig("interior", state, "asset-1");
    const intent = body.intent as Record<string, unknown>;

    expect(intent.mode).toBe("edit");
    expect(intent.editInstruction).toBe("replace the rug with oak flooring");
    expect(intent).not.toHaveProperty("roomType");
    expect(intent).not.toHaveProperty("style");
  });

  it("includes maskDataUrl in edit mode payload when provided", () => {
    const state = initialDesignFormState("interior");
    state.mode = "edit";
    state.editInstruction = "change sofa color";
    state.maskDataUrl = "data:image/png;base64,mask123";

    const body = buildDesignConfig("interior", state, "asset-1");
    expect(body.maskDataUrl).toBe("data:image/png;base64,mask123");
  });

  it("falls back editInstruction to requirements when instruction is empty", () => {
    const state = initialDesignFormState("interior");
    state.mode = "edit";
    state.requirements = "brighten the ceiling";

    const body = buildDesignConfig("interior", state, "asset-1");
    const intent = body.intent as Record<string, unknown>;

    expect(intent.editInstruction).toBe("brighten the ceiling");
  });

  it("prefers custom values over preset values in the payload", () => {
    const state = initialDesignFormState("interior");
    state.roomType = "Living Room";
    state.customRoomType = "reading nook";
    state.style = "Modern";
    state.customStyle = "wabi-sabi";
    state.colorScheme = "Neutral";
    state.customColorScheme = "muted greens";

    const body = buildDesignConfig("interior", state, "asset-1");
    const intent = body.intent as Record<string, unknown>;

    expect(intent.customRoomType).toBe("reading nook");
    expect(intent.customStyle).toBe("wabi-sabi");
    expect(intent.customColorScheme).toBe("muted greens");
  });

  it("truncates requirements to 300 chars", () => {
    const state = initialDesignFormState("interior");
    state.requirements = "x".repeat(400);

    const body = buildDesignConfig("interior", state, "asset-1");
    const intent = body.intent as Record<string, unknown>;

    expect((intent.requirements as string).length).toBeLessThanOrEqual(300);
  });

  it("applies a preset and forces mode to redesign", () => {
    const state = initialDesignFormState("interior");
    state.mode = "edit";

    const next = applyPreset(state, {
      style: "Scandinavian",
      colorScheme: "Warm",
      aspectRatio: "4:3",
      requirements: "soft textiles",
    });

    expect(next.mode).toBe("redesign");
    expect(next.style).toBe("Scandinavian");
    expect(next.colorScheme).toBe("Warm");
    expect(next.aspectRatio).toBe("4:3");
    expect(next.requirements).toBe("soft textiles");
  });

  it("ignores unsupported aspect ratios in presets", () => {
    const state = initialDesignFormState("interior");
    const next = applyPreset(state, { aspectRatio: "21:9" });

    expect(next.aspectRatio).toBe("1:1");
  });

  it("parses interior preset query params", () => {
    const params = new URLSearchParams(
      "style=Modern&roomType=Kitchen&colorScheme=Warm&aspectRatio=16:9&requirements=more%20light"
    );
    const preset = parseDesignSearchParams(params, "interior");

    expect(preset).toEqual({
      style: "Modern",
      roomType: "Kitchen",
      colorScheme: "Warm",
      aspectRatio: "16:9",
      requirements: "more light",
    });
  });

  it("parses exterior preset query params", () => {
    const params = new URLSearchParams(
      "area=Front%20Porch&style=Modern&colorScheme=Modern%20Dark&aspectRatio=4:3"
    );
    const preset = parseDesignSearchParams(params, "exterior");

    expect(preset).toEqual({
      area: "Front Porch",
      style: "Modern",
      colorScheme: "Modern Dark",
      aspectRatio: "4:3",
    });
  });

  it("builds the exact virtual-staging API body with stagingPreset (Ticket 3.3)", () => {
    const state = initialDesignFormState("interior");
    state.mode = "virtual-staging";
    state.stagingPreset = "living-room-luxury";
    state.roomType = "Living Room";
    state.style = "Modern Warm";
    state.colorScheme = "Warm";
    state.aspectRatio = "16:9";

    const body = buildDesignConfig("interior", state, "asset-staging-1");
    const picked = pickInteriorConfig(body);

    expect(picked).toMatchObject({
      sourceAssetId: "asset-staging-1",
      mediaType: "image",
      scene: "interior",
      intent: {
        mode: "virtual-staging",
        stagingPreset: "living-room-luxury",
        roomType: "Living Room",
        style: "Modern Warm",
        colorScheme: "Warm",
      },
      options: { aspect_ratio: "16:9", num_outputs: 1 },
    });
  });

  it("applies virtual-staging preset while preserving target mode and stagingPreset", () => {
    const state = initialDesignFormState("interior");
    const next = applyPreset(state, {
      mode: "virtual-staging",
      stagingPreset: "modern-bedroom",
      roomType: "Bedroom",
      style: "Scandinavian",
      colorScheme: "Neutral",
      aspectRatio: "4:3",
    });

    expect(next.mode).toBe("virtual-staging");
    expect(next.stagingPreset).toBe("modern-bedroom");
    expect(next.roomType).toBe("Bedroom");
    expect(next.style).toBe("Scandinavian");
    expect(next.colorScheme).toBe("Neutral");
    expect(next.aspectRatio).toBe("4:3");
  });

  it("parses virtual staging mode and stagingPreset from search params", () => {
    const params = new URLSearchParams(
      "mode=virtual-staging&stagingPreset=executive-office&roomType=Home+Office&style=Industrial+Loft"
    );
    const preset = parseDesignSearchParams(params, "interior");

    expect(preset).toMatchObject({
      mode: "virtual-staging",
      stagingPreset: "executive-office",
      roomType: "Home Office",
      style: "Industrial Loft",
    });
  });
});

