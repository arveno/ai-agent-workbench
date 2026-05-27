# CloudBase MySQL Seeds

本目录保存腾讯云单轨实现的 CloudBase MySQL seed 数据。当前 seed 文件覆盖：

```txt
demo_task_templates: 8 rows
demo_conversation_templates: 4 rows
teaching_metrics: 27 rows
knowledge_documents / knowledge_chunks: demo knowledge base rows
eval_cases: Evaluation case rows
```

## 文件

- `001_demo_task_templates_seed.sql`：公开示例任务模板。
- `002_demo_conversation_templates_seed.sql`：公开示例会话模板。
- `003_teaching_metrics_seed.sql`：公开教学质量演示数据，供 CloudBase Agent Run data tools 读取。
- `004_knowledge_base_seed.sql`：公开知识库文档和 chunk，供 `knowledge_search` 读取。
- `005_evaluation_cases_seed.sql`：公开 Evaluation case 集。

## 执行顺序

先确认 `tencent/migrations/001_cloudbase_mysql_schema.sql` 已执行并验证表存在，然后按顺序执行：

1. `001_demo_task_templates_seed.sql`
2. `002_demo_conversation_templates_seed.sql`
3. `003_teaching_metrics_seed.sql`
4. `004_knowledge_base_seed.sql`
5. `005_evaluation_cases_seed.sql`
6. count 验证 SQL

每个 seed 文件只包含一个 `INSERT ... ON DUPLICATE KEY UPDATE` 语句，可整段复制到 CloudBase RunSql 执行。Seed 可重复执行；重复执行会按主键更新已有模板，不会插入重复记录。

## 验证 SQL

```sql
SELECT COUNT(*) AS demo_task_template_count
FROM demo_task_templates
WHERE is_enabled = 1;
```

```sql
SELECT COUNT(*) AS demo_conversation_template_count
FROM demo_conversation_templates
WHERE is_enabled = 1
  AND visibility IN ('demo', 'system');
```

```sql
SELECT COUNT(*) AS teaching_metrics_count
FROM teaching_metrics;
```

```sql
SELECT COUNT(*) AS knowledge_document_count
FROM knowledge_documents
WHERE is_enabled = 1;
```

```sql
SELECT COUNT(*) AS knowledge_chunk_count
FROM knowledge_chunks;
```

```sql
SELECT COUNT(*) AS eval_case_count
FROM eval_cases
WHERE is_active = 1;
```

预期结果：

```txt
demo_task_template_count = 8
demo_conversation_template_count = 4
teaching_metrics_count = 27
knowledge_document_count = 8
knowledge_chunk_count = 24
eval_case_count = 8
```

## 注意事项

- Demo 模板表是公开/system 模板表，不绑定用户，不包含 `_openid` 或 `user_id`。
- `teaching_metrics` 是公开演示数据源，不绑定用户，不包含 `_openid` 或 `user_id`。
- `knowledge_documents` / `knowledge_chunks` 是公开演示知识库，不绑定用户。
- `eval_cases` 是公开/system Evaluation case 表，不绑定用户。
- 所有 JSON 字段必须显式写入 `{}`、`[]` 或完整 JSON；当前 seed 使用 MySQL `JSON_OBJECT()` / `JSON_ARRAY()`。
- 本目录不记录 token、密钥、数据库连接串或真实密码。
