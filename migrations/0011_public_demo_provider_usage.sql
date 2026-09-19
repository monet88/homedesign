-- Migration 0011: Public Demo Provider Usage (Ticket #72, ADR 0008)
-- Tracks outbound AI provider submissions per Bangkok calendar day (YYYY-MM-DD).
-- submission_count tracks actual outbound provider attempts (including retries).

CREATE TABLE IF NOT EXISTS demo_provider_usage (
  usage_date TEXT PRIMARY KEY,
  usage_count INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
