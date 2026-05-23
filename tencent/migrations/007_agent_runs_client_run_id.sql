-- Phase G-Final-1 Run ID final single-track migration.
--
-- Purpose:
-- - Make agent_runs.id the only canonical runId.
-- - Move idempotency / duplicate-run protection to client_run_id.
-- - Remove the old runtime_run_id column and its indexes.
--
-- CloudBase RunSql execution:
-- Run the SQL blocks one by one. If a DROP INDEX statement fails because the
-- index is already absent in the target environment, continue with the next
-- block after confirming the current schema.

ALTER TABLE agent_runs
  ADD COLUMN client_run_id VARCHAR(128) NULL AFTER usage_id;

UPDATE agent_runs
SET client_run_id = runtime_run_id
WHERE client_run_id IS NULL
  AND runtime_run_id IS NOT NULL
  AND runtime_run_id <> '';

-- Run this preflight before adding the unique key. If it returns rows, delete
-- old duplicate runs or clear duplicate client_run_id values before continuing.
--
-- SELECT user_id, client_run_id, COUNT(*) AS duplicate_count
-- FROM agent_runs
-- WHERE client_run_id IS NOT NULL AND client_run_id <> ''
-- GROUP BY user_id, client_run_id
-- HAVING COUNT(*) > 1;

ALTER TABLE agent_runs
  DROP INDEX uk_agent_runs_user_runtime_run;

ALTER TABLE agent_runs
  DROP INDEX idx_agent_runs_runtime_run_id;

ALTER TABLE agent_runs
  ADD KEY idx_agent_runs_client_run_id (client_run_id);

ALTER TABLE agent_runs
  ADD UNIQUE KEY uk_agent_runs_user_client_run (user_id, client_run_id);

ALTER TABLE agent_runs
  DROP COLUMN runtime_run_id;
