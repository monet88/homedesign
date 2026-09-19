import { describe, it, expect, beforeEach } from "vitest";
import {
  getOrCreateReferralCode,
  recordReferralClick,
  recordReferralSignup,
  activateReferralReward,
  getReferralStats,
} from "./referral";

// In-memory mock DB mimicking Cloudflare D1
class MockD1Database {
  private tables: Record<string, any[]> = {
    referral_codes: [],
    referrals: [],
    credit_ledger: [],
    user: [],
  };

  prepare(query: string) {
    const tables = this.tables;
    let boundArgs: any[] = [];

    const stmt = {
      bind(...args: any[]) {
        boundArgs = args;
        return stmt;
      },
      async first<T = any>(): Promise<T | null> {
        const q = query.trim();
        if (q.includes("SELECT * FROM referral_codes WHERE user_id =")) {
          const row = tables.referral_codes.find((r) => r.user_id === boundArgs[0]);
          return (row ? { ...row } : null) as T;
        }
        if (q.includes("SELECT * FROM referral_codes WHERE LOWER(code) =") || q.includes("SELECT * FROM referral_codes WHERE code =")) {
          const codeArg = (boundArgs[0] || "").toLowerCase();
          const row = tables.referral_codes.find((r) => r.code.toLowerCase() === codeArg);
          return (row ? { ...row } : null) as T;
        }
        if (q.includes("SELECT * FROM referrals WHERE referee_id =")) {
          const row = tables.referrals.find((r) => r.referee_id === boundArgs[0]);
          return (row ? { ...row } : null) as T;
        }
        if (q.includes("SELECT id FROM credit_ledger WHERE user_id =")) {
          const row = tables.credit_ledger.find(
            (r) => r.user_id === boundArgs[0] && (r.entry_type === "usage" || r.entry_type === "payment")
          );
          return (row ? { id: row.id } : null) as T;
        }
        return null;
      },
      async all<T = any>(): Promise<{ results: T[] }> {
        const q = query.trim();
        if (q.includes("FROM referrals WHERE referrer_id =")) {
          const rows = tables.referrals.filter((r) => r.referrer_id === boundArgs[0]);
          return { results: rows.map((r) => ({ ...r })) as T[] };
        }
        return { results: [] };
      },
      async run(): Promise<{ success: boolean }> {
        const q = query.trim();
        if (q.startsWith("INSERT INTO referral_codes")) {
          tables.referral_codes.push({
            id: boundArgs[0],
            user_id: boundArgs[1],
            code: boundArgs[2],
            clicks: 0,
            created_at: boundArgs[3],
          });
        } else if (q.startsWith("UPDATE referral_codes SET clicks = clicks + 1")) {
          const row = tables.referral_codes.find((r) => r.code === boundArgs[0]);
          if (row) row.clicks += 1;
        } else if (q.startsWith("INSERT INTO referrals")) {
          tables.referrals.push({
            id: boundArgs[0],
            referrer_id: boundArgs[1],
            referee_id: boundArgs[2],
            status: boundArgs[3],
            reward_credits: boundArgs[4],
            fingerprint: boundArgs[5],
            ip_hash: boundArgs[6],
            created_at: boundArgs[7],
            activated_at: null,
          });
        } else if (q.startsWith("UPDATE referrals SET status = 'rewarded'")) {
          const row = tables.referrals.find((r) => r.referee_id === boundArgs[1]);
          if (row) {
            row.status = "rewarded";
            row.activated_at = boundArgs[0];
          }
        } else if (q.startsWith("INSERT INTO credit_ledger")) {
          tables.credit_ledger.push({
            id: boundArgs[0],
            user_id: boundArgs[1],
            entry_type: "grant",
            amount: boundArgs[2],
            reason: boundArgs[3],
            grant_key: boundArgs[4],
            created_at: boundArgs[5],
          });
        }
        return { success: true };
      },
    };
    return stmt;
  }
}

describe("Referral Engine (Ticket 7.3)", () => {
  let db: any;

  beforeEach(() => {
    db = new MockD1Database();
  });

  it("creates a deterministic referral code for user", async () => {
    const code1 = await getOrCreateReferralCode(db, "user-123", "Thang Nguyen");
    expect(code1).toBeDefined();
    expect(code1.length).toBeGreaterThanOrEqual(6);

    // Calling again returns existing code
    const code2 = await getOrCreateReferralCode(db, "user-123", "Thang Nguyen");
    expect(code2).toBe(code1);
  });

  it("increments click counter on referral link visit", async () => {
    const code = await getOrCreateReferralCode(db, "user-123", "Thang Nguyen");
    await recordReferralClick(db, code);
    await recordReferralClick(db, code);

    const stats = await getReferralStats(db, "user-123");
    expect(stats.clicks).toBe(2);
  });

  it("rejects self-referral attempts", async () => {
    const code = await getOrCreateReferralCode(db, "user-123", "Thang Nguyen");
    const result = await recordReferralSignup(db, code, "user-123", "fp-1", "ip-1");
    expect(result.success).toBe(false);
    expect(result.reason).toBe("SELF_REFERRAL");
  });

  it("rejects duplicate/sybil referral attempts with same fingerprint/ip", async () => {
    const code = await getOrCreateReferralCode(db, "user-123", "Thang Nguyen");
    // Referrer has fp-1, ip-1
    const result = await recordReferralSignup(db, code, "user-456", "fp-1", "ip-1", {
      referrerFp: "fp-1",
      referrerIp: "ip-1",
    });
    expect(result.success).toBe(false);
    expect(result.reason).toBe("SYBIL_DETECTED");
  });

  it("records referral signup in pending state and awards credits on activation", async () => {
    const code = await getOrCreateReferralCode(db, "referrer-1", "Referrer");

    // Referee signs up
    const signup = await recordReferralSignup(db, code, "referee-1", "fp-referee", "ip-referee");
    expect(signup.success).toBe(true);

    // Initial stats: 1 referral pending, 0 reward credits
    let stats = await getReferralStats(db, "referrer-1");
    expect(stats.totalReferrals).toBe(1);
    expect(stats.rewardedCredits).toBe(0);

    // Referee activates (completes first AI design or purchases pack)
    const activation = await activateReferralReward(db, "referee-1");
    expect(activation.rewarded).toBe(true);
    expect(activation.rewardCredits).toBe(10);

    // Stats updated: 10 reward credits earned!
    stats = await getReferralStats(db, "referrer-1");
    expect(stats.rewardedCredits).toBe(10);

    // Activating again is idempotent
    const activationAgain = await activateReferralReward(db, "referee-1");
    expect(activationAgain.rewarded).toBe(false);
  });

  it("retroactively awards credits immediately if referee user already completed designs before claiming", async () => {
    const code = await getOrCreateReferralCode(db, "referrer-ltd", "LTD");

    // Simulate referee (inu) already rendered a design (1 credit usage in ledger)
    db["tables"].credit_ledger.push({
      id: "ledger_usage_inu_1",
      user_id: "referee-inu",
      entry_type: "usage",
      amount: 1,
      reason: "Interior design generation",
      grant_key: null,
      created_at: Date.now() - 3600000,
    });

    // Now referee-inu claims the referral code from referrer-ltd
    const claim = await recordReferralSignup(db, code, "referee-inu", "fp-inu", "ip-inu");
    expect(claim.success).toBe(true);
    expect(claim.rewardedImmediately).toBe(true);

    // Referrer-ltd stats immediately show 1 referral and +10 credits!
    const stats = await getReferralStats(db, "referrer-ltd");
    expect(stats.totalReferrals).toBe(1);
    expect(stats.rewardedCredits).toBe(10);
  });
});
