# CloudBase MySQL Seeds

本目录保存腾讯云单轨实现的 CloudBase MySQL seed 数据。当前 seed 已在 CloudBase MySQL 手动执行通过：

```txt
demo_task_templates: 8 rows
demo_conversation_templates: 4 rows
```

## 文件

- `001_demo_task_templates_seed.sql`：公开示例任务模板。
- `002_demo_conversation_templates_seed.sql`：公开示例会话模板。

## 执行顺序

先确认 `tencent/migrations/001_cloudbase_mysql_schema.sql` 已执行并验证表存在，然后按顺序执行：

1. `001_demo_task_templates_seed.sql`
2. `002_demo_conversation_templates_seed.sql`
3. count 验证 SQL

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

预期结果：

```txt
demo_task_template_count = 8
demo_conversation_template_count = 4
```

## 注意事项

- Demo 模板表是公开/system 模板表，不绑定用户，不包含 `_openid` 或 `user_id`。
- 所有 JSON 字段必须显式写入 `{}`、`[]` 或完整 JSON；当前 seed 使用 MySQL `JSON_OBJECT()` / `JSON_ARRAY()`。
- 本目录不记录 token、密钥、数据库连接串或真实密码。
