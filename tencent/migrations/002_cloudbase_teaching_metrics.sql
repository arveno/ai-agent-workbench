-- Tencent-21 CloudBase MySQL teaching metrics demo data source.
--
-- This table is a public demonstration data source for Agent Run controlled
-- data tools. It intentionally does not include _openid or user_id.

CREATE TABLE IF NOT EXISTS teaching_metrics (
  id VARCHAR(36) NOT NULL,
  `month` VARCHAR(20) NOT NULL,
  grade VARCHAR(50) NOT NULL,
  class_name VARCHAR(100) NOT NULL,
  subject VARCHAR(100) NOT NULL,
  avg_score DECIMAL(5,2) NOT NULL,
  attendance_rate DECIMAL(5,2) NOT NULL,
  homework_completion_rate DECIMAL(5,2) NOT NULL,
  warning_count INT UNSIGNED NOT NULL DEFAULT 0,
  metadata JSON NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_teaching_metrics_month (`month`),
  KEY idx_teaching_metrics_grade (grade),
  KEY idx_teaching_metrics_subject (subject),
  KEY idx_teaching_metrics_class_name (class_name),
  KEY idx_teaching_metrics_month_grade (`month`, grade),
  KEY idx_teaching_metrics_month_subject (`month`, subject)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
