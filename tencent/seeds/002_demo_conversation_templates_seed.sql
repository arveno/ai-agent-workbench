-- Tencent-08A: CloudBase MySQL demo_conversation_templates seed.
--
-- Source:
-- - supabase/migrations/20260512_demo_templates.sql
--
-- Execution:
-- - Run after tencent/seeds/001_demo_task_templates_seed.sql.
-- - Execute this whole INSERT statement in CloudBase RunSql.
-- - The seed is idempotent. Re-running it updates existing rows by primary key.
--
-- Notes:
-- - demo_conversation_templates is a public/system template table, so it does
--   not include _openid or user_id.
-- - JSON NOT NULL fields are written explicitly with JSON_OBJECT() or
--   JSON_ARRAY().
-- - Do not store tokens, secrets, database connection strings, or passwords in
--   this file.

INSERT INTO demo_conversation_templates (
  id,
  title,
  description,
  category,
  visibility,
  seed_messages,
  seed_runs,
  seed_reports,
  sort_order,
  is_enabled,
  metadata
)
VALUES
  (
    '20000000-0000-4000-8000-000000000001',
    '超长教学质量数据分析示例',
    '展示长会话、多轮追问和大文本结果的处理方式，正式长会话能力应通过分页、折叠和懒加载实现。',
    'long_context',
    'demo',
    JSON_ARRAY(
      JSON_OBJECT(
        'role', 'user',
        'kind', 'text',
        'content', '请基于近 6 个月教学质量数据，先总结整体趋势，再标出需要进一步追问的异常项。',
        'status', 'completed'
      ),
      JSON_OBJECT(
        'role', 'assistant',
        'kind', 'text',
        'content', '整体看，平均分保持小幅上升，但八年级出勤率连续两个月低于基线，七年级作业完成率波动较大。建议后续优先追问八年级出勤和七年级作业完成情况。',
        'status', 'completed'
      ),
      JSON_OBJECT(
        'role', 'user',
        'kind', 'text',
        'content', '继续展开八年级出勤率下降的可能原因，并说明需要补充哪些数据。',
        'status', 'completed'
      ),
      JSON_OBJECT(
        'role', 'assistant',
        'kind', 'text',
        'content', '可能原因包括班级活动冲突、个别班级请假集中、统计口径变化或数据同步延迟。建议补充班级维度出勤明细、请假类型、周次分布和班主任备注。',
        'status', 'completed'
      )
    ),
    JSON_ARRAY(),
    JSON_ARRAY(),
    10,
    1,
    JSON_OBJECT(
      'templateKey', 'long_context_quality',
      'showcase', 'long_context',
      'messageCountHint', 120,
      'performanceNotes', '正式长会话展示应通过分页、折叠和 lazy render，不一次性渲染超大 DOM。'
    )
  ),
  (
    '20000000-0000-4000-8000-000000000002',
    '多轮追问生成报告示例',
    '展示从异常定位到原因追问，再到管理报告生成的多轮工作流。',
    'report',
    'demo',
    JSON_ARRAY(
      JSON_OBJECT(
        'role', 'user',
        'kind', 'text',
        'content', '分析本月教学质量数据，先找出异常指标。',
        'status', 'completed'
      ),
      JSON_OBJECT(
        'role', 'assistant',
        'kind', 'text',
        'content', '本月主要异常集中在七年级平均分下降、八年级出勤率波动、九年级作业完成率低于目标线。建议优先核查七年级数学与八年级重点班级。',
        'status', 'completed'
      ),
      JSON_OBJECT(
        'role', 'user',
        'kind', 'text',
        'content', '请把这些发现整理成给教务管理者看的简版报告。',
        'status', 'completed'
      ),
      JSON_OBJECT(
        'role', 'assistant',
        'kind', 'report',
        'content', CONCAT(
          '# 教学质量简版报告',
          CHAR(10), CHAR(10),
          '## 主要结论',
          CHAR(10),
          '本月教学质量整体稳定，但七年级平均分和八年级出勤率存在异常波动。',
          CHAR(10), CHAR(10),
          '## 建议',
          CHAR(10),
          '1. 核查七年级数学周测明细。',
          CHAR(10),
          '2. 跟进八年级班级出勤记录。',
          CHAR(10),
          '3. 将作业完成率纳入下月重点跟踪。'
        ),
        'status', 'completed'
      )
    ),
    JSON_ARRAY(),
    JSON_ARRAY(),
    20,
    1,
    JSON_OBJECT(
      'templateKey', 'report_followup',
      'showcase', 'multi_turn_report',
      'tags', JSON_ARRAY('多轮追问', '报告生成', '管理摘要')
    )
  ),
  (
    '20000000-0000-4000-8000-000000000003',
    '教学评价政策 RAG 检索示例',
    '展示政策依据、来源引用和右侧来源面板的目标体验；真实检索能力将在后续接入。',
    'rag',
    'demo',
    JSON_ARRAY(
      JSON_OBJECT(
        'role', 'user',
        'kind', 'text',
        'content', '根据教学评价制度，为什么要同时关注课堂参与度、作业完成率和学业预警？请给出依据来源。',
        'status', 'completed'
      ),
      JSON_OBJECT(
        'role', 'assistant',
        'kind', 'text',
        'content', '根据示例政策片段，课堂参与度可反映过程性学习状态，作业完成率用于识别持续投入不足，学业预警用于提前发现风险学生。回答中应引用来源，例如 [S1] 评价指标口径、[S2] 学业预警规则。真实 RAG 检索将在后续接入。',
        'status', 'completed'
      ),
      JSON_OBJECT(
        'role', 'user',
        'kind', 'text',
        'content', '如果只能优先看两个指标，应该怎么选？',
        'status', 'completed'
      ),
      JSON_OBJECT(
        'role', 'assistant',
        'kind', 'text',
        'content', '建议优先看作业完成率和学业预警：前者反映过程投入，后者反映结果风险。课堂参与度适合作为解释性辅助指标。',
        'status', 'completed'
      )
    ),
    JSON_ARRAY(),
    JSON_ARRAY(),
    30,
    1,
    JSON_OBJECT(
      'templateKey', 'policy_rag_demo',
      'showcase', 'rag',
      'ragNote', '当前为 RAG 模板示例，真实检索能力将在后续接入。',
      'tags', JSON_ARRAY('RAG', '引用', '政策依据')
    )
  ),
  (
    '20000000-0000-4000-8000-000000000004',
    '数据源异常兜底示例',
    '展示数据源不可用、工具失败和保留上下文的兜底体验。',
    'fallback',
    'demo',
    JSON_ARRAY(
      JSON_OBJECT(
        'role', 'user',
        'kind', 'text',
        'content', '如果数据源暂不可用，系统应该如何提示用户，并如何保留当前分析上下文？',
        'status', 'completed'
      ),
      JSON_OBJECT(
        'role', 'assistant',
        'kind', 'text',
        'content', '系统应明确说明数据源暂不可用，不应伪造查询结果；同时保留当前问题、已完成步骤和可重试入口。用户可以切换公开演示模式继续了解流程，但不应自动把失败请求重放为 Mock。',
        'status', 'completed'
      ),
      JSON_OBJECT(
        'role', 'user',
        'kind', 'text',
        'content', '那对教务管理者应该怎么表达？',
        'status', 'completed'
      ),
      JSON_OBJECT(
        'role', 'assistant',
        'kind', 'text',
        'content', '建议表达为：当前数据源连接暂不可用，本次分析上下文已保留。请稍后重试或联系管理员检查数据源配置；在此期间可查看历史报告或公开演示流程。',
        'status', 'completed'
      )
    ),
    JSON_ARRAY(),
    JSON_ARRAY(),
    40,
    1,
    JSON_OBJECT(
      'templateKey', 'datasource_fallback',
      'showcase', 'fallback',
      'tags', JSON_ARRAY('错误态', '兜底', '上下文保留')
    )
  )
ON DUPLICATE KEY UPDATE
  title = VALUES(title),
  description = VALUES(description),
  category = VALUES(category),
  visibility = VALUES(visibility),
  seed_messages = VALUES(seed_messages),
  seed_runs = VALUES(seed_runs),
  seed_reports = VALUES(seed_reports),
  sort_order = VALUES(sort_order),
  is_enabled = VALUES(is_enabled),
  metadata = VALUES(metadata),
  updated_at = CURRENT_TIMESTAMP(3);
