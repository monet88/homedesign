// Unit tests for deploy environment policy (ticket #18, Issue #72, TDD seam).
import { describe, expect, it } from "vitest";
import { DesignError } from "@/lib/ai/types";
import {
  assertEmailSignUpAllowed,
  assertEmailSignInAllowed,
  assertGenerationAllowed,
  assertMockPaymentAllowed,
  isFreeGrantAllowed,
  isGenerationAllowed,
  isAuthBypassEnabled,
  isExplicitOfflineMarker,
  isLiveApiKeyConfigured,
  isOfflineProviderAllowed,
  isProduction,
  isDemo,
  isTestingEconomyAllowed,
} from "@/lib/env/policy";

const local = { ENVIRONMENT: "local" };
const dev = { ENVIRONMENT: "development" };
const preview = { ENVIRONMENT: "preview" };
const staging = { ENVIRONMENT: "staging" };
const demo = { ENVIRONMENT: "demo" };
const prod = { ENVIRONMENT: "production" };

describe("environment policy matrix (ticket #18 & Issue #72)", () => {
  it("identifies production and demo", () => {
    expect(isProduction(prod)).toBe(true);
    expect(isProduction(staging)).toBe(false);
    expect(isProduction(demo)).toBe(false);

    expect(isDemo(demo)).toBe(true);
    expect(isDemo(staging)).toBe(false);
    expect(isDemo(prod)).toBe(false);
  });

  it.each([
    ["local", local, true],
    ["development", dev, true],
    ["preview", preview, true],
    ["staging", staging, true],
    ["demo", demo, false],
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
    ["demo", demo, true],
    ["production", prod, false],
  ] as const)("generation in %s", (_name, env, allowed) => {
    expect(isGenerationAllowed(env)).toBe(allowed);
    if (allowed) {
      expect(() => assertGenerationAllowed(env)).not.toThrow();
    } else {
      expect(() => assertGenerationAllowed(env)).toThrow(DesignError);
    }
  });

  it("enables generation in production when AI_GENERATION_ENABLED is set", () => {
    const prodEnabled = { ...prod, AI_GENERATION_ENABLED: "true" };
    expect(isGenerationAllowed(prodEnabled)).toBe(true);
    expect(() => assertGenerationAllowed(prodEnabled)).not.toThrow();
  });

  it("mock payment banned in production and demo", () => {
    expect(() => assertMockPaymentAllowed(prod)).toThrow("MOCK_PAYMENT_BANNED_IN_PRODUCTION");
    expect(() => assertMockPaymentAllowed(demo)).toThrow("MOCK_PAYMENT_BANNED_IN_DEMO");
    expect(() => assertMockPaymentAllowed(staging)).not.toThrow();
  });

  it("email sign-up banned in production and demo", () => {
    expect(() => assertEmailSignUpAllowed(prod)).toThrow("EMAIL_SIGNUP_BANNED_IN_PRODUCTION");
    expect(() => assertEmailSignUpAllowed(demo)).toThrow("EMAIL_SIGNUP_BANNED_IN_DEMO");
    expect(() => assertEmailSignUpAllowed(staging)).not.toThrow();
  });

  it("email sign-in banned in demo", () => {
    expect(() => assertEmailSignInAllowed(demo)).toThrow("EMAIL_SIGNIN_BANNED_IN_DEMO");
    expect(() => assertEmailSignInAllowed(prod)).not.toThrow();
    expect(() => assertEmailSignInAllowed(staging)).not.toThrow();
  });

  it("AUTH_BYPASS is ignored in production and demo, and off unless explicitly set", () => {
    expect(isAuthBypassEnabled(prod)).toBe(false);
    expect(isAuthBypassEnabled({ ...prod, AUTH_BYPASS: "1" })).toBe(false);
    expect(isAuthBypassEnabled(demo)).toBe(false);
    expect(isAuthBypassEnabled({ ...demo, AUTH_BYPASS: "1" })).toBe(false);
    expect(isAuthBypassEnabled(local)).toBe(false);
    // Vitest always sets VITEST, so the flag cannot activate inside unit tests.
    expect(isAuthBypassEnabled({ ...local, AUTH_BYPASS: "1" })).toBe(false);
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
    expect(isLiveApiKeyConfigured("test-live-provider-key")).toBe(true);
  });

  it("isExplicitOfflineMarker identifies offline vars and markers", () => {
    expect(isExplicitOfflineMarker({ AI_OFFLINE: "1" })).toBe(true);
    expect(isExplicitOfflineMarker({ AI_OFFLINE: "true" })).toBe(true);
    expect(isExplicitOfflineMarker(undefined, "fake")).toBe(true);
    expect(isExplicitOfflineMarker(undefined, "offline")).toBe(true);
    expect(isExplicitOfflineMarker(undefined, "test-live-provider-key")).toBe(false);
    expect(isExplicitOfflineMarker({ AI_OFFLINE: "0" }, "test-live-provider-key")).toBe(false);
  });

  it("isOfflineProviderAllowed permits non-prod/non-demo and forbids prod and demo", () => {
    expect(isOfflineProviderAllowed("local")).toBe(true);
    expect(isOfflineProviderAllowed("development")).toBe(true);
    expect(isOfflineProviderAllowed("preview")).toBe(true);
    expect(isOfflineProviderAllowed("staging")).toBe(true);
    expect(isOfflineProviderAllowed("demo")).toBe(false);
    expect(isOfflineProviderAllowed("production")).toBe(false);
  });
});
