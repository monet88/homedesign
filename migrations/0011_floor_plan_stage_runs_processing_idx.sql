-- PR #57 / Spec: Enforce single concurrent processing stage run per room design and stage
-- Invariant-safe migration: clean up legacy race duplicates before creating unique index.

-- 1. Reconcile notified AI tasks to ready (hold is already settled) so tasks do not linger non-terminal
UPDATE ai_tasks
SET status = 'ready',
    updated_at = CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
WHERE status = 'notified'
  AND id IN (
    SELECT design_id FROM floor_plan_stage_runs WHERE status = 'processing'
  );

-- 2. Reconcile stage runs whose tasks have reached ready/completed status -> mark stage run success
UPDATE floor_plan_stage_runs
SET status = 'success',
    updated_at = CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
WHERE status = 'processing'
  AND design_id IN (
    SELECT id FROM ai_tasks WHERE status = 'ready'
  );

-- 3. Reconcile stage runs whose tasks have reached a terminal failure state -> mark stage run failed
UPDATE floor_plan_stage_runs
SET status = 'failed',
    updated_at = CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
WHERE status = 'processing'
  AND design_id IN (
    SELECT id FROM ai_tasks WHERE status IN ('failed', 'expired')
  );

-- 3. Create temporary table of duplicate loser stage runs among genuinely active processing runs
-- (keeping oldest created_at/id as winner)
DROP TABLE IF EXISTS _migration_0011_loser_stage_runs;
CREATE TABLE _migration_0011_loser_stage_runs AS
SELECT
  fpsr.id AS stage_run_id,
  fpsr.design_id AS task_id,
  ch.id AS hold_id,
  ch.user_id AS user_id,
  ch.amount AS hold_amount,
  ch.ref_type AS ref_type,
  ch.ref_id AS ref_id
FROM (
  SELECT
    id,
    design_id,
    ROW_NUMBER() OVER (
      PARTITION BY room_design_id, stage
      ORDER BY created_at ASC, id ASC
    ) AS rank
  FROM floor_plan_stage_runs
  WHERE status = 'processing'
) fpsr
LEFT JOIN credit_holds ch
  ON ch.ref_type = 'task'
  AND ch.ref_id = fpsr.design_id
  AND ch.status = 'active'
WHERE fpsr.rank > 1;

-- 4. Release active credit holds in credit_ledger for loser tasks (rerun-safe via NOT EXISTS)
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
  AND NOT EXISTS (
    SELECT 1 FROM credit_ledger WHERE id = 'mig0011_rel_' || _migration_0011_loser_stage_runs.hold_id
  );

-- 5. Mark loser active credit holds as released
UPDATE credit_holds
SET status = 'released',
    released_at = CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
WHERE id IN (SELECT hold_id FROM _migration_0011_loser_stage_runs WHERE hold_id IS NOT NULL)
  AND status = 'active';

-- 6. Clean up idempotency keys for loser tasks so future retries are not poisoned
DELETE FROM idempotency_keys
WHERE operation = 'task_create'
  AND result_id IN (SELECT task_id FROM _migration_0011_loser_stage_runs WHERE task_id IS NOT NULL);

-- 7. Terminalize loser AI tasks
UPDATE ai_tasks
SET status = 'failed',
    error_code = 'DUPLICATE_STAGE_RUN_CLEANUP',
    updated_at = CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
WHERE id IN (SELECT task_id FROM _migration_0011_loser_stage_runs WHERE task_id IS NOT NULL)
  AND status NOT IN ('ready', 'notified', 'failed', 'expired');

-- 8. Terminalize loser stage runs
UPDATE floor_plan_stage_runs
SET status = 'failed',
    updated_at = CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
WHERE id IN (SELECT stage_run_id FROM _migration_0011_loser_stage_runs);

-- 9. Drop temporary table
DROP TABLE IF EXISTS _migration_0011_loser_stage_runs;

-- 10. Create partial unique index
CREATE UNIQUE INDEX IF NOT EXISTS idx_fp_stage_runs_processing
  ON floor_plan_stage_runs(room_design_id, stage)
  WHERE status = 'processing';
