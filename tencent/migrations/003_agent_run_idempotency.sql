-- Tencent-24 Agent Run idempotency hard guard.
--
-- Purpose:
-- - Enforce server-side Agent Run idempotency at the database layer.
-- - Prevent concurrent CloudBase function instances from creating duplicate
--   runs for the same user and clientRunId.
-- - Keep historical rows without clientRunId/runtime_run_id compatible.
--
-- MySQL UNIQUE indexes allow multiple NULL values, so rows without
-- runtime_run_id are not forced into a single record. Blank runtime_run_id
-- values are normalized to NULL before adding the unique key. Only runs that
-- carry a clientRunId/runtime_run_id participate in the hard idempotency
-- boundary.
--
-- CloudBase RunSql execution:
-- Do not paste and execute this whole file as one RunSql request if the
-- console only accepts one SQL statement per execution. Run the following
-- SQL blocks one by one.
--
-- Step 1: run the duplicate preflight SELECT first.
--
-- SELECT user_id, runtime_run_id, COUNT(*) AS duplicate_count
-- FROM agent_runs
-- WHERE runtime_run_id IS NOT NULL AND runtime_run_id <> ''
-- GROUP BY user_id, runtime_run_id
-- HAVING COUNT(*) > 1;
--
-- If the preflight query returns rows, resolve duplicates before adding the
-- unique key.
--
-- Step 2: run the normalization UPDATE.
--
-- UPDATE agent_runs
-- SET runtime_run_id = NULL
-- WHERE runtime_run_id = '';
--
-- Step 3: run the unique key ALTER TABLE.
--
-- ALTER TABLE agent_runs
--   ADD UNIQUE KEY uk_agent_runs_user_runtime_run (user_id, runtime_run_id);

UPDATE agent_runs
SET runtime_run_id = NULL
WHERE runtime_run_id = '';

ALTER TABLE agent_runs
  ADD UNIQUE KEY uk_agent_runs_user_runtime_run (user_id, runtime_run_id);
