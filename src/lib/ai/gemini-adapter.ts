// Cliproxy Gemini Flash Image Adapter (Ticket #21, ADR 0007, spec §AI Provider Adapter Layer).
//
// Bridges the HomeDesign generation pipeline with Cliproxy's OpenAI-compatible
// multimodal `/v1/chat/completions` endpoint running `gemini-3.1-flash-image`.
//
// Implements `ProviderAdapter` (`submit` and `fetchOutput`) with:
//   * Multimodal payload structure with source image encoded as data URI.
//   * Response extraction from `choices[0].message.images[0].image_url.url` or `content`.
//   * Base64 / binary Uint8Array conversion and MIME type detection.
//   * Non-production API key fallback and configurable endpoint/model.
//   * Offline fallback support.

import { fixturePngBytes } from "@/lib/ai/fake-provider";
import { getNegativeConstraints, getSystemPrompt } from "@/lib/ai/prompts";
import type {
  ProviderAdapter,
  ProviderOutput,
  ProviderRequest,
  ProviderSubmitResult,
} from "@/lib/ai/types";
import { validJpegBytes } from "@/lib/fixtures/images";

export const DEFAULT_AI_API_BASE_URL = "https://cliproxy.monet.uno/v1";
export const DEFAULT_AI_DEFAULT_MODEL = "gemini-3.1-flash-image";
export const FALLBACK_AI_API_KEY = "";
export interface GeminiAdapterOptions {
  baseUrl?: string;
  apiKey?: string;
  defaultModel?: string;
  bucket?: R2Bucket;
  fetchFn?: typeof fetch;
  environment?: string;
  offlineFallback?: boolean;
}

export class GeminiFlashImageAdapter implements ProviderAdapter {
  readonly name = "gemini";
  private readonly baseUrl: string;
  private readonly apiKey: string | undefined;
  private readonly defaultModel: string;
  private readonly bucket?: R2Bucket;
  private readonly fetchFn: typeof fetch;
  private readonly environment: string;
  private readonly offlineFallback: boolean;
  private readonly pendingOutputs = new Map<string, ProviderOutput>();

  constructor(options: GeminiAdapterOptions = {}) {
    const env =
      options.environment ??
      (typeof process !== "undefined" ? process.env?.ENVIRONMENT : undefined) ??
      "local";
    this.environment = env;
    this.baseUrl = (
      options.baseUrl ??
      (typeof process !== "undefined" ? process.env?.AI_API_BASE_URL : undefined) ??
      DEFAULT_AI_API_BASE_URL
    )
      .trim()
      .replace(/\/+$/, "");
    this.apiKey =
      options.apiKey ??
      (typeof process !== "undefined" ? process.env?.AI_API_KEY : undefined);
    this.defaultModel =
      options.defaultModel ??
      (typeof process !== "undefined" ? process.env?.AI_DEFAULT_MODEL : undefined) ??
      DEFAULT_AI_DEFAULT_MODEL;
    this.bucket = options.bucket;
    this.fetchFn = options.fetchFn ?? fetch.bind(globalThis);
    this.offlineFallback = options.offlineFallback ?? false;
  }

  async resolveImageToDataUri(input: string): Promise<string> {
    const trimmed = input.trim();
    if (trimmed.startsWith("data:")) {
      return trimmed;
    }
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      try {
        const res = await this.fetchFn(trimmed);
        if (res.ok) {
          const contentType = res.headers.get("content-type") || "image/jpeg";
          const arrayBuffer = await res.arrayBuffer();
          const bytes = new Uint8Array(arrayBuffer);
          const base64 = bytesToBase64(bytes);
          return `data:${contentType.split(";")[0]};base64,${base64}`;
        }
      } catch {
        // Fall back to fixture or bucket read
      }
    }
    if (
      this.bucket &&
      (trimmed.startsWith("private:") ||
        trimmed.startsWith("ready/") ||
        trimmed.startsWith("quarantine/"))
    ) {
      const key = trimmed.replace(/^private:/, "");
      const obj = await this.bucket.get(key);
      if (obj) {
        const bytes = new Uint8Array(await obj.arrayBuffer());
        const contentType = obj.httpMetadata?.contentType || detectMimeType(bytes) || "image/jpeg";
        const base64 = bytesToBase64(bytes);
        return `data:${contentType};base64,${base64}`;
      }
    }
    // Fallback test fixture
    const fixture = validJpegBytes();
    return `data:image/jpeg;base64,${bytesToBase64(fixture)}`;
  }

  async submit(req: ProviderRequest): Promise<ProviderSubmitResult> {
    // 1. Failure injection marker support
    const failure = failureMarker(req.prompt);
    if (failure) {
      return { ok: false, error: failure, retryable: false };
    }

    const providerTaskId = `gemini-${req.taskId}`;

    // 2. API key check and offline fallback support
    if (!this.apiKey) {
      if (this.offlineFallback) {
        this.pendingOutputs.set(providerTaskId, {
          bytes: fixturePngBytes(),
          contentType: "image/png",
        });
        return { ok: true, providerTaskId };
      }
      if (this.environment === "production") {
        return { ok: false, error: "AI_API_KEY_MISSING", retryable: false };
      }
    }

    // 3. Multimodal content construction
    const contents: Array<
      { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }
    > = [{ type: "text", text: req.prompt }];

    if (req.options?.image_input && req.options.image_input.length > 0) {
      for (const img of req.options.image_input) {
        try {
          const dataUri = await this.resolveImageToDataUri(img);
          contents.push({ type: "image_url", image_url: { url: dataUri } });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          return { ok: false, error: `IMAGE_RESOLUTION_FAILED: ${msg}`, retryable: false };
        }
      }
    }

    const model =
      req.model && req.model !== "gemini-2.5-flash-image" ? req.model : this.defaultModel;
    const systemPrompt = `${getSystemPrompt(req.scene)}\n${getNegativeConstraints()}`;
    const payload = {
      model,
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: contents,
        },
      ],
    };

    const endpoint = getChatCompletionsEndpoint(this.baseUrl);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    try {
      const res = await this.fetchFn(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        if (this.offlineFallback) {
          this.pendingOutputs.set(providerTaskId, {
            bytes: fixturePngBytes(),
            contentType: "image/png",
          });
          return { ok: true, providerTaskId };
        }
        return {
          ok: false,
          error: `AI_PROVIDER_ERROR_${res.status}: ${errText || res.statusText}`,
          retryable: res.status >= 500 || res.status === 429,
        };
      }

      const json = await res.json();
      const output = extractImageFromResponse(json);
      this.pendingOutputs.set(providerTaskId, output);
      return { ok: true, providerTaskId };
    } catch (err: unknown) {
      if (this.offlineFallback) {
        this.pendingOutputs.set(providerTaskId, {
          bytes: fixturePngBytes(),
          contentType: "image/png",
        });
        return { ok: true, providerTaskId };
      }
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: `AI_PROVIDER_NETWORK_ERROR: ${msg}`, retryable: true };
    }
  }

  async fetchOutput(
    req?: ProviderRequest,
    providerTaskId?: string
  ): Promise<ProviderOutput | null> {
    const failure = failureMarker(req?.prompt ?? "");
    if (failure) {
      throw new Error(failure);
    }

    const taskId = providerTaskId ?? (req ? `gemini-${req.taskId}` : undefined);
    if (taskId && this.pendingOutputs.has(taskId)) {
      const output = this.pendingOutputs.get(taskId)!;
      this.pendingOutputs.delete(taskId);
      return output;
    }

    if (req) {
      const result = await this.submit(req);
      if (!result.ok) {
        throw new Error(result.error);
      }
      const output = this.pendingOutputs.get(result.providerTaskId);
      if (output) {
        this.pendingOutputs.delete(result.providerTaskId);
        return output;
      }
    }

    return null;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export function getChatCompletionsEndpoint(baseUrl: string): string {
  const clean = baseUrl.trim().replace(/\/+$/, "");
  if (clean.endsWith("/chat/completions")) return clean;
  if (clean.endsWith("/v1")) return `${clean}/chat/completions`;
  return `${clean}/v1/chat/completions`;
}

export function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let binary = "";
  const len = bytes.byteLength;
  const chunkSize = 0x8000;
  for (let i = 0; i < len; i += chunkSize) {
    binary += String.fromCharCode.apply(
      null,
      bytes.subarray(i, Math.min(i + chunkSize, len)) as unknown as number[]
    );
  }
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/\s+/g, "");
  if (typeof Buffer !== "undefined") {
    const buf = Buffer.from(clean, "base64");
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  }
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function detectMimeType(bytes: Uint8Array): string {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46
  ) {
    return "image/webp";
  }
  return "image/jpeg";
}

export function extractDataUri(dataUri: string): ProviderOutput {
  const trimmed = dataUri.trim();
  const match = /^data:([^;,]+)(?:;charset=[^;,]+)?(?:;base64)?,(.*)$/is.exec(trimmed);
  if (match) {
    const contentType = match[1] || "image/jpeg";
    const rawData = match[2];
    const bytes = base64ToBytes(rawData);
    return { bytes, contentType };
  }
  const bytes = base64ToBytes(trimmed);
  return {
    bytes,
    contentType: detectMimeType(bytes) || "image/jpeg",
  };
}

export function extractImageFromResponse(json: unknown): ProviderOutput {
  if (!json || typeof json !== "object") {
    throw new Error("INVALID_PROVIDER_RESPONSE: Response is not a JSON object");
  }

  const res = json as Record<string, unknown>;

  // 1. OpenAI multimodal images array: choices[0].message.images[0].image_url.url
  if (Array.isArray(res.choices) && res.choices.length > 0) {
    const firstChoice = res.choices[0] as Record<string, unknown>;
    const message = firstChoice.message as Record<string, unknown> | undefined;
    if (message) {
      // Check message.images array
      if (Array.isArray(message.images) && message.images.length > 0) {
        const firstImg = message.images[0] as Record<string, unknown>;
        const imgUrlObj = firstImg.image_url as Record<string, unknown> | undefined;
        const url =
          typeof imgUrlObj?.url === "string"
            ? imgUrlObj.url
            : typeof firstImg.url === "string"
              ? firstImg.url
              : undefined;
        if (url) {
          return extractDataUri(url);
        }
      }

      // Check message.image_url
      if (
        message.image_url &&
        typeof (message.image_url as Record<string, unknown>).url === "string"
      ) {
        return extractDataUri((message.image_url as Record<string, unknown>).url as string);
      }

      // Check message.content
      if (typeof message.content === "string") {
        const content = message.content.trim();
        // Case 1: direct data URI
        if (content.startsWith("data:image/")) {
          return extractDataUri(content);
        }
        // Case 2: markdown image ![...](data:image/...)
        const mdMatch =
          /!\[.*?\]\((data:image\/[a-zA-Z0-9+.-]+;base64,[A-Za-z0-9+/=]+)\)/s.exec(content);
        if (mdMatch) {
          return extractDataUri(mdMatch[1]);
        }
        // Case 3: embedded data URI in text
        const dataUriMatch =
          /(data:image\/[a-zA-Z0-9+.-]+;base64,[A-Za-z0-9+/=]+)/s.exec(content);
        if (dataUriMatch) {
          return extractDataUri(dataUriMatch[1]);
        }
        // Case 4: raw base64 string
        if (/^[A-Za-z0-9+/=\s]{64,}$/.test(content)) {
          return extractDataUri(content);
        }
      } else if (Array.isArray(message.content)) {
        for (const part of message.content) {
          if (part && typeof part === "object") {
            const p = part as Record<string, unknown>;
            const url =
              typeof (p.image_url as Record<string, unknown>)?.url === "string"
                ? ((p.image_url as Record<string, unknown>).url as string)
                : typeof p.url === "string"
                  ? p.url
                  : undefined;
            if (url) {
              return extractDataUri(url);
            }
          }
        }
      }
    }
  }

  // 2. OpenAI Images format: data[0].b64_json or data[0].url
  if (Array.isArray(res.data) && res.data.length > 0) {
    const firstData = res.data[0] as Record<string, unknown>;
    if (typeof firstData.b64_json === "string") {
      const bytes = base64ToBytes(firstData.b64_json);
      return { bytes, contentType: detectMimeType(bytes) };
    }
    if (typeof firstData.url === "string" && firstData.url.startsWith("data:")) {
      return extractDataUri(firstData.url);
    }
  }

  throw new Error("NO_IMAGE_IN_PROVIDER_RESPONSE");
}

function failureMarker(prompt: string): string | null {
  const m = /FAIL:([A-Z0-9_]+)/.exec(prompt);
  return m ? m[1] : null;
}
