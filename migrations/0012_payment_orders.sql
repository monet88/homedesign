-- Ticket 3.1: Real Payment Orders for Monetization (Stripe & SePay).
--
-- Tracks checkout sessions, webhooks, and payment fulfillment status.
-- Once completed, credits are settled into `credit_ledger` atomically.

CREATE TABLE IF NOT EXISTS payment_orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('stripe', 'sepay')),
  pack TEXT NOT NULL CHECK (pack IN ('lite', 'plus', 'pro', 'max')),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL DEFAULT 'usd',
  credits_granted INTEGER NOT NULL CHECK (credits_granted > 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
  provider_session_id TEXT UNIQUE,
  provider_payment_id TEXT UNIQUE,
  ledger_entry_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_payment_orders_user_created
  ON payment_orders(user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_payment_orders_session
  ON payment_orders(provider_session_id);
