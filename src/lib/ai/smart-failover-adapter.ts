// Smart Failover Provider Adapter
// High availability multi-tier AI routing:
// Primary (Fal.ai Flux Schnell: 1-2s, 75đ) -> Fallback (Gemini Flash: structure master) -> Rescue (Replicate)

import type {
  ProviderAdapter,
  ProviderOutput,
  ProviderRequest,
  ProviderSubmitResult,
  HealthCheckResult,
} from "@/lib/ai/types";

export interface FailoverTier {
  name: string;
  adapter: ProviderAdapter;
}

export class SmartFailoverProviderAdapter implements ProviderAdapter {
  readonly name = "smart_failover";
  private activeProviderMap = new Map<string, ProviderAdapter>();

  constructor(private readonly tiers: ProviderAdapter[]) {
    if (tiers.length === 0) {
      throw new Error("SmartFailoverProviderAdapter requires at least one provider tier.");
    }
  }

  async submit(req: ProviderRequest): Promise<ProviderSubmitResult> {
    let lastError = "NO_PROVIDERS_AVAILABLE";

    // When the request has input images (image-to-image or inpainting), prioritize adapters that support multimodal input (Gemini)
    const isImageGuided = Boolean(req.options.image_input && req.options.image_input.length > 0);
    const candidateTiers = isImageGuided
      ? [...this.tiers].sort((a, b) => (a.name === "gemini" ? -1 : b.name === "gemini" ? 1 : 0))
      : this.tiers;

    for (const provider of candidateTiers) {
      try {
        const res = await provider.submit(req);
        if (res.ok) {
          this.activeProviderMap.set(req.taskId, provider);
          return {
            ok: true,
            providerTaskId: `${provider.name}:${res.providerTaskId}`,
          };
        }
        lastError = res.error ?? "SUBMIT_FAILED";
      } catch (err) {
        lastError = (err as Error).message || "SUBMIT_EXCEPTION";
      }
    }

    return {
      ok: false,
      error: `ALL_PROVIDERS_FAILED: ${lastError}`,
      retryable: true,
    };
  }

  async fetchOutput(
    req?: ProviderRequest,
    providerTaskId?: string
  ): Promise<ProviderOutput | null> {
    const taskId = req?.taskId ?? "";
    let active = this.activeProviderMap.get(taskId);

    // Extract original provider if prefixed
    let realTaskId = providerTaskId;
    if (providerTaskId && providerTaskId.includes(":")) {
      const parts = providerTaskId.split(":");
      const pName = parts[0];
      realTaskId = parts.slice(1).join(":");
      const match = this.tiers.find((t) => t.name === pName);
      if (match) active = match;
    }

    // Try with the active or primary provider first
    const isImageGuided = Boolean(req?.options?.image_input && req.options.image_input.length > 0);
    const defaultCandidates = isImageGuided
      ? [...this.tiers].sort((a, b) => (a.name === "gemini" ? -1 : b.name === "gemini" ? 1 : 0))
      : this.tiers;

    const candidates = active
      ? [active, ...this.tiers.filter((t) => t !== active)]
      : defaultCandidates;

    let lastError: unknown = null;

    for (const provider of candidates) {
      try {
        // If falling back to a secondary/rescue provider, ensure it is submitted and claims outbound quota first
        if (provider !== active && req) {
          const submitRes = await provider.submit(req);
          if (!submitRes.ok) {
            console.warn(
              `[SmartFailover] Fallback provider ${provider.name} submit rejected: ${submitRes.error}. Skipping.`
            );
            if (submitRes.error === "DEMO_DAILY_LIMIT_REACHED") {
              lastError = new Error("DEMO_DAILY_LIMIT_REACHED");
            }
            continue;
          }
        }

        const taskIdForProvider = provider === active ? realTaskId : undefined;
        const out = await provider.fetchOutput(req, taskIdForProvider);
        if (out && out.bytes && out.bytes.length > 0) {
          return out;
        }
      } catch (err) {
        lastError = err;
        // Proceed to next tier
        console.warn(
          `[SmartFailover] Provider ${provider.name} failed for task ${taskId}: ${(err as Error).message}. Falling back to next tier.`
        );
      }
    }

    if (lastError) throw lastError;
    return null;
  }

  async healthCheck(): Promise<HealthCheckResult> {
    const primary = this.tiers[0];
    if (primary.healthCheck) {
      return primary.healthCheck();
    }
    return {
      status: "healthy",
      latencyMs: 20,
      models: this.tiers.map((t) => t.name),
      endpoint: "multi-tier-failover",
    };
  }
}
