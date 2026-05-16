# Tencent Cloud Migration Status

生成日期：2026-05-16

## 当前阶段

当前迁移处于 CloudBase Preview 阶段收口：腾讯云 POC 能力验证完成，CloudBase MySQL 正式 schema 已落库，CloudBase HTTP Functions 覆盖 public demo templates、Auth helper、conversations、messages、reports、demo-copy、quota 和 Agent Run SSE；前端已通过 `VITE_ENABLE_CLOUDBASE_PRIVATE_API=true` 接入 CloudBase private API preview，本地 Vite proxy 已用于规避 localhost CORS。

本阶段不再把 Vercel / Supabase 作为后续主线维护方向。现有 Vercel / Supabase 代码和文档只作为历史参考、能力对照和必要时的回滚依据；腾讯云后续主线以 EdgeOne Pages、CloudBase HTTP Functions、CloudBase Auth v2 和 CloudBase MySQL 为准。

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

## CloudBase Preview 收口结论

Tencent-19 的阶段判断是：CloudBase Preview 已具备正式页面端到端回归基础，但还不是生产默认单轨。

当前已完成能力按模块列如下：

| 模块 | 当前状态 |
| --- | --- |
| Public demo templates | `demo-tasks` / `demo-conversations` 公开只读接口已验证，前端支持 `VITE_API_BASE_URL`。 |
| Auth helper | `/api/auth/me` 与 `_shared/auth.js` 已验证，能通过 CloudBase access token 建立或复用 `app_profiles`。 |
| Conversations | CloudBase private `GET/POST /api/workbench/conversations` 已验证，前端 preview 分支可创建和读取会话。 |
| Messages | CloudBase private `GET/POST /api/workbench/messages` 已验证，前端 preview 分支可读写消息。 |
| Reports | CloudBase private `GET/POST /api/workbench/reports` 已验证，前端 preview 分支可保存和读取 report artifacts。 |
| Demo copy | CloudBase private `POST /api/workbench/demo-copy` 已验证，前端 preview 分支可复制公开会话模板并读取 seed messages。 |
| Quota | CloudBase private `GET/POST /api/workbench/quota` 基础闭环已验证，Agent Run stream 后端会 consume / finish usage。 |
| Agent Run SSE / fallback | CloudBase `/api/agent/run/stream` 已验证鉴权、归属校验、quota、run/events/tools、assistant message、SSE 和明确 fallback；Tencent-21 将 data tools 改为直接读取 CloudBase MySQL `teaching_metrics`。 |
| Frontend CloudBase Preview | 正式页面可在 `VITE_ENABLE_CLOUDBASE_PRIVATE_API=true` 下走 CloudBase conversations/messages/reports/demo-copy/quota/Agent Run stream。 |
| Local test panel | `local-tools/cloudbase-auth-test.html` 可用于快速验证 CloudBase Auth 与 API，但不提交、不属于正式产品。 |

## Preview 边界

- 当前仍是 Preview，不是正式单轨。
- Vercel / Supabase 旧代码仍保留，用于回滚、对照和默认 legacy 路径。
- 前端 `authStore` 仍是 Supabase Auth，没有替换为 CloudBase Auth。
- CloudBase private API 只通过 `VITE_ENABLE_CLOUDBASE_PRIVATE_API=true` 显式启用；默认关闭时仍走 legacy。
- Agent Run 的真实 Groq 仍可能进入明确 fallback，不能把 fallback 当作真实模型结果宣传；data tools 失败时会使用 `data_table_not_found`、`data_tool_query_failed`、`data_empty` 等明确原因。
- quota consume / finish 已具备基础闭环，但 consume 尚未事务化，也没有 MySQL 行锁并发保护。
- `local-tools` 测试面板只服务迁移验证，不提交、不进正式页面、不作为产品能力。
- CloudBase Preview 不等于删除 Vercel/Supabase；正式删除前必须保留回滚窗口。

## 正式切换前清单

正式单轨切换前必须完成：

1. 配置 EdgeOne Preview 环境变量，并确认前端指向 CloudBase 默认域名。
2. 跑完整浏览器回归：页面初始化、demo templates、创建会话、消息读写、demo-copy、reports、Agent Run、报告确认、错误态和刷新恢复。
3. 检查 Network：无 CORS、无 legacy `/api/health` 404 噪音、无明显重复 GET、无重复 POST。
4. 确认用户消息只写一次，CloudBase Agent Run 后端写入 assistant message 后，前端不重复持久化 assistant message。
5. 确认 quota 只随一次 Agent Run consume 一次，并且失败 / fallback 时 finish usage 状态正确。
6. 补 quota transaction / 行锁或等效原子扣减方案，再进入高并发或公开流量。
7. 打开 CloudBase 函数日志和错误观察，记录 401 / 403 / 429 / 500 的前端表现。
8. 在删除旧 Vercel / Supabase 代码前保留回滚窗口，至少完成一次 EdgeOne Preview 线上回归。

## EdgeOne 环境变量建议

本地 `.env.local` 推荐：

```env
VITE_API_BASE_URL=
VITE_CLOUDBASE_ENV_ID=<cloudbase-env-id>
VITE_CLOUDBASE_REGION=ap-shanghai
VITE_ENABLE_CLOUDBASE_PRIVATE_API=true
CLOUDBASE_PROXY_TARGET=https://<cloudbase-default-domain>
```

EdgeOne Preview / Production 推荐：

```env
VITE_API_BASE_URL=https://<cloudbase-default-domain>
VITE_CLOUDBASE_ENV_ID=<cloudbase-env-id>
VITE_CLOUDBASE_REGION=ap-shanghai
VITE_ENABLE_CLOUDBASE_PRIVATE_API=true
```

`CLOUDBASE_PROXY_TARGET` 只给本地 Vite dev server 使用，不是 `VITE_` 变量，不会进入浏览器，也不应配置为 EdgeOne 前端公开环境变量。

## 下一步建议

当前有两个可选路径：

- A. 推送 main，触发一次 EdgeOne Preview 部署，做线上 CloudBase Preview 回归。
- B. 继续本地做单轨化准备，暂不触发 EdgeOne 构建。

推荐路径是 A：如果本地已经通过，并且 push 前确认 `git status` 干净、`pnpm build` 通过，就应进入 EdgeOne Preview 线上回归。线上回归通过后，再决定是否进入正式默认链路切换和旧链路清理。

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

`/api/auth/me` 是正式 Auth helper 验证入口，不是旧 POC 路由 `/api/auth-me` 或旧 POC 函数。当前状态仅表示 CloudBase Auth helper 与 `/api/auth/me` 验证完成，不代表整个 Auth 链路已经切换到腾讯云。当前仍未迁移前端 `authStore`；conversations / messages / reports / demo-copy / quota 已在 CloudBase preview 开关下接入前端。Tencent-17 开始在同一 preview 开关下接入前端 Agent Run stream，但 legacy Vercel / Supabase 链路仍保留，正式切换前仍需要完整回归测试。后续私有 CloudBase HTTP Function 应复用该 helper 获取 `currentUser`，再对私有表显式追加 `_openid` 与 `user_id` 过滤。

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

`workbench-quota` 只使用固定路由 `/api/workbench/quota`，路径透传关闭，避免 CloudBase 多路径路由和路径透传差异。`GET /api/workbench/quota` 会读取或自动创建当前用户本月 `agent_run_quota`，默认 `quota_limit = 20`、`quota_used = 0`；`POST /api/workbench/quota` 通过 `body.action` 区分操作，`action = "consume"` 会为 `demo_user` 在未超额时递增 `quota_used` 并写入 `agent_run_usage(status = started)`，`admin` 不递增 quota 但仍写 usage；`action = "finish"` 按 `usageId + _openid + user_id` 更新 `status`、`finished_at`、`error_code` 和 `metadata`。`metadata` 写入前使用 `JSON.stringify(...)`，读取后安全解析。

`workbench-agent-run-stream` 使用固定路由 `/api/agent/run/stream`，路径透传关闭。Tencent-14 的 `body.mode = "basic"` 固定 Agent Run 基础闭环仍保留：复用 `_shared/auth.js` 获取 `currentUser`，校验 `conversationId + _openid + user_id + visibility = private` 归属，消耗 quota 并创建 `agent_run_usage`，创建 `agent_runs`，以 SSE 依次输出并写入 `run_events`，写入 mock `tool_invocations` 和 assistant `messages`，并 finish usage。

Tencent-21 后，默认 `real` 模式先运行 planner 判断 `capability_intro`、`data_analysis`、`knowledge_qa` 或 `unsupported`；`data_analysis` 走服务端受控工具链 `schema_inspect`、`aggregate_table`、`chart_render`。`schema_inspect` 返回固定 `teaching_metrics` schema 描述，`aggregate_table` 通过 CloudBase MySQL `app.rdb()` 读取 `teaching_metrics` 并在 JS 中按 month / grade / subject 聚合，`chart_render` 生成 chart config / series 数据，并写入 `tool_invocations` 的 `tool_name`、`status`、`input`、`output`、`elapsed_ms`；配置 `GROQ_API_KEY` 时用 Groq 生成结论，未配置或调用失败时返回明确 fallback，不伪装成真实模型结果。SSE 与 assistant message metadata 会记录 `conclusionSource` 和 `fallbackReason`。`knowledge_qa` 暂不迁真实 RAG，返回 `rag_not_migrated` fallback，因为现有 RAG 仍依赖 Supabase Admin / knowledge 表链路。

CloudBase 部署 `workbench-agent-run-stream` 时不再需要 `POSTGRES_CONNECTION_STRING` 或 `SUPABASE_DB_CONNECTION_STRING`。CloudBase MySQL 由函数运行时通过 `@cloudbase/node-sdk` 和 `app.rdb()` 访问；可选环境变量为 `GROQ_API_KEY`、`GROQ_MODEL`。`GROQ_API_KEY` 未配置且 data tools 成功时，应通过 `fallbackReason = "groq_not_configured"` 完成 SSE 流并写入 run/message/usage，不应再出现 `data_tool_failed`。

当前状态表示 conversations 列表 / 创建、messages 读取 / 写入、reports 列表 / 单条读取 / 保存、demo-copy、quota 基础闭环函数和 Agent Run CloudBase 流式验证函数已加入仓库并可进行部署验证，其中前端 CloudBase preview 已接入 conversations、messages、reports、demo-copy、quota 和 Agent Run stream。Tencent-21 还需要在 CloudBase MySQL 执行 `tencent/migrations/002_cloudbase_teaching_metrics.sql` 与 `tencent/seeds/003_teaching_metrics_seed.sql`，否则真实 Agent Run 会明确返回 `fallbackReason = "data_table_not_found"`。`PATCH`、`DELETE`、archive、Agent Run 报告生成、RAG knowledge_qa、前端 `authStore` 和正式默认链路均未迁移。Tencent-10C 暂未在消息写入和会话计数更新之间使用事务；Tencent-13/Tencent-21 暂未在 quota consume 中使用 MySQL transaction + 行锁，后续高并发场景需要补事务或原子更新方案。

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
| CloudBase 临时路由 | `/api/health` | 正式 health 接口迁移后替换或删除临时实现。 |
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
2. 再迁 CloudBase Auth helper 与 `app_profiles`，建立 `_openid -> user_id` 映射。Tencent-09A 已完成 Auth helper 与 `/api/auth/me` 验证，但前端 `authStore` 尚未迁移。
3. 再迁 `conversations`、`messages`、`report_artifacts` 等会话、消息和报告接口。当前 Tencent-10C/Tencent-12 先新增 conversations 列表 / 创建、messages 读取 / 写入、reports 列表 / 单条读取 / 保存和 demo-copy 基础闭环，后续再迁 PATCH、archive、Agent Run 报告生成和 Agent Run 相关查询。
4. 再迁 quota transaction。当前 Tencent-13 已新增 quota 基础闭环，后续仍需使用 MySQL 事务和行锁验证并发扣减。
5. 最后迁 Agent Run SSE。Tencent-21 已在 CloudBase Agent Run 函数中接入 CloudBase MySQL `teaching_metrics` data tools、Groq 和明确 fallback；Tencent-17 已在 CloudBase preview 开关下接入前端 stream 调用。后续仍需补 RAG knowledge_qa、报告生成入口、事务化 quota、断线恢复和正式切换前回归测试。

Agent Run SSE 放在最后，是因为它同时涉及流式输出、真实模型调用、quota、`agent_runs`、`run_events`、`tool_invocations`、报告生成和错误恢复，风险最高。

## 面试讲法

可以这样说明：

> 这个项目的腾讯云迁移不是只换一个静态托管平台，而是把前端部署、HTTP API、SSE、Auth 和数据库一起迁到腾讯云体系。现在 EdgeOne Pages、CloudBase HTTP Function、SSE、Auth v2 匿名登录、路由鉴权和 MySQL 读写 POC 都已经验证通过，正式 MySQL schema 也已经落库。后续不会继续沿 Vercel / Supabase 做主线扩展，而是按低风险接口、Auth 和用户表、会话消息报告、quota 事务、最后 Agent Run SSE 的顺序分批迁移。

这段表述只描述工程事实，不需要包装成已完成全量迁移。

## 安全约束

本文档不记录 token、密钥、数据库连接串或真实密码。后续迁移记录也应只写能力状态、资源名称和操作原则，敏感配置必须通过服务端环境变量或云平台密钥管理注入。
