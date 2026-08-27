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
