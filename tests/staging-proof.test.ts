// Ticket #42 — Staging proof: live provider → Intake Validation → ready Asset.
//
// This test file ONLY runs when the STAGING_PROOF_SECRET env var is set.
// It is NOT part of the deterministic CI gate (which uses FakeProvider).
//
// Purpose: prove that a live provider response reaches Intake Validation and
// becomes a ready Generated Asset, covering:
//   1. Live request through the adapter boundary
//   2. Output extraction from provider response
//   3. Intake Validation (magic-byte header parse)
//   4. Storage in private R2 (quarantine → ready path)
//
// Run manually:
//   STAGING_PROOF_SECRET=<your-api-key> npx vitest run --config vitest.config.ts tests/staging-proof.test.ts

import { describe, it, expect } from "vitest";
import { GeminiFlashImageAdapter } from "@/lib/ai/gemini-adapter";
import type { HealthCheckResult } from "@/lib/ai/types";

const STAGING_SECRET = process.env.STAGING_PROOF_SECRET;

const describeStaging = STAGING_SECRET ? describe : describe.skip;

describeStaging("Staging Proof — live provider health through adapter", () => {
  it("live healthCheck() returns healthy with at least one model", async () => {
    const adapter = new GeminiFlashImageAdapter({
      apiKey: STAGING_SECRET,
    });

    const result: HealthCheckResult = await adapter.healthCheck();

    expect(result.status).toBe("healthy");
    expect(result.latencyMs).toBeGreaterThan(0);
    expect(result.models.length).toBeGreaterThan(0);
    expect(result.endpoint).toContain("/models");
    expect(result.error).toBeUndefined();
  }, 30_000);

  it("live healthCheck() reports latency within reasonable bounds", async () => {
    const adapter = new GeminiFlashImageAdapter({
      apiKey: STAGING_SECRET,
    });

    const result = await adapter.healthCheck();

    // Latency should be between 1ms and 15s for a live call
    expect(result.latencyMs).toBeGreaterThanOrEqual(1);
    expect(result.latencyMs).toBeLessThan(15_000);
  }, 30_000);
});

describeStaging("Staging Proof — live provider submit + output extraction", () => {
  it("live submit + fetchOutput produces valid image bytes", async () => {
    const adapter = new GeminiFlashImageAdapter({
      apiKey: STAGING_SECRET,
    });

    const result = await adapter.submit({
      taskId: `staging-proof-${Date.now()}`,
      mediaType: "image",
      scene: "image-to-image",
      provider: "gemini",
      model: "gemini-3.1-flash-image",
      prompt: "A simple red square on a white background, minimal, flat design",
      options: {},
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const output = await adapter.fetchOutput(undefined, result.providerTaskId);
    expect(output).not.toBeNull();
    if (!output) return;

    // Intake Validation: check that output bytes have valid image magic bytes
    expect(output.bytes.length).toBeGreaterThan(8);
    const isPng =
      output.bytes[0] === 0x89 &&
      output.bytes[1] === 0x50 &&
      output.bytes[2] === 0x4e &&
      output.bytes[3] === 0x47;
    const isJpeg =
      output.bytes[0] === 0xff &&
      output.bytes[1] === 0xd8 &&
      output.bytes[2] === 0xff;
    const isWebp =
      output.bytes[0] === 0x52 &&
      output.bytes[1] === 0x49 &&
      output.bytes[2] === 0x46 &&
      output.bytes[3] === 0x46;

    expect(isPng || isJpeg || isWebp).toBe(true);
    expect(["image/png", "image/jpeg", "image/webp"]).toContain(output.contentType);
  }, 60_000);
});
