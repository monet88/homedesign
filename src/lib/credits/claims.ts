import type { Env } from "@/lib/bindings";
import { getAvailableCredits } from "./ledger";

export const DEFAULT_FREE_CLAIM_AMOUNT = 5;
export const CLAIM_RATE_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours sliding window
export const MAX_CLAIMS_PER_DEVICE = 5; // Allow up to 5 claims / device / 24h (comfortable for studio/testing)
export const MAX_CLAIMS_PER_IP = 10; // Allow up to 10 claims / IP / 24h (studios, coworking, offices)

export interface ClaimFreeTrialResult {
  success: boolean;
  amount?: number;
  newBalance?: number;
  error?: "ALREADY_CLAIMED" | "DEVICE_CLAIM_LIMIT_REACHED" | "IP_CLAIM_LIMIT_REACHED" | "INTERNAL_ERROR";
  message?: string;
}

/**
 * SHA-256 hash a client IP using Web Crypto API.
 * Ensures privacy and uniform format across environments.
 */
export async function hashIp(ip: string): Promise<string> {
  const normalized = ip.trim().toLowerCase();
  const encoder = new TextEncoder();
  const data = encoder.encode(normalized || "unknown-ip");
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Check whether a user has already claimed their onboarding free trial credits.
 */
export async function hasUserClaimedFreeTrial(env: Env, userId: string): Promise<boolean> {
  try {
    const row = await env.DB.prepare(
      `SELECT id FROM user_free_claims WHERE user_id = ?1 LIMIT 1`
    ).bind(userId).first();
    return Boolean(row?.id);
  } catch {
    return false;
  }
}

/**
 * Claim onboarding free trial credits with anti-abuse protection:
 * 1. Checks user has not claimed before (Inviolable Account Invariant).
 * 2. Checks device fingerprint threshold (max 2 / 24h).
 * 3. Checks IP hash threshold (max 5 / 24h).
 * 4. Bypasses device/IP limit for admin role or dev environments.
 * 5. Atomically records claim and adds credit ledger grant.
 */
export async function claimOnboardingFreeTrial(
  env: Env,
  userId: string,
  opts: {
    fingerprint?: string | null;
    ip?: string | null;
    userRole?: string | null;
  }
): Promise<ClaimFreeTrialResult> {
  const fp = (opts.fingerprint || "unknown-device").trim().slice(0, 128);
  const ipHash = await hashIp(opts.ip || "127.0.0.1");
  const now = Date.now();
  const windowStart = now - CLAIM_RATE_LIMIT_WINDOW_MS;
  const isBypassRole = opts.userRole === "admin" || env.ENVIRONMENT === "development";

  // 1. Check if user already claimed (Strict Account Invariant)
  const existingUserClaim = await env.DB.prepare(
    `SELECT id FROM user_free_claims WHERE user_id = ?1 LIMIT 1`
  ).bind(userId).first();

  if (existingUserClaim) {
    return {
      success: false,
      error: "ALREADY_CLAIMED",
      message: "Tài khoản của bạn đã nhận credit dùng thử miễn phí.",
    };
  }

  // 2. Check device fingerprint rate limit (if fingerprint is known & not admin/dev bypass)
  if (fp !== "unknown-device" && !isBypassRole) {
    const recentFpClaims = await env.DB.prepare(
      `SELECT COUNT(id) AS count FROM user_free_claims WHERE fingerprint = ?1 AND created_at > ?2`
    ).bind(fp, windowStart).first<{ count: number }>();

    const count = recentFpClaims?.count ?? 0;
    if (count >= MAX_CLAIMS_PER_DEVICE) {
      return {
        success: false,
        error: "DEVICE_CLAIM_LIMIT_REACHED",
        message: "Thiết bị này đã đạt giới hạn nhận credit dùng thử trong 24 giờ qua. Vui lòng nâng cấp gói để tiếp tục.",
      };
    }
  }

  // 3. Check IP hash rate limit (if IP is not local/unknown & not admin/dev bypass)
  const isLocalIp = opts.ip === "127.0.0.1" || opts.ip === "::1" || !opts.ip;
  if (!isLocalIp && !isBypassRole) {
    const recentIpClaims = await env.DB.prepare(
      `SELECT COUNT(id) AS count FROM user_free_claims WHERE ip_hash = ?1 AND created_at > ?2`
    ).bind(ipHash, windowStart).first<{ count: number }>();

    const count = recentIpClaims?.count ?? 0;
    if (count >= MAX_CLAIMS_PER_IP) {
      return {
        success: false,
        error: "IP_CLAIM_LIMIT_REACHED",
        message: "Địa chỉ IP này đã đạt giới hạn nhận credit dùng thử trong 24 giờ qua. Vui lòng nâng cấp gói để tiếp tục.",
      };
    }
  }

  // 4. Record claim and grant credits
  const claimId = crypto.randomUUID();
  const ledgerId = crypto.randomUUID();
  const grantKey = `onboarding-free-claim-v1:${userId}`;

  try {
    // We execute both inserts atomically in D1 batch
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO user_free_claims (id, user_id, fingerprint, ip_hash, amount, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
      ).bind(claimId, userId, fp, ipHash, DEFAULT_FREE_CLAIM_AMOUNT, now),
      env.DB.prepare(
        `INSERT INTO credit_ledger (id, user_id, entry_type, amount, reason, ref_type, ref_id, grant_key, created_at)
         VALUES (?1, ?2, 'grant', ?3, ?4, 'onboarding_free_trial', ?5, ?6, ?7)`
      ).bind(
        ledgerId,
        userId,
        DEFAULT_FREE_CLAIM_AMOUNT,
        `Onboarding Free Trial (${DEFAULT_FREE_CLAIM_AMOUNT} credits)`,
        claimId,
        grantKey,
        now
      ),
    ]);

    const newBalance = await getAvailableCredits(env, userId);
    return {
      success: true,
      amount: DEFAULT_FREE_CLAIM_AMOUNT,
      newBalance,
    };
  } catch (err) {
    const msg = (err as Error).message || "Database insert error";
    if (msg.includes("UNIQUE constraint failed") || msg.includes("idx_credit_ledger_grant_key")) {
      return {
        success: false,
        error: "ALREADY_CLAIMED",
        message: "Tài khoản của bạn đã nhận credit dùng thử miễn phí.",
      };
    }
    return {
      success: false,
      error: "INTERNAL_ERROR",
      message: msg,
    };
  }
}
