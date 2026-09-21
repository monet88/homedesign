import { describe, it, expect, vi } from "vitest";
import { KieAdapter } from "./kie-adapter";
import type { ProviderRequest } from "./types";

function mockReq(partial: Partial<ProviderRequest> & { prompt: string }): ProviderRequest {
  return {
    taskId: partial.taskId ?? "task-kie-1",
    scene: partial.scene ?? "image-to-image",
    mediaType: "image",
    provider: "kie",
    model: "gpt-image-2",
    prompt: partial.prompt,
    options: partial.options ?? {},
  };
}

describe("KieAdapter", () => {
  it("fails submit if KIE_AI_API key is missing", async () => {
    const adapter = new KieAdapter({ apiKey: "" });
    const res = await adapter.submit(
      mockReq({ prompt: "Luxury Living Room Scandinavian" })
    );

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBe("KIE_AI_API_KEY_MISSING");
    }
  });

  it("handles prompt failure markers gracefully", async () => {
    const adapter = new KieAdapter({ apiKey: "test-fake-key" });
    const res = await adapter.submit(
      mockReq({ prompt: "FAIL:SIMULATED_PROVIDER_ERROR" })
    );

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBe("SIMULATED_PROVIDER_ERROR");
    }
  });

  it("enforces demo daily quota when claimOutboundAttempt returns false", async () => {
    const claimFn = vi.fn().mockResolvedValue(false); // Quota reached
    const adapter = new KieAdapter({
      apiKey: "test-kie-key",
      claimOutboundAttempt: claimFn,
    });

    const res = await adapter.submit(mockReq({ prompt: "Modern Penthouse" }));
    expect(claimFn).toHaveBeenCalledTimes(1);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBe("DEMO_DAILY_LIMIT_REACHED");
      expect(res.retryable).toBe(false);
    }
  });

  it("proceeds with submit when claimOutboundAttempt returns true", async () => {
    const claimFn = vi.fn().mockResolvedValue(true); // Quota allowed
    const adapter = new KieAdapter({
      apiKey: "test-kie-key",
      claimOutboundAttempt: claimFn,
    });

    const res = await adapter.submit(mockReq({ prompt: "Modern Penthouse" }));
    expect(claimFn).toHaveBeenCalledTimes(1);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.providerTaskId).toBe("kie-task-kie-1");
    }
  });

  it("submits task and fetches generated output bytes successfully", async () => {
    const fakeImageBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const fakeFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("api.kie.ai")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              data: [
                {
                  url: "https://storage.kie.ai/images/sample.png",
                },
              ],
            }),
        });
      }
      if (url.includes("storage.kie.ai")) {
        return Promise.resolve({
          ok: true,
          headers: {
            get: (h: string) => (h === "content-type" ? "image/png" : null),
          },
          arrayBuffer: () => Promise.resolve(fakeImageBytes.buffer),
        });
      }
      return Promise.reject(new Error(`Unexpected fetch URL: ${url}`));
    });

    const adapter = new KieAdapter({
      apiKey: "test-kie-key",
      fetchFn: fakeFetch as unknown as typeof fetch,
    });

    const output = await adapter.fetchOutput(
      mockReq({ prompt: "Luxury Bedroom Suite" })
    );

    expect(output).not.toBeNull();
    expect(output?.contentType).toBe("image/png");
    expect(output?.bytes).toEqual(fakeImageBytes);
  });
});
