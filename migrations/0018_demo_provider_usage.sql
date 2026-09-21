-- Migration 0018: Forward migration for demo_provider_usage schema update
-- Creates demo_provider_usage and migrates existing data from demo_daily_provider_usage if present.

CREATE TABLE IF NOT EXISTS demo_provider_usage (
  usage_date TEXT PRIMARY KEY,
  usage_count INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

INSERT OR IGNORE INTO demo_provider_usage (usage_date, usage_count, updated_at)
SELECT day_key, submission_count, updated_at
FROM demo_daily_provider_usage
WHERE EXISTS (SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'demo_daily_provider_usage');
