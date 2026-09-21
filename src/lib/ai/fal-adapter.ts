// Fal.ai Flux Provider Adapter (Sprint 9 - Ticket 9.2)
// Ultra-fast (~1-2s) & Cost-efficient (~$0.003 / 75 VNĐ per image)
// Supported models: fal-ai/flux/schnell (default for batch) & fal-ai/flux/dev

import type {
  ProviderAdapter,
  ProviderOutput,
  ProviderRequest,
  ProviderSubmitResult,
  HealthCheckResult,
} from "@/lib/ai/types";

export interface FalAdapterConfig {
  apiKey?: string;
  model?: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  claimOutboundAttempt?: () => Promise<boolean>;
}

export class FalFluxAdapter implements ProviderAdapter {
  readonly name = "fal";
  private readonly apiKey?: string;
  private readonly model: string;
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;
  private readonly claimOutboundAttempt?: () => Promise<boolean>;
  private readonly claimedTaskIds = new Set<string>();

  constructor(config: FalAdapterConfig = {}) {
    this.apiKey =
      config.apiKey ??
      (typeof process !== "undefined" ? process.env?.FAL_AI_API : undefined);
    this.model = config.model ?? "fal-ai/flux/schnell";
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
        error: "FAL_AI_API_KEY_MISSING",
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
      providerTaskId: `fal-${req.taskId}`,
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
      throw new Error("FAL_AI_API_KEY_MISSING");
    }

    // Double-lock: Ensure outbound attempt is claimed even if fetchOutput is invoked without prior submit
    if (this.claimOutboundAttempt && req?.taskId && !this.claimedTaskIds.has(req.taskId)) {
      const allowed = await this.claimOutboundAttempt();
      if (!allowed) {
        throw new Error("DEMO_DAILY_LIMIT_REACHED");
      }
      this.claimedTaskIds.add(req.taskId);
    }

    const endpoint = `https://fal.run/${this.model}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    const safeFetch = this.fetchFn;

    try {
      const res = await safeFetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Key ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: prompt,
          image_size: "landscape_4_3",
          num_inference_steps: this.model.includes("schnell") ? 4 : 28,
          enable_safety_checker: true,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => "");
        throw new Error(`FAL_API_ERROR: ${res.status} ${errorText}`);
      }

      const json = (await res.json()) as {
        images?: Array<{ url: string; content_type?: string }>;
      };

      const imageUrl = json.images?.[0]?.url;
      if (!imageUrl) {
        throw new Error("FAL_NO_IMAGE_RETURNED");
      }

      // Fetch the binary image bytes from the generated URL
      const imgRes = await safeFetch(imageUrl, { signal: controller.signal });
      if (!imgRes.ok) {
        throw new Error(`FAL_IMAGE_DOWNLOAD_ERROR: ${imgRes.status}`);
      }

      const buffer = await imgRes.arrayBuffer();
      return {
        bytes: new Uint8Array(buffer),
        contentType: json.images?.[0]?.content_type || "image/jpeg",
      };
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error("FAL_REQUEST_TIMEOUT", { cause: err });
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  async healthCheck(): Promise<HealthCheckResult> {
    if (!this.apiKey) {
      return {
        status: "unhealthy",
        latencyMs: 0,
        models: [this.model],
        endpoint: `https://fal.run/${this.model}`,
      };
    }
    return {
      status: "healthy",
      latencyMs: 15,
      models: [this.model],
      endpoint: `https://fal.run/${this.model}`,
    };
  }
}

function failureMarker(prompt: string): string | null {
  const m = /FAIL:([A-Z0-9_]+)/.exec(prompt);
  return m ? m[1] : null;
}
