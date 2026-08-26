-- Ticket 05: Mock Payment + idempotency keys + task/hold atomicity (ADR 0002).
--
-- Extends ticket 04's ledger with:
--   * `mock_payments`      — one row per successful Mock Purchase (audit + AC proof).
--   * `idempotency_keys`   — unique (user_id, operation, idempotency_key) with a
--                            canonical request fingerprint. Same key + same
--                            fingerprint -> cached record; same key + different
--                            fingerprint -> 409 IDEMPOTENCY_KEY_REUSED.
--   * `ai_tasks`           — extended with user_id, hold_id, cost_credits,
--                            expires_at (30 min server expiry) and the 'expired'
--                            terminal status for the reconciler.
--
-- Production ban: the App Worker rejects Mock Payment when
-- ENVIRONMENT === "production". This schema only stores test credits; nothing
-- here is convertible to real payment.

-- Successful Mock Purchases (ADR 0002 §Mock Payment boundary).
CREATE TABLE IF NOT EXISTS mock_payments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  pack TEXT NOT NULL CHECK (pack IN ('lite', 'plus', 'pro', 'max')),
  label TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  idempotency_key TEXT NOT NULL,
  ledger_entry_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mock_payments_user_created
  ON mock_payments(user_id, created_at);

-- Idempotency keys shared by Mock Payment and (contract-wise) task creation.
-- The request fingerprint is a canonical hash of the operation payload so
-- "same key + same payload" returns the cached record while "same key +
-- different payload" is rejected with 409.
CREATE TABLE IF NOT EXISTS idempotency_keys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  operation TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_fingerprint TEXT NOT NULL,
  -- Domain record produced by this idempotent operation.
  result_type TEXT NOT NULL,
  result_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (user_id, operation, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_idempotency_keys_user_created
  ON idempotency_keys(user_id, created_at);

-- Extend ai_tasks so the App Worker can atomically create a task row + hold
-- (ADR 0002: "task acceptance creates a Credit Hold atomically").
ALTER TABLE ai_tasks ADD COLUMN user_id TEXT;
ALTER TABLE ai_tasks ADD COLUMN hold_id TEXT;
ALTER TABLE ai_tasks ADD COLUMN cost_credits INTEGER;
ALTER TABLE ai_tasks ADD COLUMN expires_at INTEGER;
ALTER TABLE ai_tasks ADD COLUMN expired_at INTEGER;

-- The 'expired' terminal status is added via a table rebuild because D1/SQLite
-- cannot ALTER a CHECK constraint. Original CHECK allowed only:
--   ('accepted','processing','output','quarantined','notified','failed')
-- New CHECK adds 'expired'. The rebuild preserves existing rows.
CREATE TABLE IF NOT EXISTS ai_tasks_new (
  id TEXT PRIMARY KEY,
  scene TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt TEXT NOT NULL,
  source_key TEXT,
  status TEXT NOT NULL DEFAULT 'accepted'
    CHECK (status IN ('accepted','processing','output','quarantined','notified','failed','expired')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  user_id TEXT,
  hold_id TEXT,
  cost_credits INTEGER,
  expires_at INTEGER,
  expired_at INTEGER
);

INSERT INTO ai_tasks_new (id, scene, provider, model, prompt, source_key, status, created_at, updated_at, user_id, hold_id, cost_credits, expires_at, expired_at)
  SELECT id, scene, provider, model, prompt, source_key, status, created_at, updated_at, user_id, hold_id, cost_credits, expires_at, expired_at
  FROM ai_tasks;

DROP TABLE ai_tasks;
ALTER TABLE ai_tasks_new RENAME TO ai_tasks;

CREATE INDEX IF NOT EXISTS idx_ai_tasks_expiry
  ON ai_tasks(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_ai_tasks_user_created
  ON ai_tasks(user_id, created_at);
