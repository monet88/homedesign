-- Ticket 04: immutable Credit Ledger + Credit Holds (ADR 0002).
--
-- The Ledger is the single source of truth for balance. Balance is always
-- DERIVED, never stored or edited directly:
--   Available = Σ(grants + mock payments) − Σ(usage) − Σ(active holds)
--
-- Signed amounts: grant/payment/release are positive; usage/hold are negative.
-- `credit_holds` tracks the hold lifecycle (active -> settled | released) so
-- later tickets (#5/#7) can query a hold by task ref and settle/release it
-- exactly once. settle converts a hold into usage; release restores it.

CREATE TABLE IF NOT EXISTS credit_ledger (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  entry_type TEXT NOT NULL
    CHECK (entry_type IN ('grant', 'payment', 'usage', 'hold', 'release')),
  amount INTEGER NOT NULL,
  reason TEXT NOT NULL,
  ref_type TEXT,
  ref_id TEXT,
  grant_key TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_credit_ledger_user_created
  ON credit_ledger(user_id, created_at);

-- Idempotent one-time grants: a unique (user_id, grant_key) makes concurrent
-- `INSERT ... ON CONFLICT DO NOTHING` grant exactly once. Non-grant rows carry
-- grant_key = NULL (SQLite treats NULLs as distinct in unique indexes).
CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_ledger_grant_key
  ON credit_ledger(user_id, grant_key) WHERE grant_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS credit_holds (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL CHECK (amount > 0),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'settled', 'released')),
  ref_type TEXT NOT NULL,
  ref_id TEXT NOT NULL,
  ledger_hold_id TEXT,
  created_at INTEGER NOT NULL,
  settled_at INTEGER,
  released_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_credit_holds_user_status
  ON credit_holds(user_id, status);

-- A task/run can have at most one ACTIVE hold (#7: no double-hold on retry).
CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_holds_ref_active
  ON credit_holds(ref_type, ref_id) WHERE status = 'active';
