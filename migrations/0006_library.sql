-- Ticket 08: Project library surface (favorite / visibility) and supporting indexes.
-- Sharing/unlisted (#9) will use the visibility column; this migration only adds
-- the column and defaults everything to private.

ALTER TABLE projects ADD COLUMN favorite INTEGER NOT NULL DEFAULT 0;
ALTER TABLE projects ADD COLUMN visibility TEXT NOT NULL DEFAULT 'private';

CREATE INDEX IF NOT EXISTS idx_projects_user_favorite ON projects(user_id, favorite);
CREATE INDEX IF NOT EXISTS idx_projects_user_visibility ON projects(user_id, visibility);
CREATE INDEX IF NOT EXISTS idx_projects_user_updated ON projects(user_id, updated_at);
