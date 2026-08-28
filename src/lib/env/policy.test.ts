// Unit tests for deploy environment policy (ticket #18, TDD seam).
import { describe, expect, it } from "vitest";
import { DesignError } from "@/lib/ai/types";
import {
  assertEmailSignUpAllowed,
  assertGenerationAllowed,
  assertMockPaymentAllowed,
  isFreeGrantAllowed,
  isGenerationAllowed,
  isAuthBypassEnabled,
  isExplicitOfflineMarker,
  isLiveApiKeyConfigured,
  isOfflineProviderAllowed,
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

  it("AUTH_BYPASS is ignored in production and off unless explicitly set", () => {
    expect(isAuthBypassEnabled(prod)).toBe(false);
    expect(isAuthBypassEnabled({ ...prod, AUTH_BYPASS: "1" })).toBe(false);
    expect(isAuthBypassEnabled(local)).toBe(false);
    // Vitest always sets VITEST, so the flag cannot activate inside unit tests.
    expect(isAuthBypassEnabled({ ...local, AUTH_BYPASS: "1" })).toBe(false);

    const prev = process.env.VITEST;
    delete process.env.VITEST;
    try {
      expect(isAuthBypassEnabled({ ...local, AUTH_BYPASS: "1" })).toBe(true);
      expect(isAuthBypassEnabled({ ...prod, AUTH_BYPASS: "1" })).toBe(false);
    } finally {
      process.env.VITEST = prev;
    }
  });

  it("isLiveApiKeyConfigured identifies valid non-placeholder keys", () => {
    expect(isLiveApiKeyConfigured(undefined)).toBe(false);
    expect(isLiveApiKeyConfigured(null)).toBe(false);
    expect(isLiveApiKeyConfigured("")).toBe(false);
    expect(isLiveApiKeyConfigured("   ")).toBe(false);
    expect(isLiveApiKeyConfigured("fake")).toBe(false);
    expect(isLiveApiKeyConfigured("test")).toBe(false);
    expect(isLiveApiKeyConfigured("offline")).toBe(false);
    expect(isLiveApiKeyConfigured("mock")).toBe(false);
    expect(isLiveApiKeyConfigured("test-live-key-12345")).toBe(true);
  });

  it("isExplicitOfflineMarker identifies offline vars and markers", () => {
    expect(isExplicitOfflineMarker({ AI_OFFLINE: "1" })).toBe(true);
    expect(isExplicitOfflineMarker({ AI_OFFLINE: "true" })).toBe(true);
    expect(isExplicitOfflineMarker({ AI_OFFLINE: "yes" })).toBe(true);
    expect(isExplicitOfflineMarker({ AI_OFFLINE: "0" })).toBe(false);
    expect(isExplicitOfflineMarker({}, "fake")).toBe(true);
    expect(isExplicitOfflineMarker({}, "test")).toBe(true);
    expect(isExplicitOfflineMarker({}, "live-key")).toBe(false);
  });

  it("isOfflineProviderAllowed permits non-prod and forbids prod", () => {
    expect(isOfflineProviderAllowed("local")).toBe(true);
    expect(isOfflineProviderAllowed("development")).toBe(true);
    expect(isOfflineProviderAllowed("preview")).toBe(true);
    expect(isOfflineProviderAllowed("staging")).toBe(true);
    expect(isOfflineProviderAllowed("production")).toBe(false);
  });
});
