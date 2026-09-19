import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  CircuitBreaker,
  executeWithResilience,
  isRetryableError,
} from "./resilience";

describe("isRetryableError", () => {
  it("identifies retryable HTTP status codes", () => {
    expect(isRetryableError(429)).toBe(true);
    expect(isRetryableError(500)).toBe(true);
    expect(isRetryableError(503)).toBe(true);
    expect(isRetryableError(504)).toBe(true);
    expect(isRetryableError(400)).toBe(false);
    expect(isRetryableError(401)).toBe(false);
    expect(isRetryableError(404)).toBe(false);
  });

  it("identifies retryable error messages", () => {
    expect(isRetryableError(new Error("AI_PROVIDER_ERROR_429: Too Many Requests"))).toBe(true);
    expect(isRetryableError(new Error("fetch failed"))).toBe(true);
    expect(isRetryableError(new Error("AI_PROVIDER_NETWORK_ERROR: timeout"))).toBe(true);
    expect(isRetryableError(new Error("INVALID_INPUT"))).toBe(false);
  });
});

describe("CircuitBreaker", () => {
  let cb: CircuitBreaker;

  beforeEach(() => {
    cb = new CircuitBreaker({ failureThreshold: 3, cooldownMs: 1000, timeWindowMs: 5000 });
  });

  it("starts in CLOSED state and stays CLOSED on success", () => {
    expect(cb.getState()).toBe("CLOSED");
    expect(cb.isOpen()).toBe(false);
    cb.recordSuccess();
    expect(cb.getState()).toBe("CLOSED");
  });

  it("opens circuit after reaching failure threshold", () => {
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.getState()).toBe("CLOSED");
    cb.recordFailure();
    expect(cb.getState()).toBe("OPEN");
    expect(cb.isOpen()).toBe(true);
  });

  it("recovers to CLOSED after success in HALF_OPEN state", async () => {
    cb.recordFailure();
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.getState()).toBe("OPEN");

    // Manually advance time past cooldown
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 1500);
    expect(cb.getState()).toBe("HALF_OPEN");

    cb.recordSuccess();
    expect(cb.getState()).toBe("CLOSED");
  });
});

describe("executeWithResilience", () => {
  it("succeeds on first attempt without retrying", async () => {
    const action = vi.fn().mockResolvedValue("success");
    const sleepFn = vi.fn().mockResolvedValue(undefined);

    const res = await executeWithResilience(action, { sleepFn });
    expect(res).toBe("success");
    expect(action).toHaveBeenCalledTimes(1);
    expect(sleepFn).not.toHaveBeenCalled();
  });

  it("retries on retryable errors and succeeds on subsequent attempt", async () => {
    const action = vi
      .fn()
      .mockRejectedValueOnce(new Error("AI_PROVIDER_ERROR_429"))
      .mockResolvedValueOnce("recovered");
    const sleepFn = vi.fn().mockResolvedValue(undefined);

    const res = await executeWithResilience(action, { sleepFn, maxRetries: 3 });
    expect(res).toBe("recovered");
    expect(action).toHaveBeenCalledTimes(2);
    expect(sleepFn).toHaveBeenCalledTimes(1);
  });

  it("does not retry on non-retryable errors", async () => {
    const action = vi.fn().mockRejectedValue(new Error("INVALID_PROMPT_400"));
    const sleepFn = vi.fn().mockResolvedValue(undefined);

    await expect(executeWithResilience(action, { sleepFn })).rejects.toThrow("INVALID_PROMPT_400");
    expect(action).toHaveBeenCalledTimes(1);
    expect(sleepFn).not.toHaveBeenCalled();
  });

  it("fast-fails when circuit breaker is OPEN", async () => {
    const cb = new CircuitBreaker({ failureThreshold: 1 });
    cb.recordFailure();
    expect(cb.isOpen()).toBe(true);

    const action = vi.fn();
    await expect(
      executeWithResilience(action, { circuitBreaker: cb })
    ).rejects.toThrow("CIRCUIT_BREAKER_OPEN");
    expect(action).not.toHaveBeenCalled();
  });
});
