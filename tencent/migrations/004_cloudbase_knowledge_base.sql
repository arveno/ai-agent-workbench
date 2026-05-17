-- Tencent-28 CloudBase MySQL public demo knowledge base.
--
-- Purpose:
-- - Provide a controlled MySQL-backed knowledge source for Agent Run
--   knowledge_qa.
-- - This is public demo knowledge, not user-private data, so it intentionally
--   has no _openid or user_id.
-- - Retrieval is handled by the CloudBase function; the model never receives
--   direct SQL access.
--
-- CloudBase RunSql:
-- If the console only accepts one statement per execution, run the
-- knowledge_documents CREATE TABLE first, then run the knowledge_chunks CREATE
-- TABLE.

CREATE TABLE IF NOT EXISTS knowledge_documents (
  id VARCHAR(36) NOT NULL,
  title VARCHAR(200) NOT NULL,
  category VARCHAR(100) NOT NULL,
  visibility ENUM('demo','system') NOT NULL DEFAULT 'demo',
  is_enabled TINYINT(1) NOT NULL DEFAULT 1,
  metadata JSON NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_knowledge_documents_title (title),
  KEY idx_knowledge_documents_category (category),
  KEY idx_knowledge_documents_visibility_enabled (visibility, is_enabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id VARCHAR(36) NOT NULL,
  document_id VARCHAR(36) NOT NULL,
  chunk_index INT UNSIGNED NOT NULL,
  title VARCHAR(200) NOT NULL,
  content TEXT NOT NULL,
  keywords JSON NOT NULL,
  metadata JSON NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_knowledge_chunks_document_id (document_id),
  KEY idx_knowledge_chunks_title (title),
  KEY idx_knowledge_chunks_document_chunk (document_id, chunk_index),
  CONSTRAINT fk_knowledge_chunks_document
    FOREIGN KEY (document_id) REFERENCES knowledge_documents(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
