// Environment policy gates (ADR 0006, ticket #18, Issue #72, ADR 0008).
// Centralizes production & demo bans for Free Grant, generation, mock payment,
// test-outbox, and email sign-up. Non-production paths stay unchanged.

import { DesignError } from "@/lib/ai/types";
import type { Env } from "@/lib/bindings";

export type DeployEnvironment =
  | "local"
  | "development"
  | "preview"
  | "staging"
  | "demo"
  | "production";

const PRODUCTION = "production" as const;
const DEMO = "demo" as const;

export function isProduction(env: Pick<Env, "ENVIRONMENT">): boolean {
  return env.ENVIRONMENT === PRODUCTION;
}

export function isDemo(env: Pick<Env, "ENVIRONMENT">): boolean {
  return env.ENVIRONMENT === DEMO;
}

/** Local UI testing: skip login. Never honored in production or demo. */
export function isAuthBypassEnabled(
  env: Pick<Env, "ENVIRONMENT"> & { AUTH_BYPASS?: string }
): boolean {
  if (isProduction(env) || isDemo(env)) return false;
  // Wrangler tests load `.dev.vars`; never treat the test harness as a guest.
  if (process.env.VITEST) return false;
  const value = env.AUTH_BYPASS?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

/** Free Grant + Mock Payment + test-outbox are allowed outside production and demo (ADR 0008). */
export function isTestingEconomyAllowed(env: Pick<Env, "ENVIRONMENT">): boolean {
  return !isProduction(env) && !isDemo(env);
}

/** Free Credit Grant is banned in production (ADR 0006) and Public Demo (ADR 0008). */
export function isFreeGrantAllowed(env: Pick<Env, "ENVIRONMENT">): boolean {
  return isTestingEconomyAllowed(env);
}

/**
 * Billable generation policy (ADR 0006, ADR 0008).
 * - Demo: allows generation with daily quota guard (DEMO_DAILY_PROVIDER_LIMIT).
 * - Production: enabled when AI_GENERATION_ENABLED="true" (commercial release toggle),
 *   otherwise blocked by default to prevent unauthorized provider billing.
 */
export function isGenerationAllowed(
  env: Pick<Env, "ENVIRONMENT"> & { AI_GENERATION_ENABLED?: string }
): boolean {
  if (isProduction(env)) {
    const enabled = env.AI_GENERATION_ENABLED?.trim().toLowerCase();
    return enabled === "1" || enabled === "true" || enabled === "yes";
  }
  return true;
}

/** Email/password sign-up is banned in production (ADR 0006) and demo (ADR 0008). */
export function isEmailSignUpAllowed(env: Pick<Env, "ENVIRONMENT">): boolean {
  return !isProduction(env) && !isDemo(env);
}

/** Email/password sign-in is banned in demo (ADR 0008). */
export function isEmailSignInAllowed(env: Pick<Env, "ENVIRONMENT">): boolean {
  return !isDemo(env);
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

/** Check if offline fallback / fake provider is allowed in this environment (banned in production and demo). */
export function isOfflineProviderAllowed(env: Pick<Env, "ENVIRONMENT"> | string): boolean {
  const envName = typeof env === "string" ? env : env.ENVIRONMENT;
  return envName !== "production" && envName !== "demo";
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
    const err = new Error(
      isDemo(env) ? "EMAIL_SIGNUP_BANNED_IN_DEMO" : "EMAIL_SIGNUP_BANNED_IN_PRODUCTION"
    ) as Error & { status?: number };
    err.status = 403;
    throw err;
  }
}

export function assertEmailSignInAllowed(env: Pick<Env, "ENVIRONMENT">): void {
  if (!isEmailSignInAllowed(env)) {
    const err = new Error("EMAIL_SIGNIN_BANNED_IN_DEMO") as Error & { status?: number };
    err.status = 403;
    throw err;
  }
}

export function assertMockPaymentAllowed(env: Pick<Env, "ENVIRONMENT">): void {
  if (!isTestingEconomyAllowed(env)) {
    const err = new Error(
      isDemo(env) ? "MOCK_PAYMENT_BANNED_IN_DEMO" : "MOCK_PAYMENT_BANNED_IN_PRODUCTION"
    ) as Error & { status?: number };
    err.status = 403;
    throw err;
  }
}

/**
 * Resolves the private R2 bucket name for the environment (Issue #72, ADR 0008).
 * Supports explicit HD_PRIVATE_BUCKET_NAME env var, demo environment (hd-demo-private),
 * or defaults to homedesign-private.
 */
export function getPrivateBucketName(env: { ENVIRONMENT?: string; HD_PRIVATE_BUCKET_NAME?: string }): string {
  if (env.HD_PRIVATE_BUCKET_NAME && env.HD_PRIVATE_BUCKET_NAME.trim() !== "") {
    return env.HD_PRIVATE_BUCKET_NAME.trim();
  }
  if (env.ENVIRONMENT === "demo") {
    return "hd-demo-private";
  }
  if (env.ENVIRONMENT === "staging") {
    return "hd-staging-private";
  }
  if (env.ENVIRONMENT === "production") {
    return "hd-prod-private";
  }
  if (env.ENVIRONMENT === "preview") {
    return "hd-preview-private";
  }
  if (env.ENVIRONMENT === "development") {
    return "hd-dev-private";
  }
  return "homedesign-private";
}
