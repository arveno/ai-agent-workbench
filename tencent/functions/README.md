# CloudBase HTTP Functions

本目录保存腾讯云迁移阶段的 CloudBase HTTP Function 草案。当前包含低风险 demo templates 只读接口、Tencent-09A 的正式 CloudBase Auth helper 验证入口、Tencent-10C/Tencent-13 的 conversations / messages / reports / demo-copy / quota 基础闭环验证函数，以及 Tencent-14 的 Agent Run 基础闭环。Tencent-14 只使用固定 mock 流程验证 CloudBase 版 Agent Run 的 Auth、会话归属、quota、SSE、`agent_runs`、`run_events`、`tool_invocations` 和 assistant message 写入，不接真实 Groq、planner 或 tools；现阶段不替换前端 Auth store。

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
| `workbench-agent-run-stream` | `/api/agent/run/stream` | 开启 | 固定 Agent Run 基础闭环，验证 Auth、会话归属、quota、SSE、run/events、mock tool 和 assistant message 写入。 |

## 共享 helper

| 目录 | 用途 |
| --- | --- |
| `_shared/mysql.js` | 初始化 `@cloudbase/node-sdk`、返回 `app.rdb()`，提供 MySQL 结果和 JSON 字段兜底处理。 |
| `_shared/auth.js` | 解析 CloudBase token / Bearer token payload，获取 `_openid` / `user_id`，查询或创建 `app_profiles`，并返回统一 `currentUser`。 |

后续私有 CloudBase HTTP Function 应复用已验证的 `_shared/auth.js` 获取 `currentUser`，再对私有表显式追加 `_openid` 与 `user_id` 过滤。`workbench-conversations`、`workbench-messages`、`workbench-reports`、`workbench-demo-copy`、`workbench-quota` 和 `workbench-agent-run-stream` 已按该方式实现基础验证；当前不替换前端 `authStore`。

不迁移：

```txt
/api/workbench/demo-conversations/:id/copy
/api/workbench/conversations/:id PATCH
/api/workbench/runs/:id/report
```

CloudBase HTTP 访问服务不支持 `/api/workbench/demo-conversations/:id/copy` 这种动态路径，Tencent-12 改用固定 `/api/workbench/demo-copy` 路由。当前只迁移 conversations 列表 / 创建、messages 读取 / 写入、reports 列表 / 单条读取 / 保存、demo-copy、quota 基础闭环和固定 Agent Run 基础闭环；PATCH、archive、真实 Groq、真实 planner/tools、报告生成入口和 quota 并发事务后续再迁。

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
Copy-Item _shared/mysql.js,_shared/auth.js -Destination (Join-Path $stage '_shared')
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

`workbench-agent-run-stream` 依赖 `_shared`。它使用固定路由 `/api/agent/run/stream`，路径透传关闭；`POST` 从 JSON body 读取 `conversationId`，复用 `_shared/auth.js` 获取 `currentUser`，校验会话归属后执行固定 Agent Run 基础闭环：consume quota、创建 `agent_runs`、写入 `run_events`、写入 mock `tool_invocations`、写入 assistant message，并 finish usage。它不调用真实 Groq、planner 或 tools。打包说明使用 Git Bash：

```bash
cd tencent/functions
stage="$HOME/Desktop/cloudbase-workbench-agent-run-stream-package"
rm -rf "$stage"
mkdir -p "$stage/_shared"
cp workbench-agent-run-stream/index.js workbench-agent-run-stream/package.json workbench-agent-run-stream/scf_bootstrap workbench-agent-run-stream/README.md "$stage/"
cp _shared/mysql.js _shared/auth.js "$stage/_shared/"
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

`workbench-conversations`、`workbench-messages`、`workbench-reports`、`workbench-demo-copy`、`workbench-quota` 和 `workbench-agent-run-stream` 的 zip 根目录都应包含：

```txt
_shared/
index.js
package.json
README.md
scf_bootstrap
```

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

成功响应格式应与现有 Vercel API 兼容：

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
curl -i -X POST -H "Authorization: Bearer <cloudbase-token>" -H "Content-Type: application/json" -d "{\"action\":\"consume\",\"runId\":\"manual-test\",\"metadata\":{\"source\":\"curl\"}}" https://<your-domain>/api/workbench/quota
curl -i -X POST -H "Authorization: Bearer <cloudbase-token>" -H "Content-Type: application/json" -d "{\"action\":\"finish\",\"usageId\":\"<usage-id>\",\"status\":\"completed\",\"metadata\":{\"source\":\"curl\"}}" https://<your-domain>/api/workbench/quota
curl -i -H "Authorization: Bearer <cloudbase-token>" https://<your-domain>/api/workbench/quota
```

未带 token 时应由 CloudBase 网关返回 `401 MISSING_CREDENTIALS`。读取额度应返回 `ok: true` 和 `quota`；`POST` 缺少或传入非法 `action` 应返回 `validation_error`；`action = "consume"` 应返回 `usageId` 和更新后的 `quota`；`action = "finish"` 应返回更新后的 `usage`；再次读取额度时，`demo_user` 的 `quotaUsed` 应变化。该验证不应影响 `demo-tasks`、`demo-conversations`、`auth-me`、`workbench-conversations`、`workbench-messages`、`workbench-reports` 或 `workbench-demo-copy`。Tencent-13 暂未使用 MySQL transaction + 行锁，接入真实 Agent Run 前必须补事务化。

`workbench-agent-run-stream` 线上验证建议：

```bash
curl -i https://<your-domain>/api/agent/run/stream
curl -N -i -X POST \
  -H "Authorization: Bearer <cloudbase-token>" \
  -H "Content-Type: application/json" \
  -d "{\"prompt\":\"测试提示词\",\"conversationId\":\"<conversation-id>\",\"clientRunId\":\"manual-basic-run\"}" \
  https://<your-domain>/api/agent/run/stream
```

未带 token 时应由 CloudBase 网关返回 `401 MISSING_CREDENTIALS`。带 token 但缺少或传入不属于当前用户的 `conversationId` 时应返回 `validation_error` 或 `not_found`。带 token 且会话归属正确时，`POST` 应以 SSE 格式依次输出 `run_started`、`step_started`、`tool_started`、`tool_completed`、`conclusion_delta`、`conclusion_completed` 和 `run_completed`，并能在 `run_completed` 中看到 `runId`、`usageId` 和 `assistantMessageId`。随后读取 quota 应看到 `demo_user` 的 `quotaUsed` 增加，读取当前会话 messages 应能看到 assistant message，`agent_runs`、`run_events` 和 `tool_invocations` 应出现对应记录。该验证不接真实 Groq、planner 或 tools，不应影响 `demo-tasks`、`demo-conversations`、`auth-me`、`workbench-conversations`、`workbench-messages`、`workbench-reports`、`workbench-demo-copy` 或 `workbench-quota`。

## 安全说明

- `demo-tasks` 和 `demo-conversations` 是公开只读接口，不读取 token，不做身份认证。
- `auth-me` 必须开启 CloudBase HTTP 路由身份认证；它会读取 Bearer token payload，并可能创建 `app_profiles`。
- `auth-me` 是正式 Auth helper 验证入口，不是旧 POC 函数，当前暂不改前端 Auth store。
- `workbench-conversations` 必须开启 CloudBase HTTP 路由身份认证；它只读取和创建 `conversations`，不写入 messages 或 reports。
- `workbench-messages` 必须开启 CloudBase HTTP 路由身份认证，路径透传关闭；它会先校验 conversation 归属，再读取或写入 `messages`，不写 reports、Agent Run、SSE 或 quota。
- `workbench-reports` 必须开启 CloudBase HTTP 路由身份认证，路径透传关闭；它会先校验 conversation 归属，再读取或写入 `report_artifacts`，不写 Agent Run、SSE 或 quota。
- `workbench-demo-copy` 必须开启 CloudBase HTTP 路由身份认证，路径透传关闭；它读取公开 demo 模板并写入当前用户私有 `conversations` / `messages`，不写 reports、Agent Run、SSE 或 quota。
- `workbench-quota` 必须开启 CloudBase HTTP 路由身份认证，路径透传关闭；它只写 `agent_run_quota` / `agent_run_usage`，当前不接 Agent Run 或 SSE。
- `workbench-agent-run-stream` 必须开启 CloudBase HTTP 路由身份认证，路径透传关闭；它复用 `_shared/auth.js` 与 `_shared/mysql.js` 验证固定 Agent Run 基础闭环，但不接真实 Groq、planner、tools 或前端正式调用。
- 通过 CloudBase Node SDK 写入 MySQL `JSON` 字段前必须 `JSON.stringify(...)`；读取后再安全解析，失败时回退到 `{}` 或 `[]`。
- 日志不要输出 token、密钥、数据库连接串或完整内部堆栈。
- 当前 CORS 先允许 `Access-Control-Allow-Origin: *`，后续正式接入域名后可收紧。
