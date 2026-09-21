/**
 * Ticket 7.3: Viral Referral Loop & Growth Engine.
 *
 * Implements:
 * 1. Deterministic/slugified referral code generation per user.
 * 2. Click tracking for marketing attribution.
 * 3. Two-phase incentive lock:
 *    - Phase 1: Referee registers via link -> gets free trial claim.
 *    - Phase 2: Referee activates (first generation or pack purchase) -> Referrer gets 10 credits.
 * 4. Sybil attack & self-referral prevention.
 */

export interface D1DatabaseLike {
  prepare: (query: string) => {
    bind: (...args: any[]) => {
      first: <T = any>() => Promise<T | null>;
      all: <T = any>() => Promise<{ results: T[] }>;
      run: () => Promise<{ success?: boolean }>;
    };
  };
}

export interface ReferralCodeRecord {
  id: string;
  user_id: string;
  code: string;
  clicks: number;
  created_at: number;
}

export interface ReferralRecord {
  id: string;
  referrer_id: string;
  referee_id: string;
  status: "pending" | "rewarded" | "rejected";
  reward_credits: number;
  fingerprint: string | null;
  ip_hash: string | null;
  created_at: number;
  activated_at: number | null;
}

export interface ReferralStats {
  code: string;
  clicks: number;
  totalReferrals: number;
  pendingReferrals: number;
  rewardedReferrals: number;
  rewardedCredits: number;
}

/**
 * Generate a clean, readable referral code slug from user name or ID.
 */
export function generateCodeSlug(userId: string, userName?: string): string {
  const cleanName = (userName || "friend")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 8);
  const suffix = userId.replace(/[^a-z0-9]/gi, "").slice(-4).toLowerCase();
  return `${cleanName || "user"}${suffix || "88"}`;
}

/**
 * Get or create referral code for a user.
 */
export async function getOrCreateReferralCode(
  db: D1DatabaseLike,
  userId: string,
  userName?: string
): Promise<string> {
  const existing = await db
    .prepare("SELECT * FROM referral_codes WHERE user_id = ?1")
    .bind(userId)
    .first<ReferralCodeRecord>();

  if (existing?.code) {
    return existing.code;
  }

  const code = generateCodeSlug(userId, userName);
  const id = `refc_${userId}_${Date.now()}`;
  const now = Date.now();

  await db
    .prepare(
      "INSERT INTO referral_codes (id, user_id, code, clicks, created_at) VALUES (?1, ?2, ?3, 0, ?4)"
    )
    .bind(id, userId, code, now)
    .run();

  return code;
}

/**
 * Record a click on a referral link.
 */
export async function recordReferralClick(db: D1DatabaseLike, code: string): Promise<void> {
  await db
    .prepare("UPDATE referral_codes SET clicks = clicks + 1 WHERE code = ?1")
    .bind(code)
    .run();
}

/**
 * Check if a referee user has already activated (has at least one usage or payment in credit_ledger).
 */
export async function hasUserActivated(
  db: D1DatabaseLike,
  userId: string
): Promise<boolean> {
  const usageRow = await db
    .prepare(
      "SELECT id FROM credit_ledger WHERE user_id = ?1 AND entry_type IN ('usage', 'payment') LIMIT 1"
    )
    .bind(userId)
    .first<{ id: string }>();

  return !!usageRow;
}

/**
 * Record a referral signup (Phase 1: pending activation, with retroactive reward check).
 */
export async function recordReferralSignup(
  db: D1DatabaseLike,
  code: string,
  refereeUserId: string,
  fingerprint?: string,
  ipHash?: string,
  knownReferrerIdentity?: { referrerFp?: string; referrerIp?: string }
): Promise<{
  success: boolean;
  reason?: string;
  referralId?: string;
  isExisting?: boolean;
  rewardedImmediately?: boolean;
}> {
  const cleanCode = code.trim().toLowerCase();
  const refCodeRow = await db
    .prepare("SELECT * FROM referral_codes WHERE LOWER(code) = ?1 OR code = ?2")
    .bind(cleanCode, code)
    .first<ReferralCodeRecord>();

  if (!refCodeRow) {
    return { success: false, reason: "INVALID_CODE" };
  }

  // Prevent self-referral
  if (refCodeRow.user_id === refereeUserId) {
    return { success: false, reason: "SELF_REFERRAL" };
  }

  // Sybil check: if fingerprint or ip matches known referrer device
  if (
    knownReferrerIdentity &&
    ((fingerprint && fingerprint === knownReferrerIdentity.referrerFp) ||
      (ipHash && ipHash === knownReferrerIdentity.referrerIp))
  ) {
    return { success: false, reason: "SYBIL_DETECTED" };
  }

  // Check if referee already was referred
  const existingRef = await db
    .prepare("SELECT * FROM referrals WHERE referee_id = ?1")
    .bind(refereeUserId)
    .first<ReferralRecord>();

  if (existingRef) {
    // If referee already has a pending referral, check if they can be retroactively rewarded now
    if (existingRef.status === "pending") {
      const isAlreadyActive = await hasUserActivated(db, refereeUserId);
      let rewardedImmediately = false;
      if (isAlreadyActive) {
        const activation = await activateReferralReward(db, refereeUserId);
        rewardedImmediately = activation.rewarded;
      }
      return {
        success: true,
        referralId: existingRef.id,
        isExisting: true,
        rewardedImmediately,
      };
    }
    return { success: false, reason: "ALREADY_REFERRED" };
  }

  const referralId = `ref_${Date.now()}_${refereeUserId.slice(-6)}`;
  const now = Date.now();

  await db
    .prepare(
      "INSERT INTO referrals (id, referrer_id, referee_id, status, reward_credits, fingerprint, ip_hash, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)"
    )
    .bind(
      referralId,
      refCodeRow.user_id,
      refereeUserId,
      "pending",
      10,
      fingerprint || null,
      ipHash || null,
      now
    )
    .run();

  // Retroactive Activation Check:
  // If referee user has ALREADY generated designs or bought packs before claiming referral,
  // reward the referrer immediately so nobody misses their rewards!
  const isAlreadyActive = await hasUserActivated(db, refereeUserId);
  let rewardedImmediately = false;
  if (isAlreadyActive) {
    const activation = await activateReferralReward(db, refereeUserId);
    rewardedImmediately = activation.rewarded;
  }

  return { success: true, referralId, rewardedImmediately };
}

/**
 * Activate referral reward (Phase 2: Referrer gets 10 credits upon referee activation).
 */
export async function activateReferralReward(
  db: D1DatabaseLike,
  refereeUserId: string
): Promise<{ rewarded: boolean; rewardCredits?: number; referrerId?: string }> {
  const refRow = await db
    .prepare("SELECT * FROM referrals WHERE referee_id = ?1")
    .bind(refereeUserId)
    .first<ReferralRecord>();

  if (!refRow || refRow.status !== "pending") {
    return { rewarded: false };
  }

  const now = Date.now();
  const ledgerId = `ledger_ref_${refRow.id}`;
  const grantKey = `referral-reward-${refereeUserId}`;

  // Update status to rewarded
  await db
    .prepare("UPDATE referrals SET status = 'rewarded', activated_at = ?1 WHERE referee_id = ?2")
    .bind(now, refereeUserId)
    .run();

  // Credit 10 credits into referrer's ledger
  await db
    .prepare(
      "INSERT INTO credit_ledger (id, user_id, entry_type, amount, reason, grant_key, created_at) VALUES (?1, ?2, 'grant', ?3, ?4, ?5, ?6)"
    )
    .bind(
      ledgerId,
      refRow.referrer_id,
      refRow.reward_credits,
      "Viral Referral Activation Reward",
      grantKey,
      now
    )
    .run();

  return {
    rewarded: true,
    rewardCredits: refRow.reward_credits,
    referrerId: refRow.referrer_id,
  };
}

/**
 * Get stats for a user's referral funnel.
 */
export async function getReferralStats(
  db: D1DatabaseLike,
  userId: string
): Promise<ReferralStats> {
  const codeRow = await db
    .prepare("SELECT * FROM referral_codes WHERE user_id = ?1")
    .bind(userId)
    .first<ReferralCodeRecord>();

  const code = codeRow?.code || "";
  const clicks = codeRow?.clicks || 0;

  const referralsRes = await db
    .prepare("SELECT * FROM referrals WHERE referrer_id = ?1")
    .bind(userId)
    .all<ReferralRecord>();

  const rows: ReferralRecord[] = referralsRes.results || [];
  const totalReferrals = rows.length;
  const pendingReferrals = rows.filter((r) => r.status === "pending").length;
  const rewardedReferrals = rows.filter((r) => r.status === "rewarded").length;
  const rewardedCredits = rows
    .filter((r) => r.status === "rewarded")
    .reduce((sum, r) => sum + r.reward_credits, 0);

  return {
    code,
    clicks,
    totalReferrals,
    pendingReferrals,
    rewardedReferrals,
    rewardedCredits,
  };
}
