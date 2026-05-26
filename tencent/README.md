# Tencent Cloud Single Track

本目录用于当前腾讯云单轨实现，目标栈为：

```txt
EdgeOne Pages
+ CloudBase HTTP Functions
+ CloudBase Auth v2
+ CloudBase MySQL
```

本目录保留 CloudBase MySQL schema、seed、CloudBase HTTP Functions 和部署说明。当前前端身份主线使用 CloudBase 用户名密码登录；Agent Run `real` data tools 直接读取 CloudBase MySQL `teaching_metrics` 与 `knowledge_documents` / `knowledge_chunks`；模型链路通过 `selectedModelId`、服务端 catalog 白名单和 `_shared/langchainModelLayer.js` 调用 LangChain Chat Model 与 SiliconFlow / Zhipu OpenAI-compatible API。后续仍需要 EdgeOne Preview / Production 线上回归。

## 文件

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
- `functions/workbench-quota/`：Tencent-13 quota HTTP Function，固定路由为 `/api/workbench/quota`，`GET` 读取额度，`POST` 通过 `body.action` 区分消耗额度和完成 usage。
- `functions/workbench-runs/`：Tencent-26 Agent Run 读取恢复 HTTP Function，固定路由为 `/api/workbench/runs`，GET 按 `conversationId` 或 `runId` 返回 run、run_events 和 tool_invocations。
- `functions/workbench-agent-run-stream/`：Agent Run 流式 HTTP Function，固定路由为 `/api/agent/run/stream`；主链路进入 LangGraph runtime，Tool / Retriever / Model 进入 LangChain 边界，模型不可用时进入明确 fallback。

## 表用途

| 表 | 用途 |
| --- | --- |
| `app_profiles` | 业务用户资料与角色，关联 CloudBase `_openid` 与业务 `user_id`。 |
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

RAG 相关表由后续 migration 和 seed 单独维护，当前 `knowledge_search` 读取 CloudBase MySQL `knowledge_documents` / `knowledge_chunks`。

## CloudBase 服务端边界

| 能力 | 当前方式 |
| --- | --- |
| 用户身份 | CloudBase Auth v2 登录态 + `app_profiles` 业务用户表。 |
| 当前用户解析 | CloudBase HTTP Function 校验 access token 后得到 `_openid`，再查询或创建 `app_profiles`。 |
| 私有数据权限 | 服务端查询必须显式追加 `_openid = ?` 和 `user_id = ?`。 |
| 数据库访问 | CloudBase HTTP Function 通过服务端运行时访问 MySQL，前端不直连数据库。 |
| `uuid` / `gen_random_uuid()` | 函数层生成 UUID/ULID，MySQL 字段使用 `VARCHAR(36)`。 |
| `jsonb` | MySQL `JSON`。 |
| `timestamptz` | MySQL `DATETIME(3)`，时间统一由服务端按 UTC 或约定时区写入。 |
| 更新时间 | 第一版不使用业务 trigger；`updated_at` 使用 MySQL `ON UPDATE CURRENT_TIMESTAMP(3)`。 |
| quota 扣减 | CloudBase HTTP Function 使用 CAS 条件更新；公开高并发前再评估 transaction / row lock。 |

## JSON 写入约定

所有 `JSON NOT NULL` 字段，SQL seed / RunSql 必须显式写入 `{}`、`[]` 或完整 JSON，不依赖数据库默认值。

通过 CloudBase Node SDK 写入 MySQL `JSON` 字段时，必须先使用 `JSON.stringify(...)`，不能直接传 JS object / array；`app_profiles.metadata` 也遵守该约定。读取后再安全 `JSON.parse`，解析失败时按字段语义回退到 `{}` 或 `[]`。

## Seed 数据

`seeds/001_demo_task_templates_seed.sql` 和 `seeds/002_demo_conversation_templates_seed.sql` 用于写入公开演示任务和公开示例会话模板。seed 使用 `INSERT ... ON DUPLICATE KEY UPDATE`，可在 CloudBase MySQL schema 落库后重复执行。

Demo 模板表是公开/system 模板表，不绑定用户，不包含 `_openid` 或 `user_id`。用户复制模板生成私有会话时，才进入后续 conversations/messages 迁移范围。

## 私有数据访问原则

所有私有 API 必须遵守：

1. 每个私有 API 先校验 CloudBase access token，得到 `_openid`。
2. 通过已验证的 `_shared/auth.js` 查或创建 `app_profiles`，得到业务 `user_id` 和统一 `currentUser`。第一阶段 `_openid` 与 `user_id` 可以同值。
3. 所有私有表读写都必须带 `_openid` 与 `user_id` 条件。
4. 子资源访问必须同时校验父资源归属，例如读取 `messages` 前确认 `conversation_id + user_id + _openid`。
5. Demo 模板表只返回 `is_enabled = 1` 且允许公开展示的数据。

## Quota 原子扣减状态

Tencent-13 已新增 `workbench-quota` 基础闭环函数，用于读取本月额度、消耗一次额度并完成 `agent_run_usage`。Tencent-24 后，`workbench-quota` 和 `workbench-agent-run-stream` 都使用 CAS 条件更新做原子扣减：先读取当前 quota，再执行 `quota_used = oldQuotaUsed + 1` 且 `WHERE quota_used = oldQuotaUsed` 的 counted update，失败时重试。`admin` 用户不增加 `quota_used`，但仍写 usage。

当前 quota 扣减没有启用 MySQL transaction / `SELECT ... FOR UPDATE`，原因是当前函数只使用 CloudBase MySQL `app.rdb()` 已验证的 filters 和 counted update API；未在本阶段引入 raw SQL 或事务 API。后续如果进入公开高并发流量，仍建议升级为真正事务或存储过程：

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

## Agent Run 环境变量

所有依赖 `functions/_shared/mysql.js` 的 CloudBase HTTP Function 都必须在 CloudBase 控制台配置函数环境变量：

```txt
CLOUDBASE_ENV_ID=ai-agent-workbench-poc-d6731923d
```

受影响函数包括 `auth-me`、`workbench-conversations`、`workbench-messages`、`workbench-reports`、`workbench-demo-copy`、`workbench-quota`、`workbench-runs` 和 `workbench-agent-run-stream`。这是 CloudBase 函数运行时变量，不是前端变量；不要写入代码，不要放进 EdgeOne，也不要加 `VITE_` 前缀。

`workbench-agent-run-stream` 的 data tools 通过 CloudBase 函数运行时读取 CloudBase MySQL。当前模型链路由 `selectedModelId` 进入 `_shared/langchainModelLayer.js`，再通过 catalog 白名单映射到 LangChain Chat Model 和 SiliconFlow / Zhipu OpenAI-compatible API。推荐配置：

```txt
SILICONFLOW_API_KEY=...
ZHIPU_API_KEY=...
```

可选覆盖默认 endpoint / model / timeout：

```txt
SILICONFLOW_BASE_URL=https://api.siliconflow.cn/v1
ZHIPU_BASE_URL=https://open.bigmodel.cn/api/paas/v4
SILICONFLOW_MODEL_QWEN=Qwen/Qwen2.5-7B-Instruct
SILICONFLOW_MODEL_GLM=THUDM/GLM-4-9B-0414
ZHIPU_MODEL_GLM_FLASH=glm-4-flash-250414
MODEL_GATEWAY_TIMEOUT_MS=30000
```

模型 Key 只放 `workbench-agent-run-stream` 的 CloudBase 函数环境变量，不放 EdgeOne / 前端 `VITE_*` 变量。EdgeOne 只放 `VITE_API_BASE_URL`、`VITE_CLOUDBASE_ENV_ID`、`VITE_CLOUDBASE_REGION` 等前端公开变量。模型未配置时，`real` 模式应在受控工具成功后通过 `fallbackReason = "model_not_configured"` 返回结果。Agent Run data tools 通过 `@cloudbase/node-sdk` 的 `app.rdb()` 读取 CloudBase MySQL `teaching_metrics`，RAG `knowledge_qa` 通过受控 `knowledge_search` 读取 `knowledge_documents` / `knowledge_chunks`。当前 `_shared/langchainModelLayer.js` 是模型调用边界。

## Migration 执行说明

CloudBase RunSql 更适合单条或分段 SQL 执行。正式迁移时需要提供脚本化执行方式，避免在控制台手动逐条复制 SQL。

详细执行顺序、验证 SQL、JSON 写入约定和安全说明见 `migrations/README.md`。

## CloudBase Preview 边界

当前 CloudBase Preview 已覆盖 public demo templates、Auth helper、conversations、messages、reports、demo-copy、quota、Agent Run SSE / fallback 和正式页面 preview 分支。本地开发通过 `CLOUDBASE_PROXY_TARGET` 代理 `/api`，线上 EdgeOne 通过 `VITE_API_BASE_URL` 指向 CloudBase 默认域名。

Preview 阶段仍需注意：

1. quota consume 已使用 CAS 条件更新做原子扣减重试；Agent Run 幂等需要先执行 `migrations/007_agent_runs_client_run_id.sql`，为 `agent_runs(user_id, client_run_id)` 增加唯一约束；公开高并发前仍建议为 quota 补事务或存储过程。
2. Agent Run 的 LangChain Model Layer 仍可能 fallback，fallback 不能伪装成真实模型结果；`data_table_not_found` / `data_tool_query_failed` / `data_empty` / `model_*` 需要结合 CloudBase MySQL、模型服务和函数日志排查。
3. `local-tools/cloudbase-auth-test.html` 仅用于本地快速验证，不属于正式产品，也不应提交为正式能力。

## 后续迁移顺序建议

1. 先在 CloudBase MySQL 执行并校验 `001_cloudbase_mysql_schema.sql`。
2. 新增 MySQL repository 层，只覆盖 `health`、`demo_task_templates`、`demo_conversation_templates` 等低风险读接口。
3. 新增 CloudBase Auth 后端校验 helper，建立 `_openid -> app_profiles.user_id` 映射。当前 `auth-me` 已验证该链路，Tencent-25/Tencent-25B 已把前端默认登录主线切到 CloudBase 用户名密码登录。
4. 迁移 conversations/messages/report/run 查询接口，所有 SQL 显式加 `_openid/user_id`。当前 conversations、messages、reports、demo-copy、workbench-runs 和报告闭环已完成，PATCH、archive 后续再迁。
5. 迁移 quota 事务。当前 Tencent-13 已新增 quota 基础闭环，后续仍需单独验证 MySQL transaction + 行锁并发扣减。
6. 迁移 Agent Run SSE。CloudBase 函数内的 data tools 直接读取 CloudBase MySQL `teaching_metrics`，LangChain Model Layer 负责模型调用，`007_agent_runs_client_run_id.sql` 提供跨实例幂等唯一约束，`knowledge_qa` 通过 CloudBase MySQL `knowledge_search` 执行受控检索；后续仍需做 EdgeOne Preview 线上回归。
7. 后续继续做 EdgeOne 线上回归和 CloudBase 运行时 smoke。
