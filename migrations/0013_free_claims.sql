-- Ticket 6.1: Onboarding Free Trial & Anti-Abuse Claim Ledger
--
-- Tracks free credit claims per user, device fingerprint, and IP hash.
-- Enforces:
-- 1. Exactly 1 claim per user account (unique on user_id).
-- 2. Anti-abuse rate limit per device fingerprint / IP hash.

CREATE TABLE IF NOT EXISTS user_free_claims (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES user(id) ON DELETE CASCADE,
  fingerprint TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_free_claims_fp_created
  ON user_free_claims(fingerprint, created_at);

CREATE INDEX IF NOT EXISTS idx_user_free_claims_ip_created
  ON user_free_claims(ip_hash, created_at);
