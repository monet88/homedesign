// Unit tests for deploy environment policy (ticket #18, TDD seam).
import { describe, expect, it } from "vitest";
import { DesignError } from "@/lib/ai/types";
import {
  assertEmailSignUpAllowed,
  assertGenerationAllowed,
  assertMockPaymentAllowed,
  isFreeGrantAllowed,
  isGenerationAllowed,
  isProduction,
  isTestingEconomyAllowed,
} from "@/lib/env/policy";

const local = { ENVIRONMENT: "local" };
const dev = { ENVIRONMENT: "development" };
const preview = { ENVIRONMENT: "preview" };
const staging = { ENVIRONMENT: "staging" };
const prod = { ENVIRONMENT: "production" };

describe("environment policy matrix (ticket #18)", () => {
  it("identifies production", () => {
    expect(isProduction(prod)).toBe(true);
    expect(isProduction(staging)).toBe(false);
  });

  it.each([
    ["local", local, true],
    ["development", dev, true],
    ["preview", preview, true],
    ["staging", staging, true],
    ["production", prod, false],
  ] as const)("testing economy in %s", (_name, env, allowed) => {
    expect(isTestingEconomyAllowed(env)).toBe(allowed);
    expect(isFreeGrantAllowed(env)).toBe(allowed);
  });

  it.each([
    ["local", local, true],
    ["development", dev, true],
    ["preview", preview, true],
    ["staging", staging, true],
    ["production", prod, false],
  ] as const)("generation in %s", (_name, env, allowed) => {
    expect(isGenerationAllowed(env)).toBe(allowed);
    if (allowed) {
      expect(() => assertGenerationAllowed(env)).not.toThrow();
    } else {
      expect(() => assertGenerationAllowed(env)).toThrow(DesignError);
      try {
        assertGenerationAllowed(env);
      } catch (err) {
        expect(err).toBeInstanceOf(DesignError);
        expect((err as DesignError).code).toBe("GENERATION_DISABLED");
        expect((err as DesignError).status).toBe(403);
      }
    }
  });

  it("mock payment banned in production", () => {
    expect(() => assertMockPaymentAllowed(prod)).toThrow("MOCK_PAYMENT_BANNED_IN_PRODUCTION");
    expect(() => assertMockPaymentAllowed(staging)).not.toThrow();
  });

  it("email sign-up banned in production", () => {
    expect(() => assertEmailSignUpAllowed(prod)).toThrow("EMAIL_SIGNUP_BANNED_IN_PRODUCTION");
    expect(() => assertEmailSignUpAllowed(staging)).not.toThrow();
  });
});
