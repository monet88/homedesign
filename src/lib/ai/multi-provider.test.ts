import { describe, expect, it, vi } from "vitest";
import { FalFluxAdapter } from "./fal-adapter";
import { ReplicateAdapter } from "./replicate-adapter";
import { KieAdapter } from "./kie-adapter";
import { SmartFailoverProviderAdapter } from "./smart-failover-adapter";
import type { ProviderAdapter, ProviderRequest } from "./types";

describe("Multi-Model AI Providers & Smart Failover", () => {
  const dummyRequest: ProviderRequest = {
    taskId: "task-test-123",
    mediaType: "image",
    scene: "image-to-image",
    provider: "default",
    model: "default",
    prompt: "Modern living room, wooden floor, large balcony",
    options: { quality: "hd" },
  };

  describe("FalFluxAdapter", () => {
    it("fails submit closed if API key is missing", async () => {
      const adapter = new FalFluxAdapter({ apiKey: "" });
      const res = await adapter.submit(dummyRequest);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toBe("FAL_AI_API_KEY_MISSING");
      }
    });

    it("submits successfully when API key is provided", async () => {
      const adapter = new FalFluxAdapter({ apiKey: "test-fal-key" });
      const res = await adapter.submit(dummyRequest);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.providerTaskId).toBe("fal-task-test-123");
      }
    });
  });

  describe("ReplicateAdapter", () => {
    it("fails submit closed if API key is missing", async () => {
      const adapter = new ReplicateAdapter({ apiKey: "" });
      const res = await adapter.submit(dummyRequest);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toBe("REPLICATE_API_KEY_MISSING");
      }
    });

    it("submits successfully when API key is provided", async () => {
      const adapter = new ReplicateAdapter({ apiKey: "test-replicate-key" });
      const res = await adapter.submit(dummyRequest);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.providerTaskId).toBe("replicate-task-test-123");
      }
    });
  });

  describe("KieAdapter", () => {
    it("fails submit closed if API key is missing", async () => {
      const adapter = new KieAdapter({ apiKey: "" });
      const res = await adapter.submit(dummyRequest);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toBe("KIE_AI_API_KEY_MISSING");
      }
    });

    it("decodes base64 payload properly on fetchOutput", async () => {
      const b64Data = btoa("mock-image-bytes-from-kie");
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [{ b64_json: b64Data }],
        }),
      });

      const adapter = new KieAdapter({ apiKey: "test-kie-key", fetchFn: mockFetch as any });
      const output = await adapter.fetchOutput(dummyRequest, "kie-task-123");
      expect(output).not.toBeNull();
      expect(output?.contentType).toBe("image/png");
      expect(output?.bytes.length).toBeGreaterThan(0);
    });
  });

  describe("SmartFailoverProviderAdapter", () => {
    it("fails over to second tier if primary fetchOutput throws", async () => {
      const failingPrimary: ProviderAdapter = {
        name: "primary-fal",
        submit: async () => ({ ok: true, providerTaskId: "p-1" }),
        fetchOutput: async () => {
          throw new Error("FAL_API_TIMEOUT");
        },
        healthCheck: async () => ({
          status: "unhealthy",
          latencyMs: 0,
          models: ["flux"],
          endpoint: "primary-fal",
        }),
      };

      const mockSuccessBytes = new Uint8Array([1, 2, 3, 4]);
      const workingFallback: ProviderAdapter = {
        name: "fallback-gemini",
        submit: async () => ({ ok: true, providerTaskId: "f-1" }),
        fetchOutput: async () => ({
          bytes: mockSuccessBytes,
          contentType: "image/jpeg",
        }),
        healthCheck: async () => ({
          status: "healthy",
          latencyMs: 10,
          models: ["gemini"],
          endpoint: "fallback-gemini",
        }),
      };

      const failover = new SmartFailoverProviderAdapter([failingPrimary, workingFallback]);
      const submitRes = await failover.submit(dummyRequest);
      expect(submitRes.ok).toBe(true);

      const taskId = submitRes.ok ? submitRes.providerTaskId : undefined;
      // fetchOutput should catch the error on primary and transparently resolve via fallback
      const output = await failover.fetchOutput(dummyRequest, taskId);
      expect(output).not.toBeNull();
      expect(output?.bytes).toEqual(mockSuccessBytes);
    });

    it("blocks failover if fallback provider quota is exhausted", async () => {
      const failingPrimary: ProviderAdapter = {
        name: "primary-fal",
        submit: async () => ({ ok: true, providerTaskId: "p-1" }),
        fetchOutput: async () => {
          throw new Error("FAL_TIMEOUT");
        },
        healthCheck: async () => ({ status: "unhealthy", latencyMs: 0, models: [], endpoint: "" }),
      };

      const fallbackFetchOutput = vi.fn().mockResolvedValue({ bytes: new Uint8Array([1]), contentType: "image/png" });
      const exhaustedFallback: ProviderAdapter = {
        name: "fallback-replicate",
        submit: vi.fn().mockResolvedValue({ ok: false, error: "DEMO_DAILY_LIMIT_REACHED", retryable: false }),
        fetchOutput: fallbackFetchOutput,
        healthCheck: async () => ({ status: "healthy", latencyMs: 0, models: [], endpoint: "" }),
      };

      const failover = new SmartFailoverProviderAdapter([failingPrimary, exhaustedFallback]);
      const submitRes = await failover.submit(dummyRequest);
      expect(submitRes.ok).toBe(true);

      const taskId = submitRes.ok ? submitRes.providerTaskId : undefined;
      // Should reject because fallback quota limit was reached, preventing unmetered outbound call
      await expect(failover.fetchOutput(dummyRequest, taskId)).rejects.toThrow();
      expect(exhaustedFallback.submit).toHaveBeenCalledTimes(1);
      expect(fallbackFetchOutput).not.toHaveBeenCalled();
    });

    it("enforces double-lock quota in FalFluxAdapter.fetchOutput when called without submit", async () => {
      const claimFn = vi.fn().mockResolvedValue(false);
      const adapter = new FalFluxAdapter({
        apiKey: "test-fal-key",
        claimOutboundAttempt: claimFn,
      });

      await expect(adapter.fetchOutput(dummyRequest)).rejects.toThrow("DEMO_DAILY_LIMIT_REACHED");
      expect(claimFn).toHaveBeenCalledTimes(1);
    });

    it("enforces double-lock quota in ReplicateAdapter.fetchOutput when called without submit", async () => {
      const claimFn = vi.fn().mockResolvedValue(false);
      const adapter = new ReplicateAdapter({
        apiKey: "test-replicate-key",
        claimOutboundAttempt: claimFn,
      });

      await expect(adapter.fetchOutput(dummyRequest)).rejects.toThrow("DEMO_DAILY_LIMIT_REACHED");
      expect(claimFn).toHaveBeenCalledTimes(1);
    });

    it("enforces double-lock quota in KieAdapter.fetchOutput when called without submit", async () => {
      const claimFn = vi.fn().mockResolvedValue(false);
      const adapter = new KieAdapter({
        apiKey: "test-kie-key",
        claimOutboundAttempt: claimFn,
      });

      await expect(adapter.fetchOutput(dummyRequest)).rejects.toThrow("DEMO_DAILY_LIMIT_REACHED");
      expect(claimFn).toHaveBeenCalledTimes(1);
    });
  });
});
