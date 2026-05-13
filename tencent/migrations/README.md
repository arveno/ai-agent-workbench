# CloudBase MySQL Migration 执行说明

本目录保存腾讯云单轨实现的 CloudBase MySQL migration。当前第一版 schema 为：

```txt
001_cloudbase_mysql_schema.sql
```

当前阶段只说明执行方式，不实现自动化脚本，不引入腾讯云 SDK，不在仓库中写入任何腾讯云密钥。

## 执行原则

- 不通过可视化界面手动建表。
- 不在控制台逐个点字段、逐个配置索引或外键。
- 优先使用 SQL migration，保证 schema 可审查、可复用、可回滚设计。
- CloudBase RunSql / API Explorer 可用于 POC 和小规模验证。
- 正式迁移后续应提供脚本化执行方式，避免依赖控制台手动复制 SQL。

## RunSql 分段执行建议

CloudBase RunSql 更适合单条或分段 SQL 执行，不建议一次性粘贴完整长 SQL。执行 `001_cloudbase_mysql_schema.sql` 时，建议每个 `CREATE TABLE ... ENGINE=InnoDB ...;` 语句单独执行。

执行顺序必须遵守外键依赖：

1. `app_profiles`
2. `agent_run_quota`
3. `agent_run_usage`
4. `conversations`
5. `agent_runs`
6. `messages`
7. `run_events`
8. `tool_invocations`
9. `report_artifacts`
10. `demo_task_templates`
11. `demo_conversation_templates`

执行时每次只复制一段完整 `CREATE TABLE` 语句，确认成功后再执行下一段。不要在控制台拆开单个建表语句，也不要跳过依赖表。

## 验证 SQL

执行后可使用以下只读 SQL 验证表是否创建成功：

```sql
SHOW TABLES;
```

```sql
DESCRIBE app_profiles;
```

```sql
SELECT COUNT(*) FROM app_profiles;
```

```sql
SELECT TABLE_NAME
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
ORDER BY TABLE_NAME;
```

可选地检查关键索引：

```sql
SHOW INDEX FROM run_events;
```

```sql
SHOW INDEX FROM conversations;
```

## JSON 字段注意事项

所有 `JSON NOT NULL` 字段，后端 repository 插入时必须显式传入 `{}`、`[]` 或完整 JSON，不依赖数据库默认值。

建议约定：

- 对象型字段写入 `{}` 或完整对象，例如 `metadata`、`plan`、`chart_data`。
- 数组型字段写入 `[]` 或完整数组，例如 `seed_messages`、`seed_runs`、`seed_reports`。
- 后端参数化 SQL 中由 repository 统一序列化 JSON，避免把不完整字符串直接拼进 SQL。

## `_openid` / `user_id` 约定

- `_openid` 来自 CloudBase Auth，是云开发权限体系识别用户的关键字段。
- `user_id` 是业务用户 ID，用于 Workbench 业务表过滤和后续用户映射。
- 第一阶段 `_openid` 与 `user_id` 可以保持同值。
- 所有私有数据查询必须同时带 `_openid` 和 `user_id`。

示例：

```sql
SELECT *
FROM conversations
WHERE id = ?
  AND _openid = ?
  AND user_id = ?;
```

子资源查询也必须校验父资源归属，例如读取消息前先确认对应会话属于当前用户。

## 安全说明

- 前端不直连 MySQL。
- 数据库操作只允许在 CloudBase HTTP Function 内完成。
- 腾讯云密钥不能写入仓库。
- `access_token` / `refresh_token` 不能写入日志。
- 数据库连接串、腾讯云 SecretId / SecretKey 只能通过服务端环境变量注入。

## 后续脚本化方向

后续如果实现 migration 执行脚本，应读取本地环境变量：

```txt
TENCENT_SECRET_ID
TENCENT_SECRET_KEY
TENCENT_CLOUDBASE_ENV_ID
TENCENT_REGION
```

脚本设计建议：

- 从 `tencent/migrations/` 按文件名排序读取 migration。
- 将 SQL 按完整语句分段执行，至少以 `CREATE TABLE ...;` 为基本执行单元。
- 每段执行前输出 migration 文件名和语句序号，不输出密钥、连接串或 token。
- 每段执行失败时立即停止，保留错误上下文，避免继续执行后续依赖表。
- 执行完成后自动运行只读验证 SQL，输出表清单和关键表结构摘要。

