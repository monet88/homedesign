-- Smoke suite marker table (ticket #18). Synthetic only; no PII.
CREATE TABLE IF NOT EXISTS smoke_markers (
  id TEXT PRIMARY KEY,
  seeded_at INTEGER NOT NULL
);
