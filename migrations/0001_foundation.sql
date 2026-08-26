-- Ticket 01: foundation schema for the Workers runtime harness.
-- Later tickets add the full D1 metadata schema (identity, ledger, projects,
-- floor plan lineage, activity). Keep this minimal and backward-compatible.

CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  lifecycle TEXT NOT NULL DEFAULT 'pending-upload'
    CHECK (lifecycle IN ('pending-upload', 'quarantined', 'ready', 'rejected', 'deleted')),
  storage_key TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_tasks (
  id TEXT PRIMARY KEY,
  scene TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt TEXT NOT NULL,
  source_key TEXT,
  status TEXT NOT NULL DEFAULT 'accepted'
    CHECK (status IN ('accepted', 'processing', 'output', 'quarantined', 'notified', 'failed')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Queue notify test harness: records PROVIDER_NOTIFY + ASSET_VALIDATE messages
-- so tests can assert on at-least-once delivery without a live queue consumer.
CREATE TABLE IF NOT EXISTS queue_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  queue TEXT NOT NULL,
  body TEXT NOT NULL,
  received_at INTEGER NOT NULL
);
