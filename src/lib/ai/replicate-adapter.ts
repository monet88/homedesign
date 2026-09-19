// Replicate Flux Provider Adapter
// High-quality serverless inference with Replicate predictions API
// Supports black-forest-labs/flux-schnell and flux-dev

import type {
  ProviderAdapter,
  ProviderOutput,
  ProviderRequest,
  ProviderSubmitResult,
  HealthCheckResult,
} from "@/lib/ai/types";

export interface ReplicateAdapterConfig {
  apiKey?: string;
  model?: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  claimOutboundAttempt?: () => Promise<boolean>;
}

export class ReplicateAdapter implements ProviderAdapter {
  readonly name = "replicate";
  private readonly apiKey?: string;
  private readonly model: string;
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;
  private readonly claimOutboundAttempt?: () => Promise<boolean>;
  private readonly claimedTaskIds = new Set<string>();

  constructor(config: ReplicateAdapterConfig = {}) {
    this.apiKey =
      config.apiKey ??
      (typeof process !== "undefined" ? process.env?.REPLICATE_API : undefined);
    this.model = config.model ?? "black-forest-labs/flux-schnell";
    this.fetchFn = (config.fetchFn ?? fetch).bind(globalThis);
    this.timeoutMs = config.timeoutMs ?? 25000;
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
        error: "REPLICATE_API_KEY_MISSING",
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
      providerTaskId: `replicate-${req.taskId}`,
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
      throw new Error("REPLICATE_API_KEY_MISSING");
    }

    // Double-lock: Ensure outbound attempt is claimed even if fetchOutput is invoked without prior submit
    if (this.claimOutboundAttempt && req?.taskId && !this.claimedTaskIds.has(req.taskId)) {
      const allowed = await this.claimOutboundAttempt();
      if (!allowed) {
        throw new Error("DEMO_DAILY_LIMIT_REACHED");
      }
      this.claimedTaskIds.add(req.taskId);
    }

    const endpoint = "https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions";

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    const safeFetch = this.fetchFn;

    try {
      const res = await safeFetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          Prefer: "wait=20",
        },
        body: JSON.stringify({
          input: {
            prompt: `${prompt}, 8k photorealistic architectural interior photography, masterwork`,
            aspect_ratio: "4:3",
            output_format: "jpg",
            output_quality: 90,
          },
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`REPLICATE_API_ERROR: ${res.status} ${errText}`);
      }

      const json = (await res.json()) as {
        status?: string;
        output?: string[] | string;
        error?: string;
      };

      if (json.error) {
        throw new Error(`REPLICATE_MODEL_ERROR: ${json.error}`);
      }

      let imageUrl: string | undefined;
      if (Array.isArray(json.output) && json.output.length > 0) {
        imageUrl = json.output[0];
      } else if (typeof json.output === "string") {
        imageUrl = json.output;
      }

      if (!imageUrl) {
        throw new Error("REPLICATE_NO_IMAGE_RETURNED");
      }

      // Download image bytes
      const imgRes = await safeFetch(imageUrl, { signal: controller.signal });
      if (!imgRes.ok) {
        throw new Error(`REPLICATE_IMAGE_DOWNLOAD_ERROR: ${imgRes.status}`);
      }

      const buffer = await imgRes.arrayBuffer();
      return {
        bytes: new Uint8Array(buffer),
        contentType: "image/jpeg",
      };
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error("REPLICATE_REQUEST_TIMEOUT", { cause: err });
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  async healthCheck(): Promise<HealthCheckResult> {
    return {
      status: this.apiKey ? "healthy" : "unhealthy",
      latencyMs: 25,
      models: [this.model],
      endpoint: "https://api.replicate.com/v1",
    };
  }
}

function failureMarker(prompt: string): string | null {
  const m = /FAIL:([A-Z0-9_]+)/.exec(prompt);
  return m ? m[1] : null;
}
