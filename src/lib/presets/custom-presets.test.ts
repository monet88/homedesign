import { describe, expect, it } from "vitest";
import { formatPresetPromptAdditions, type CustomPreset } from "./custom-presets";

describe("Custom Styling Presets (Ticket 8.3)", () => {
  it("formats preferred materials and custom directives into prompt additions", () => {
    const preset: CustomPreset = {
      id: "preset-1",
      userId: "user-1",
      name: "Luxury Minimalist Walnut",
      scene: "interior",
      preferredMaterials: ["An Cuong Walnut Wood", "Italian Calacatta Marble", "Brushed Brass"],
      customPromptAdditions: "Focus on warm 2700K indirect cove lighting, floor-to-ceiling clean lines, zero clutter.",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const formatted = formatPresetPromptAdditions(preset);
    expect(formatted).toContain("An Cuong Walnut Wood, Italian Calacatta Marble, Brushed Brass");
    expect(formatted).toContain("Focus on warm 2700K indirect cove lighting");
  });

  it("handles presets with only materials or only prompt additions gracefully", () => {
    const presetMaterialsOnly: CustomPreset = {
      id: "preset-2",
      userId: "user-1",
      name: "Materials Only",
      scene: "all",
      preferredMaterials: ["Teakwood", "Polished Concrete"],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const formatted = formatPresetPromptAdditions(presetMaterialsOnly);
    expect(formatted).toContain("Teakwood, Polished Concrete");
    expect(formatted).not.toContain("architectural directive");

    const presetDirectiveOnly: CustomPreset = {
      id: "preset-3",
      userId: "user-1",
      name: "Directive Only",
      scene: "exterior",
      customPromptAdditions: "Japanese Zen courtyard with moss garden and bamboo accents",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const formattedDirective = formatPresetPromptAdditions(presetDirectiveOnly);
    expect(formattedDirective).toContain("Japanese Zen courtyard with moss garden");
    expect(formattedDirective).not.toContain("Preferred materials");
  });

  it("enforces tenant boundary: rejects unauthorized user from loading private preset", async () => {
    const { getCustomPreset } = await import("./custom-presets");
    const mockEnv = {
      DB: {
        prepare: (query: string) => ({
          bind: (...args: unknown[]) => ({
            first: async () => {
              if (query.includes("SELECT * FROM custom_presets")) {
                return {
                  id: "preset-private",
                  workspace_id: null,
                  user_id: "owner-123",
                  name: "Confidential Studio Preset",
                  scene: "interior",
                  created_at: 100,
                  updated_at: 100,
                };
              }
              return null;
            },
          }),
        }),
      },
    } as any;

    await expect(
      getCustomPreset(mockEnv, "preset-private", "attacker-456")
    ).rejects.toThrow("PRESET_FORBIDDEN");
  });

  it("allows workspace member to load shared workspace preset", async () => {
    const { getCustomPreset } = await import("./custom-presets");
    const mockEnv = {
      DB: {
        prepare: (query: string) => ({
          bind: (...args: unknown[]) => ({
            first: async () => {
              if (query.includes("SELECT * FROM custom_presets")) {
                return {
                  id: "preset-ws-1",
                  workspace_id: "ws-arch",
                  user_id: "owner-123",
                  name: "Studio Shared Preset",
                  scene: "interior",
                  preferred_materials: JSON.stringify(["Oak", "Marble"]),
                  created_at: 100,
                  updated_at: 100,
                };
              }
              if (query.includes("SELECT role FROM workspace_members")) {
                return { role: "architect" };
              }
              return null;
            },
          }),
        }),
      },
    } as any;

    const preset = await getCustomPreset(mockEnv, "preset-ws-1", "colleague-789");
    expect(preset.name).toBe("Studio Shared Preset");
    expect(preset.preferredMaterials).toEqual(["Oak", "Marble"]);
  });
});

