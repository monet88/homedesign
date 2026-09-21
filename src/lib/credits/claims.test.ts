import { describe, expect, it } from "vitest";
import {
  hashIp,
  DEFAULT_FREE_CLAIM_AMOUNT,
  CLAIM_RATE_LIMIT_WINDOW_MS,
  MAX_CLAIMS_PER_DEVICE,
  MAX_CLAIMS_PER_IP,
  claimOnboardingFreeTrial,
  hasUserClaimedFreeTrial,
} from "./claims";
import type { Env } from "@/lib/bindings";

describe("Onboarding Free Trial & Anti-Abuse (Ticket 6.1 & Refactor)", () => {
  it("hashIp generates deterministic 64-char hex string", async () => {
    const hash1 = await hashIp("192.168.1.1");
    const hash2 = await hashIp("192.168.1.1");
    const hash3 = await hashIp("10.0.0.1");

    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
    expect(hash1).not.toBe(hash3);
  });

  it("exports sensible defaults (5 credits, 24h window, threshold limits)", () => {
    expect(DEFAULT_FREE_CLAIM_AMOUNT).toBe(5);
    expect(CLAIM_RATE_LIMIT_WINDOW_MS).toBe(24 * 60 * 60 * 1000);
    expect(MAX_CLAIMS_PER_DEVICE).toBe(5);
    expect(MAX_CLAIMS_PER_IP).toBe(10);
  });

  it("handles mock DB queries for claim checks, thresholds, and admin bypass", async () => {
    const claims = new Map<string, any>();

    const mockEnv = {
      DB: {
        prepare: (query: string) => ({
          bind: (...args: any[]) => ({
            first: async <T = any>() => {
              if (query.includes("FROM user_free_claims WHERE user_id = ?1")) {
                const userId = args[0];
                return (claims.has(userId) ? { id: claims.get(userId).id } : null) as T;
              }
              if (query.includes("COUNT(id) AS count FROM user_free_claims WHERE fingerprint = ?1")) {
                const fp = args[0];
                const window = args[1];
                let count = 0;
                for (const c of claims.values()) {
                  if (c.fingerprint === fp && c.created_at > window) {
                    count++;
                  }
                }
                return { count } as T;
              }
              if (query.includes("COUNT(id) AS count FROM user_free_claims WHERE ip_hash = ?1")) {
                const ipHash = args[0];
                const window = args[1];
                let count = 0;
                for (const c of claims.values()) {
                  if (c.ip_hash === ipHash && c.created_at > window) {
                    count++;
                  }
                }
                return { count } as T;
              }
              return null as T;
            },
            run: async () => ({ success: true }),
          }),
        }),
        batch: async (statements: any[]) => {
          return [{ success: true }, { success: true }];
        },
      },
    } as unknown as Env;

    // Initially user-1 has not claimed
    const claimedBefore = await hasUserClaimedFreeTrial(mockEnv, "user-1");
    expect(claimedBefore).toBe(false);

    // Perform first claim on device A
    claims.set("user-1", {
      id: "claim-1",
      user_id: "user-1",
      fingerprint: "fp-device-a",
      ip_hash: "ip-hash-a",
      created_at: Date.now(),
    });
    const res1 = await claimOnboardingFreeTrial(mockEnv, "user-1-test", {
      fingerprint: "fp-device-a",
      ip: "123.45.67.89",
    });
    expect(res1.success).toBe(true);
    expect(res1.amount).toBe(5);

    // Same user cannot claim again (Account Invariant)
    const resSameUser = await claimOnboardingFreeTrial(mockEnv, "user-1", {
      fingerprint: "fp-device-different",
      ip: "123.45.67.89",
    });
    expect(resSameUser.success).toBe(false);
    expect(resSameUser.error).toBe("ALREADY_CLAIMED");

    // Second user on same device A is ALLOWED (Threshold = 2, currently 1 existing claim)
    const res2 = await claimOnboardingFreeTrial(mockEnv, "user-2-test", {
      fingerprint: "fp-device-a",
      ip: "123.45.67.89",
    });
    expect(res2.success).toBe(true);

    // Populate device A until threshold (5 claims)
    for (let i = 2; i <= 5; i++) {
      claims.set(`user-${i}`, {
        id: `claim-${i}`,
        user_id: `user-${i}`,
        fingerprint: "fp-device-a",
        ip_hash: "ip-hash-a",
        created_at: Date.now(),
      });
    }

    // 6th user on same device A reaches limit (Threshold 5 reached)
    const resOverLimit = await claimOnboardingFreeTrial(mockEnv, "user-6", {
      fingerprint: "fp-device-a",
      ip: "123.45.67.89",
    });
    expect(resOverLimit.success).toBe(false);
    expect(resOverLimit.error).toBe("DEVICE_CLAIM_LIMIT_REACHED");

    // Admin role bypasses device limit on same device A
    const resAdmin = await claimOnboardingFreeTrial(mockEnv, "admin-user", {
      fingerprint: "fp-device-a",
      ip: "123.45.67.89",
      userRole: "admin",
    });
    expect(resAdmin.success).toBe(true);
  });
});
