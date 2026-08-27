// Environment policy gates (ADR 0006, ticket #18).
// Centralizes production bans for Free Grant, generation, mock payment,
// test-outbox, and email sign-up. Non-production paths stay unchanged.

import { DesignError } from "@/lib/ai/types";
import type { Env } from "@/lib/bindings";

export type DeployEnvironment =
  | "local"
  | "development"
  | "preview"
  | "staging"
  | "production";

const PRODUCTION = "production" as const;

export function isProduction(env: Pick<Env, "ENVIRONMENT">): boolean {
  return env.ENVIRONMENT === PRODUCTION;
}

/** Local UI testing: skip login. Never honored in production. */
export function isAuthBypassEnabled(
  env: Pick<Env, "ENVIRONMENT"> & { AUTH_BYPASS?: string }
): boolean {
  if (isProduction(env)) return false;
  // Wrangler tests load `.dev.vars`; never treat the test harness as a guest.
  if (process.env.VITEST) return false;
  const value = env.AUTH_BYPASS?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

/** Free Grant + Mock Payment + test-outbox are allowed outside production. */
export function isTestingEconomyAllowed(env: Pick<Env, "ENVIRONMENT">): boolean {
  return !isProduction(env);
}

/** Free Credit Grant is banned in production (ADR 0006). */
export function isFreeGrantAllowed(env: Pick<Env, "ENVIRONMENT">): boolean {
  return isTestingEconomyAllowed(env);
}

/** Billable generation is disabled in production until policy is settled. */
export function isGenerationAllowed(env: Pick<Env, "ENVIRONMENT">): boolean {
  return !isProduction(env);
}

/** Email/password sign-up is banned in production (ADR 0006). */
export function isEmailSignUpAllowed(env: Pick<Env, "ENVIRONMENT">): boolean {
  return !isProduction(env);
}

/** Helper to check if a provider API key is a non-empty, non-fake live key. */
export function isLiveApiKeyConfigured(apiKey?: string | null): boolean {
  if (!apiKey || typeof apiKey !== "string") return false;
  const trimmed = apiKey.trim().toLowerCase();
  if (trimmed === "" || trimmed === "fake" || trimmed === "test" || trimmed === "offline" || trimmed === "mock") {
    return false;
  }
  return true;
}

/** Check if explicit offline marker variable or marker key is set. */
export function isExplicitOfflineMarker(
  env?: { AI_OFFLINE?: string } | null,
  apiKey?: string | null
): boolean {
  const offlineVar = env?.AI_OFFLINE?.trim().toLowerCase();
  if (offlineVar === "1" || offlineVar === "true" || offlineVar === "yes") {
    return true;
  }
  if (typeof apiKey === "string") {
    const trimmed = apiKey.trim().toLowerCase();
    if (trimmed === "fake" || trimmed === "test" || trimmed === "offline" || trimmed === "mock") {
      return true;
    }
  }
  return false;
}

/** Check if offline fallback / fake provider is allowed in this environment (banned in production). */
export function isOfflineProviderAllowed(env: Pick<Env, "ENVIRONMENT"> | string): boolean {
  const envName = typeof env === "string" ? env : env.ENVIRONMENT;
  return envName !== "production";
}

export function assertGenerationAllowed(env: Pick<Env, "ENVIRONMENT">): void {
  if (!isGenerationAllowed(env)) {
    throw new DesignError(
      "GENERATION_DISABLED",
      403,
      "generation disabled until production credits/payment/abuse policy is settled"
    );
  }
}

export function assertEmailSignUpAllowed(env: Pick<Env, "ENVIRONMENT">): void {
  if (!isEmailSignUpAllowed(env)) {
    const err = new Error("EMAIL_SIGNUP_BANNED_IN_PRODUCTION") as Error & { status?: number };
    err.status = 403;
    throw err;
  }
}

export function assertMockPaymentAllowed(env: Pick<Env, "ENVIRONMENT">): void {
  if (!isTestingEconomyAllowed(env)) {
    const err = new Error("MOCK_PAYMENT_BANNED_IN_PRODUCTION") as Error & { status?: number };
    err.status = 403;
    throw err;
  }
}
