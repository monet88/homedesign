-- PR #57 / Spec: Enforce single concurrent processing stage run per room design and stage
CREATE UNIQUE INDEX IF NOT EXISTS idx_fp_stage_runs_processing
  ON floor_plan_stage_runs(room_design_id, stage)
  WHERE status = 'processing';
