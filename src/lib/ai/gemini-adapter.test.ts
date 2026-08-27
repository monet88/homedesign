// Ticket #21 — Cliproxy Gemini Flash Image Adapter unit & integration tests (ADR 0007).
import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  GeminiFlashImageAdapter,
  base64ToBytes,
  bytesToBase64,
  detectMimeType,
  extractDataUri,
  extractImageFromResponse,
  getChatCompletionsEndpoint,
  DEFAULT_AI_API_BASE_URL,
  DEFAULT_AI_DEFAULT_MODEL,
  FALLBACK_AI_API_KEY,
} from "@/lib/ai/gemini-adapter";
import {
  getProvider,
  registerProvider,
  resetProviders,
  type ProviderAdapter,
} from "@/lib/ai/provider-adapter";
import { MAGIC, validJpegBytes, validPngBytes } from "@/lib/fixtures/images";
import type { ProviderRequest } from "@/lib/ai/types";

const REQ: ProviderRequest = {
  taskId: "task-test-1",
  mediaType: "image",
  scene: "image-to-image",
  provider: "gemini",
  model: "gemini-3.1-flash-image",
  prompt: "Redesign this living room in a warm minimalist style.",
  options: {
    image_input: [
      "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD//2Q==",
    ],
  },
};

beforeEach(() => {
  resetProviders();
});

describe("GeminiFlashImageAdapter Helpers", () => {
  it("bytesToBase64 and base64ToBytes roundtrip properly", () => {
    const png = validPngBytes();
    const b64 = bytesToBase64(png);
    expect(typeof b64).toBe("string");
    const restored = base64ToBytes(b64);
    expect(Array.from(restored)).toEqual(Array.from(png));
  });

  it("detectMimeType identifies PNG, JPEG, and WebP magic bytes", () => {
    expect(detectMimeType(MAGIC.PNG)).toBe("image/png");
    expect(detectMimeType(MAGIC.JPEG)).toBe("image/jpeg");
    const webpHeader = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);
    expect(detectMimeType(webpHeader)).toBe("image/webp");
  });

  it("getChatCompletionsEndpoint formats various base URL shapes correctly", () => {
    expect(getChatCompletionsEndpoint("https://cliproxy.monet.uno/v1")).toBe(
      "https://cliproxy.monet.uno/v1/chat/completions"
    );
    expect(getChatCompletionsEndpoint("https://cliproxy.monet.uno/v1/")).toBe(
      "https://cliproxy.monet.uno/v1/chat/completions"
    );
    expect(getChatCompletionsEndpoint("https://cliproxy.monet.uno")).toBe(
      "https://cliproxy.monet.uno/v1/chat/completions"
    );
    expect(getChatCompletionsEndpoint("https://api.openai.com/v1/chat/completions")).toBe(
      "https://api.openai.com/v1/chat/completions"
    );
  });

  it("extractDataUri parses data URI with metadata and raw base64 strings", () => {
    const jpegB64 = bytesToBase64(validJpegBytes());
    const dataUri = `data:image/jpeg;base64,${jpegB64}`;
    const res1 = extractDataUri(dataUri);
    expect(res1.contentType).toBe("image/jpeg");
    expect(res1.bytes.length).toBe(validJpegBytes().length);

    const res2 = extractDataUri(jpegB64);
    expect(res2.contentType).toBe("image/jpeg");
    expect(res2.bytes.length).toBe(validJpegBytes().length);
  });

  it("extractImageFromResponse handles choices[0].message.images array", () => {
    const pngB64 = bytesToBase64(validPngBytes());
    const mockJson = {
      choices: [
        {
          message: {
            role: "assistant",
            images: [
              {
                image_url: {
                  url: `data:image/png;base64,${pngB64}`,
                },
              },
            ],
          },
        },
      ],
    };
    const output = extractImageFromResponse(mockJson);
    expect(output.contentType).toBe("image/png");
    expect(output.bytes.length).toBe(validPngBytes().length);
  });

  it("extractImageFromResponse handles choices[0].message.content data URI & markdown", () => {
    const pngB64 = bytesToBase64(validPngBytes());
    const mockJson1 = {
      choices: [
        {
          message: {
            role: "assistant",
            content: `data:image/png;base64,${pngB64}`,
          },
        },
      ],
    };
    const out1 = extractImageFromResponse(mockJson1);
    expect(out1.contentType).toBe("image/png");

    const mockJson2 = {
      choices: [
        {
          message: {
            role: "assistant",
            content: `Here is your render:\n\n![Interior](data:image/png;base64,${pngB64})\n\nDone!`,
          },
        },
      ],
    };
    const out2 = extractImageFromResponse(mockJson2);
    expect(out2.contentType).toBe("image/png");
  });

  it("extractImageFromResponse throws on invalid or empty responses", () => {
    expect(() => extractImageFromResponse(null)).toThrow("INVALID_PROVIDER_RESPONSE");
    expect(() => extractImageFromResponse({ choices: [] })).toThrow("NO_IMAGE_IN_PROVIDER_RESPONSE");
    expect(() =>
      extractImageFromResponse({ choices: [{ message: { content: "No image here" } }] })
    ).toThrow("NO_IMAGE_IN_PROVIDER_RESPONSE");
  });
});

describe("GeminiFlashImageAdapter Adapter Lifecycle", () => {
  it("implements ProviderAdapter with name 'gemini'", () => {
    const adapter = new GeminiFlashImageAdapter();
    expect(adapter.name).toBe("gemini");
  });

  it("dispatches multimodal chat completion payload and caches output for fetchOutput", async () => {
    const pngB64 = bytesToBase64(validPngBytes());
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: "chatcmpl-test",
        choices: [
          {
            message: {
              role: "assistant",
              images: [
                {
                  type: "image_url",
                  image_url: { url: `data:image/png;base64,${pngB64}` },
                },
              ],
            },
          },
        ],
      }),
    });

    const adapter = new GeminiFlashImageAdapter({
      baseUrl: "https://cliproxy.monet.uno/v1",
      apiKey: "sk-test-key",
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const submitRes = await adapter.submit(REQ);
    expect(submitRes.ok).toBe(true);
    if (!submitRes.ok) return;
    expect(submitRes.providerTaskId).toBe("gemini-task-test-1");

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [callUrl, callInit] = mockFetch.mock.calls[0];
    expect(callUrl).toBe("https://cliproxy.monet.uno/v1/chat/completions");
    expect(callInit.method).toBe("POST");
    expect(callInit.headers["Authorization"]).toBe("Bearer sk-test-key");
    expect(callInit.headers["Content-Type"]).toBe("application/json");

    const sentPayload = JSON.parse(callInit.body);
    expect(sentPayload.model).toBe("gemini-3.1-flash-image");
    expect(sentPayload.messages[0].role).toBe("system");
    expect(sentPayload.messages[0].content).toContain("architectural visualizer");
    expect(sentPayload.messages[1].role).toBe("user");
    expect(sentPayload.messages[1].content).toEqual([
      { type: "text", text: REQ.prompt },
      { type: "image_url", image_url: { url: REQ.options.image_input![0] } },
    ]);

    const output = await adapter.fetchOutput(REQ, submitRes.providerTaskId);
    expect(output).not.toBeNull();
    expect(output!.contentType).toBe("image/png");
    expect(Array.from(output!.bytes)).toEqual(Array.from(validPngBytes()));

    // Cache consumed
    const nextFetch = await adapter.fetchOutput(undefined, submitRes.providerTaskId);
    expect(nextFetch).toBeNull();
  });

  it("handles FAIL:<REASON> prompt marker fail-closed without network calls", async () => {
    const mockFetch = vi.fn();
    const adapter = new GeminiFlashImageAdapter({
      fetchFn: mockFetch as unknown as typeof fetch,
    });
    const req = { ...REQ, prompt: "Redesign living room FAIL:SIMULATED_PROVIDER_DOWN" };

    const submitRes = await adapter.submit(req);
    expect(submitRes).toEqual({
      ok: false,
      error: "SIMULATED_PROVIDER_DOWN",
      retryable: false,
    });
    expect(mockFetch).not.toHaveBeenCalled();

    await expect(adapter.fetchOutput(req)).rejects.toThrow("SIMULATED_PROVIDER_DOWN");
  });

  it("handles HTTP 401 and 500 errors gracefully from gateway", async () => {
    const mockFetch401 = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      text: async () => "Invalid API key",
    });

    const adapter401 = new GeminiFlashImageAdapter({
      fetchFn: mockFetch401 as unknown as typeof fetch,
    });

    const res401 = await adapter401.submit(REQ);
    expect(res401.ok).toBe(false);
    if (!res401.ok) {
      expect(res401.error).toContain("AI_PROVIDER_ERROR_401");
    }

    const mockFetch500 = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      text: async () => "Upstream timeout",
    });

    const adapter500 = new GeminiFlashImageAdapter({
      fetchFn: mockFetch500 as unknown as typeof fetch,
    });

    const res500 = await adapter500.submit(REQ);
    expect(res500.ok).toBe(false);
    if (!res500.ok) {
      expect(res500.error).toContain("AI_PROVIDER_ERROR_500");
      expect(res500.retryable).toBe(true);
    }
  });

  it("resolves HTTP image URLs to base64 data URIs before dispatch", async () => {
    const jpegBytes = validJpegBytes();
    const mockFetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url === "https://storage.example.com/source.jpg") {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "image/jpeg" }),
          arrayBuffer: async () => jpegBytes.buffer,
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                images: [{ image_url: { url: `data:image/jpeg;base64,${bytesToBase64(jpegBytes)}` } }],
              },
            },
          ],
        }),
      });
    });

    const adapter = new GeminiFlashImageAdapter({
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const reqWithUrl: ProviderRequest = {
      ...REQ,
      options: { image_input: ["https://storage.example.com/source.jpg"] },
    };

    const submitRes = await adapter.submit(reqWithUrl);
    expect(submitRes.ok).toBe(true);

    const completionCall = mockFetch.mock.calls.find((c) =>
      String(c[0]).includes("/chat/completions")
    );
    expect(completionCall).toBeDefined();
    const payload = JSON.parse(completionCall![1].body);
    const userMessage = payload.messages.find((m: { role: string }) => m.role === "user");
    expect(userMessage).toBeDefined();
    expect(userMessage.content[1].image_url.url).toContain("data:image/jpeg;base64,");
  });

  it("resolves private storage references with mock R2Bucket", async () => {
    const jpegBytes = validJpegBytes();
    const mockBucket = {
      get: vi.fn().mockResolvedValue({
        arrayBuffer: async () => jpegBytes.buffer,
        httpMetadata: { contentType: "image/jpeg" },
      }),
    } as unknown as R2Bucket;

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              images: [{ image_url: { url: `data:image/jpeg;base64,${bytesToBase64(jpegBytes)}` } }],
            },
          },
        ],
      }),
    });

    const adapter = new GeminiFlashImageAdapter({
      bucket: mockBucket,
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const reqWithPrivate: ProviderRequest = {
      ...REQ,
      options: { image_input: ["private:ready/asset-123.jpg"] },
    };

    const submitRes = await adapter.submit(reqWithPrivate);
    expect(submitRes.ok).toBe(true);
    expect(mockBucket.get).toHaveBeenCalledWith("ready/asset-123.jpg");
  });

  it("fails in production when AI_API_KEY is not configured", async () => {
    const adapter = new GeminiFlashImageAdapter({
      environment: "production",
      apiKey: "",
    });

    const submitRes = await adapter.submit(REQ);
    expect(submitRes).toEqual({
      ok: false,
      error: "AI_API_KEY_MISSING",
      retryable: false,
    });
  });

  it("supports offline fallback mode when network fails", async () => {
    const mockFetchFail = vi.fn().mockRejectedValue(new Error("ENOTFOUND"));
    const adapter = new GeminiFlashImageAdapter({
      offlineFallback: true,
      fetchFn: mockFetchFail as unknown as typeof fetch,
    });

    const submitRes = await adapter.submit(REQ);
    expect(submitRes.ok).toBe(true);
    if (!submitRes.ok) return;

    const output = await adapter.fetchOutput(REQ, submitRes.providerTaskId);
    expect(output).not.toBeNull();
    expect(output!.contentType).toBe("image/png");
    expect(Array.from(output!.bytes.slice(0, 8))).toEqual(Array.from(MAGIC.PNG));
  });

  it("supports offline fallback mode when AI_API_KEY is missing/empty", async () => {
    const adapter = new GeminiFlashImageAdapter({
      apiKey: "",
      environment: "production",
      offlineFallback: true,
    });

    const submitRes = await adapter.submit(REQ);
    expect(submitRes.ok).toBe(true);
    if (!submitRes.ok) return;

    const output = await adapter.fetchOutput(REQ, submitRes.providerTaskId);
    expect(output).not.toBeNull();
    expect(output!.contentType).toBe("image/png");
    expect(Array.from(output!.bytes.slice(0, 8))).toEqual(Array.from(MAGIC.PNG));
  });
});

describe("Provider Registry with GeminiFlashImageAdapter", () => {
  it("resolves 'gemini' to GeminiFlashImageAdapter by default", () => {
    const provider = getProvider("gemini");
    expect(provider.name).toBe("gemini");
    expect(provider).toBeInstanceOf(GeminiFlashImageAdapter);
  });

  it("allows custom registration and reset restores GeminiFlashImageAdapter", () => {
    const customStub: ProviderAdapter = {
      name: "gemini",
      submit: async () => ({ ok: true, providerTaskId: "custom-1" }),
      fetchOutput: async () => null,
    };
    registerProvider(customStub);
    expect(getProvider("gemini")).toBe(customStub);

    resetProviders();
    expect(getProvider("gemini")).toBeInstanceOf(GeminiFlashImageAdapter);
  });
});
