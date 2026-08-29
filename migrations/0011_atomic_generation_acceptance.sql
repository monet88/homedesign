-- Enforce ADR 0004 at the database boundary: one processing run per Room Design + stage.
-- This partial unique index is the serialization point for concurrent stage acceptance.
-- If legacy data already violates the invariant, creation fails closed for manual repair.
CREATE UNIQUE INDEX IF NOT EXISTS idx_fp_stage_runs_processing
  ON floor_plan_stage_runs(room_design_id, stage)
  WHERE status = 'processing';