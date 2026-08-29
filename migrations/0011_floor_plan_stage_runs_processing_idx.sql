-- PR #57 / Spec: Enforce single concurrent processing stage run per room design and stage
-- Invariant-safe migration: clean up legacy race duplicates before creating unique index.

-- 1. Reconcile stage runs whose tasks have reached terminal failure
UPDATE floor_plan_stage_runs
SET status = 'failed',
    updated_at = CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
WHERE status = 'processing'
  AND design_id IN (
    SELECT id FROM ai_tasks WHERE status IN ('failed', 'expired')
  );
-- 2. Create temporary table of duplicate loser stage runs among genuinely active processing runs
-- (keeping oldest created_at/id as winner, prioritizing ready/notified if present)
DROP TABLE IF EXISTS _migration_0011_loser_stage_runs;
CREATE TABLE _migration_0011_loser_stage_runs AS
SELECT
  fpsr.id AS stage_run_id,
  fpsr.design_id AS task_id,
  ch.id AS hold_id,
  ch.user_id AS user_id,
  ch.amount AS hold_amount,
  ch.ref_type AS ref_type,
  ch.ref_id AS ref_id,
  fpsr.task_status AS task_status
FROM (
  SELECT
    fpsr_inner.id,
    fpsr_inner.design_id,
    t.status AS task_status,
    ROW_NUMBER() OVER (
      PARTITION BY fpsr_inner.room_design_id, fpsr_inner.stage
      ORDER BY
        CASE WHEN t.status IN ('ready', 'notified') THEN 0 ELSE 1 END ASC,
        fpsr_inner.created_at ASC,
        fpsr_inner.id ASC
    ) AS rank
  FROM floor_plan_stage_runs fpsr_inner
  LEFT JOIN ai_tasks t ON t.id = fpsr_inner.design_id
  WHERE fpsr_inner.status = 'processing'
) fpsr
LEFT JOIN credit_holds ch
  ON ch.ref_type = 'task'
  AND ch.ref_id = fpsr.design_id
  AND ch.status = 'active'
WHERE fpsr.rank > 1;

-- 3. Release active credit holds in credit_ledger for active non-terminal loser tasks (rerun-safe via NOT EXISTS)
INSERT INTO credit_ledger (
  id, user_id, entry_type, amount, reason, ref_type, ref_id, grant_key, created_at
)
SELECT
  'mig0011_rel_' || hold_id,
  user_id,
  'release',
  hold_amount,
  'duplicate_stage_run_cleanup',
  ref_type,
  ref_id,
  NULL,
  CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
FROM _migration_0011_loser_stage_runs
WHERE hold_id IS NOT NULL
  AND (task_status IS NULL OR task_status NOT IN ('ready', 'notified'))
  AND NOT EXISTS (
    SELECT 1 FROM credit_ledger WHERE id = 'mig0011_rel_' || _migration_0011_loser_stage_runs.hold_id
  );

-- 4. Mark active credit holds for active non-terminal losers as released
UPDATE credit_holds
SET status = 'released',
    released_at = CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
WHERE id IN (
  SELECT hold_id FROM _migration_0011_loser_stage_runs
  WHERE hold_id IS NOT NULL
    AND (task_status IS NULL OR task_status NOT IN ('ready', 'notified'))
)
  AND status = 'active';

-- 5. Clean up idempotency keys ONLY for active non-terminal loser tasks so future retries are not poisoned
DELETE FROM idempotency_keys
WHERE operation = 'task_create'
  AND result_id IN (
    SELECT task_id FROM _migration_0011_loser_stage_runs
    WHERE task_id IS NOT NULL
      AND (task_status IS NULL OR task_status NOT IN ('ready', 'notified'))
  );

-- 6. Terminalize active non-terminal loser AI tasks
UPDATE ai_tasks
SET status = 'failed',
    error_code = 'DUPLICATE_STAGE_RUN_CLEANUP',
    updated_at = CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
WHERE id IN (
  SELECT task_id FROM _migration_0011_loser_stage_runs
  WHERE task_id IS NOT NULL
    AND (task_status IS NULL OR task_status NOT IN ('ready', 'notified', 'failed', 'expired'))
);

-- 7. Preserve successful duplicate stage runs as success, fail only non-terminal losers
UPDATE floor_plan_stage_runs
SET status = 'success',
    updated_at = CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
WHERE id IN (
  SELECT stage_run_id FROM _migration_0011_loser_stage_runs
  WHERE task_status IN ('ready', 'notified')
);

UPDATE floor_plan_stage_runs
SET status = 'failed',
    updated_at = CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
WHERE id IN (
  SELECT stage_run_id FROM _migration_0011_loser_stage_runs
  WHERE task_status IS NULL OR task_status NOT IN ('ready', 'notified')
);

-- 8. Drop temporary table
DROP TABLE IF EXISTS _migration_0011_loser_stage_runs;

-- 9. Create partial unique index
CREATE UNIQUE INDEX IF NOT EXISTS idx_fp_stage_runs_processing
  ON floor_plan_stage_runs(room_design_id, stage)
  WHERE status = 'processing';
