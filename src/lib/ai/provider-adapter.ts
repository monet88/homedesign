// Ticket 07 — provider adapter seam (spec §App → provider adapter, ADR 0006
// "AI provider is a per-stage adapter, not a domain term").
//
// The lifecycle (src/lib/ai/lifecycle.ts) only ever talks to `ProviderAdapter`.
// Adding the real provider for #15 (Floor Plan) means registering another
// implementation here — the lifecycle, credits and validation paths do not
// change.
//
// Contract:
//   submit(req)  → hand the origin-compatible payload to the backend. The
//                  adapter NEVER decides success; it only accepts.
//   fetchOutput(req, providerTaskId) → produce output bytes to stage into the
//                  R2 quarantine key. Returning `null` means "not ready yet".
//
// `req.options.image_input` is a short-lived private URL resolved server-side
// by the lifecycle (never provided by the browser, never returned to it).

import { GeminiFlashImageAdapter } from "@/lib/ai/gemini-adapter";
import { FalFluxAdapter } from "@/lib/ai/fal-adapter";
import { ReplicateAdapter } from "@/lib/ai/replicate-adapter";
import { KieAdapter } from "@/lib/ai/kie-adapter";
import { SmartFailoverProviderAdapter } from "@/lib/ai/smart-failover-adapter";
import { fixturePngBytes } from "@/lib/ai/fake-provider";
import { isDemo, isLiveApiKeyConfigured, isOfflineProviderAllowed, isProduction } from "@/lib/env/policy";
import { claimDemoProviderSubmission } from "@/lib/ai/demo-usage";
import type { Env } from "@/lib/bindings";
import type {
  ProviderAdapter,
  ProviderOutput,
  ProviderRequest,
  ProviderSubmitResult,
} from "@/lib/ai/types";

export type { ProviderAdapter };

/**
 * Fake provider (ticket #1 seam) — the working implementation for every
 * non-production environment. Deterministic 1x1 PNG output so the validation
 * path can assert on real bytes with a bounded header parse.
 *
 * Failure injection: a `FAIL:<reason>` marker inside the built prompt makes the
 * adapter fail, which lets the lifecycle tests prove the fail-closed
 * release-hold path without stubbing modules.
 */
export class FakeProviderAdapter implements ProviderAdapter {
  readonly name = "fake";

  constructor(
    private readonly outputBytes: Uint8Array = fixturePngBytes(),
    private readonly contentType = "image/png"
  ) {}

  async submit(req: ProviderRequest): Promise<ProviderSubmitResult> {
    const failure = failureMarker(req.prompt);
    if (failure) return { ok: false, error: failure, retryable: false };
    return { ok: true, providerTaskId: `fake-${req.taskId}` };
  }

  async fetchOutput(req?: ProviderRequest, _providerTaskId?: string): Promise<ProviderOutput | null> {
    const failure = failureMarker(req?.prompt ?? "");
    if (failure) throw new Error(failure);
    return { bytes: this.outputBytes, contentType: this.contentType };
  }

  async healthCheck(): Promise<import("@/lib/ai/types").HealthCheckResult> {
    return {
      status: "healthy",
      latencyMs: 0,
      models: ["fake-model"],
      endpoint: "fake://health",
    };
  }
}

/**
 * Fake provider variant that emits bytes which FAIL intake validation
 * (unrecognized header). Proves "output rejected → release hold + fail task"
 * without touching the validator.
 */
export class FakeBadOutputProviderAdapter extends FakeProviderAdapter {
  constructor() {
    super(new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]), "image/png");
  }
}

/**
 * Real provider stub — same interface, not wired to a backend yet. Kept here so
 * #15 has a single file to fill in; calling it fails closed (the lifecycle
 * releases the hold and marks the task failed) instead of dangling.
 */
export class RealProviderAdapter implements ProviderAdapter {
  readonly name: string;

  constructor(name = "gemini") {
    this.name = name;
  }

  async submit(): Promise<ProviderSubmitResult> {
    return { ok: false, error: "PROVIDER_NOT_CONFIGURED", retryable: false };
  }

  async fetchOutput(_req?: ProviderRequest, _providerTaskId?: string): Promise<ProviderOutput | null> {
    throw new Error("PROVIDER_NOT_CONFIGURED");
  }

  async healthCheck(): Promise<import("@/lib/ai/types").HealthCheckResult> {
    return {
      status: "unhealthy",
      latencyMs: 0,
      models: [],
      endpoint: "",
      error: "PROVIDER_NOT_CONFIGURED",
    };
  }
}

// ── Registry ────────────────────────────────────────────────────────────────

const registry = new Map<string, ProviderAdapter>();

export function registerProvider(adapter: ProviderAdapter): void {
  registry.set(adapter.name, adapter);
}

const defaultFakeAdapter = new FakeProviderAdapter();
const defaultGeminiAdapter = new GeminiFlashImageAdapter();
const defaultFalAdapter = new FalFluxAdapter();

/** Reset to the default registry (fake + gemini + fal flux adapter). Used between tests. */
export function resetProviders(): void {
  registry.clear();
  registry.set("fake", defaultFakeAdapter);
  registry.set("gemini", defaultGeminiAdapter);
  registry.set("fal", defaultFalAdapter);
}

resetProviders();

export type ProviderEnv =
  | string
  | (Partial<Env> & {
      ENVIRONMENT?: string;
      AI_API_KEY?: string;
      AI_API_BASE_URL?: string;
      AI_DEFAULT_MODEL?: string;
      AI_OFFLINE?: string;
      fetchFn?: typeof fetch;
    });

/**
 * Resolve a provider adapter by name and environment/bindings.
 *
 * Selection rules (Ticket #33):
 * 1. Production strictly bans FakeProvider (returns RealProviderAdapter).
 * 2. If no valid live API key is configured:
 *    - In allowed offline environments, requested "fake" (or default/unknown) resolves to FakeProviderAdapter with zero network calls.
 *    - Explicit live provider request (e.g. "gemini") without a configured key returns RealProviderAdapter (failing submit closed with PROVIDER_NOT_CONFIGURED).
 * 3. In production or with a live API key:
 *    - "gemini" resolves to GeminiFlashImageAdapter initialized with the configured key.
 *    - Missing key in production fails closed with RealProviderAdapter (PROVIDER_NOT_CONFIGURED).
 */
export function getProvider(
  name: string,
  envOrEnvironment: ProviderEnv = "local"
): ProviderAdapter {
  const envObj =
    typeof envOrEnvironment === "string"
      ? { ENVIRONMENT: envOrEnvironment }
      : envOrEnvironment ?? { ENVIRONMENT: "local" };

  const envName = envObj.ENVIRONMENT || "local";
  const isProd = isProduction({ ENVIRONMENT: envName });
  const isDemoEnv = isDemo({ ENVIRONMENT: envName });
  const offlineAllowed = isOfflineProviderAllowed({ ENVIRONMENT: envName });

  const apiKey =
    envObj.AI_API_KEY ??
    (typeof process !== "undefined" ? process.env?.AI_API_KEY : undefined);

  const hasLiveKey = isLiveApiKeyConfigured(apiKey);
  const isOfflineMarker =
    envObj.AI_OFFLINE === "1" ||
    envObj.AI_OFFLINE === "true" ||
    envObj.AI_OFFLINE === "yes" ||
    (typeof apiKey === "string" && ["fake", "test", "offline", "mock"].includes(apiKey.trim().toLowerCase()));

  // 1. Production and Demo: offline fallback / FakeProvider strictly forbidden (ADR 0008, Issue #72)
  if (!offlineAllowed) {
    if (name === "fake") {
      return new RealProviderAdapter("fake");
    }
    const custom = registry.get(name);
    if (custom && custom !== defaultGeminiAdapter && custom.name !== "fake") {
      return custom;
    }
    const falKey =
      (envObj as Record<string, unknown>).FAL_AI_API as string | undefined ??
      (typeof process !== "undefined" ? process.env?.FAL_AI_API : undefined);
    const repKey =
      (envObj as Record<string, unknown>).REPLICATE_API as string | undefined ??
      (typeof process !== "undefined" ? process.env?.REPLICATE_API : undefined);
    const kieKey =
      (envObj as Record<string, unknown>).KIE_AI_API as string | undefined ??
      (typeof process !== "undefined" ? process.env?.KIE_AI_API : undefined);

    const safeFetchFn = (envObj.fetchFn ?? (typeof fetch !== "undefined" ? fetch : undefined))?.bind(globalThis);
    const demoClaimFn =
      isDemoEnv && "DB" in envObj && envObj.DB
        ? () => claimDemoProviderSubmission(envObj as Env)
        : undefined;

    if (name === "fal") {
      if (falKey) return new FalFluxAdapter({ apiKey: falKey, fetchFn: safeFetchFn, claimOutboundAttempt: demoClaimFn });
      return new RealProviderAdapter("fal");
    }
    if (name === "replicate") {
      if (repKey) return new ReplicateAdapter({ apiKey: repKey, fetchFn: safeFetchFn, claimOutboundAttempt: demoClaimFn });
      return new RealProviderAdapter("replicate");
    }
    if (name === "kie") {
      if (kieKey) return new KieAdapter({ apiKey: kieKey, fetchFn: safeFetchFn, claimOutboundAttempt: demoClaimFn });
      return new RealProviderAdapter("kie");
    }

    if (name === "gemini") {
      if (!hasLiveKey || isOfflineMarker) {
        return new RealProviderAdapter(name);
      }
      return new GeminiFlashImageAdapter({
        environment: envName,
        apiKey,
        baseUrl: envObj.AI_API_BASE_URL,
        defaultModel: envObj.AI_DEFAULT_MODEL,
        bucket: envObj.HD_PRIVATE,
        fetchFn: safeFetchFn,
        resilience: { maxRetries: 2, baseDelayMs: 250, maxDelayMs: 2000 },
        claimOutboundAttempt: demoClaimFn,
      });
    }

    if (isDemoEnv && (name === "" || name === "default" || name === "smart")) {
      const tiers: ProviderAdapter[] = [];
      if (falKey) {
        tiers.push(new FalFluxAdapter({ apiKey: falKey, fetchFn: safeFetchFn, claimOutboundAttempt: demoClaimFn }));
      }
      if (hasLiveKey && !isOfflineMarker) {
        tiers.push(
          new GeminiFlashImageAdapter({
            environment: envName,
            apiKey,
            baseUrl: envObj.AI_API_BASE_URL,
            defaultModel: envObj.AI_DEFAULT_MODEL,
            bucket: envObj.HD_PRIVATE,
            fetchFn: safeFetchFn,
            resilience: { maxRetries: 2, baseDelayMs: 250, maxDelayMs: 2000 },
            claimOutboundAttempt: demoClaimFn,
          })
        );
      }
      if (repKey) {
        tiers.push(new ReplicateAdapter({ apiKey: repKey, fetchFn: safeFetchFn, claimOutboundAttempt: demoClaimFn }));
      }
      if (tiers.length > 0) {
        return tiers.length === 1 ? tiers[0] : new SmartFailoverProviderAdapter(tiers);
      }
    }

    if (!hasLiveKey || isOfflineMarker) {
      return new RealProviderAdapter(name);
    }
    return new RealProviderAdapter(name);
  }

  // 2. Non-production (local, dev, preview, staging, test)
  if (name === "fake") {
    return registry.get("fake") ?? defaultFakeAdapter;
  }

  const custom = registry.get(name);
  if (custom && custom !== defaultGeminiAdapter) {
    return custom;
  }

  if (name === "gemini") {
    if (hasLiveKey && !isOfflineMarker) {
      return new GeminiFlashImageAdapter({
        environment: envName,
        apiKey,
        baseUrl: envObj.AI_API_BASE_URL,
        defaultModel: envObj.AI_DEFAULT_MODEL,
        bucket: envObj.HD_PRIVATE,
        fetchFn: envObj.fetchFn,
        resilience: { maxRetries: 2, baseDelayMs: 250, maxDelayMs: 2000 },
      });
    }
    return new RealProviderAdapter("gemini");
  }

  if (custom) return custom;
  return registry.get("fake") ?? defaultFakeAdapter;
}
function failureMarker(prompt: string): string | null {
  const m = /FAIL:([A-Z0-9_]+)/.exec(prompt);
  return m ? m[1] : null;
}
