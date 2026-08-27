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
import { fixturePngBytes } from "@/lib/ai/fake-provider";
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
}

// ── Registry ────────────────────────────────────────────────────────────────

const registry = new Map<string, ProviderAdapter>();

export function registerProvider(adapter: ProviderAdapter): void {
  registry.set(adapter.name, adapter);
}

/** Reset to the default registry (fake + gemini flash image adapter). Used between tests. */
export function resetProviders(): void {
  registry.clear();
  registry.set("fake", new FakeProviderAdapter());
  registry.set("gemini", new GeminiFlashImageAdapter({ offlineFallback: true }));
}

resetProviders();

/**
 * Resolve a provider adapter by name. Unknown providers fall back to the fake
 * adapter in non-production environments and to the real stub otherwise, so an
 * unknown name can never silently skip the lifecycle.
 */
export function getProvider(name: string, environment = "local"): ProviderAdapter {
  const found = registry.get(name);
  if (found) return found;
  if (environment === "production") return new RealProviderAdapter(name);
  return registry.get("fake")!;
}

function failureMarker(prompt: string): string | null {
  const m = /FAIL:([A-Z0-9_]+)/.exec(prompt);
  return m ? m[1] : null;
}
