-- Tencent-08A: CloudBase MySQL demo_task_templates seed.
--
-- Source:
-- - supabase/migrations/20260512_demo_templates.sql
--
-- Execution:
-- - Run after tencent/migrations/001_cloudbase_mysql_schema.sql.
-- - Execute this whole INSERT statement in CloudBase RunSql.
-- - The seed is idempotent. Re-running it updates existing rows by primary key.
--
-- Notes:
-- - demo_task_templates is a public/system template table, so it does not
--   include _openid or user_id.
-- - JSON NOT NULL fields are written explicitly with JSON_OBJECT() or
--   JSON_ARRAY().
-- - Do not store tokens, secrets, database connection strings, or passwords in
--   this file.

INSERT INTO demo_task_templates (
  id,
  title,
  description,
  prompt,
  category,
  recommended_mode,
  sort_order,
  is_enabled,
  metadata
)
VALUES
  (
    '10000000-0000-4000-8000-000000000001',
    '你能做什么？',
    '了解工作台如何组合教育数据分析、工具调用、报告生成和知识检索能力。',
    '你能做什么？请用工作台视角说明你可以如何帮助我完成教育数据分析、报告生成和知识检索。',
    'intro',
    'mock',
    10,
    1,
    JSON_OBJECT(
      'showcaseValue', '能力介绍 / 入口引导',
      'tags', JSON_ARRAY('能力介绍', '工作台入口', '公开演示')
    )
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    '分析 2026 年 5 月教学质量数据，找出异常指标',
    '定位本月教学质量异常指标、异常班级和可能原因，输出管理建议。',
    '分析 2026 年 5 月教学质量数据，找出异常指标、异常班级和可能原因，并给出管理建议。',
    'analysis',
    'agent',
    20,
    1,
    JSON_OBJECT(
      'showcaseValue', '数据分析 / 异常定位 / 图表生成',
      'tags', JSON_ARRAY('异常定位', '教学质量', '图表生成')
    )
  ),
  (
    '10000000-0000-4000-8000-000000000003',
    '对比本月和上月教学质量指标变化',
    '对比 2026 年 5 月与 4 月关键指标变化，识别改善项和下降项。',
    '对比 2026 年 5 月和 4 月的教学质量指标变化，说明哪些指标改善、哪些指标下降。',
    'analysis',
    'agent',
    30,
    1,
    JSON_OBJECT(
      'showcaseValue', '月度对比 / 变化解释 / 管理关注项',
      'tags', JSON_ARRAY('月度对比', '指标变化', '管理建议')
    )
  ),
  (
    '10000000-0000-4000-8000-000000000004',
    '分析最近 6 个月教学质量趋势',
    '观察长期趋势，识别持续改善和持续下滑的指标。',
    '分析最近 6 个月教学质量趋势，指出持续改善和持续下滑的指标。',
    'analysis',
    'agent',
    40,
    1,
    JSON_OBJECT(
      'showcaseValue', '趋势分析 / 长周期指标 / 风险预警',
      'tags', JSON_ARRAY('趋势分析', '长周期', '风险预警')
    )
  ),
  (
    '10000000-0000-4000-8000-000000000005',
    '生成一份简版教学质量报告',
    '面向教务管理者生成简版教学质量分析报告。',
    '基于本月教学质量数据，生成一份面向教务管理者的简版分析报告。',
    'report',
    'mock',
    50,
    1,
    JSON_OBJECT(
      'showcaseValue', '报告生成 / 管理摘要 / 行动建议',
      'tags', JSON_ARRAY('报告生成', 'Markdown', '管理摘要')
    )
  ),
  (
    '10000000-0000-4000-8000-000000000006',
    '超长上下文数据分析示例',
    '打开长会话模板，展示多轮追问、大文本结果和性能保护边界。',
    '打开一个超长上下文数据分析示例，展示长会话、多轮追问和大文本结果的处理方式。',
    'long_context',
    'mock',
    60,
    1,
    JSON_OBJECT(
      'showcaseValue', '长上下文 / 多轮分析 / 性能保护',
      'tags', JSON_ARRAY('长上下文', '多轮追问', '懒加载'),
      'templateKey', 'long_context_quality',
      'performanceNotes', '不是通过一次性渲染超大 DOM 展示长会话能力，而是后续通过分页、折叠、懒加载实现。'
    )
  ),
  (
    '10000000-0000-4000-8000-000000000007',
    '教学评价政策 RAG 检索示例',
    '打开政策依据模板，展示 RAG 来源引用和证据链入口。',
    '根据教学评价制度，说明为什么要关注课堂参与度、作业完成率和学业预警，并给出依据来源。',
    'rag',
    'mock',
    70,
    1,
    JSON_OBJECT(
      'showcaseValue', 'RAG 来源引用 / 政策依据 / 证据链',
      'tags', JSON_ARRAY('RAG', '政策依据', '引用'),
      'templateKey', 'policy_rag_demo',
      'ragNote', '当前为 RAG 模板示例，真实检索能力将在后续接入。'
    )
  ),
  (
    '10000000-0000-4000-8000-000000000008',
    '数据源异常与兜底示例',
    '打开工具失败和数据源异常模板，展示错误态、兜底和上下文保留。',
    '如果数据源暂不可用，系统应该如何提示用户，并如何保留当前分析上下文？',
    'fallback',
    'mock',
    80,
    1,
    JSON_OBJECT(
      'showcaseValue', '错误态 / 兜底 / 不自动重放 Mock',
      'tags', JSON_ARRAY('错误态', '兜底', '上下文保留'),
      'templateKey', 'datasource_fallback'
    )
  )
ON DUPLICATE KEY UPDATE
  title = VALUES(title),
  description = VALUES(description),
  prompt = VALUES(prompt),
  category = VALUES(category),
  recommended_mode = VALUES(recommended_mode),
  sort_order = VALUES(sort_order),
  is_enabled = VALUES(is_enabled),
  metadata = VALUES(metadata),
  updated_at = CURRENT_TIMESTAMP(3);
