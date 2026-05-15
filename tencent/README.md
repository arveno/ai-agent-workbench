# Tencent Cloud Migration Draft

本目录用于腾讯云单轨实现的迁移草案，目标栈为：

```txt
EdgeOne Pages
+ CloudBase HTTP Functions
+ CloudBase Auth v2
+ CloudBase MySQL
```

当前迁移状态见 `../docs/TENCENT_MIGRATION_STATUS.md`。本目录保留腾讯云单轨实现的迁移草案和 CloudBase MySQL schema；Tencent-09A 仅表示 CloudBase Auth helper 与正式 `/api/auth/me` 验证完成，Tencent-10C/Tencent-12 仅新增 conversations / messages / reports / demo-copy 基础闭环函数，当前仓库仍不迁移前端 Auth store、不修改前端状态。

## 文件

- `../docs/TENCENT_MIGRATION_STATUS.md`：腾讯云迁移当前状态、已验证 POC、schema 落库结果和 POC 清理计划。
- `migrations/001_cloudbase_mysql_schema.sql`：CloudBase MySQL schema 第一版。
- `migrations/README.md`：CloudBase MySQL migration 执行原则、RunSql 分段建议和验证 SQL。
- `seeds/README.md`：CloudBase MySQL seed 执行顺序和验证 SQL。
- `seeds/001_demo_task_templates_seed.sql`：公开示例任务模板初始化数据。
- `seeds/002_demo_conversation_templates_seed.sql`：公开示例会话模板初始化数据。
- `functions/README.md`：CloudBase HTTP Function 打包、路由和验证说明。
- `functions/_shared/`：CloudBase HTTP Function 共享 MySQL 与 Auth helper。
- `functions/demo-tasks/`：公开示例任务只读 HTTP Function。
- `functions/demo-conversations/`：公开示例会话只读 HTTP Function。
- `functions/auth-me/`：正式 CloudBase Auth helper 验证入口，不是旧 POC 函数；用于建立 `_openid -> app_profiles.user_id` 映射并返回 `currentUser`。
- `functions/workbench-conversations/`：Tencent-10A/10C conversations HTTP Function，覆盖 `GET /api/workbench/conversations` 和 `POST /api/workbench/conversations`。
- `functions/workbench-messages/`：Tencent-10C messages HTTP Function，固定路由为 `/api/workbench/messages`，GET 从 query 读取 `conversationId`，POST 从 JSON body 读取 `conversationId`。
- `functions/workbench-reports/`：Tencent-11 reports HTTP Function，固定路由为 `/api/workbench/reports`，GET 从 query 读取 `conversationId` 或 `id`，POST 从 JSON body 保存报告。
- `functions/workbench-demo-copy/`：Tencent-12 demo-copy HTTP Function，固定路由为 `/api/workbench/demo-copy`，POST 从 JSON body 读取 `templateId` 并复制示例会话模板。

## 表用途

| 表 | 用途 |
| --- | --- |
| `app_profiles` | 业务用户资料与角色。承接 Supabase `profiles`，关联 CloudBase `_openid` 与业务 `user_id`。 |
| `agent_run_quota` | 真实 Agent Run 月度额度。后续通过 MySQL 事务扣减。 |
| `agent_run_usage` | 每次真实 Agent Run 的使用记录，记录 started/completed/failed/stopped。 |
| `conversations` | Workbench 会话列表与会话状态。 |
| `messages` | 会话消息，包括 user/assistant/report/error 等消息。 |
| `agent_runs` | Agent Run 主记录，保存 intent、plan、数据源快照、图表、结论和状态。 |
| `run_events` | Agent Run 流式事件序列，用于恢复 Run Trace。 |
| `tool_invocations` | 工具调用记录，用于最近工具、Run Trace 和调试。 |
| `report_artifacts` | 用户确认生成的 Markdown 报告 Artifact。 |
| `demo_task_templates` | 公开演示任务模板。 |
| `demo_conversation_templates` | 公开演示会话模板。 |

RAG 相关表暂不落地，只在 migration 末尾保留后续扩展注释，避免第一版 schema 过早复杂化。

## Supabase 能力替换

| Supabase 能力 | CloudBase MySQL 替换方式 |
| --- | --- |
| `auth.users` 外键 | CloudBase Auth v2 登录态 + `app_profiles` 业务用户表。 |
| `auth.uid()` | CloudBase HTTP Function 校验 access token 后得到 `_openid`，再查询/创建 `app_profiles`。 |
| RLS policy | 服务端 repository 查询必须显式追加 `_openid = ?` 和 `user_id = ?`。 |
| `service_role` grant | CloudBase HTTP Function 使用服务端私密配置连接 MySQL，前端不直连数据库。 |
| `uuid` / `gen_random_uuid()` | 函数层生成 UUID/ULID，MySQL 字段使用 `VARCHAR(36)`。 |
| `jsonb` | MySQL `JSON`。 |
| `timestamptz` | MySQL `DATETIME(3)`，时间统一由服务端按 UTC 或约定时区写入。 |
| Supabase trigger | 第一版不使用业务 trigger；`updated_at` 使用 MySQL `ON UPDATE CURRENT_TIMESTAMP(3)`。 |
| Supabase quota RPC | CloudBase HTTP Function 内部 MySQL transaction + `SELECT ... FOR UPDATE`。 |

## JSON 写入约定

所有 `JSON NOT NULL` 字段，SQL seed / RunSql 必须显式写入 `{}`、`[]` 或完整 JSON，不依赖数据库默认值。

通过 CloudBase Node SDK 写入 MySQL `JSON` 字段时，必须先使用 `JSON.stringify(...)`，不能直接传 JS object / array；`app_profiles.metadata` 也遵守该约定。读取后再安全 `JSON.parse`，解析失败时按字段语义回退到 `{}` 或 `[]`。

## Seed 数据

`seeds/001_demo_task_templates_seed.sql` 和 `seeds/002_demo_conversation_templates_seed.sql` 用于写入公开演示任务和公开示例会话模板。seed 使用 `INSERT ... ON DUPLICATE KEY UPDATE`，可在 CloudBase MySQL schema 落库后重复执行。

Demo 模板表是公开/system 模板表，不绑定用户，不包含 `_openid` 或 `user_id`。用户复制模板生成私有会话时，才进入后续 conversations/messages 迁移范围。

## RLS 替代原则

CloudBase MySQL 不提供 Supabase RLS。后续 API 迁移必须遵守：

1. 每个私有 API 先校验 CloudBase access token，得到 `_openid`。
2. 通过已验证的 `_shared/auth.js` 查或创建 `app_profiles`，得到业务 `user_id` 和统一 `currentUser`。第一阶段 `_openid` 与 `user_id` 可以同值。
3. 所有私有表读写都必须带 `_openid` 与 `user_id` 条件。
4. 子资源访问必须同时校验父资源归属，例如读取 `messages` 前确认 `conversation_id + user_id + _openid`。
5. Demo 模板表只返回 `is_enabled = 1` 且允许公开展示的数据。

## Quota 事务草案

`consume_agent_run_quota` 后续迁移为 MySQL 事务：

```sql
START TRANSACTION;
SELECT role
FROM app_profiles
WHERE user_id = ? AND _openid = ?
FOR UPDATE;

-- 创建或锁定当月 agent_run_quota。
-- demo_user: quota_used < quota_limit 时递增并插入 agent_run_usage。
-- admin: 不递增 quota，只插入 agent_run_usage。

COMMIT;
```

`finish_agent_run_usage` 后续迁移为带归属过滤的更新：

```sql
UPDATE agent_run_usage
SET status = ?, finished_at = CURRENT_TIMESTAMP(3), error_code = ?, metadata = ?
WHERE id = ? AND user_id = ? AND _openid = ?;
```

## Migration 执行说明

CloudBase RunSql 更适合单条或分段 SQL 执行。正式迁移时需要提供脚本化执行方式，避免在控制台手动逐条复制 SQL。

详细执行顺序、验证 SQL、JSON 写入约定和安全说明见 `migrations/README.md`。

## 后续迁移顺序建议

1. 先在 CloudBase MySQL 执行并校验 `001_cloudbase_mysql_schema.sql`。
2. 新增 MySQL repository 层，只覆盖 `health`、`demo_task_templates`、`demo_conversation_templates` 等低风险读接口。
3. 新增 CloudBase Auth 后端校验 helper，建立 `_openid -> app_profiles.user_id` 映射。当前 `auth-me` 已验证该链路，前端 `authStore` 尚未迁移。
4. 迁移 conversations/messages/report/run 查询接口，所有 SQL 显式加 `_openid/user_id`。当前 Tencent-10C/Tencent-12 只新增 conversations 列表 / 创建、messages 读取 / 写入、reports 列表 / 单条读取 / 保存和 demo-copy 基础闭环，PATCH、archive、Agent Run 相关报告生成和 run 查询后续再迁。
5. 迁移 quota 事务，单独验证并发扣减。
6. 迁移 Agent Run SSE，把 `res.write` 替换为 CloudBase HTTP Function SSE writer。
7. 最后清理旧 Vercel/Supabase 代码，清理前必须保证腾讯云版本已可演示和可回滚。
