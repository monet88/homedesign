// KIE.ai Market Provider Adapter
// High-creativity AI image generation powered by KIE.ai / GPT Image 2
// OpenAI Image Generation API compatible schema

import type {
  ProviderAdapter,
  ProviderOutput,
  ProviderRequest,
  ProviderSubmitResult,
  HealthCheckResult,
} from "@/lib/ai/types";

export interface KieAdapterConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  claimOutboundAttempt?: () => Promise<boolean>;
}

export class KieAdapter implements ProviderAdapter {
  readonly name = "kie";
  private readonly apiKey?: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;
  private readonly claimOutboundAttempt?: () => Promise<boolean>;
  private readonly claimedTaskIds = new Set<string>();

  constructor(config: KieAdapterConfig = {}) {
    this.apiKey =
      config.apiKey ??
      (typeof process !== "undefined" ? process.env?.KIE_AI_API : undefined);
    this.baseUrl = config.baseUrl ?? "https://api.kie.ai/v1";
    this.model = config.model ?? "gpt-image-2";
    this.fetchFn = (config.fetchFn ?? fetch).bind(globalThis);
    this.timeoutMs = config.timeoutMs ?? 30000;
    this.claimOutboundAttempt = config.claimOutboundAttempt;
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  async submit(req: ProviderRequest): Promise<ProviderSubmitResult> {
    const failure = failureMarker(req.prompt);
    if (failure) return { ok: false, error: failure, retryable: false };

    if (!this.apiKey) {
      return {
        ok: false,
        error: "KIE_AI_API_KEY_MISSING",
        retryable: false,
      };
    }

    if (this.claimOutboundAttempt) {
      const allowed = await this.claimOutboundAttempt();
      if (!allowed) {
        return { ok: false, error: "DEMO_DAILY_LIMIT_REACHED", retryable: false };
      }
      this.claimedTaskIds.add(req.taskId);
    }

    return {
      ok: true,
      providerTaskId: `kie-${req.taskId}`,
    };
  }

  async fetchOutput(
    req?: ProviderRequest,
    _providerTaskId?: string
  ): Promise<ProviderOutput | null> {
    const prompt = req?.prompt ?? "";
    const failure = failureMarker(prompt);
    if (failure) throw new Error(failure);

    if (!this.apiKey) {
      throw new Error("KIE_AI_API_KEY_MISSING");
    }

    // Double-lock: Ensure outbound attempt is claimed even if fetchOutput is invoked without prior submit
    if (this.claimOutboundAttempt && req?.taskId && !this.claimedTaskIds.has(req.taskId)) {
      const allowed = await this.claimOutboundAttempt();
      if (!allowed) {
        throw new Error("DEMO_DAILY_LIMIT_REACHED");
      }
      this.claimedTaskIds.add(req.taskId);
    }

    const endpoint = `${this.baseUrl}/images/generations`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    const safeFetch = this.fetchFn;

    try {
      const res = await safeFetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          prompt: `${prompt}, photorealistic architectural rendering, luxury design, studio lighting`,
          n: 1,
          size: "1024x768",
          response_format: "b64_json",
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`KIE_API_ERROR: ${res.status} ${errText}`);
      }

      const json = (await res.json()) as {
        data?: Array<{ b64_json?: string; url?: string }>;
        error?: { message?: string };
      };

      if (json.error?.message) {
        throw new Error(`KIE_MODEL_ERROR: ${json.error.message}`);
      }

      const item = json.data?.[0];
      if (!item) {
        throw new Error("KIE_NO_IMAGE_RETURNED");
      }

      if (item.b64_json) {
        // Decode base64 bytes directly
        const binaryStr = atob(item.b64_json);
        const len = binaryStr.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }
        return {
          bytes,
          contentType: "image/png",
        };
      }

      if (item.url) {
        const imgRes = await safeFetch(item.url, { signal: controller.signal });
        if (!imgRes.ok) {
          throw new Error(`KIE_IMAGE_DOWNLOAD_ERROR: ${imgRes.status}`);
        }
        const buffer = await imgRes.arrayBuffer();
        return {
          bytes: new Uint8Array(buffer),
          contentType: "image/png",
        };
      }

      throw new Error("KIE_INVALID_IMAGE_PAYLOAD");
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error("KIE_REQUEST_TIMEOUT", { cause: err });
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  async healthCheck(): Promise<HealthCheckResult> {
    return {
      status: this.apiKey ? "healthy" : "unhealthy",
      latencyMs: 30,
      models: [this.model],
      endpoint: this.baseUrl,
    };
  }
}

function failureMarker(prompt: string): string | null {
  const m = /FAIL:([A-Z0-9_]+)/.exec(prompt);
  return m ? m[1] : null;
}
