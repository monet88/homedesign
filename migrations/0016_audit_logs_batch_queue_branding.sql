-- Migration 0016: Audit Logs, Batch AI Rendering Queue & White-Label Branding (Sprint 9)

-- 1. Studio Activity & Credit Audit Logs
CREATE TABLE IF NOT EXISTS workspace_audit_logs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  actor_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  details TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_workspace_audit_time ON workspace_audit_logs(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_workspace_audit_action ON workspace_audit_logs(workspace_id, action);
CREATE INDEX IF NOT EXISTS idx_workspace_audit_actor ON workspace_audit_logs(actor_id);

-- 2. Batch AI Rendering Queue Jobs
CREATE TABLE IF NOT EXISTS batch_render_jobs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'partial')),
  total_items INTEGER NOT NULL DEFAULT 0,
  completed_items INTEGER NOT NULL DEFAULT 0,
  failed_items INTEGER NOT NULL DEFAULT 0,
  total_credits_cost INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_batch_render_user ON batch_render_jobs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_batch_render_workspace ON batch_render_jobs(workspace_id, created_at DESC);

-- Link AI Tasks to Batch Jobs
ALTER TABLE ai_tasks ADD COLUMN batch_id TEXT REFERENCES batch_render_jobs(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_ai_tasks_batch ON ai_tasks(batch_id);

-- 3. White-Label Studio Branding & Watermark
ALTER TABLE workspaces ADD COLUMN brand_logo_url TEXT;
ALTER TABLE workspaces ADD COLUMN brand_name TEXT;
ALTER TABLE workspaces ADD COLUMN brand_tagline TEXT;
ALTER TABLE workspaces ADD COLUMN contact_phone TEXT;
ALTER TABLE workspaces ADD COLUMN contact_email TEXT;
ALTER TABLE workspaces ADD COLUMN contact_address TEXT;
ALTER TABLE workspaces ADD COLUMN watermark_enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE workspaces ADD COLUMN watermark_text TEXT;
ALTER TABLE workspaces ADD COLUMN watermark_position TEXT NOT NULL DEFAULT 'bottom-right';
