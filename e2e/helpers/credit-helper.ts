import { Page, expect } from "@playwright/test";

export interface CreditsSummary {
  available: number;
  activeHolds: number;
  totalGrants: number;
  totalPayments: number;
  totalUsage: number;
}

/**
 * Queries the authorized GET /api/credits endpoint to retrieve user's credit ledger summary.
 * Retries transport-level resets only; HTTP/application failures still fail immediately.
 */
export async function fetchCreditsSummary(page: Page): Promise<CreditsSummary> {
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const res = await page.request.get("/api/credits");
      expect(res.ok()).toBeTruthy();
      const body = (await res.json()) as { code: number; data: CreditsSummary };
      expect(body.code).toBe(0);
      expect(typeof body.data.available).toBe("number");
      expect(typeof body.data.activeHolds).toBe("number");
      expect(typeof body.data.totalUsage).toBe("number");
      return body.data;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const transient = /ECONNRESET|ECONNREFUSED|socket hang up/i.test(message);
      if (!transient || attempt === maxAttempts) {
        throw new Error(`Credit summary request failed: ${sanitizeFailureOutput(message)}`);
      }
      await page.waitForTimeout(150 * attempt);
    }
  }

  throw new Error("Credit summary request failed after transient retries");
}

/**
 * Sanitizes failure output and logs to prevent leaking credentials, tokens, prompts, or private storage URLs.
 */
export function sanitizeFailureOutput(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = typeof value === "string" ? value : String((value as Error)?.message || value);
  return str
    .replace(/token=[a-zA-Z0-9_-]+/gi, "token=[REDACTED]")
    .replace(/password['"]?\s*:\s*['"][^'"]+['"]/gi, 'password:"[REDACTED]"')
    .replace(/secret['"]?\s*:\s*['"][^'"]+['"]/gi, 'secret:"[REDACTED]"')
    .replace(/prompt['"]?\s*:\s*['"][^'"]+['"]/gi, 'prompt:"[REDACTED]"')
    .replace(/quarantine\/[a-zA-Z0-9_-]+/gi, "quarantine/[REDACTED]")
    .replace(/https?:\/\/[^\s"']+\/quarantine\/[^\s"']+/gi, "[REDACTED_QUARANTINE_URL]")
    .replace(/https?:\/\/[^\s"']+\/homedesign-[^\s"']+/gi, "[REDACTED_ASSET_URL]")
    .replace(/https?:\/\/[^\s"']+\/api\/auth\/verify-email\?token=[^\s"']+/gi, "[REDACTED_VERIFY_URL]")
    .split("?")[0];
}
