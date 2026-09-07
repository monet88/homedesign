-- Migration 0011: Public Demo Provider Usage (Ticket #72, ADR 0008)
-- Tracks outbound AI provider submissions per Bangkok calendar day (YYYY-MM-DD).
-- submission_count tracks actual outbound provider attempts (including retries).

CREATE TABLE IF NOT EXISTS demo_daily_provider_usage (
  day_key TEXT PRIMARY KEY,
  submission_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
