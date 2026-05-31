# CloudBase MySQL Migration 执行说明

本目录保存当前 CloudBase MySQL canonical baseline。W3 Governance 采用 baseline rewrite + dev reset：当前 migrations 从零执行后必须得到最新契约 schema，不再为旧 POC 数据保留 runtime 兼容字段或 cleanup migration。

当前 active migration 文件为：

```txt
001_cloudbase_mysql_schema.sql
002_cloudbase_teaching_metrics.sql
004_cloudbase_knowledge_base.sql
005_cloudbase_evaluations.sql
006_cloudbase_source_lineage.sql
```

已移除历史迁移：

- `003_agent_run_idempotency.sql`：旧 `runtime_run_id` 幂等链路。
- `007_agent_runs_client_run_id.sql`：旧 baseline 迁移到 `client_run_id` 的过渡脚本。

当前 baseline 已直接包含 `agent_runs.client_run_id`、`uk_agent_runs_user_client_run`、canonical Report / Evaluation run 外键，以及 Source Lineage 表。旧 `runtime_run_id` 和独立 `conclusion_source` DB 字段不属于当前 schema。

如本地或云端已有旧 POC 数据库，请重建 / 重置开发库后按当前 active migrations 重新执行；不要在 runtime 中增加旧字段 fallback，也不要用 cleanup migration 伪造旧数据。

## 执行原则

- 不通过可视化界面手动建表。
- 不在控制台逐个点字段、逐个配置索引或外键。
- 优先使用 SQL migration，保证 schema 可审查、可复用。
- CloudBase RunSql / API Explorer 可用于 POC 和小规模验证。
- 正式迁移后续应提供脚本化执行方式，避免依赖控制台手动复制 SQL。

## RunSql 分段执行建议

CloudBase RunSql 更适合单条或分段 SQL 执行，不建议一次性粘贴完整长 SQL。执行 `001_cloudbase_mysql_schema.sql` 时，建议每个 `CREATE TABLE ... ENGINE=InnoDB ...;` 语句单独执行。

执行顺序必须遵守外键依赖：

1. `001_cloudbase_mysql_schema.sql`
   - `app_profiles`
   - `agent_run_quota`
   - `agent_run_usage`
   - `conversations`
   - `agent_runs`
   - `messages`
   - `run_events`
   - `tool_invocations`
   - `report_artifacts`
   - `demo_task_templates`
   - `demo_conversation_templates`
2. `002_cloudbase_teaching_metrics.sql`
3. `004_cloudbase_knowledge_base.sql`
4. `005_cloudbase_evaluations.sql`
   - `eval_cases`
   - `eval_results`
5. `006_cloudbase_source_lineage.sql`
   - `retrieval_logs`
   - `run_sources`

执行时每次只复制一段完整 `CREATE TABLE` 语句，确认成功后再执行下一段。不要在控制台拆开单个建表语句，也不要跳过依赖表。

## Canonical 字段边界

- `agent_runs.id` 是 canonical `runId`。
- `agent_runs.client_run_id` 只用于 pending / 幂等，不是业务主关系。
- `agent_runs.metadata.modelTrace` 是模型状态事实源。
- `agent_runs` 不保留 `runtime_run_id`。
- `agent_runs` 不保留独立 `conclusion_source`；结论来源只在 `metadata.modelTrace.conclusionSource`。
- `report_artifacts.run_id` 必须指向 `agent_runs.id`，外键使用 `ON DELETE CASCADE`。
- `eval_results.run_id` 必须指向 `agent_runs.id`，外键使用 `ON DELETE CASCADE`。
- `eval_results.model_trace` 保存 canonical modelTrace 快照。
- Report / Evaluation metadata 不展开顶层模型字段。

## Seed 执行说明

表结构全部创建并验证通过后，再按顺序执行 seed 文件：

```txt
tencent/seeds/001_demo_task_templates_seed.sql
tencent/seeds/002_demo_conversation_templates_seed.sql
tencent/seeds/003_teaching_metrics_seed.sql
tencent/seeds/004_knowledge_base_seed.sql
tencent/seeds/005_evaluation_cases_seed.sql
```

每个 seed 文件只包含一个 `INSERT ... ON DUPLICATE KEY UPDATE` 语句，可整段复制到 CloudBase RunSql。

Seed 数据可重复执行；重复执行会按主键更新已有模板，不会插入重复记录。

## 验证 SQL

执行后可使用以下只读 SQL 验证表是否创建成功：

```sql
SHOW TABLES;
```

```sql
DESCRIBE app_profiles;
```

```sql
SELECT TABLE_NAME
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
ORDER BY TABLE_NAME;
```

可选地检查关键索引：

```sql
SHOW INDEX FROM agent_runs;
```

```sql
SHOW INDEX FROM report_artifacts;
```

```sql
SHOW INDEX FROM eval_results;
```

```sql
SHOW INDEX FROM run_sources;
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

- 从 `tencent/migrations/` 按文件名排序读取 active migration。
- 从 `tencent/seeds/` 按文件名排序读取 seed，并在 schema 验证通过后执行。
- 将 SQL 按完整语句分段执行，至少以 `CREATE TABLE ...;` 为基本执行单元。
- 每段执行前输出 migration 文件名和语句序号，不输出密钥、连接串或 token。
- 每段执行失败时立即停止，保留错误上下文，避免继续执行后续依赖表。
- 执行完成后自动运行只读验证 SQL，输出表清单和关键表结构摘要。
