// Ticket 3.5: AI Provider Resilience Engine (Exponential Backoff, Full Jitter & Circuit Breaker)
// Designed for Cloudflare Workers Edge & Next.js Runtime (Zero External Dependencies)

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface CircuitBreakerOptions {
  failureThreshold?: number; // Số lần lỗi liên tiếp để ngắt mạch (mặc định 5)
  cooldownMs?: number; // Thời gian chờ trước khi thử lại (mặc định 30,000ms)
  timeWindowMs?: number; // Cửa sổ trượt ghi nhận lỗi (mặc định 60,000ms)
}

export class CircuitBreaker {
  private state: CircuitState = "CLOSED";
  private failureCount = 0;
  private lastFailureTime = 0;
  private successCount = 0;

  readonly failureThreshold: number;
  readonly cooldownMs: number;
  readonly timeWindowMs: number;

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? 5;
    this.cooldownMs = options.cooldownMs ?? 30_000;
    this.timeWindowMs = options.timeWindowMs ?? 60_000;
  }

  getState(): CircuitState {
    const now = Date.now();
    if (this.state === "OPEN") {
      if (now - this.lastFailureTime > this.cooldownMs) {
        this.state = "HALF_OPEN";
      }
    }
    return this.state;
  }

  recordSuccess(): void {
    this.failureCount = 0;
    this.state = "CLOSED";
    this.successCount++;
  }

  recordFailure(): void {
    const now = Date.now();
    if (now - this.lastFailureTime > this.timeWindowMs) {
      this.failureCount = 1;
    } else {
      this.failureCount++;
    }
    this.lastFailureTime = now;

    if (this.failureCount >= this.failureThreshold) {
      this.state = "OPEN";
    }
  }

  isOpen(): boolean {
    return this.getState() === "OPEN";
  }

  reset(): void {
    this.state = "CLOSED";
    this.failureCount = 0;
    this.lastFailureTime = 0;
    this.successCount = 0;
  }
}

export interface RetryOptions {
  maxRetries?: number; // Số lần thử lại tối đa (mặc định 3)
  baseDelayMs?: number; // Thời gian delay cơ sở (mặc định 300ms)
  maxDelayMs?: number; // Giới hạn delay tối đa (mặc định 3000ms)
  sleepFn?: (ms: number) => Promise<void>; // Sleep function cho test mocking
}

export const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function isRetryableError(statusOrError: number | Error | string): boolean {
  if (typeof statusOrError === "number") {
    // 408 Request Timeout, 429 Too Many Requests, 500 Internal, 502 Bad Gateway, 503 Service Unavailable, 504 Gateway Timeout
    return [408, 429, 500, 502, 503, 504].includes(statusOrError);
  }
  const msg =
    statusOrError instanceof Error
      ? statusOrError.message
      : String(statusOrError);
  return (
    msg.includes("429") ||
    msg.includes("500") ||
    msg.includes("502") ||
    msg.includes("503") ||
    msg.includes("504") ||
    msg.includes("408") ||
    msg.includes("fetch failed") ||
    msg.includes("timeout") ||
    msg.includes("NETWORK_ERROR") ||
    msg.includes("ECONNRESET")
  );
}

export interface ResilienceOptions extends RetryOptions {
  circuitBreaker?: CircuitBreaker;
}

/** Global default circuit breaker for the AI Provider */
export const defaultAiCircuitBreaker = new CircuitBreaker();

/**
 * Execute an async AI provider action with Exponential Backoff with Full Jitter and Circuit Breaker protection.
 */
export async function executeWithResilience<T>(
  action: (attempt: number) => Promise<T>,
  options: ResilienceOptions = {}
): Promise<T> {
  const cb = options.circuitBreaker ?? defaultAiCircuitBreaker;
  const maxRetries = options.maxRetries ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 300;
  const maxDelayMs = options.maxDelayMs ?? 3000;
  const sleep = options.sleepFn ?? defaultSleep;

  if (cb.isOpen()) {
    throw new Error("CIRCUIT_BREAKER_OPEN: AI provider is currently unhealthy and fast-failing");
  }

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await action(attempt);
      cb.recordSuccess();
      return result;
    } catch (err) {
      lastError = err;
      const retryable = isRetryableError(err as Error);

      if (!retryable || attempt === maxRetries) {
        cb.recordFailure();
        throw err;
      }

      // Exponential backoff with full jitter: delay = min(maxDelay, baseDelay * 2^attempt) * jitter(0.5..1.0)
      const exponentialDelay = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, attempt));
      const jitter = 0.5 + Math.random() * 0.5;
      const delay = Math.round(exponentialDelay * jitter);

      await sleep(delay);
    }
  }

  throw lastError;
}
