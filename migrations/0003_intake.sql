-- Ticket 06: intake validation schema (ADR 0003).
-- Extends the foundation assets table with the fields the upload pipeline and
-- Validation Worker need: uploader (quota scoping), declared vs verified byte
-- size, parsed dimensions, and the retention/deletion state machine.

-- Backward-compatible additive columns on `assets`.
ALTER TABLE assets ADD COLUMN user_id TEXT;
ALTER TABLE assets ADD COLUMN declared_size INTEGER;
ALTER TABLE assets ADD COLUMN actual_size INTEGER;
ALTER TABLE assets ADD COLUMN width INTEGER;
ALTER TABLE assets ADD COLUMN height INTEGER;
ALTER TABLE assets ADD COLUMN created_by TEXT;
ALTER TABLE assets ADD COLUMN deleted_at INTEGER;
ALTER TABLE assets ADD COLUMN purge_at INTEGER;

-- Quota lookups: active intake per user (pending-upload + quarantined),
-- hourly intent rate, ready-private byte total.
CREATE INDEX IF NOT EXISTS idx_assets_user_lifecycle ON assets(user_id, lifecycle);
CREATE INDEX IF NOT EXISTS idx_assets_created_at ON assets(created_at);
CREATE INDEX IF NOT EXISTS idx_assets_lifecycle ON assets(lifecycle);
CREATE INDEX IF NOT EXISTS idx_assets_deleted_at ON assets(deleted_at);

-- Deletion/recovery: `deleted` assets are hidden immediately and purged after
-- the 30-day recovery window. R2 lifecycle rules handle the object bytes;
-- this flag lets the app enforce visibility/access revocation app-side.
ALTER TABLE assets ADD COLUMN recovery_until INTEGER;
