-- Ticket 09: Unlisted read-only project sharing (ADR 0005).
-- Visibility `unlisted` alone is not a share; access requires an active
-- project_shares row keyed by token digest (never plaintext secret).

CREATE TABLE IF NOT EXISTS project_shares (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  token_digest TEXT NOT NULL,
  expires_at INTEGER,
  revoked_at INTEGER,
  created_at INTEGER NOT NULL,
  UNIQUE (token_digest)
);

CREATE INDEX IF NOT EXISTS idx_project_shares_project ON project_shares(project_id);
