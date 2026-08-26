// Ticket 07 — provider adapter seam unit tests (AC4).
//
// The lifecycle only ever talks to `ProviderAdapter`; #15 registers a real
// implementation without touching credits, validation or the lifecycle. These
// tests pin the interface contract and the registry fallback behavior.
import { describe, expect, it, beforeEach } from "vitest";
import { fixturePngBytes } from "@/lib/ai/fake-provider";
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

describe("provider registry", () => {
  it("resolves registered adapters by name", () => {
    expect(getProvider("fake").name).toBe("fake");
    expect(getProvider("gemini").name).toBe("gemini");
  });

  it("unknown provider falls back to fake outside production, real stub in production", () => {
    expect(getProvider("who-dis", "local").name).toBe("fake");
    expect(getProvider("who-dis", "preview").name).toBe("fake");
    expect(getProvider("who-dis", "production")).toBeInstanceOf(RealProviderAdapter);
  });

  it("registerProvider adds an adapter; resetProviders restores the defaults", () => {
    const stub: ProviderAdapter = {
      name: "stub",
      async submit() {
        return { ok: true, providerTaskId: "stub-1" };
      },
      async fetchOutput() {
        return null;
      },
    };
    registerProvider(stub);
    expect(getProvider("stub")).toBe(stub);
    resetProviders();
    expect(getProvider("stub").name).toBe("fake");
  });
});
