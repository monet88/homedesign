-- Migration 0014: Sprint 7 B2B Multi-Project, 4K Upscale & Referral Funnel
--
-- 1. Referral Codes and Referral Conversions (Two-Phase Incentive Lock)
-- 2. Multi-Room Project Rooms support
-- 3. Upscale tracking columns on designs

-- Unique referral code assigned to each user
CREATE TABLE IF NOT EXISTS referral_codes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES user(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  clicks INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_referral_codes_code ON referral_codes(code);
CREATE INDEX IF NOT EXISTS idx_referral_codes_user ON referral_codes(user_id);

-- Referral attribution tracking
CREATE TABLE IF NOT EXISTS referrals (
  id TEXT PRIMARY KEY,
  referrer_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  referee_id TEXT NOT NULL UNIQUE REFERENCES user(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'rewarded', 'rejected')),
  reward_credits INTEGER NOT NULL DEFAULT 10,
  fingerprint TEXT,
  ip_hash TEXT,
  created_at INTEGER NOT NULL,
  activated_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referee ON referrals(referee_id);
CREATE INDEX IF NOT EXISTS idx_referrals_status ON referrals(status);

-- Multi-room Project rooms mapping
CREATE TABLE IF NOT EXISTS project_rooms (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  room_type TEXT NOT NULL,
  source_asset_id TEXT,
  output_asset_id TEXT,
  design_id TEXT,
  is_upscaled INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_project_rooms_project ON project_rooms(project_id);

-- 4K Upscale columns on designs table
ALTER TABLE designs ADD COLUMN is_upscaled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE designs ADD COLUMN upscaled_asset_id TEXT;
