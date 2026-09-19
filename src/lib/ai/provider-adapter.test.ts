// Ticket 07 — provider adapter seam unit tests (AC4).
//
// The lifecycle only ever talks to `ProviderAdapter`; #15 registers a real
// implementation without touching credits, validation or the lifecycle. These
// tests pin the interface contract and the registry fallback behavior.
import { describe, expect, it, beforeEach } from "vitest";
import { fixturePngBytes } from "@/lib/ai/fake-provider";
import { GeminiFlashImageAdapter } from "@/lib/ai/gemini-adapter";
import {
  FakeBadOutputProviderAdapter,
  FakeProviderAdapter,
  RealProviderAdapter,
  getProvider,
  registerProvider,
  resetProviders,
  type ProviderAdapter,
} from "@/lib/ai/provider-adapter";
import { MAGIC } from "@/lib/fixtures/images";
import type { ProviderRequest } from "@/lib/ai/types";

const REQ: ProviderRequest = {
  taskId: "task-1",
  mediaType: "image",
  scene: "image-to-image",
  provider: "fake",
  model: "gemini-2.5-flash-image",
  prompt: "Redesign this living room in a modern direction.",
  options: { image_input: ["private:ready/asset-1"] },
};

beforeEach(() => {
  resetProviders();
});

describe("fake provider adapter (AC4)", () => {
  it("implements the adapter interface: submit accepts, fetchOutput yields bytes", async () => {
    const adapter: ProviderAdapter = new FakeProviderAdapter();
    expect(adapter.name).toBe("fake");

    const accepted = await adapter.submit(REQ);
    expect(accepted.ok).toBe(true);
    if (!accepted.ok) return;
    expect(accepted.providerTaskId).toBe("fake-task-1");

    const output = await adapter.fetchOutput(REQ, accepted.providerTaskId);
    expect(output).not.toBeNull();
    expect(output!.contentType).toBe("image/png");
    expect(Array.from(output!.bytes.slice(0, 8))).toEqual(Array.from(MAGIC.PNG));
    expect(output!.bytes.length).toBe(fixturePngBytes().length);
  });

  it("the adapter never decides success — output is only bytes + content type", async () => {
    const output = await new FakeProviderAdapter().fetchOutput(REQ, "fake-task-1");
    expect(Object.keys(output!).sort()).toEqual(["bytes", "contentType"]);
  });

  it("FAIL:<REASON> in the built prompt makes submit fail closed (no bytes)", async () => {
    const adapter = new FakeProviderAdapter();
    const req = { ...REQ, prompt: "Redesign.\nCustom requirements: FAIL:PROVIDER_DOWN" };
    const result = await adapter.submit(req);
    expect(result).toEqual({ ok: false, error: "PROVIDER_DOWN", retryable: false });
    await expect(adapter.fetchOutput(req, "fake-task-1")).rejects.toThrow("PROVIDER_DOWN");
  });

  it("bad-output variant emits bytes with an unrecognized header (validator rejects them)", async () => {
    const output = await new FakeBadOutputProviderAdapter().fetchOutput(REQ, "fake-task-1");
    expect(output).not.toBeNull();
    expect(Array.from(output!.bytes.slice(0, 8))).not.toEqual(Array.from(MAGIC.PNG));
  });
});

describe("real provider stub fails closed", () => {
  it("submit is rejected and fetchOutput throws PROVIDER_NOT_CONFIGURED", async () => {
    const adapter = new RealProviderAdapter("gemini");
    expect(adapter.name).toBe("gemini");
    expect(await adapter.submit()).toEqual({
      ok: false,
      error: "PROVIDER_NOT_CONFIGURED",
      retryable: false,
    });
    await expect(adapter.fetchOutput()).rejects.toThrow("PROVIDER_NOT_CONFIGURED");
  });
});

describe("provider registry & selection policy matrix (Ticket #33)", () => {
  it("resolves registered adapters by name", () => {
    expect(getProvider("fake").name).toBe("fake");
    expect(getProvider("gemini").name).toBe("gemini");
  });

  describe("offline environment selection (local, dev, preview, staging)", () => {
    it.each(["local", "development", "preview", "staging"])("%s with no key selects FakeProvider for fake/default", (envName) => {
      const provider = getProvider("fake", envName);
      expect(provider.name).toBe("fake");
      expect(provider).toBeInstanceOf(FakeProviderAdapter);
    });

    it.each(["local", "development", "preview", "staging"])("%s with no key fails closed for explicit gemini", async (envName) => {
      const provider = getProvider("gemini", envName);
      expect(provider.name).toBe("gemini");
      expect(provider).toBeInstanceOf(RealProviderAdapter);
      const res = await provider.submit(REQ);
      expect(res).toEqual({ ok: false, error: "PROVIDER_NOT_CONFIGURED", retryable: false });
    });
    it.each(["", "   ", "fake", "test", "offline", "mock"])("treats key marker '%s' as unconfigured offline", async (marker) => {
      const fakeP = getProvider("fake", { ENVIRONMENT: "preview", AI_API_KEY: marker });
      expect(fakeP).toBeInstanceOf(FakeProviderAdapter);

      const geminiP = getProvider("gemini", { ENVIRONMENT: "preview", AI_API_KEY: marker });
      expect(geminiP).toBeInstanceOf(RealProviderAdapter);
      expect(await geminiP.submit(REQ)).toEqual({ ok: false, error: "PROVIDER_NOT_CONFIGURED", retryable: false });
    });

    it("AI_OFFLINE='1' forces unconfigured behavior even if a key is present", async () => {
      const geminiP = getProvider("gemini", {
        ENVIRONMENT: "development",
        AI_API_KEY: "test-live-key",
        AI_OFFLINE: "1",
      });
      expect(geminiP).toBeInstanceOf(RealProviderAdapter);
      expect(await geminiP.submit(REQ)).toEqual({ ok: false, error: "PROVIDER_NOT_CONFIGURED", retryable: false });
    });

    it("live key in non-prod selects GeminiFlashImageAdapter for gemini", () => {
      const provider = getProvider("gemini", {
        ENVIRONMENT: "preview",
        AI_API_KEY: "test-live-key",
        AI_API_BASE_URL: "https://pro.autommo.online/v1",
      });
      expect(provider.name).toBe("gemini");
      expect(provider).toBeInstanceOf(GeminiFlashImageAdapter);
    });

    it("unknown provider falls back to fake in non-prod", () => {
      expect(getProvider("who-dis", "local").name).toBe("fake");
      expect(getProvider("who-dis", "preview").name).toBe("fake");
    });
  });

  describe("production fail-closed policy", () => {
    it("production strictly bans FakeProvider (fails closed)", async () => {
      const provider = getProvider("fake", "production");
      expect(provider).toBeInstanceOf(RealProviderAdapter);
      const res = await provider.submit(REQ);
      expect(res).toEqual({ ok: false, error: "PROVIDER_NOT_CONFIGURED", retryable: false });
    });

    it("production with missing/empty key fails closed for gemini", async () => {
      const provider = getProvider("gemini", "production");
      expect(provider).toBeInstanceOf(RealProviderAdapter);
      const res = await provider.submit(REQ);
      expect(res).toEqual({ ok: false, error: "PROVIDER_NOT_CONFIGURED", retryable: false });
    });

    it("production with live key selects GeminiFlashImageAdapter", () => {
      const provider = getProvider("gemini", {
        ENVIRONMENT: "production",
        AI_API_KEY: "test-live-key",
      });
      expect(provider.name).toBe("gemini");
      expect(provider).toBeInstanceOf(GeminiFlashImageAdapter);
    });

    it("production with live key still forbids fake provider", async () => {
      const provider = getProvider("fake", {
        ENVIRONMENT: "production",
        AI_API_KEY: "test-live-key",
      });
      expect(provider).toBeInstanceOf(RealProviderAdapter);
      expect(await provider.submit(REQ)).toEqual({ ok: false, error: "PROVIDER_NOT_CONFIGURED", retryable: false });
    });

    it("unknown provider in production fails closed", () => {
      expect(getProvider("who-dis", "production")).toBeInstanceOf(RealProviderAdapter);
    });
  });

  describe("Public Demo provider resolution & fail-closed policy (ADR 0008, Issue #72)", () => {
    it("demo strictly bans FakeProvider (fails closed)", async () => {
      const provider = getProvider("fake", "demo");
      expect(provider).toBeInstanceOf(RealProviderAdapter);
      const res = await provider.submit(REQ);
      expect(res).toEqual({ ok: false, error: "PROVIDER_NOT_CONFIGURED", retryable: false });
    });

    it("demo with live key still strictly bans FakeProvider", async () => {
      const provider = getProvider("fake", {
        ENVIRONMENT: "demo",
        AI_API_KEY: "test-live-key",
      });
      expect(provider).toBeInstanceOf(RealProviderAdapter);
      expect(await provider.submit(REQ)).toEqual({ ok: false, error: "PROVIDER_NOT_CONFIGURED", retryable: false });
    });

    it("demo with missing/empty key fails closed for gemini", async () => {
      const provider = getProvider("gemini", "demo");
      expect(provider).toBeInstanceOf(RealProviderAdapter);
      const res = await provider.submit(REQ);
      expect(res).toEqual({ ok: false, error: "PROVIDER_NOT_CONFIGURED", retryable: false });
    });

    it("demo with offline marker fails closed for gemini", async () => {
      const offlineMarker = "offline";
      const provider = getProvider("gemini", {
        ENVIRONMENT: "demo",
        AI_API_KEY: offlineMarker,
      });
      expect(provider).toBeInstanceOf(RealProviderAdapter);
      expect(await provider.submit(REQ)).toEqual({ ok: false, error: "PROVIDER_NOT_CONFIGURED", retryable: false });
    });

    it("demo with live key selects GeminiFlashImageAdapter for gemini", () => {
      const provider = getProvider("gemini", {
        ENVIRONMENT: "demo",
        AI_API_KEY: "test-live-key",
      });
      expect(provider.name).toBe("gemini");
      expect(provider).toBeInstanceOf(GeminiFlashImageAdapter);
    });

    it("demo with live key resolves omitted/default provider to GeminiFlashImageAdapter", () => {
      const defaultP = getProvider("default", {
        ENVIRONMENT: "demo",
        AI_API_KEY: "test-live-key",
      });
      expect(defaultP.name).toBe("gemini");
      expect(defaultP).toBeInstanceOf(GeminiFlashImageAdapter);

      const emptyP = getProvider("", {
        ENVIRONMENT: "demo",
        AI_API_KEY: "test-live-key",
      });
      expect(emptyP.name).toBe("gemini");
      expect(emptyP).toBeInstanceOf(GeminiFlashImageAdapter);
    });

    it("unknown provider in demo fails closed", () => {
      expect(getProvider("who-dis", "demo")).toBeInstanceOf(RealProviderAdapter);
    });
  });

  it("registerProvider adds a custom adapter; resetProviders restores the defaults", () => {
    const stub: ProviderAdapter = {
      name: "stub",
      async submit() {
        return { ok: true, providerTaskId: "stub-1" };
      },
      async fetchOutput() {
        return null;
      },
      async healthCheck() {
        return { status: "healthy", latencyMs: 0, models: [], endpoint: "" };
      },
    };
    registerProvider(stub);
    expect(getProvider("stub")).toBe(stub);
    resetProviders();
    expect(getProvider("stub").name).toBe("fake");
  });
});
