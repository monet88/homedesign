-- Migration 0017: Interactive 3D Panorama & VR 360 Tour Engine (Sprint 10)

-- 1. Virtual Tour Container
CREATE TABLE IF NOT EXISTS panorama_tours (
  id TEXT PRIMARY KEY,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  first_scene_id TEXT,
  is_public INTEGER NOT NULL DEFAULT 1,
  share_token TEXT UNIQUE NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_panorama_tours_user ON panorama_tours(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_panorama_tours_workspace ON panorama_tours(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_panorama_tours_share ON panorama_tours(share_token);

-- 2. Tour Rooms / Scenes (Equirectangular 360 Images)
CREATE TABLE IF NOT EXISTS panorama_scenes (
  id TEXT PRIMARY KEY,
  tour_id TEXT NOT NULL REFERENCES panorama_tours(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
  initial_yaw REAL NOT NULL DEFAULT 0.0,
  initial_pitch REAL NOT NULL DEFAULT 0.0,
  initial_hfov REAL NOT NULL DEFAULT 100.0,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_panorama_scenes_tour ON panorama_scenes(tour_id, order_index ASC);

-- 3. Interactive Hot-Spots (Navigation between rooms or architectural info markers)
CREATE TABLE IF NOT EXISTS panorama_hotspots (
  id TEXT PRIMARY KEY,
  scene_id TEXT NOT NULL REFERENCES panorama_scenes(id) ON DELETE CASCADE,
  target_scene_id TEXT REFERENCES panorama_scenes(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('scene', 'info')),
  pitch REAL NOT NULL,
  yaw REAL NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_panorama_hotspots_scene ON panorama_hotspots(scene_id);
