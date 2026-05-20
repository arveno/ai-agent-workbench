-- Tencent-30 CloudBase MySQL Evaluation / Bad Case schema.
--
-- Purpose:
-- - Store a public, seed-managed Evaluation case set.
-- - Store private per-user Evaluation / Bad Case results.
-- - Keep Agent Run, model, tool, RAG and report actual data as compact
--   summaries instead of copying raw run_events or raw tool payloads.
--
-- CloudBase RunSql:
-- If the console only accepts one statement per execution, run the eval_cases
-- CREATE TABLE first, then run the eval_results CREATE TABLE.
--
-- Notes:
-- - eval_cases is a public/system table and intentionally has no _openid or
--   user_id.
-- - eval_results is private user data. CloudBase functions must always query
--   it with _openid and user_id filters.
-- - verdict values are controlled by the workbench-evaluations function:
--   pass, fail, unknown. No CHECK constraint is added here to avoid CloudBase
--   MySQL version drift.

CREATE TABLE IF NOT EXISTS eval_cases (
  id VARCHAR(64) NOT NULL,
  title VARCHAR(255) NOT NULL,
  question TEXT NOT NULL,
  category VARCHAR(64) NOT NULL,
  expected_intent VARCHAR(128) NULL,
  expected_tools JSON NOT NULL DEFAULT (JSON_ARRAY()),
  expected_rag JSON NOT NULL DEFAULT (JSON_OBJECT()),
  expected_report JSON NOT NULL DEFAULT (JSON_OBJECT()),
  expected_conclusion_points JSON NOT NULL DEFAULT (JSON_ARRAY()),
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  metadata JSON NOT NULL DEFAULT (JSON_OBJECT()),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_eval_cases_active_sort (is_active, sort_order),
  KEY idx_eval_cases_category_sort (category, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS eval_results (
  id VARCHAR(64) NOT NULL,
  _openid VARCHAR(128) NOT NULL,
  user_id VARCHAR(128) NOT NULL,
  case_id VARCHAR(64) NOT NULL,
  conversation_id VARCHAR(64) NULL,
  run_id VARCHAR(64) NULL,
  runtime_run_id VARCHAR(128) NULL,
  verdict VARCHAR(32) NOT NULL DEFAULT 'unknown',
  bad_case_reason VARCHAR(128) NULL,
  human_note TEXT NULL,
  actual_summary JSON NOT NULL DEFAULT (JSON_OBJECT()),
  model_trace JSON NOT NULL DEFAULT (JSON_OBJECT()),
  tool_summary JSON NOT NULL DEFAULT (JSON_ARRAY()),
  rag_summary JSON NOT NULL DEFAULT (JSON_OBJECT()),
  report_summary JSON NOT NULL DEFAULT (JSON_OBJECT()),
  metadata JSON NOT NULL DEFAULT (JSON_OBJECT()),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_eval_results_openid (_openid),
  KEY idx_eval_results_user_created (user_id, created_at),
  KEY idx_eval_results_user_case_created (user_id, case_id, created_at),
  KEY idx_eval_results_user_run (user_id, run_id),
  KEY idx_eval_results_user_verdict_created (user_id, verdict, created_at),
  CONSTRAINT fk_eval_results_case
    FOREIGN KEY (case_id) REFERENCES eval_cases (id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_eval_results_conversation
    FOREIGN KEY (conversation_id) REFERENCES conversations (id)
    ON DELETE SET NULL,
  CONSTRAINT fk_eval_results_run
    FOREIGN KEY (run_id) REFERENCES agent_runs (id)
    ON DELETE SET NULL,
  CONSTRAINT fk_eval_results_profile_user
    FOREIGN KEY (user_id) REFERENCES app_profiles (user_id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
