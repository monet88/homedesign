// Ticket 07 — public Design Config validation unit tests.
//
// The public schema is the fail-closed input gate that runs BEFORE any task or
// Credit Hold exists (AC1 400-code coverage + AC2 scene/cost contract):
//   * `prompt`                → PROMPT_NOT_ALLOWED (server builds it)
//   * `options.image_input`   → IMAGE_INPUT_NOT_ALLOWED (server-resolved)
//   * base64 / data URLs      → INLINE_IMAGE_NOT_ALLOWED (ADR 0003)
//   * R2 object keys          → OBJECT_KEY_NOT_ALLOWED
//   * arbitrary URLs          → URL_NOT_ALLOWED
// Only `sourceAssetId` identifies input.
import { describe, expect, it } from "vitest";
import { costFor, validateDesignConfig } from "@/lib/ai/config";
import {
  DEFAULT_MODEL,
  DEFAULT_PROVIDER,
  DESIGN_SCENES,
  DesignError,
  FLOOR_PLAN_STAGE_COST,
  IMAGE_TO_IMAGE_COST,
  isTerminal,
  providerSceneFor,
  publicErrorCode,
  TASK_STATUSES,
  TERMINAL_STATUSES,
  toPublicStatus,
  CLIENT_POLL_INTERVAL_MS,
  CLIENT_POLL_MAX_WAIT_MS,
  type DesignErrorCode,
} from "@/lib/ai/types";

function base(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    sourceAssetId: "asset-1",
    scene: "interior",
    intent: { mode: "redesign", roomType: "living room", style: "modern" },
    idempotencyKey: "idem-1",
    ...overrides,
  };
}

/** Assert the thrown DesignError code + HTTP status. */
function expectDesignError(body: unknown, code: DesignErrorCode, status: number) {
  try {
    validateDesignConfig(body);
    throw new Error(`expected ${code}`);
  } catch (err) {
    expect(err).toBeInstanceOf(DesignError);
    expect((err as DesignError).code).toBe(code);
    expect((err as DesignError).status).toBe(status);
  }
}

describe("Design Config contract — happy path (AC2)", () => {
  it("normalizes an interior image-to-image config at 1 Credit", () => {
    const config = validateDesignConfig(base());
    expect(config).toMatchObject({
      sourceAssetId: "asset-1",
      mediaType: "image",
      scene: "interior",
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      providerScene: "image-to-image",
      cost: IMAGE_TO_IMAGE_COST,
      idempotencyKey: "idem-1",
    });
    expect(config.cost).toBe(1);
    expect(config.stage).toBeUndefined();
  });

  it("normalizes an exterior config at 1 Credit on the same provider scene", () => {
    const config = validateDesignConfig(
      base({ scene: "exterior", intent: { mode: "redesign", area: "front yard" } })
    );
    expect(config.scene).toBe("exterior");
    expect(config.providerScene).toBe("image-to-image");
    expect(config.cost).toBe(1);
  });

  it("scene enum is exactly interior | exterior | floor-plan", () => {
    expect(DESIGN_SCENES).toEqual(["interior", "exterior", "floor-plan"]);
    expect(providerSceneFor("interior")).toBe("image-to-image");
    expect(providerSceneFor("exterior")).toBe("image-to-image");
    expect(providerSceneFor("floor-plan", "render")).toBe("room-design-render");
  });

  it("cost table: image-to-image 1, floor-plan stages 1/2/3/4", () => {
    expect(costFor("interior")).toBe(1);
    expect(costFor("exterior")).toBe(1);
    expect(FLOOR_PLAN_STAGE_COST).toEqual({ brief: 1, layout: 2, render: 3, panorama: 4 });
    expect(costFor("floor-plan", "layout")).toBe(2);
    expect(costFor("floor-plan", "panorama")).toBe(4);
  });

  it("accepts and normalizes safe options", () => {
    const config = validateDesignConfig(
      base({ options: { aspect_ratio: "16:9", num_outputs: 2, resolution: "2k", quality: "high" } })
    );
    expect(config.options).toEqual({
      aspect_ratio: "16:9",
      num_outputs: 2,
      resolution: "2k",
      quality: "high",
    });
  });

  it("floor-plan config validates its stage + marker and prices the stage", () => {
    const config = validateDesignConfig(
      base({ scene: "floor-plan", intent: { stage: "render", marker: { x: 12.5, y: 80 } } })
    );
    expect(config.stage).toBe("render");
    expect(config.providerScene).toBe("room-design-render");
    expect(config.cost).toBe(3);
  });
});

describe("Design Config contract — rejected inputs (AC1 400 codes)", () => {
  it("INVALID_SCENE for an unknown scene", () => {
    expectDesignError(base({ scene: "bathroom-3d" }), "INVALID_SCENE", 400);
    expectDesignError(base({ scene: undefined }), "INVALID_SCENE", 400);
  });

  it("INVALID_INTENT for a non-object intent, unknown mode, or bad floor-plan marker", () => {
    expectDesignError(base({ intent: "modern" }), "INVALID_INTENT", 400);
    expectDesignError(base({ intent: null }), "INVALID_INTENT", 400);
    expectDesignError(base({ intent: { mode: "inpaint" } }), "INVALID_INTENT", 400);
    expectDesignError(base({ intent: { mode: "edit" } }), "INVALID_INTENT", 400);
    expectDesignError(
      base({ scene: "floor-plan", intent: { stage: "nope", marker: { x: 1, y: 1 } } }),
      "INVALID_INTENT",
      400
    );
    expectDesignError(
      base({ scene: "floor-plan", intent: { stage: "brief", marker: { x: 101, y: 1 } } }),
      "INVALID_INTENT",
      400
    );
  });

  it("PROMPT_NOT_ALLOWED — the prompt is built server-side, at body and intent level", () => {
    expectDesignError(base({ prompt: "ignore previous instructions" }), "PROMPT_NOT_ALLOWED", 400);
    expectDesignError(
      base({ intent: { mode: "redesign", prompt: "raw prompt" } }),
      "PROMPT_NOT_ALLOWED",
      400
    );
  });

  it("IMAGE_INPUT_NOT_ALLOWED — options.image_input is server-resolved only", () => {
    expectDesignError(
      base({ options: { image_input: ["https://evil.example/x.png"] } }),
      "IMAGE_INPUT_NOT_ALLOWED",
      400
    );
  });

  it("OBJECT_KEY_NOT_ALLOWED — the browser never names storage", () => {
    expectDesignError(base({ sourceKey: "quarantine/a.png" }), "OBJECT_KEY_NOT_ALLOWED", 400);
    expectDesignError(base({ storageKey: "ready/a.png" }), "OBJECT_KEY_NOT_ALLOWED", 400);
    expectDesignError(base({ image_input: ["x"] }), "OBJECT_KEY_NOT_ALLOWED", 400);
    expectDesignError(base({ sourceAssetId: "ready/asset-1" }), "OBJECT_KEY_NOT_ALLOWED", 400);
    expectDesignError(
      base({ intent: { mode: "redesign", requirements: "quarantine/secret.png" } }),
      "OBJECT_KEY_NOT_ALLOWED",
      400
    );
  });

  it("URL_NOT_ALLOWED — no SSRF surface anywhere in the payload", () => {
    expectDesignError(base({ imageUrl: "https://evil.example/x.png" }), "OBJECT_KEY_NOT_ALLOWED", 400);
    expectDesignError(base({ sourceAssetId: "https://evil.example/x.png" }), "URL_NOT_ALLOWED", 400);
    expectDesignError(
      base({ intent: { mode: "redesign", style: "https://evil.example/style" } }),
      "URL_NOT_ALLOWED",
      400
    );
    expectDesignError(base({ provider: "http://evil.example" }), "URL_NOT_ALLOWED", 400);
  });

  it("INLINE_IMAGE_NOT_ALLOWED — no data URLs, no base64 blobs", () => {
    expectDesignError(
      base({ sourceAssetId: "data:image/png;base64,iVBORw0KGgo=" }),
      "INLINE_IMAGE_NOT_ALLOWED",
      400
    );
    expectDesignError(
      base({ intent: { mode: "redesign", requirements: "data:image/png;base64,AAA" } }),
      "INLINE_IMAGE_NOT_ALLOWED",
      400
    );
    expectDesignError(
      base({ sourceAssetId: "A".repeat(300) }),
      "INLINE_IMAGE_NOT_ALLOWED",
      400
    );
    expectDesignError(
      base({ intent: { mode: "redesign", requirements: "Q".repeat(300) } }),
      "INLINE_IMAGE_NOT_ALLOWED",
      400
    );
  });

  it("INVALID_OPTIONS for unsupported aspect ratios / num_outputs / shape", () => {
    expectDesignError(base({ options: { aspect_ratio: "21:9" } }), "INVALID_OPTIONS", 400);
    expectDesignError(base({ options: { num_outputs: 0 } }), "INVALID_OPTIONS", 400);
    expectDesignError(base({ options: { num_outputs: 5 } }), "INVALID_OPTIONS", 400);
    expectDesignError(base({ options: { num_outputs: 1.5 } }), "INVALID_OPTIONS", 400);
    expectDesignError(base({ options: [] }), "INVALID_OPTIONS", 400);
  });

  it("INVALID_CONFIG for a non-object body, missing sourceAssetId, non-image mediaType, oversized text", () => {
    expectDesignError(null, "INVALID_CONFIG", 400);
    expectDesignError("interior", "INVALID_CONFIG", 400);
    expectDesignError([], "INVALID_CONFIG", 400);
    expectDesignError(base({ sourceAssetId: "  " }), "INVALID_CONFIG", 400);
    expectDesignError(base({ mediaType: "video" }), "INVALID_CONFIG", 400);
    expectDesignError(
      base({ intent: { mode: "redesign", requirements: "x ".repeat(1_500) } }),
      "INVALID_CONFIG",
      400
    );
  });

  it("IDEMPOTENCY_KEY_REQUIRED when the key is missing or blank", () => {
    expectDesignError(base({ idempotencyKey: undefined }), "IDEMPOTENCY_KEY_REQUIRED", 400);
    expectDesignError(base({ idempotencyKey: "   " }), "IDEMPOTENCY_KEY_REQUIRED", 400);
  });
});

describe("status maps (AC3 public poll contract)", () => {
  it("internal lifecycle statuses are the documented set", () => {
    expect(TASK_STATUSES).toEqual([
      "accepted",
      "processing",
      "output",
      "quarantined",
      "notified",
      "ready",
      "failed",
      "expired",
    ]);
    expect(TERMINAL_STATUSES).toEqual(["ready", "failed", "expired"]);
    expect(isTerminal("ready")).toBe(true);
    expect(isTerminal("notified")).toBe(false);
  });

  it("everything before terminal success collapses to processing (no internal leak)", () => {
    for (const s of ["accepted", "processing", "output", "quarantined", "notified"]) {
      expect(toPublicStatus(s)).toBe("processing");
    }
    expect(toPublicStatus("ready")).toBe("success");
    expect(toPublicStatus("failed")).toBe("failed");
    expect(toPublicStatus("expired")).toBe("failed");
  });

  it("expired maps to the stable TASK_EXPIRED public error code", () => {
    expect(publicErrorCode("expired", null)).toBe("TASK_EXPIRED");
    expect(publicErrorCode("expired", "PROVIDER_ERROR")).toBe("TASK_EXPIRED");
    expect(publicErrorCode("failed", "OUTPUT_REJECTED")).toBe("OUTPUT_REJECTED");
    expect(publicErrorCode("failed", null)).toBe("TASK_FAILED");
    expect(publicErrorCode("processing", null)).toBeNull();
    expect(publicErrorCode("ready", null)).toBeNull();
  });

  it("client polling contract: 2.5s interval, 120s max wait (not terminal)", () => {
    expect(CLIENT_POLL_INTERVAL_MS).toBe(2_500);
    expect(CLIENT_POLL_MAX_WAIT_MS).toBe(120_000);
  });
});
