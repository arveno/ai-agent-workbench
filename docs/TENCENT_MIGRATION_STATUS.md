# Tencent Cloud Migration Status

生成日期：2026-05-17

## 当前阶段

当前迁移进入 CloudBase 单轨清理阶段：腾讯云 POC 能力验证完成，CloudBase MySQL 正式 schema 已落库，CloudBase HTTP Functions 覆盖 public demo templates、Auth helper、conversations、messages、reports、demo-copy、quota、Agent Run SSE、Run Trace 恢复和 RAG knowledge_search；Tencent-25B 后前端 `authStore` 默认使用 CloudBase 用户名密码登录与 session 恢复，Tencent-26 后刷新页面或切换会话可通过 CloudBase 读取最近一次 run、run_events 和 tool_invocations，业务 private API 默认使用 CloudBase access token，本地 Vite proxy 已用于规避 localhost CORS。

本阶段不再把 Vercel / Supabase 作为后续主线维护方向。Tencent-29B 已删除旧 `api/`、`src/server/`、`supabase/` 主体代码和对应 package 依赖；腾讯云后续主线以 EdgeOne Pages、CloudBase HTTP Functions、CloudBase Auth v2 和 CloudBase MySQL 为准。

## 已验证通过的 POC 能力

以下能力已完成验证：

1. EdgeOne Pages 静态部署通过。
2. CloudBase `/api/health` 普通 HTTP API 通过。
3. CloudBase `/api/sse-test` SSE 流式输出通过。
4. CloudBase Auth v2 匿名登录通过。
5. CloudBase HTTP 路由身份认证通过。
6. CloudBase MySQL RunSql 建表、插入、查询通过。
7. CloudBase HTTP Function 读写 MySQL 通过。
8. Tencent-09A：CloudBase Auth helper 与正式 `/api/auth/me` 验证通过。

这些 POC 说明静态部署、普通 HTTP Function、SSE、匿名登录、后端鉴权、RunSql、函数内 MySQL 访问和 CloudBase 身份到业务用户的映射已经具备迁移基础。它们不等同于主业务接口已迁移完成，后续仍需按业务风险分批替换。

## CloudBase 默认链路收口结论

Tencent-29B 的阶段判断是：CloudBase 已成为正式前端单轨 Auth 和 private API 来源，并补齐 Agent Run 运行、读取恢复、报告闭环和 RAG knowledge_search。Vercel / Supabase legacy 主体代码已删除，后续仅保留历史迁移说明和必要的腾讯云回归清单。

当前已完成能力按模块列如下：

| 模块 | 当前状态 |
| --- | --- |
| Public demo templates | `demo-tasks` / `demo-conversations` 公开只读接口已验证，前端支持 `VITE_API_BASE_URL`。 |
| Auth helper | `/api/auth/me` 与 `_shared/auth.js` 已验证，能通过 CloudBase access token 建立或复用 `app_profiles`；前端默认使用 CloudBase 用户名密码登录，不再自动匿名登录。 |
| Conversations | CloudBase private `GET/POST /api/workbench/conversations` 已验证，前端默认分支可创建和读取会话。 |
| Messages | CloudBase private `GET/POST /api/workbench/messages` 已验证，前端默认分支可读写消息。 |
| Reports | CloudBase private `GET/POST /api/workbench/reports` 已验证，前端默认分支可保存和读取 report artifacts。 |
| Demo copy | CloudBase private `POST /api/workbench/demo-copy` 已验证，前端默认分支可复制公开会话模板并读取 seed messages。 |
| Quota | CloudBase private `GET/POST /api/workbench/quota` 基础闭环已验证，Agent Run stream 后端会 consume / finish usage。 |
| Agent Run SSE / fallback | CloudBase `/api/agent/run/stream` 已验证鉴权、归属校验、quota、run/events/tools、assistant message、SSE 和明确 fallback；Tencent-21 将 data tools 改为直接读取 CloudBase MySQL `teaching_metrics`，Tencent-22 新增轻量 OpenAI-compatible model gateway，Phase 0 后当前模型链路收敛到 SiliconFlow / Zhipu 国内 provider。 |
| Run recovery | CloudBase private `GET /api/workbench/runs?conversationId=...&latest=1` 与 `GET /api/workbench/runs?runId=...` 返回 run、events 和 toolInvocations，前端用于刷新页面或切换会话后的 Run Trace 恢复。 |
| Frontend CloudBase default | 正式页面默认恢复 CloudBase 用户名密码 session；未登录保持访客状态，登录后走 CloudBase conversations/messages/reports/demo-copy/quota/Agent Run stream/Run recovery。 |
| Local test panel | `local-tools/cloudbase-auth-test.html` 可用于快速验证 CloudBase Auth 与 API，但不提交、不属于正式产品。 |

## 单轨化边界

- CloudBase Auth / CloudBase private APIs 已成为前端默认主链路。
- Vercel / Supabase 旧 `api/`、`src/server/`、`supabase/` 主体代码已删除，不再作为正式前端运行路径。
- 前端 `authStore` 默认恢复 CloudBase 用户名密码 session；没有 session 时保持未登录访客状态，公开 demo 仍可用。正式登录弹窗只调用 CloudBase Auth。
- Agent Run 运行和刷新恢复都已走 CloudBase：`/api/agent/run/stream` 负责写入，`/api/workbench/runs` 负责读取最近一次 run、run_events 和 tool_invocations，不会重新触发 run 或重复扣 quota。
- 匿名登录只保留给 `local-tools` 或明确 demo fallback，不作为正式页面登录主线。
- `VITE_ENABLE_CLOUDBASE_PRIVATE_API` 已退出正式前端运行分支，不再建议配置到本地或 EdgeOne 环境。
- Agent Run 的真实模型调用仍可能进入明确 fallback，不能把 fallback 当作真实模型结果宣传；data tools 失败时会使用 `data_table_not_found`、`data_tool_query_failed`、`data_empty` 等明确原因，模型失败时会使用 `model_*` fallbackReason。
- quota consume / finish 已具备基础闭环；Tencent-24 后 consume 使用 CAS 条件更新做原子扣减重试，Agent Run 通过 migration `003_agent_run_idempotency.sql` 增加 `(user_id, runtime_run_id)` 唯一约束，但 quota 尚未使用 MySQL transaction / 行锁。
- `local-tools` 测试面板只服务迁移验证，不提交、不进正式页面、不作为产品能力。
- CloudBase 默认链路已不依赖 Vercel/Supabase 主体代码；后续回归以 EdgeOne + CloudBase 为准。

## 旧链路删除后回归清单

旧链路主体删除后必须完成：

1. 配置 EdgeOne Preview / Production 环境变量，并确认前端指向 CloudBase 默认域名。
2. 跑完整浏览器回归：页面初始化、demo templates、创建会话、消息读写、demo-copy、reports、Agent Run、报告确认、错误态和刷新恢复。
3. 检查 Network：无 CORS、无 legacy `/api/health` 404 噪音、无明显重复 GET、无重复 POST。
4. 确认用户消息只写一次，CloudBase Agent Run 后端写入 assistant message 后，前端不重复持久化 assistant message。
5. 确认 quota 只随一次 Agent Run consume 一次，并且失败 / fallback 时 finish usage 状态正确。
6. 高并发或公开流量前执行并校验 `003_agent_run_idempotency.sql`，并继续补 quota transaction / 行锁或存储过程。
7. 打开 CloudBase 函数日志和错误观察，记录 401 / 403 / 429 / 500 的前端表现。
8. 至少完成一次 EdgeOne Preview / Production 线上回归，再继续删除剩余历史文档或旧 UI 文案。

## EdgeOne 环境变量建议

本地 `.env.local` 推荐：

```env
VITE_API_BASE_URL=
VITE_CLOUDBASE_ENV_ID=<cloudbase-env-id>
VITE_CLOUDBASE_REGION=ap-shanghai
CLOUDBASE_PROXY_TARGET=https://<cloudbase-default-domain>
```

EdgeOne Preview / Production 推荐：

```env
VITE_API_BASE_URL=https://<cloudbase-default-domain>
VITE_CLOUDBASE_ENV_ID=<cloudbase-env-id>
VITE_CLOUDBASE_REGION=ap-shanghai
```

`CLOUDBASE_PROXY_TARGET` 只给本地 Vite dev server 使用，不是 `VITE_` 变量，不会进入浏览器，也不应配置为 EdgeOne 前端公开环境变量。`VITE_ENABLE_CLOUDBASE_PRIVATE_API` 不再控制正式前端请求路径。

## CloudBase 函数环境变量要求

所有使用 `tencent/functions/_shared/mysql.js` 的 CloudBase HTTP Function 都必须在 CloudBase 控制台配置函数环境变量：

```env
CLOUDBASE_ENV_ID=ai-agent-workbench-poc-d6731923d
```

受影响函数清单：

- `auth-me`
- `workbench-conversations`
- `workbench-messages`
- `workbench-reports`
- `workbench-demo-copy`
- `workbench-quota`
- `workbench-agent-run-stream`

这是 CloudBase 函数运行时变量，用于 `@cloudbase/node-sdk` 初始化 CloudBase MySQL / `app.rdb()`。它不是 EdgeOne 变量，不是 `VITE_` 前端变量，不要写入前端，也不要写入代码。EdgeOne 只需要配置前端公开的 `VITE_*` 变量；`CLOUDBASE_ENV_ID` 应只出现在 CloudBase 函数环境变量中。

`workbench-agent-run-stream` 的模型配置同样只放 CloudBase 函数环境变量。当前 model catalog 读取 `SILICONFLOW_API_KEY` 与 `ZHIPU_API_KEY`，可选覆盖 `SILICONFLOW_BASE_URL`、`ZHIPU_BASE_URL`、`SILICONFLOW_MODEL_QWEN`、`SILICONFLOW_MODEL_GLM`、`ZHIPU_MODEL_GLM_FLASH` 和 `MODEL_GATEWAY_TIMEOUT_MS`。模型 Key 不放 EdgeOne / 前端 `VITE_*` 变量。`local-tools/cloudbase-auth-test.html` 仍只作为本地验证工具，不提交、不进入正式页面。

## 下一步建议

当前有两个可选路径：

- A. 推送 main，触发一次 EdgeOne Preview 部署，做线上 CloudBase 默认链路回归。
- B. 继续本地做旧链路删除前准备，暂不触发 EdgeOne 构建。

推荐路径是 A：如果本地已经通过，并且 push 前确认 `git status` 干净、`pnpm build` 通过，就应进入 EdgeOne Preview 线上回归。线上回归通过后，再决定是否进入旧链路清理。

## CloudBase MySQL schema 状态

CloudBase MySQL 正式 schema 已分段执行落库。当前正式表包括：

```txt
app_profiles
agent_run_quota
agent_run_usage
conversations
agent_runs
messages
run_events
tool_invocations
report_artifacts
demo_task_templates
demo_conversation_templates
```

当前 schema 以 `tencent/migrations/001_cloudbase_mysql_schema.sql` 为准。后续表结构调整应继续在 `tencent/migrations/` 下演进，不覆盖 Supabase migration。

## CloudBase Auth helper 状态

Tencent-09A 已完成并验证通过。当前新增的正式能力包括：

- `tencent/functions/_shared/mysql.js`：CloudBase MySQL 访问 helper，统一初始化 `@cloudbase/node-sdk` 并返回 `app.rdb()`。
- `tencent/functions/_shared/auth.js`：CloudBase Auth helper，解析 CloudBase token / Bearer token payload，获取 `_openid` / `user_id`，查询或创建 `app_profiles`，并返回统一 `currentUser`。
- `tencent/functions/auth-me/`：正式 Auth helper 验证入口。

正式路由为：

```txt
/api/auth/me -> auth-me
身份认证：开启
```

验证结果：

- 不带 token 请求 `/api/auth/me` 时，CloudBase 网关返回 `401 MISSING_CREDENTIALS`。
- 带 `Authorization: Bearer ...` 请求 `/api/auth/me` 时，返回 `200 OK` 和 `currentUser`。
- `app_profiles` 会自动创建或复用对应用户。
- 当前验证用户的 `role = demo_user`，`status = active`。
- 第一阶段 `_openid` 与 `user_id` 保持同值。

`/api/auth/me` 是正式 Auth helper 验证入口，不是旧 POC 路由 `/api/auth-me` 或旧 POC 函数。Tencent-25B 后前端 `authStore` 默认恢复 CloudBase 用户名密码 session，并通过 `/api/auth/me` 获取统一 `currentUser`；没有 session 时保持未登录状态，不自动匿名登录。conversations / messages / reports / demo-copy / quota / Agent Run stream 默认使用 CloudBase access token。legacy Vercel / Supabase 主体代码已删除，仍需要完整 EdgeOne + CloudBase 回归测试。后续私有 CloudBase HTTP Function 应复用该 helper 获取 `currentUser`，再对私有表显式追加 `_openid` 与 `user_id` 过滤。

CloudBase MySQL JSON 字段写入约定也已确认：通过 CloudBase Node SDK 写入 MySQL `JSON` 字段时，不能直接传 JS object / array，包括 `app_profiles.metadata`，必须先 `JSON.stringify(...)`；读取后再安全 `JSON.parse`，解析失败时使用 `{}` 或 `[]` 等安全默认值。

## conversations / messages / reports / demo-copy / quota / Agent Run 函数状态

Tencent-10A 新增 `tencent/functions/workbench-conversations/`，用于验证 CloudBase 私有会话列表查询；Tencent-10C 在同一函数中扩展创建会话，并新增 `tencent/functions/workbench-messages/` 验证消息读取和写入；Tencent-11 新增 `tencent/functions/workbench-reports/` 验证报告列表、单条读取和保存；Tencent-12 新增 `tencent/functions/workbench-demo-copy/` 验证复制示例会话模板；Tencent-13 新增 `tencent/functions/workbench-quota/` 验证 quota 读取、消耗和完成 usage 的基础闭环；Tencent-14 新增 `tencent/functions/workbench-agent-run-stream/` 验证 CloudBase 固定 Agent Run 基础闭环；Tencent-15 在同一 Agent Run 函数中新增 `real` 模式，Tencent-21 将 `real` data tools 改为 CloudBase MySQL `teaching_metrics`。正式路由规划为：

```txt
/api/workbench/conversations -> workbench-conversations
身份认证：开启

/api/workbench/messages -> workbench-messages
身份认证：开启
路径透传：关闭

/api/workbench/reports -> workbench-reports
身份认证：开启
路径透传：关闭

/api/workbench/demo-copy -> workbench-demo-copy
身份认证：开启
路径透传：关闭

/api/workbench/quota -> workbench-quota
身份认证：开启
路径透传：关闭

/api/agent/run/stream -> workbench-agent-run-stream
身份认证：开启
路径透传：关闭
```

该函数实现 `GET /api/workbench/conversations` 和 `POST /api/workbench/conversations`，复用 `_shared/auth.js` 获取 `currentUser`，复用 `_shared/mysql.js` 访问 CloudBase MySQL，并按 `_openid = currentUser.openid`、`user_id = currentUser.userId`、`visibility = 'private'` 过滤或写入 `conversations`。`GET` 参数兼容现有 `limit`、`cursor`、`status`，返回 `{ ok: true, data: { conversations, nextCursor } }`。`POST` 支持 `title`、`summary`、`mode`、`metadata`，写入 `status = 'active'`、`visibility = 'private'`、`message_count = 0`，返回 `{ ok: true, data: conversation }`。

CloudBase HTTP 访问服务不支持 `/api/workbench/conversations/:id/messages` 这类动态参数路径，因此 `workbench-messages` 使用固定路由 `/api/workbench/messages`。读取和写入消息前必须先校验父会话归属，私有查询都带 `_openid` 与 `user_id`。`GET /api/workbench/messages?conversationId=...` 支持 `limit` 和 `before`，返回 `{ ok: true, data: { messages, nextCursor } }`；`POST /api/workbench/messages` 从 JSON body 读取 `conversationId`，并支持 `role`、`kind`、`content`、`runId`、`clientMessageId`、`status`、`metadata`，用 `user_id + client_message_id` 做幂等，写入成功后顺序更新父会话 `message_count`。

`workbench-reports` 也使用固定路由 `/api/workbench/reports`。`GET /api/workbench/reports?conversationId=...` 会先校验父会话归属，再按 `created_at DESC` 返回 `{ ok: true, data: { reports } }`；`GET /api/workbench/reports?id=...` 按 `id + _openid + user_id` 读取单个报告；`POST /api/workbench/reports` 从 JSON body 读取 `conversationId`、`runId`、`title`、`contentMarkdown`、`status`、`metadata`，校验会话归属后写入 `report_artifacts`，返回 `{ ok: true, data: report }`。`metadata` 写入前使用 `JSON.stringify(...)`，读取后安全解析。

CloudBase HTTP 访问服务不支持 `/api/workbench/demo-conversations/:id/copy` 这类动态参数路径，因此 Tencent-12 使用固定路由 `/api/workbench/demo-copy`。`POST /api/workbench/demo-copy` 从 JSON body 读取 `templateId`，读取启用且 `visibility in ('demo','system')` 的 `demo_conversation_templates`，为当前用户创建 private conversation，并把有效 `seed_messages` 写入 `messages`。返回 `{ ok: true, data: { conversation, messagesCount } }`。本阶段未使用事务；如果 seed messages 写入失败，会尽量删除刚创建的 conversation 做补偿清理，后续高一致性场景需要事务化。

`workbench-quota` 只使用固定路由 `/api/workbench/quota`，路径透传关闭，避免 CloudBase 多路径路由和路径透传差异。`GET /api/workbench/quota` 会读取或自动创建当前用户本月 `agent_run_quota`，默认 `quota_limit = 20`、`quota_used = 0`；`POST /api/workbench/quota` 通过 `body.action` 区分操作，`action = "consume"` 会为 `demo_user` 在未超额时使用 `quota_used = oldQuotaUsed` 的 CAS 条件更新递增额度并写入 `agent_run_usage(status = started)`，`admin` 不递增 quota 但仍写 usage；`action = "finish"` 按 `usageId + _openid + user_id` 更新 `status`、`finished_at`、`error_code` 和 `metadata`。`metadata` 写入前使用 `JSON.stringify(...)`，读取后安全解析。

`workbench-agent-run-stream` 使用固定路由 `/api/agent/run/stream`，路径透传关闭。Tencent-14 的 `body.mode = "basic"` 固定 Agent Run 基础闭环仍保留：复用 `_shared/auth.js` 获取 `currentUser`，校验 `conversationId + _openid + user_id + visibility = private` 归属，按 `user_id + clientRunId` 做服务端幂等检查。Tencent-24 要求先执行 `tencent/migrations/003_agent_run_idempotency.sql`，为 `agent_runs(user_id, runtime_run_id)` 增加唯一约束；函数会先创建 `agent_runs(status = pending)` 建立幂等边界，再消耗 quota 并创建 `agent_run_usage`，随后标记 run 为 `running`、输出 SSE、写入 `run_events`、写入 mock `tool_invocations` 和 assistant `messages`，并 finish usage。同一用户重复提交相同 `clientRunId` 时返回 `run_reused`，不重复扣 quota、不重复创建 run、不重复写 assistant message，也不重放 run_events / tool_invocations。

Tencent-21 后，默认 `real` 模式先运行 planner 判断 `capability_intro`、`data_analysis`、`knowledge_qa` 或 `unsupported`；`data_analysis` 走服务端受控工具链 `schema_inspect`、`aggregate_table`、`chart_render`。`schema_inspect` 返回固定 `teaching_metrics` schema 描述，`aggregate_table` 通过 CloudBase MySQL `app.rdb()` 读取 `teaching_metrics` 并在 JS 中按 month / grade / subject 聚合，`chart_render` 生成 chart config / series 数据，并写入 `tool_invocations` 的 `tool_name`、`status`、`input`、`output`、`elapsed_ms`。Tencent-28 后，`knowledge_qa` 走 CloudBase MySQL 受控 `knowledge_search`，读取 `knowledge_documents` / `knowledge_chunks`，在函数内做关键词评分并返回 top 3-5 个知识片段；模型只接收检索后的片段，不直接访问 SQL。Phase 0 后，当前模型主链路为前端 `selectedModelId` -> CloudBase `workbench-agent-run-stream` -> `_shared/modelGateway.js` -> model catalog 白名单校验 -> SiliconFlow / Zhipu OpenAI-compatible API -> `modelTrace` / `tokenUsage` / `latency` / `fallbackReason`。模型成功时 `conclusionSource = "model"` 并记录 `selectedModelId`、`provider`、`model`、`tokenUsage` 和 `latencyMs`；未配置或调用失败时返回明确 fallback，不伪装成真实模型结果。模型失败原因包括：`model_not_configured`、`invalid_model`、`model_disabled`、`model_timeout`、`rate_limited`、`model_forbidden`、`provider_error`、`provider_bad_response`、`model_failed`。Tencent-28 新增 RAG fallback：`rag_table_not_found`、`rag_query_failed`、`rag_empty`、`rag_no_match`。SSE 与 assistant message metadata 会记录 `conclusionSource`、`fallbackReason`、`selectedModelId`、`modelProvider`、`modelName`、`tokenUsage`、`latencyMs`、`modelErrorType`、`modelHttpStatus` 和脱敏 `modelErrorMessage`，知识回答 metadata 额外记录 `source = knowledge_qa`、`retrievedChunkCount`、`sourceDocumentIds`。

CloudBase 部署 `workbench-agent-run-stream` 时不再需要 `POSTGRES_CONNECTION_STRING` 或 `SUPABASE_DB_CONNECTION_STRING`。所有依赖 `_shared/mysql.js` 的函数必须在 CloudBase 函数环境变量中配置 `CLOUDBASE_ENV_ID=ai-agent-workbench-poc-d6731923d`，不要配置到 EdgeOne 或前端 `VITE_*`。CloudBase MySQL 由函数运行时通过 `@cloudbase/node-sdk` 和 `app.rdb()` 访问；模型 Key 只放 `workbench-agent-run-stream` 的 CloudBase 函数环境变量，不放 EdgeOne / 前端 `VITE_*`。推荐配置 `SILICONFLOW_API_KEY` 与 `ZHIPU_API_KEY`，按需覆盖 `SILICONFLOW_BASE_URL`、`ZHIPU_BASE_URL`、`SILICONFLOW_MODEL_QWEN`、`SILICONFLOW_MODEL_GLM`、`ZHIPU_MODEL_GLM_FLASH` 和 `MODEL_GATEWAY_TIMEOUT_MS`。模型未配置且 data tools 成功时，应通过 `fallbackReason = "model_not_configured"` 完成 SSE 流并写入 run/message/usage，不应再出现 `data_tool_failed`。

当前状态表示 conversations 列表 / 创建、messages 读取 / 写入、reports 列表 / 单条读取 / 保存、demo-copy、quota 基础闭环函数和 Agent Run CloudBase 流式验证函数已加入仓库并可进行部署验证，其中前端默认链路已接入 CloudBase Auth、conversations、messages、reports、demo-copy、quota 和 Agent Run stream。Tencent-21 需要在 CloudBase MySQL 执行 `tencent/migrations/002_cloudbase_teaching_metrics.sql` 与 `tencent/seeds/003_teaching_metrics_seed.sql`，否则真实 Agent Run 会明确返回 `fallbackReason = "data_table_not_found"`。Tencent-24 新增 `tencent/migrations/003_agent_run_idempotency.sql`，部署新版 `workbench-agent-run-stream` 前必须先执行该 migration，确保跨实例重复 `clientRunId` 命中数据库唯一约束。Tencent-28 需要执行 `tencent/migrations/004_cloudbase_knowledge_base.sql` 与 `tencent/seeds/004_knowledge_base_seed.sql`，否则知识类问题会返回 `rag_table_not_found` 或 `rag_empty`。`PATCH`、`DELETE` 和 archive 尚未迁移。Tencent-10C 暂未在消息写入和会话计数更新之间使用事务；quota 仍使用 CAS 条件更新而非 MySQL transaction / 行锁。

## run_events 索引状态

`run_events` 的冗余索引清理已经完成：

- `idx_run_events_run_id` 已从 CloudBase MySQL 数据库中删除。
- `idx_run_events_run_id` 已从 `tencent/migrations/001_cloudbase_mysql_schema.sql` 中删除。
- `uk_run_events_run_seq (run_id, seq)` 已保留，用于保证同一个 `run_id` 下事件序号唯一。

后续不要重新增加单列 `idx_run_events_run_id`，除非有新的查询计划和压测结果证明需要。按 `run_id` 查询事件时，`uk_run_events_run_seq (run_id, seq)` 可覆盖按 run 维度和事件顺序的主要访问路径。

## POC / 临时资源清理清单

以下资源仍属于 POC 或临时验证产物，后续在正式接口迁移前后需要清理。清理时应先确认没有正式路由、脚本或文档继续依赖它们。

| 类型 | 资源 | 清理建议 |
| --- | --- | --- |
| MySQL 测试表 | `agent_mysql_poc` | 确认无依赖后删除测试表。 |
| 测试数据 | `manual-test-user` | 确认不属于正式演示账号后删除。 |
| CloudBase 临时函数 | `scfhelloworld` | 删除函数及对应部署配置。 |
| CloudBase 临时函数 | `sse-test` | 正式 SSE 迁移完成后删除。 |
| CloudBase 临时函数 | 旧 `auth-me` POC 版本 | 已由正式 `/api/auth/me -> auth-me` 替代；只清理旧 POC 包或旧配置，不删除正式函数。 |
| CloudBase 临时函数 | `mysql-poc` | MySQL repository 正式化后删除。 |
| CloudBase 临时路由 | `/api/health` | 前端已不调用 legacy health；若控制台仍保留旧路由，可确认无依赖后删除。 |
| CloudBase 临时路由 | `/api/sse-test` | Agent Run SSE 迁移完成后删除。 |
| CloudBase 临时路由 | `/api/auth-me` | 旧 POC 路由。正式路由为 `/api/auth/me`，确认无依赖后删除旧路由。 |
| CloudBase 临时路由 | `/api/mysql-poc` | 正式 MySQL 读写接口迁移后删除。 |
| 本地临时文件 | `cloudbase-auth-test.html` | 归档验证结论后删除。 |
| 本地临时目录 | `cloudbase-sse-test` | 归档验证结论后删除。 |
| 本地临时目录 | `cloudbase-auth-me` | 归档验证结论后删除。 |
| 本地临时目录 | `cloudbase-mysql-poc` | 归档验证结论后删除。 |

## 下一步迁移顺序

建议按风险从低到高推进：

1. 先迁低风险 `demo_task_templates`、`demo_conversation_templates` 和 `health` 类接口。当前 demo templates 只读接口已完成验证。
2. 再迁 CloudBase Auth helper 与 `app_profiles`，建立 `_openid -> user_id` 映射。Tencent-09A 已完成 Auth helper 与 `/api/auth/me` 验证，Tencent-25 已把前端 `authStore` 默认身份来源切到 CloudBase，Tencent-25B 已切到 CloudBase 用户名密码登录主线。
3. 再迁 `conversations`、`messages`、`report_artifacts` 等会话、消息和报告接口。当前 Tencent-10C/Tencent-12 先新增 conversations 列表 / 创建、messages 读取 / 写入、reports 列表 / 单条读取 / 保存和 demo-copy 基础闭环，后续再迁 PATCH、archive、Agent Run 报告生成和 Agent Run 相关查询。
4. 再迁 quota transaction。当前 Tencent-13 已新增 quota 基础闭环，后续仍需使用 MySQL 事务和行锁验证并发扣减。
5. 最后迁 Agent Run SSE。Tencent-21 已在 CloudBase Agent Run 函数中接入 CloudBase MySQL `teaching_metrics` data tools，Tencent-22 已新增轻量 OpenAI-compatible model gateway 和明确 fallback，Phase 0 后当前模型链路收敛到 SiliconFlow / Zhipu 国内 provider，Tencent-28 已接入 CloudBase MySQL `knowledge_search`；Tencent-17 已接入前端 stream 调用，Tencent-25 后该调用默认走 CloudBase token。后续仍需补更强 quota transaction、断线恢复和旧链路删除前回归测试。

Agent Run SSE 放在最后，是因为它同时涉及流式输出、真实模型调用、quota、`agent_runs`、`run_events`、`tool_invocations`、报告生成和错误恢复，风险最高。

## 面试讲法

可以这样说明：

> 这个项目的腾讯云迁移不是只换一个静态托管平台，而是把前端部署、HTTP API、SSE、Auth 和数据库一起迁到腾讯云体系。现在 EdgeOne Pages、CloudBase HTTP Function、SSE、路由鉴权、CloudBase 用户名密码登录、MySQL 读写、会话消息报告、quota、Agent Run SSE、Run 恢复、报告闭环和 RAG knowledge_search 都已完成主链路迁移，前端默认身份来源和 private API 均已收敛到 CloudBase。Vercel / Supabase 主体代码已删除，后续重点是线上回归、增强事务一致性并清理剩余历史文案。

这段表述只描述工程事实，不需要包装成已完成全量迁移。

## 安全约束

本文档不记录 token、密钥、数据库连接串或真实密码。后续迁移记录也应只写能力状态、资源名称和操作原则，敏感配置必须通过服务端环境变量或云平台密钥管理注入。
