-- Tencent-21 teaching_metrics seed data.
--
-- Public demo data source for CloudBase Agent Run controlled data tools.
-- Safe to rerun: rows are upserted by primary key.

INSERT INTO teaching_metrics (
  id,
  `month`,
  grade,
  class_name,
  subject,
  avg_score,
  attendance_rate,
  homework_completion_rate,
  warning_count,
  metadata
) VALUES
  ('tm-202605-g7a-math', '2026-05', '七年级', '七年级 1 班', '数学', 82.50, 96.20, 91.40, 2, JSON_OBJECT('source', 'seed', 'trend', 'stable', 'tags', JSON_ARRAY('grade7', 'math'))),
  ('tm-202605-g7a-cn', '2026-05', '七年级', '七年级 1 班', '语文', 84.10, 97.30, 93.20, 1, JSON_OBJECT('source', 'seed', 'trend', 'up', 'tags', JSON_ARRAY('grade7', 'chinese'))),
  ('tm-202605-g7a-en', '2026-05', '七年级', '七年级 1 班', '英语', 80.70, 95.10, 89.50, 3, JSON_OBJECT('source', 'seed', 'trend', 'down', 'tags', JSON_ARRAY('grade7', 'english'))),
  ('tm-202605-g7b-math', '2026-05', '七年级', '七年级 2 班', '数学', 78.90, 94.80, 87.60, 5, JSON_OBJECT('source', 'seed', 'trend', 'down', 'tags', JSON_ARRAY('grade7', 'math'))),
  ('tm-202605-g7b-cn', '2026-05', '七年级', '七年级 2 班', '语文', 83.60, 96.70, 92.10, 2, JSON_OBJECT('source', 'seed', 'trend', 'stable', 'tags', JSON_ARRAY('grade7', 'chinese'))),
  ('tm-202605-g7b-en', '2026-05', '七年级', '七年级 2 班', '英语', 79.40, 93.90, 88.20, 4, JSON_OBJECT('source', 'seed', 'trend', 'down', 'tags', JSON_ARRAY('grade7', 'english'))),
  ('tm-202605-g8a-math', '2026-05', '八年级', '八年级 1 班', '数学', 76.80, 93.40, 85.90, 6, JSON_OBJECT('source', 'seed', 'trend', 'down', 'tags', JSON_ARRAY('grade8', 'math'))),
  ('tm-202605-g8a-cn', '2026-05', '八年级', '八年级 1 班', '语文', 85.20, 96.50, 92.80, 1, JSON_OBJECT('source', 'seed', 'trend', 'up', 'tags', JSON_ARRAY('grade8', 'chinese'))),
  ('tm-202605-g8a-en', '2026-05', '八年级', '八年级 1 班', '英语', 81.90, 94.70, 90.30, 3, JSON_OBJECT('source', 'seed', 'trend', 'stable', 'tags', JSON_ARRAY('grade8', 'english'))),
  ('tm-202605-g8b-math', '2026-05', '八年级', '八年级 2 班', '数学', 74.30, 91.80, 83.40, 8, JSON_OBJECT('source', 'seed', 'trend', 'risk', 'tags', JSON_ARRAY('grade8', 'math'))),
  ('tm-202605-g8b-cn', '2026-05', '八年级', '八年级 2 班', '语文', 82.70, 95.60, 90.80, 3, JSON_OBJECT('source', 'seed', 'trend', 'stable', 'tags', JSON_ARRAY('grade8', 'chinese'))),
  ('tm-202605-g8b-en', '2026-05', '八年级', '八年级 2 班', '英语', 77.60, 92.90, 86.70, 6, JSON_OBJECT('source', 'seed', 'trend', 'down', 'tags', JSON_ARRAY('grade8', 'english'))),
  ('tm-202605-g9a-math', '2026-05', '九年级', '九年级 1 班', '数学', 79.80, 95.30, 88.90, 4, JSON_OBJECT('source', 'seed', 'trend', 'stable', 'tags', JSON_ARRAY('grade9', 'math'))),
  ('tm-202605-g9a-cn', '2026-05', '九年级', '九年级 1 班', '语文', 86.40, 97.80, 94.10, 1, JSON_OBJECT('source', 'seed', 'trend', 'up', 'tags', JSON_ARRAY('grade9', 'chinese'))),
  ('tm-202605-g9a-en', '2026-05', '九年级', '九年级 1 班', '英语', 83.20, 96.40, 91.60, 2, JSON_OBJECT('source', 'seed', 'trend', 'stable', 'tags', JSON_ARRAY('grade9', 'english'))),
  ('tm-202605-g9b-math', '2026-05', '九年级', '九年级 2 班', '数学', 77.10, 93.60, 86.80, 6, JSON_OBJECT('source', 'seed', 'trend', 'down', 'tags', JSON_ARRAY('grade9', 'math'))),
  ('tm-202605-g9b-cn', '2026-05', '九年级', '九年级 2 班', '语文', 84.80, 96.90, 92.70, 2, JSON_OBJECT('source', 'seed', 'trend', 'stable', 'tags', JSON_ARRAY('grade9', 'chinese'))),
  ('tm-202605-g9b-en', '2026-05', '九年级', '九年级 2 班', '英语', 80.50, 94.20, 89.40, 4, JSON_OBJECT('source', 'seed', 'trend', 'down', 'tags', JSON_ARRAY('grade9', 'english'))),
  ('tm-202604-g7a-math', '2026-04', '七年级', '七年级 1 班', '数学', 81.30, 95.90, 90.70, 3, JSON_OBJECT('source', 'seed', 'trend', 'baseline', 'tags', JSON_ARRAY('grade7', 'math'))),
  ('tm-202604-g7a-cn', '2026-04', '七年级', '七年级 1 班', '语文', 82.90, 96.50, 91.60, 2, JSON_OBJECT('source', 'seed', 'trend', 'baseline', 'tags', JSON_ARRAY('grade7', 'chinese'))),
  ('tm-202604-g7a-en', '2026-04', '七年级', '七年级 1 班', '英语', 81.10, 94.80, 89.90, 3, JSON_OBJECT('source', 'seed', 'trend', 'baseline', 'tags', JSON_ARRAY('grade7', 'english'))),
  ('tm-202604-g8a-math', '2026-04', '八年级', '八年级 1 班', '数学', 78.20, 94.10, 86.40, 5, JSON_OBJECT('source', 'seed', 'trend', 'baseline', 'tags', JSON_ARRAY('grade8', 'math'))),
  ('tm-202604-g8a-cn', '2026-04', '八年级', '八年级 1 班', '语文', 84.10, 96.20, 91.90, 2, JSON_OBJECT('source', 'seed', 'trend', 'baseline', 'tags', JSON_ARRAY('grade8', 'chinese'))),
  ('tm-202604-g8a-en', '2026-04', '八年级', '八年级 1 班', '英语', 82.40, 95.20, 90.70, 3, JSON_OBJECT('source', 'seed', 'trend', 'baseline', 'tags', JSON_ARRAY('grade8', 'english'))),
  ('tm-202604-g9a-math', '2026-04', '九年级', '九年级 1 班', '数学', 78.60, 94.90, 87.50, 5, JSON_OBJECT('source', 'seed', 'trend', 'baseline', 'tags', JSON_ARRAY('grade9', 'math'))),
  ('tm-202604-g9a-cn', '2026-04', '九年级', '九年级 1 班', '语文', 85.50, 97.10, 93.50, 1, JSON_OBJECT('source', 'seed', 'trend', 'baseline', 'tags', JSON_ARRAY('grade9', 'chinese'))),
  ('tm-202604-g9a-en', '2026-04', '九年级', '九年级 1 班', '英语', 81.80, 95.60, 90.80, 3, JSON_OBJECT('source', 'seed', 'trend', 'baseline', 'tags', JSON_ARRAY('grade9', 'english')))
ON DUPLICATE KEY UPDATE
  `month` = VALUES(`month`),
  grade = VALUES(grade),
  class_name = VALUES(class_name),
  subject = VALUES(subject),
  avg_score = VALUES(avg_score),
  attendance_rate = VALUES(attendance_rate),
  homework_completion_rate = VALUES(homework_completion_rate),
  warning_count = VALUES(warning_count),
  metadata = VALUES(metadata);
