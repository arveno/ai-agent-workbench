-- Tencent-31 CloudBase MySQL Source / Retrieval lineage schema.
--
-- Purpose:
-- - Persist canonical RAG retrieval logs and run sources.
-- - Keep run_events and tool_invocations.output as event/raw debug data.
-- - Support Run Trace / Source Panel refresh recovery and later Report /
--   Evaluation source inputs.
--
-- CloudBase RunSql:
-- If the console only accepts one statement per execution, run the
-- retrieval_logs CREATE TABLE first, then run the run_sources CREATE TABLE.

CREATE TABLE IF NOT EXISTS retrieval_logs (
  id VARCHAR(36) NOT NULL,
  _openid VARCHAR(128) NOT NULL,
  user_id VARCHAR(128) NOT NULL,
  run_id VARCHAR(36) NOT NULL,
  conversation_id VARCHAR(36) NOT NULL,
  tool_invocation_id VARCHAR(36) NULL,
  query TEXT NOT NULL,
  provider VARCHAR(64) NOT NULL,
  matched_chunk_count INT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  metadata JSON NOT NULL,
  PRIMARY KEY (id),
  KEY idx_retrieval_logs_user_run (user_id, run_id, created_at),
  KEY idx_retrieval_logs_run (run_id),
  KEY idx_retrieval_logs_tool_invocation (tool_invocation_id),
  KEY idx_retrieval_logs_conversation_created (conversation_id, created_at),
  CONSTRAINT fk_retrieval_logs_run
    FOREIGN KEY (run_id) REFERENCES agent_runs (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_retrieval_logs_conversation
    FOREIGN KEY (conversation_id) REFERENCES conversations (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_retrieval_logs_tool_invocation
    FOREIGN KEY (tool_invocation_id) REFERENCES tool_invocations (id)
    ON DELETE SET NULL,
  CONSTRAINT fk_retrieval_logs_profile_user
    FOREIGN KEY (user_id) REFERENCES app_profiles (user_id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS run_sources (
  id VARCHAR(36) NOT NULL,
  _openid VARCHAR(128) NOT NULL,
  user_id VARCHAR(128) NOT NULL,
  run_id VARCHAR(36) NOT NULL,
  conversation_id VARCHAR(36) NOT NULL,
  tool_invocation_id VARCHAR(36) NULL,
  retrieval_log_id VARCHAR(36) NULL,
  document_id VARCHAR(36) NULL,
  chunk_id VARCHAR(36) NULL,
  citation_label VARCHAR(32) NULL,
  source_order INT UNSIGNED NOT NULL DEFAULT 0,
  title VARCHAR(255) NOT NULL,
  preview TEXT NOT NULL,
  score DECIMAL(8,4) NULL,
  source_type VARCHAR(32) NOT NULL,
  used_in_answer TINYINT(1) NOT NULL DEFAULT 0,
  no_source_reason VARCHAR(128) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  metadata JSON NOT NULL,
  PRIMARY KEY (id),
  KEY idx_run_sources_user_run_order (user_id, run_id, source_order),
  KEY idx_run_sources_run (run_id),
  KEY idx_run_sources_tool_invocation (tool_invocation_id),
  KEY idx_run_sources_retrieval_log (retrieval_log_id),
  KEY idx_run_sources_document_chunk (document_id, chunk_id),
  KEY idx_run_sources_conversation_created (conversation_id, created_at),
  CONSTRAINT fk_run_sources_run
    FOREIGN KEY (run_id) REFERENCES agent_runs (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_run_sources_conversation
    FOREIGN KEY (conversation_id) REFERENCES conversations (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_run_sources_tool_invocation
    FOREIGN KEY (tool_invocation_id) REFERENCES tool_invocations (id)
    ON DELETE SET NULL,
  CONSTRAINT fk_run_sources_retrieval_log
    FOREIGN KEY (retrieval_log_id) REFERENCES retrieval_logs (id)
    ON DELETE SET NULL,
  CONSTRAINT fk_run_sources_document
    FOREIGN KEY (document_id) REFERENCES knowledge_documents (id)
    ON DELETE SET NULL,
  CONSTRAINT fk_run_sources_chunk
    FOREIGN KEY (chunk_id) REFERENCES knowledge_chunks (id)
    ON DELETE SET NULL,
  CONSTRAINT fk_run_sources_profile_user
    FOREIGN KEY (user_id) REFERENCES app_profiles (user_id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
