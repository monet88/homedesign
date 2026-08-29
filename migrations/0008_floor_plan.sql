-- Ticket 10: Floor Plan project specialization — Room Designs + stage runs (0008; 0007 is project_shares).

CREATE TABLE IF NOT EXISTS room_designs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  marker_id TEXT NOT NULL,
  marker_x REAL NOT NULL CHECK (marker_x >= 0 AND marker_x <= 100),
  marker_y REAL NOT NULL CHECK (marker_y >= 0 AND marker_y <= 100),
  marker_locked INTEGER NOT NULL DEFAULT 0,
  brief_confirmed_at INTEGER,
  progress TEXT NOT NULL DEFAULT 'draft',
  recognition_json TEXT,
  proposal_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (project_id, marker_id)
);

CREATE INDEX IF NOT EXISTS idx_room_designs_project ON room_designs(project_id);
CREATE INDEX IF NOT EXISTS idx_room_designs_user ON room_designs(user_id);

CREATE TABLE IF NOT EXISTS floor_plan_stage_runs (
  id TEXT PRIMARY KEY,
  room_design_id TEXT NOT NULL,
  stage TEXT NOT NULL CHECK (stage IN ('brief','layout','render','panorama')),
  status TEXT NOT NULL DEFAULT 'draft',
  design_id TEXT,
  confirmed_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_fp_stage_runs_room ON floor_plan_stage_runs(room_design_id, stage);
CREATE UNIQUE INDEX IF NOT EXISTS idx_fp_stage_runs_design ON floor_plan_stage_runs(design_id);
