# CloudBase HTTP Functions

本目录保存当前 CloudBase HTTP Functions 实现。当前包含公开 demo templates 只读接口、CloudBase Auth helper、conversations / messages / reports / demo-copy / quota / runs / evaluations 基础闭环函数，以及 Agent Run 流式函数。`workbench-agent-run-stream` 主链路已进入 LangGraph runtime；正式 Tool / Retriever 已进入 LangChain Tool / Retriever 边界并读取 CloudBase MySQL `teaching_metrics`、`knowledge_documents` 和 `knowledge_chunks`；模型链路通过前端 `selectedModelId`、服务端 catalog 白名单和 `_shared/langchainModelLayer.js` 调用 LangChain Chat Model 与 SiliconFlow / Zhipu OpenAI-compatible API。Trace / Evaluation 语义已对齐 LangSmith，但 LangSmith 外部 ID 不替代 canonical `runId` 或项目主事实源。

## 函数

| 函数目录 | 建议 CloudBase 路由 | 身份认证 | 用途 |
| --- | --- | --- | --- |
| `demo-tasks` | `/api/workbench/demo-tasks` | 关闭 | 读取公开示例任务模板。 |
| `demo-conversations` | `/api/workbench/demo-conversations` | 关闭 | 读取公开示例会话模板。 |
| `auth-me` | `/api/auth/me` | 开启 | 校验 CloudBase 登录态，查询或创建 `app_profiles`，返回 `currentUser`。 |
| `workbench-conversations` | `/api/workbench/conversations` | 开启 | 查询当前用户私有 Workbench 会话列表，并创建空会话。 |
| `workbench-messages` | `/api/workbench/messages` | 开启 | 校验会话归属后读取和写入当前用户私有消息。 |
| `workbench-reports` | `/api/workbench/reports` | 开启 | 校验会话归属后读取和保存当前用户私有报告。 |
| `workbench-demo-copy` | `/api/workbench/demo-copy` | 开启 | 复制公开示例会话模板为当前用户私有会话。 |
| `workbench-quota` | `/api/workbench/quota` | 开启 | 查询本月 Agent Run 额度，并通过 `POST body.action` 消耗额度或完成 usage。 |
| `workbench-runs` | `/api/workbench/runs` | 开启 | 只读恢复当前用户的 Agent Run、Run Trace 和 Tool Invocation。 |
| `workbench-evaluations` | `/api/workbench/evaluations` | 开启 | 读取和写入 Evaluation / Bad Case，并按 LangSmith feedback 语义上报。 |
| `workbench-agent-run-stream` | `/api/agent/run/stream` | 开启 | CloudBase Agent Run SSE 主入口；内部编排进入 LangGraph runtime，Tool / Retriever 进入 LangChain 边界。 |

## 共享 helper

| 目录 | 用途 |
| --- | --- |
| `_shared/mysql.js` | 初始化 `@cloudbase/node-sdk`、返回 `app.rdb()`，提供 MySQL 结果和 JSON 字段兜底处理。 |
| `_shared/auth.js` | 解析 CloudBase token / Bearer token payload，获取 `_openid` / `user_id`，查询或创建 `app_profiles`，并返回统一 `currentUser`。 |
| `_shared/langchainModelLayer.js` | 当前 LangChain Model Layer；承载 catalog、provider、model、apiKeyEnv、timeout、usage、cost estimate 和错误归类契约。 |
| `_shared/langgraphRuntime.js` | LangGraph Run State / node / edge / canonical event mapper 边界。 |
| `_shared/langsmithObservability.js` | LangSmith Trace / Evaluation 上报边界；失败或未配置时显式返回状态。 |
| `_shared/agentRunModelMetadata.js` | Report / Evaluation 复用的 Agent Run canonical `modelTrace` metadata 读取边界，只读取项目 `agent_runs.metadata.modelTrace`。 |

后续私有 CloudBase HTTP Function 应复用已验证的 `_shared/auth.js` 获取 `currentUser`，再对私有表显式追加 `_openid` 与 `user_id` 过滤。`workbench-conversations`、`workbench-messages`、`workbench-reports`、`workbench-demo-copy`、`workbench-quota`、`workbench-runs`、`workbench-agent-run-stream` 和 `workbench-evaluations` 已按该方式实现基础验证；当前不替换前端 `authStore`。

## CloudBase 函数环境变量

所有依赖 `_shared/mysql.js` 的 CloudBase HTTP Function 都必须在 CloudBase 控制台配置函数环境变量：

```txt
CLOUDBASE_ENV_ID=ai-agent-workbench-poc-d6731923d
```

受影响函数：

- `auth-me`
- `workbench-conversations`
- `workbench-messages`
- `workbench-reports`
- `workbench-demo-copy`
- `workbench-quota`
- `workbench-runs`
- `workbench-agent-run-stream`
- `workbench-evaluations`

这是 CloudBase 函数运行时环境变量，用于 `@cloudbase/node-sdk` 初始化 `app.rdb()`。不要写入代码，不要写入前端，不要配置到 EdgeOne，也不要加 `VITE_` 前缀。EdgeOne 只配置前端公开的 `VITE_*` 变量；本地 Vite proxy 可继续使用 `CLOUDBASE_PROXY_TARGET`，但它不是 CloudBase 函数变量。

`workbench-agent-run-stream` 的模型 Key 也只放 CloudBase 函数环境变量。`SILICONFLOW_API_KEY` / `ZHIPU_API_KEY` 不放 EdgeOne / 前端 `VITE_*` 变量。LangSmith Key 只允许配置到服务端 CloudBase 函数环境变量，不能进入 `VITE_*` 或前端 bundle。

不迁移：

```txt
/api/workbench/demo-conversations/:id/copy
/api/workbench/conversations/:id PATCH
/api/workbench/runs/:id/report
```

CloudBase HTTP 访问服务不支持 `/api/workbench/demo-conversations/:id/copy` 这种动态路径，Tencent-12 改用固定 `/api/workbench/demo-copy` 路由。当前已迁移 conversations 列表 / 创建、messages 读取 / 写入、reports 列表 / 单条读取 / 保存、demo-copy、quota 基础闭环、Agent Run 流式验证和 CloudBase MySQL `knowledge_qa` 受控检索；PATCH、archive 和更强 quota transaction / 行锁后续再迁。

## 打包上传

每个函数目录独立打包。上传源码包即可，不默认把 `node_modules` 打进 zip，也不提交或上传 `package-lock.json`。在 CloudBase 创建 HTTP 云函数时开启“自动安装依赖”，由 CloudBase 根据函数目录内的 `package.json` 安装依赖。

公开 demo templates 函数不依赖 `_shared`，可直接在函数目录打包：

```bash
cd tencent/functions/demo-tasks
chmod +x scf_bootstrap
zip -r demo-tasks.zip index.js package.json scf_bootstrap README.md
```

```bash
cd tencent/functions/demo-conversations
chmod +x scf_bootstrap
zip -r demo-conversations.zip index.js package.json scf_bootstrap README.md
```

`auth-me` 依赖 `_shared`，打包时用桌面临时目录把共享 helper 放进 zip 根目录，不在仓库里提交临时复制文件：

```powershell
cd tencent/functions
$stage = Join-Path $env:USERPROFILE 'Desktop\cloudbase-auth-me-package'
if (Test-Path $stage) {
  Remove-Item -LiteralPath $stage -Recurse -Force
}
New-Item -ItemType Directory -Force -Path (Join-Path $stage '_shared') | Out-Null
Copy-Item auth-me/index.js,auth-me/package.json,auth-me/scf_bootstrap,auth-me/README.md -Destination $stage
Copy-Item _shared/mysql.js,_shared/auth.js -Destination (Join-Path $stage '_shared')
Compress-Archive -Path (Join-Path $stage '*') -DestinationPath (Join-Path $stage 'auth-me.zip') -Force
```

`workbench-conversations` 也依赖 `_shared`。打包时使用桌面临时目录，不使用 `/tmp`，zip 不提交 Git：

```powershell
cd tencent/functions
$stage = Join-Path $env:USERPROFILE 'Desktop\cloudbase-workbench-conversations-package'
if (Test-Path $stage) {
  Remove-Item -LiteralPath $stage -Recurse -Force
}
New-Item -ItemType Directory -Force -Path (Join-Path $stage '_shared') | Out-Null
Copy-Item workbench-conversations/index.js,workbench-conversations/package.json,workbench-conversations/scf_bootstrap,workbench-conversations/README.md -Destination $stage
Copy-Item _shared/mysql.js,_shared/auth.js -Destination (Join-Path $stage '_shared')
Compress-Archive -Path (Join-Path $stage '*') -DestinationPath (Join-Path $stage 'workbench-conversations.zip') -Force
```

`workbench-messages` 也依赖 `_shared`。CloudBase HTTP 访问服务不支持动态参数路径，路由使用固定路径 `/api/workbench/messages`，路径透传关闭；`GET` 从 query 读取 `conversationId`，`POST` 从 JSON body 读取 `conversationId`：

```powershell
cd tencent/functions
$stage = Join-Path $env:USERPROFILE 'Desktop\cloudbase-workbench-messages-package'
if (Test-Path $stage) {
  Remove-Item -LiteralPath $stage -Recurse -Force
}
New-Item -ItemType Directory -Force -Path (Join-Path $stage '_shared') | Out-Null
Copy-Item workbench-messages/index.js,workbench-messages/package.json,workbench-messages/scf_bootstrap,workbench-messages/README.md -Destination $stage
Copy-Item _shared/mysql.js,_shared/auth.js -Destination (Join-Path $stage '_shared')
Compress-Archive -Path (Join-Path $stage '*') -DestinationPath (Join-Path $stage 'workbench-messages.zip') -Force
```

`workbench-reports` 也依赖 `_shared`。路由使用固定路径 `/api/workbench/reports`，路径透传关闭；`GET` 从 query 读取 `conversationId` 或 `id`，`POST` 从 JSON body 读取 `conversationId`：

```powershell
cd tencent/functions
$stage = Join-Path $env:USERPROFILE 'Desktop\cloudbase-workbench-reports-package'
if (Test-Path $stage) {
  Remove-Item -LiteralPath $stage -Recurse -Force
}
New-Item -ItemType Directory -Force -Path (Join-Path $stage '_shared') | Out-Null
Copy-Item workbench-reports/index.js,workbench-reports/package.json,workbench-reports/scf_bootstrap,workbench-reports/README.md -Destination $stage
Copy-Item _shared/mysql.js,_shared/auth.js,_shared/agentRunModelMetadata.js -Destination (Join-Path $stage '_shared')
Compress-Archive -Path (Join-Path $stage '*') -DestinationPath (Join-Path $stage 'workbench-reports.zip') -Force
```

`workbench-demo-copy` 也依赖 `_shared`。路由使用固定路径 `/api/workbench/demo-copy`，路径透传关闭；`POST` 从 JSON body 读取 `templateId`。打包说明使用 Git Bash：

```bash
cd tencent/functions
stage="$HOME/Desktop/cloudbase-workbench-demo-copy-package"
rm -rf "$stage"
mkdir -p "$stage/_shared"
cp workbench-demo-copy/index.js workbench-demo-copy/package.json workbench-demo-copy/scf_bootstrap workbench-demo-copy/README.md "$stage/"
cp _shared/mysql.js _shared/auth.js "$stage/_shared/"
chmod +x "$stage/scf_bootstrap"
(cd "$stage" && zip -r workbench-demo-copy.zip index.js package.json README.md scf_bootstrap _shared)
```

`workbench-quota` 也依赖 `_shared`。只使用固定路由 `/api/workbench/quota`，路径透传关闭；`GET` 读取额度，`POST` 通过 `body.action = "consume"` 或 `body.action = "finish"` 区分操作。打包说明使用 Git Bash：

```bash
cd tencent/functions
stage="$HOME/Desktop/cloudbase-workbench-quota-package"
rm -rf "$stage"
mkdir -p "$stage/_shared"
cp workbench-quota/index.js workbench-quota/package.json workbench-quota/scf_bootstrap workbench-quota/README.md "$stage/"
cp _shared/mysql.js _shared/auth.js "$stage/_shared/"
chmod +x "$stage/scf_bootstrap"
(cd "$stage" && zip -r workbench-quota.zip index.js package.json README.md scf_bootstrap _shared)
```

`workbench-runs` 依赖 `_shared`。只使用固定路由 `/api/workbench/runs`，路径透传关闭；`GET /api/workbench/runs?conversationId=<id>&latest=1` 读取当前会话最近一次 run，`GET /api/workbench/runs?runId=<id>` 读取指定 run，并一起返回 `run_events` 和 `tool_invocations`。该函数只读，不创建 run、不 consume quota、不写 assistant message。打包说明使用 Git Bash：

```bash
cd tencent/functions
stage="$HOME/Desktop/cloudbase-workbench-runs-package"
rm -rf "$stage"
mkdir -p "$stage/_shared"
cp workbench-runs/index.js workbench-runs/package.json workbench-runs/scf_bootstrap workbench-runs/README.md "$stage/"
cp _shared/mysql.js _shared/auth.js "$stage/_shared/"
chmod +x "$stage/scf_bootstrap"
(cd "$stage" && zip -r workbench-runs.zip index.js package.json README.md scf_bootstrap _shared)
```

`workbench-agent-run-stream` 依赖 `_shared`。部署当前版函数前，必须先在 CloudBase MySQL 执行 `tencent/migrations/007_agent_runs_client_run_id.sql`，为 `agent_runs(user_id, client_run_id)` 增加唯一约束。它使用固定路由 `/api/agent/run/stream`，路径透传关闭；`POST` 从 JSON body 读取 `conversationId`，复用 `_shared/auth.js` 获取 `currentUser`，校验会话归属后执行 CloudBase Agent Run 流式验证：按 `user_id + clientRunId` 做服务端幂等检查，先创建 `agent_runs(status = pending)` 建立数据库幂等边界，再 consume quota、绑定 `usage_id`、写入 `run_events`、写入 `tool_invocations`、写入 assistant message，并 finish usage。当前 Agent Run 主链路进入 LangGraph runtime；正式工具通过 LangChain Tool / Structured Tool 执行，`knowledge_search` 通过 LangChain Retriever / Document 输出边界；模型调用走 `_shared/langchainModelLayer.js`。该函数的 `package.json` 依赖 `@cloudbase/node-sdk`、`@langchain/core`、`@langchain/langgraph`、`@langchain/openai` 和 `zod`，需要 CloudBase 自动安装依赖。打包说明使用 Git Bash：

```bash
cd tencent/functions
stage="$HOME/Desktop/cloudbase-workbench-agent-run-stream-package"
rm -rf "$stage"
mkdir -p "$stage/_shared"
cp workbench-agent-run-stream/index.js workbench-agent-run-stream/package.json workbench-agent-run-stream/scf_bootstrap workbench-agent-run-stream/README.md "$stage/"
cp _shared/mysql.js _shared/auth.js _shared/langchainModelLayer.js _shared/langgraphRuntime.js _shared/langsmithObservability.js "$stage/_shared/"
chmod +x "$stage/scf_bootstrap"
(cd "$stage" && zip -r workbench-agent-run-stream.zip index.js package.json README.md scf_bootstrap _shared)
```

`workbench-agent-run-stream` 的 zip 根目录应包含：

```txt
_shared/
index.js
package.json
README.md
scf_bootstrap
```

`workbench-evaluations` 依赖 `_shared`。只使用固定路由 `/api/workbench/evaluations`，路径透传关闭；它读取和写入 Evaluation / Bad Case 结果，保留 `eval_results.run_id` 和项目 Evaluation 表作为主事实源，并通过 `_shared/langsmithObservability.js` 按 LangSmith feedback 语义上报。打包说明使用 Git Bash：

```bash
cd tencent/functions
stage="$HOME/Desktop/cloudbase-workbench-evaluations-package"
rm -rf "$stage"
mkdir -p "$stage/_shared"
cp workbench-evaluations/index.js workbench-evaluations/package.json workbench-evaluations/scf_bootstrap workbench-evaluations/README.md "$stage/"
cp _shared/mysql.js _shared/auth.js _shared/langsmithObservability.js _shared/agentRunModelMetadata.js "$stage/_shared/"
chmod +x "$stage/scf_bootstrap"
(cd "$stage" && zip -r workbench-evaluations.zip index.js package.json README.md scf_bootstrap _shared)
```

`workbench-conversations`、`workbench-messages`、`workbench-reports`、`workbench-demo-copy`、`workbench-quota`、`workbench-runs`、`workbench-agent-run-stream` 和 `workbench-evaluations` 的 zip 根目录都应包含：

```txt
_shared/
index.js
package.json
README.md
scf_bootstrap
```

`workbench-agent-run-stream` 通过 CloudBase 函数运行时、`@cloudbase/node-sdk` 和 `app.rdb()` 访问 CloudBase MySQL。Agent Run 主链路进入 LangGraph runtime；Tool / Retriever 进入 LangChain Tool / Retriever 边界。当前模型链路由前端 `selectedModelId` 进入 `_shared/langchainModelLayer.js`，通过 catalog 白名单映射到 LangChain Chat Model 和 SiliconFlow / Zhipu OpenAI-compatible API。推荐配置：

所有依赖 `_shared/mysql.js` 的函数都需要先在 CloudBase 函数环境变量中配置 `CLOUDBASE_ENV_ID=ai-agent-workbench-poc-d6731923d`；EdgeOne 不需要也不应配置该变量。

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

LangSmith 可选配置：

```txt
LANGSMITH_API_KEY=...
LANGSMITH_PROJECT=ai-agent-workbench
LANGSMITH_TIMEOUT_MS=3000
```

模型 Key 和 LangSmith Key 只放 CloudBase 函数环境变量，不放 EdgeOne / 前端 `VITE_*` 变量。未配置模型时应走 `fallbackReason = "model_not_configured"`，不应再出现 `data_tool_failed`。Agent Run Tool / Retriever 只读取 CloudBase MySQL 受控表。`knowledge_qa` 使用 CloudBase MySQL `knowledge_documents` / `knowledge_chunks` 和受控 `knowledge_search`，不接外部向量库，不让模型直接查 SQL。`_shared/langchainModelLayer.js` 是当前模型调用边界，并在现有 JSON metadata 中输出 canonical `usage` / `costEstimate`，不新增数据库字段；旧模型网关不得恢复为 Agent Run runtime fallback。LangSmith 未配置或上报失败时必须显式记录未上报 / 上报失败，不能伪装真实 trace。

上传时选择 CloudBase HTTP 云函数，运行时建议 Node.js 18.x。压缩包应包含函数目录内的文件，不要把上级目录一起打进 zip。

如果 CloudBase 自动安装依赖失败，再单独排查依赖安装、运行时版本和网络环境；不要默认提交或上传 `node_modules`。

## 本地验证

本地如果已配置可访问 CloudBase 的环境，可在函数目录执行：

```bash
pnpm install --prod
pnpm start
```

然后请求：

```bash
curl -i http://127.0.0.1:9000/
```

成功响应格式应与当前 CloudBase HTTP API 契约一致：

```json
{ "ok": true, "data": { "tasks": [] } }
```

```json
{ "ok": true, "data": { "conversations": [] } }
```

线上验证建议：

```bash
curl -i https://<your-domain>/api/workbench/demo-tasks
curl -i https://<your-domain>/api/workbench/demo-conversations
```

预期 `demo-tasks` 返回 8 条，`demo-conversations` 返回 4 条。

`auth-me` 线上验证建议：

```bash
curl -i https://<your-domain>/api/auth/me
curl -i -H "Authorization: Bearer <cloudbase-token>" https://<your-domain>/api/auth/me
```

未带 token 时应由 CloudBase 网关返回 `401 MISSING_CREDENTIALS`。带 token 时应返回 `ok: true` 和 `currentUser`，并在 `app_profiles` 中出现或复用对应用户。当前验证用户为 `role = demo_user`、`status = active`，第一阶段 `_openid` 与 `user_id` 保持同值。手动把 `status` 改为 `disabled` 后，应返回 `403`。

`workbench-conversations` 语法检查：

```bash
node --check tencent/functions/workbench-conversations/index.js
node --check tencent/functions/workbench-messages/index.js
node --check tencent/functions/workbench-reports/index.js
node --check tencent/functions/workbench-demo-copy/index.js
node --check tencent/functions/workbench-quota/index.js
node --check tencent/functions/workbench-agent-run-stream/index.js
node --check tencent/functions/workbench-evaluations/index.js
node --check tencent/functions/_shared/langchainModelLayer.js
node --check tencent/functions/_shared/langgraphRuntime.js
node --check tencent/functions/_shared/langsmithObservability.js
```

`workbench-conversations` 线上验证建议：

```bash
curl -i https://<your-domain>/api/workbench/conversations
curl -i -H "Authorization: Bearer <cloudbase-token>" "https://<your-domain>/api/workbench/conversations?limit=20"
curl -i -X POST -H "Authorization: Bearer <cloudbase-token>" -H "Content-Type: application/json" -d "{\"title\":\"新会话\",\"mode\":\"mock\"}" https://<your-domain>/api/workbench/conversations
```

未带 token 时应由 CloudBase 网关返回 `401 MISSING_CREDENTIALS`。带 token 的 `GET` 应返回 `ok: true`、`data.conversations` 和 `data.nextCursor`；当前用户没有私有会话时，`conversations` 应为 `[]`。带 token 的 `POST` 应返回 `ok: true` 和新建 conversation，随后 `GET` 应能查到该会话。该验证不应影响 `demo-tasks` 或 `demo-conversations`。

`workbench-messages` 线上验证建议：

```bash
curl -i "https://<your-domain>/api/workbench/messages?conversationId=<conversation-id>"
curl -i -H "Authorization: Bearer <cloudbase-token>" "https://<your-domain>/api/workbench/messages?conversationId=<conversation-id>&limit=30"
curl -i -X POST -H "Authorization: Bearer <cloudbase-token>" -H "Content-Type: application/json" -d "{\"conversationId\":\"<conversation-id>\",\"role\":\"user\",\"content\":\"hello\",\"clientMessageId\":\"local-message-1\"}" https://<your-domain>/api/workbench/messages
```

未带 token 时应由 CloudBase 网关返回 `401 MISSING_CREDENTIALS`。带 token 的 `GET` 在空会话中应返回 `ok: true` 和 `messages: []`；带 token 的 `POST` 应返回 `ok: true` 和新建 message，随后 `GET` 应能查到该消息，并且父会话 `message_count` 增加。该验证不应影响 `demo-tasks`、`demo-conversations` 或 `auth-me`。

`workbench-reports` 线上验证建议：

```bash
curl -i https://<your-domain>/api/workbench/reports
curl -i -H "Authorization: Bearer <cloudbase-token>" https://<your-domain>/api/workbench/reports
curl -i -X POST -H "Authorization: Bearer <cloudbase-token>" -H "Content-Type: application/json" -d "{\"title\":\"分析报告\",\"contentMarkdown\":\"# 测试报告\"}" https://<your-domain>/api/workbench/reports
curl -i -X POST -H "Authorization: Bearer <cloudbase-token>" -H "Content-Type: application/json" -d "{\"conversationId\":\"<conversation-id>\",\"title\":\"分析报告\",\"contentMarkdown\":\"# 测试报告\",\"status\":\"generated\",\"metadata\":{\"source\":\"browser-test\"}}" https://<your-domain>/api/workbench/reports
curl -i -H "Authorization: Bearer <cloudbase-token>" "https://<your-domain>/api/workbench/reports?conversationId=<conversation-id>"
```

未带 token 时应由 CloudBase 网关返回 `401 MISSING_CREDENTIALS`。带 token 但保存报告缺少 `conversationId` 时应返回 `validation_error`；创建会话后保存报告应返回 `ok: true` 和新建 report，随后按 `conversationId` 读取报告列表应返回 `reports`，且数量至少为 1。该验证不应影响 `demo-tasks`、`demo-conversations`、`auth-me`、`workbench-conversations` 或 `workbench-messages`。

`workbench-demo-copy` 线上验证建议：

```bash
curl -i https://<your-domain>/api/workbench/demo-copy
curl -i -X POST -H "Authorization: Bearer <cloudbase-token>" -H "Content-Type: application/json" -d "{}" https://<your-domain>/api/workbench/demo-copy
curl -i -X POST -H "Authorization: Bearer <cloudbase-token>" -H "Content-Type: application/json" -d "{\"templateId\":\"<template-id>\"}" https://<your-domain>/api/workbench/demo-copy
curl -i -H "Authorization: Bearer <cloudbase-token>" "https://<your-domain>/api/workbench/conversations?limit=20"
curl -i -H "Authorization: Bearer <cloudbase-token>" "https://<your-domain>/api/workbench/messages?conversationId=<copied-conversation-id>"
```

未带 token 时应由 CloudBase 网关返回 `401 MISSING_CREDENTIALS`。带 token 但缺少 `templateId` 时应返回 `validation_error`；带 token 和有效 `templateId` 时应返回 `ok: true`、`conversation` 和 `messagesCount`。随后读取会话列表应能看到复制出来的会话，读取该会话消息应能看到 seed messages。该验证不应影响 `demo-tasks`、`demo-conversations`、`auth-me`、`workbench-conversations`、`workbench-messages` 或 `workbench-reports`。

`workbench-quota` 线上验证建议：

```bash
curl -i https://<your-domain>/api/workbench/quota
curl -i -H "Authorization: Bearer <cloudbase-token>" https://<your-domain>/api/workbench/quota
curl -i -X POST -H "Authorization: Bearer <cloudbase-token>" -H "Content-Type: application/json" -d "{\"action\":\"consume\",\"runId\":\"<canonical-agent-run-id>\",\"metadata\":{\"source\":\"curl\"}}" https://<your-domain>/api/workbench/quota
curl -i -X POST -H "Authorization: Bearer <cloudbase-token>" -H "Content-Type: application/json" -d "{\"action\":\"finish\",\"usageId\":\"<usage-id>\",\"status\":\"completed\",\"metadata\":{\"source\":\"curl\"}}" https://<your-domain>/api/workbench/quota
curl -i -H "Authorization: Bearer <cloudbase-token>" https://<your-domain>/api/workbench/quota
```

未带 token 时应由 CloudBase 网关返回 `401 MISSING_CREDENTIALS`。读取额度应返回 `ok: true` 和 `quota`；`POST` 缺少或传入非法 `action` 应返回 `validation_error`；`action = "consume"` 必须传入当前用户已存在的 canonical Agent Run UUID，并应返回 `usageId` 和更新后的 `quota`；`action = "finish"` 应返回更新后的 `usage`；再次读取额度时，`demo_user` 的 `quotaUsed` 应变化。该验证不应影响 `demo-tasks`、`demo-conversations`、`auth-me`、`workbench-conversations`、`workbench-messages`、`workbench-reports` 或 `workbench-demo-copy`。Tencent-24 使用 `quota_used = oldQuotaUsed` 的 CAS 条件更新和 `count = "exact"` 做原子扣减重试；当前仍未新增 MySQL transaction / 行锁。

`workbench-agent-run-stream` 线上验证建议：

```bash
curl -i https://<your-domain>/api/agent/run/stream
curl -N -i -X POST \
  -H "Authorization: Bearer <cloudbase-token>" \
  -H "Content-Type: application/json" \
  -d "{\"prompt\":\"分析本月教学质量数据，找出异常指标\",\"conversationId\":\"<conversation-id>\",\"clientRunId\":\"manual-langgraph-data-run\"}" \
  https://<your-domain>/api/agent/run/stream
curl -N -i -X POST \
  -H "Authorization: Bearer <cloudbase-token>" \
  -H "Content-Type: application/json" \
  -d "{\"prompt\":\"基于知识库回答教学质量评价口径\",\"conversationId\":\"<conversation-id>\",\"clientRunId\":\"manual-langgraph-rag-run\"}" \
  https://<your-domain>/api/agent/run/stream
```

未带 token 时应由 CloudBase 网关返回 `401 MISSING_CREDENTIALS`。带 token 但缺少或传入不属于当前用户的 `conversationId` 时应返回 `validation_error` 或 `not_found`。有效请求应以 SSE 格式输出 LangGraph runtime 映射后的 canonical events，并能在 `run_completed` 中看到 `runId`、`usageId` 和 `assistantMessageId`。数据分析问题应输出 `schema_inspect` / `aggregate_table` / `chart_render` tool completion、chart、conclusion 和 run completion 相关事件；知识类问题应输出 `knowledge_search` tool completion、可选 `rag_sources_ready`、conclusion 和 run completion 相关事件。模型未配置且受控工具成功时应返回 `conclusionSource = "fallback"` 和 `fallbackReason = "model_not_configured"`，不应返回 `data_tool_failed` 或 500。知识库未建表 / 查询失败 / 无数据 / 无命中时应分别返回 `rag_table_not_found`、`rag_query_failed`、`rag_empty`、`rag_no_match`。模型失败时 SSE 和 metadata 应包含 `provider`、`model`、`modelErrorType`、`modelHttpStatus`。LangSmith 未配置或上报失败时 metadata 应显式记录未上报 / 上报失败。随后读取 quota 应看到 `demo_user` 的 `quotaUsed` 增加，读取当前会话 messages 应能看到 assistant message，`agent_runs`、`run_events` 和 `tool_invocations` 应出现对应记录。使用相同 `clientRunId` 重复请求时应返回 `run_reused`，且 quota 不再增加、assistant message 不重复、run_events/tool_invocations 不重放；该断言依赖 `007_agent_runs_client_run_id.sql` 已先执行。该验证不应影响 `demo-tasks`、`demo-conversations`、`auth-me`、`workbench-conversations`、`workbench-messages`、`workbench-reports`、`workbench-demo-copy` 或 `workbench-quota`。

## 安全说明

- `demo-tasks` 和 `demo-conversations` 是公开只读接口，不读取 token，不做身份认证。
- `auth-me` 必须开启 CloudBase HTTP 路由身份认证；它会读取 Bearer token payload，并可能创建 `app_profiles`。
- `auth-me` 是正式 Auth helper 验证入口，不是旧 POC 函数。
- `workbench-conversations` 必须开启 CloudBase HTTP 路由身份认证；它只读取和创建 `conversations`，不写入 messages 或 reports。
- `workbench-messages` 必须开启 CloudBase HTTP 路由身份认证，路径透传关闭；它会先校验 conversation 归属，再读取或写入 `messages`，不写 reports、Agent Run、SSE 或 quota。
- `workbench-reports` 必须开启 CloudBase HTTP 路由身份认证，路径透传关闭；它会先校验 conversation 归属，再读取或写入 `report_artifacts`，不写 Agent Run、SSE 或 quota。
- `workbench-demo-copy` 必须开启 CloudBase HTTP 路由身份认证，路径透传关闭；它读取公开 demo 模板并写入当前用户私有 `conversations` / `messages`，不写 reports、Agent Run、SSE 或 quota。
- `workbench-quota` 必须开启 CloudBase HTTP 路由身份认证，路径透传关闭；它只写 `agent_run_quota` / `agent_run_usage`，当前不接 Agent Run 或 SSE。
- `workbench-runs` 必须开启 CloudBase HTTP 路由身份认证，路径透传关闭；它只读 `agent_runs` / `run_events` / `tool_invocations`，用于刷新页面或切换会话后的 Run Trace 恢复，不写 quota、messages 或 run 事件。
- `workbench-evaluations` 必须开启 CloudBase HTTP 路由身份认证，路径透传关闭；它读取和写入 `eval_results`，并通过 `_shared/langsmithObservability.js` 对齐 LangSmith feedback 语义，不让 LangSmith 外部 ID 替代 canonical `runId`。
- `workbench-agent-run-stream` 必须开启 CloudBase HTTP 路由身份认证，路径透传关闭；它复用 `_shared/auth.js`、`_shared/mysql.js`、`_shared/langchainModelLayer.js`、`_shared/langgraphRuntime.js` 与 `_shared/langsmithObservability.js` 执行 CloudBase Agent Run 流式链路。主链路进入 LangGraph runtime，Tool / Retriever / Model 进入 LangChain 边界；旧模型网关不再作为 Agent Run runtime 调用或 fallback 旁路。
- 通过 CloudBase Node SDK 写入 MySQL `JSON` 字段前必须 `JSON.stringify(...)`；读取后再安全解析，失败时回退到 `{}` 或 `[]`。
- 日志不要输出 token、密钥、数据库连接串或完整内部堆栈。
- 当前 CORS 先允许 `Access-Control-Allow-Origin: *`，后续正式接入域名后可收紧。
