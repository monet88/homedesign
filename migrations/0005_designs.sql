-- Ticket 07: Generation backend — Design rows, Projects linkage, task columns.
--
-- Object model (spec §Projects / ADR 0005):
--   Project  — owns the run; `kind = interior | exterior | floor-plan`.
--   Design   — one billable generation run. `designs.id == ai_tasks.id` so the
--              Workflow instance ID, the task row, the Credit Hold ref and the
--              public `data.id` are all the same identifier (see ticket notes).
--   ai_tasks — the DesignTask: status machine + hold + 30-min expiry (#5).
--
-- Credits: the hold lives on `ai_tasks` (created by `createTaskWithHold`).
-- `designs` never stores balance — the ledger stays the only source of truth.

-- Projects (minimal shape; the library/sharing surface lands in #17).
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('interior', 'exterior', 'floor-plan')),
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  source_asset_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_projects_user_kind ON projects(user_id, kind);
CREATE INDEX IF NOT EXISTS idx_projects_source ON projects(source_asset_id);

-- Project ↔ Asset membership. Source Assets may be shared across the owner's
-- Projects; a Generated Asset belongs to exactly one run and one Project.
CREATE TABLE IF NOT EXISTS project_assets (
  project_id TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('source', 'generated', 'share-selected')),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (project_id, asset_id, role)
);

CREATE INDEX IF NOT EXISTS idx_project_assets_asset ON project_assets(asset_id);

-- One row per billable generation run. `id` == `ai_tasks.id`.
CREATE TABLE IF NOT EXISTS designs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  scene TEXT NOT NULL CHECK (scene IN ('interior', 'exterior', 'floor-plan')),
  stage TEXT,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  provider_scene TEXT NOT NULL,
  -- Server-built prompt (public API never accepts one).
  prompt TEXT NOT NULL,
  -- Normalized Design Config (JSON) for replay/audit; never contains bytes,
  -- object keys or provider URLs.
  config_json TEXT NOT NULL,
  source_asset_id TEXT NOT NULL,
  output_asset_id TEXT,
  cost_credits INTEGER NOT NULL,
  idempotency_key TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  completed_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_designs_user_created ON designs(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_designs_project ON designs(project_id);
CREATE INDEX IF NOT EXISTS idx_designs_source ON designs(source_asset_id);

-- ai_tasks: provider correlation, terminal error code, validation attempt
-- counter (initial attempt + 3 retries → validation-exhausted → release hold),
-- and the last dispatch timestamp used by the reconciler to re-dispatch a
-- non-terminal task with the SAME id.
ALTER TABLE ai_tasks ADD COLUMN provider_task_id TEXT;
ALTER TABLE ai_tasks ADD COLUMN error_code TEXT;
ALTER TABLE ai_tasks ADD COLUMN validation_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ai_tasks ADD COLUMN dispatched_at INTEGER;

-- Add the terminal success status `ready` (asset ready + attached + settled).
-- D1/SQLite cannot ALTER a CHECK constraint, so rebuild the table (same
-- pattern as 0004_payments.sql). Previous CHECK:
--   ('accepted','processing','output','quarantined','notified','failed','expired')
CREATE TABLE IF NOT EXISTS ai_tasks_v3 (
  id TEXT PRIMARY KEY,
  scene TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt TEXT NOT NULL,
  source_key TEXT,
  status TEXT NOT NULL DEFAULT 'accepted'
    CHECK (status IN ('accepted','processing','output','quarantined','notified','ready','failed','expired')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  user_id TEXT,
  hold_id TEXT,
  cost_credits INTEGER,
  expires_at INTEGER,
  expired_at INTEGER,
  provider_task_id TEXT,
  error_code TEXT,
  validation_attempts INTEGER NOT NULL DEFAULT 0,
  dispatched_at INTEGER
);

INSERT INTO ai_tasks_v3 (id, scene, provider, model, prompt, source_key, status, created_at, updated_at, user_id, hold_id, cost_credits, expires_at, expired_at, provider_task_id, error_code, validation_attempts, dispatched_at)
  SELECT id, scene, provider, model, prompt, source_key, status, created_at, updated_at, user_id, hold_id, cost_credits, expires_at, expired_at, provider_task_id, error_code, validation_attempts, dispatched_at
  FROM ai_tasks;

DROP TABLE ai_tasks;
ALTER TABLE ai_tasks_v3 RENAME TO ai_tasks;

CREATE INDEX IF NOT EXISTS idx_ai_tasks_expiry ON ai_tasks(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_ai_tasks_user_created ON ai_tasks(user_id, created_at);
