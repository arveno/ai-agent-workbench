-- Tencent-28 CloudBase knowledge base seed data.
--
-- Public demo knowledge for the Agent Run knowledge_qa controlled RAG tool.
-- Safe to rerun: rows are upserted by primary key.
--
-- CloudBase RunSql:
-- If the console only accepts one statement per execution, run the documents
-- INSERT first, then run the chunks INSERT.

INSERT INTO knowledge_documents (
  id,
  title,
  category,
  visibility,
  is_enabled,
  metadata
) VALUES
  ('kb-doc-platform', 'AI Agent Workbench 平台能力说明', 'platform', 'demo', 1, JSON_OBJECT('source', 'seed', 'tags', JSON_ARRAY('platform', 'agent'))),
  ('kb-doc-metrics', '教学质量分析指标说明', 'metrics', 'demo', 1, JSON_OBJECT('source', 'seed', 'tags', JSON_ARRAY('metrics', 'teaching_quality'))),
  ('kb-doc-warning', '异常指标与 warning_count 解释', 'metrics', 'demo', 1, JSON_OBJECT('source', 'seed', 'tags', JSON_ARRAY('warning_count', 'risk'))),
  ('kb-doc-agent-run', 'Agent Run 执行流程说明', 'agent_run', 'demo', 1, JSON_OBJECT('source', 'seed', 'tags', JSON_ARRAY('agent_run', 'run_trace'))),
  ('kb-doc-report', '报告生成与 report_artifacts 说明', 'report', 'demo', 1, JSON_OBJECT('source', 'seed', 'tags', JSON_ARRAY('report', 'artifact'))),
  ('kb-doc-quota', 'quota 与 fallback 机制说明', 'runtime', 'demo', 1, JSON_OBJECT('source', 'seed', 'tags', JSON_ARRAY('quota', 'fallback'))),
  ('kb-doc-cloudbase', 'CloudBase 迁移链路说明', 'migration', 'demo', 1, JSON_OBJECT('source', 'seed', 'tags', JSON_ARRAY('cloudbase', 'migration'))),
  ('kb-doc-rag', 'RAG 知识检索使用说明', 'rag', 'demo', 1, JSON_OBJECT('source', 'seed', 'tags', JSON_ARRAY('rag', 'knowledge_search')))
ON DUPLICATE KEY UPDATE
  title = VALUES(title),
  category = VALUES(category),
  visibility = VALUES(visibility),
  is_enabled = VALUES(is_enabled),
  metadata = VALUES(metadata);

INSERT INTO knowledge_chunks (
  id,
  document_id,
  chunk_index,
  title,
  content,
  keywords,
  metadata
) VALUES
  ('kb-chunk-platform-001', 'kb-doc-platform', 1, '平台定位', 'AI Agent Workbench 是面向教育数据分析的工作台，核心流程包括公开示例、私有会话、消息持久化、Agent Run、Run Trace、报告和刷新恢复。', JSON_ARRAY('平台能力', 'AI Agent Workbench', '公开示例', '私有会话'), JSON_OBJECT('source', 'seed')),
  ('kb-chunk-platform-002', 'kb-doc-platform', 2, '公开示例与私有会话', '公开示例任务用于演示入口；用户登录后触发真实 Agent 时，会创建 CloudBase private conversation，后续恢复以 conversation.id 为唯一主键。', JSON_ARRAY('公开示例', 'private conversation', 'conversation.id', 'CloudBase'), JSON_OBJECT('source', 'seed')),
  ('kb-chunk-platform-003', 'kb-doc-platform', 3, '刷新恢复原则', '刷新页面时应先恢复 CloudBase Auth，再读取 conversations、messages、latest run bundle 和 reports。恢复过程不应触发新的 Agent Run。', JSON_ARRAY('刷新恢复', 'messages', 'runs', 'reports'), JSON_OBJECT('source', 'seed')),

  ('kb-chunk-metrics-001', 'kb-doc-metrics', 1, 'avg_score 含义', 'avg_score 表示班级在某学科某月份的平均分，可用于观察成绩水平和不同年级、学科之间的差异。', JSON_ARRAY('avg_score', '平均分', '成绩'), JSON_OBJECT('source', 'seed')),
  ('kb-chunk-metrics-002', 'kb-doc-metrics', 2, 'attendance_rate 含义', 'attendance_rate 表示出勤率，单位为百分比。出勤率下降通常需要结合成绩、作业完成率和班级情况进一步判断。', JSON_ARRAY('attendance_rate', '出勤率', '出勤'), JSON_OBJECT('source', 'seed')),
  ('kb-chunk-metrics-003', 'kb-doc-metrics', 3, 'homework_completion_rate 含义', 'homework_completion_rate 表示作业完成率，单位为百分比。它可以作为学习投入和阶段性风险的辅助指标。', JSON_ARRAY('homework_completion_rate', '作业完成率', '完成率'), JSON_OBJECT('source', 'seed')),

  ('kb-chunk-warning-001', 'kb-doc-warning', 1, 'warning_count 含义', 'warning_count 表示当前维度下需要关注的预警或异常数量。它不是单个学生名单，而是用于提示某班级、年级或学科存在需要进一步排查的风险点。', JSON_ARRAY('warning_count', '预警', '异常指标', '风险'), JSON_OBJECT('source', 'seed')),
  ('kb-chunk-warning-002', 'kb-doc-warning', 2, '如何解释预警数量', 'warning_count 较高时，应结合 avg_score、attendance_rate 和 homework_completion_rate 交叉验证，避免只根据单一指标下结论。', JSON_ARRAY('warning_count', 'avg_score', 'attendance_rate', 'homework_completion_rate'), JSON_OBJECT('source', 'seed')),
  ('kb-chunk-warning-003', 'kb-doc-warning', 3, '异常指标处理建议', '异常指标通常用于定位优先关注范围，例如某年级某学科预警数量偏高时，可以继续查看班级、月份和学科维度。', JSON_ARRAY('异常指标', '教学质量', '班级', '学科'), JSON_OBJECT('source', 'seed')),

  ('kb-chunk-agent-001', 'kb-doc-agent-run', 1, 'Agent Run 是什么', 'Agent Run 是真实分析任务的服务端执行单元，会记录 agent_runs、run_events、tool_invocations、assistant message 和 quota usage。', JSON_ARRAY('Agent Run', 'agent_runs', 'run_events', 'tool_invocations'), JSON_OBJECT('source', 'seed')),
  ('kb-chunk-agent-002', 'kb-doc-agent-run', 2, 'Run Trace 来源', 'Run Trace 由 SSE 事件和持久化 run_events 恢复，包括 step_started、tool_started、tool_completed、conclusion_completed 和 run_completed 等事件。', JSON_ARRAY('Run Trace', 'SSE', 'run_events', 'tool_completed'), JSON_OBJECT('source', 'seed')),
  ('kb-chunk-agent-003', 'kb-doc-agent-run', 3, '数据工具链', 'data_analysis 意图会运行 schema_inspect、aggregate_table 和 chart_render；knowledge_qa 意图会运行 knowledge_search。', JSON_ARRAY('schema_inspect', 'aggregate_table', 'chart_render', 'knowledge_search'), JSON_OBJECT('source', 'seed')),

  ('kb-chunk-report-001', 'kb-doc-report', 1, '报告生成入口', 'Agent Run 完成后如果进入 report_pending 状态，前端可以基于当前 conversation.id 和 currentRun.id 生成简版报告。', JSON_ARRAY('报告', 'report_pending', 'currentRun', 'conversation.id'), JSON_OBJECT('source', 'seed')),
  ('kb-chunk-report-002', 'kb-doc-report', 2, 'report_artifacts 归属', '报告持久化到 report_artifacts，归属主键是 conversation_id。metadata 可记录 runId、conclusionSource、fallbackReason 和 toolNames。', JSON_ARRAY('report_artifacts', 'conversation_id', 'runId', 'metadata'), JSON_OBJECT('source', 'seed')),
  ('kb-chunk-report-003', 'kb-doc-report', 3, '报告恢复', '刷新或切换会话时，前端会读取 /api/workbench/reports?conversationId=...，报告只展示在当前 active conversation 下。', JSON_ARRAY('报告恢复', 'GET reports', 'conversationId'), JSON_OBJECT('source', 'seed')),

  ('kb-chunk-quota-001', 'kb-doc-quota', 1, 'quota 扣减规则', 'quota 用于限制真实 Agent Run 调用次数。正常 Agent Run 只应 consume 一次，读取 messages、runs 或 reports 不应扣 quota。', JSON_ARRAY('quota', 'consume', 'Agent Run', '扣减'), JSON_OBJECT('source', 'seed')),
  ('kb-chunk-quota-002', 'kb-doc-quota', 2, 'fallback 原则', 'fallback 表示服务端明确说明某个环节不可用或模型失败，不能把 fallback 结果伪装成真实模型输出。', JSON_ARRAY('fallback', '模型失败', 'model_forbidden', 'model_not_configured'), JSON_OBJECT('source', 'seed')),
  ('kb-chunk-quota-003', 'kb-doc-quota', 3, '幂等保护', 'Agent Run 使用 user_id + clientRunId 做幂等保护，并依赖数据库唯一约束避免并发重复创建 run 或重复扣 quota。', JSON_ARRAY('幂等', 'clientRunId', 'quota', '唯一约束'), JSON_OBJECT('source', 'seed')),

  ('kb-chunk-cloudbase-001', 'kb-doc-cloudbase', 1, 'CloudBase 单轨主线', '当前迁移目标是让 CloudBase 成为默认 Auth、API、MySQL 和 Agent Run 主线，Vercel/Supabase legacy 仅作为迁移期回滚路径保留。', JSON_ARRAY('CloudBase', 'Auth', 'MySQL', 'legacy'), JSON_OBJECT('source', 'seed')),
  ('kb-chunk-cloudbase-002', 'kb-doc-cloudbase', 2, '本地开发代理', '本地开发可使用 Vite proxy 将 /api 代理到 CloudBase HTTP Function 域名，避免 localhost 直接跨域请求 CloudBase 产生 CORS。', JSON_ARRAY('Vite proxy', 'CORS', 'CLOUDBASE_PROXY_TARGET'), JSON_OBJECT('source', 'seed')),
  ('kb-chunk-cloudbase-003', 'kb-doc-cloudbase', 3, '私有 API token', 'CloudBase private API 必须使用 CloudBase access_token，不应混用 Supabase token。公开 demo templates 可以不带 token 读取。', JSON_ARRAY('access_token', 'private API', 'Supabase token'), JSON_OBJECT('source', 'seed')),

  ('kb-chunk-rag-001', 'kb-doc-rag', 1, 'RAG 检索范围', '当前 CloudBase RAG 是受控 MySQL 检索，不接外部向量库。knowledge_search 只读取启用的 demo/system 知识文档和 chunks。', JSON_ARRAY('RAG', 'knowledge_search', 'knowledge_documents', 'knowledge_chunks'), JSON_OBJECT('source', 'seed')),
  ('kb-chunk-rag-002', 'kb-doc-rag', 2, 'RAG 匹配方式', 'knowledge_search 根据用户问题提取关键词，在 chunk title、content 和 keywords 中做简单评分，返回 top 3-5 个知识片段。', JSON_ARRAY('关键词', '评分', 'topK', 'keywords'), JSON_OBJECT('source', 'seed')),
  ('kb-chunk-rag-003', 'kb-doc-rag', 3, 'RAG 无命中处理', '如果知识库没有命中，Agent Run 应返回 rag_no_match fallback，并明确说明未找到相关知识，不应编造答案。', JSON_ARRAY('rag_no_match', 'fallback', '无命中'), JSON_OBJECT('source', 'seed'))
ON DUPLICATE KEY UPDATE
  document_id = VALUES(document_id),
  chunk_index = VALUES(chunk_index),
  title = VALUES(title),
  content = VALUES(content),
  keywords = VALUES(keywords),
  metadata = VALUES(metadata);
