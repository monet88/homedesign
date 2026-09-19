import { describe, it, expect, vi } from "vitest";
import { FalFluxAdapter } from "./fal-adapter";
import type { ProviderRequest } from "./types";

function mockReq(partial: Partial<ProviderRequest> & { prompt: string }): ProviderRequest {
  return {
    taskId: partial.taskId ?? "task-1",
    scene: partial.scene ?? "image-to-image",
    mediaType: "image",
    provider: "fal",
    model: "fal-ai/flux/schnell",
    prompt: partial.prompt,
    options: partial.options ?? {},
  };
}

describe("FalFluxAdapter (Sprint 9 - Ticket 9.2)", () => {
  it("fails submit if FAL_AI_API key is missing", async () => {
    const adapter = new FalFluxAdapter({ apiKey: "" });
    const res = await adapter.submit(
      mockReq({ prompt: "Luxury Living Room Scandinavian" })
    );

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBe("FAL_AI_API_KEY_MISSING");
    }
  });

  it("handles prompt failure markers gracefully", async () => {
    const adapter = new FalFluxAdapter({ apiKey: "test-fake-key" });
    const res = await adapter.submit(
      mockReq({ prompt: "FAIL:SIMULATED_PROVIDER_ERROR" })
    );

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBe("SIMULATED_PROVIDER_ERROR");
    }
  });

  it("submits task and fetches generated output bytes successfully", async () => {
    const fakeImageBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]); // PNG magic bytes
    const fakeFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("fal.run")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              images: [
                {
                  url: "https://fal.media/files/monkey/sample.png",
                  content_type: "image/png",
                },
              ],
            }),
        });
      }
      if (url.includes("fal.media")) {
        return Promise.resolve({
          ok: true,
          arrayBuffer: () => Promise.resolve(fakeImageBytes.buffer),
        });
      }
      return Promise.reject(new Error("Unknown URL"));
    });

    const adapter = new FalFluxAdapter({
      apiKey: "test-fal-key",
      fetchFn: fakeFetch as unknown as typeof fetch,
    });

    const submitRes = await adapter.submit(
      mockReq({
        taskId: "task-123",
        prompt: "Modern Master Bedroom with oak wooden paneling",
      })
    );

    expect(submitRes.ok).toBe(true);
    if (submitRes.ok) {
      expect(submitRes.providerTaskId).toBe("fal-task-123");
    }

    const output = await adapter.fetchOutput(
      mockReq({
        taskId: "task-123",
        prompt: "Modern Master Bedroom with oak wooden paneling",
      })
    );

    expect(output).not.toBeNull();
    expect(output?.bytes).toEqual(fakeImageBytes);
    expect(output?.contentType).toBe("image/png");
    expect(fakeFetch).toHaveBeenCalledTimes(2);
  });

  it("does not pass adapter instance as this context to fetchFn (prevents Illegal invocation)", async () => {
    function strictThisFetch(this: unknown, url: string | URL | Request) {
      if (this !== undefined && this !== globalThis) {
        throw new TypeError("Illegal invocation: function called with incorrect this reference");
      }
      if (String(url).includes("fal.run")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              images: [{ url: "https://fal.media/sample.png", content_type: "image/png" }],
            })
          )
        );
      }
      return Promise.resolve(new Response(new Uint8Array([1, 2, 3])));
    }

    const adapter = new FalFluxAdapter({
      apiKey: "test-fal-key",
      fetchFn: strictThisFetch as unknown as typeof fetch,
    });

    const output = await adapter.fetchOutput(mockReq({ prompt: "Test room design" }));
    expect(output).not.toBeNull();
  });

  it("enforces demo daily quota when claimOutboundAttempt returns false", async () => {
    const claimFn = vi.fn().mockResolvedValue(false); // Quota reached
    const adapter = new FalFluxAdapter({
      apiKey: "test-fal-key",
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
    const adapter = new FalFluxAdapter({
      apiKey: "test-fal-key",
      claimOutboundAttempt: claimFn,
    });

    const res = await adapter.submit(mockReq({ prompt: "Modern Penthouse" }));
    expect(claimFn).toHaveBeenCalledTimes(1);
    expect(res.ok).toBe(true);
  });
});
