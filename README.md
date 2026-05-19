# AI Agent Workbench / AI 应用工作台 Demo

AI Agent Workbench 是一个面向 AI 应用前端、Agent 工作台和 B 端数据分析场景的作品 Demo。

它不是普通聊天框，而是一个小规模但链路完整的 AI 应用样例：用户可以先体验公开示例，登录后进入真实 CloudBase 私有会话，触发服务端 Agent Run，查看工具执行、Run Trace、图表、报告和 RAG 来源，并在刷新页面后恢复会话、消息、Run Trace 和报告。

当前版本是阶段性 CloudBase 单轨演示版，不宣称生产可用。重点是展示一条完整、可回归、可讲清楚边界的腾讯云迁移主线。

当前主链路：

```txt
EdgeOne / Vite
  ↓
CloudBase Auth
  ↓
CloudBase HTTP Functions
  ↓
CloudBase MySQL
```

在线预览以当前 EdgeOne 部署地址为准。

---

## 项目简介

本项目用于展示一个小规模但逻辑完整的 AI Workbench：

```txt
用户输入
  ↓
会话 / 消息管理
  ↓
Mock 或真实 Agent 分流
  ↓
Planner + Tool Registry
  ↓
数据分析 / 图表 / 报告 / RAG 来源
  ↓
Run Trace 与持久化数据资产
```

当前主要面向教育数据分析场景，例如教学质量指标分析、月度对比、异常指标定位、简版报告生成、教学评价制度问答和公开示例任务。

---

## 当前核心能力

- CloudBase 用户名密码登录：正式登录、退出登录和 session 恢复都走 CloudBase Auth。
- 会话列表与消息持久化：`conversations` / `messages` 支持登录后读写和刷新恢复。
- 公开示例任务：未登录也可查看公开 demo，登录后可从示例任务进入私有会话。
- Demo copy：公开示例会话可复制为当前用户的 CloudBase private conversation。
- Agent Run SSE：真实 Agent 通过 `/api/agent/run/stream` 流式返回运行事件。
- Run Trace：`agent_runs` / `run_events` / `tool_invocations` 可恢复，刷新页面不重新触发 Agent Run。
- Quota：真实 Agent Run 有额度读取、consume、finish 和重复请求保护。
- Reports：报告 artifact 归属当前 CloudBase conversation，可保存、读取、刷新恢复和切换会话隔离。
- teaching_metrics 数据分析：`schema_inspect`、`aggregate_table`、`chart_render` 读取 CloudBase MySQL 演示数据。
- knowledge_qa / RAG：`knowledge_search` 从 CloudBase MySQL `knowledge_documents` / `knowledge_chunks` 检索知识片段。
- 明确 fallback 边界：`conclusionSource` 和 `fallbackReason` 会说明结果来自模型、结构化 fallback、模型未配置、模型拒绝或数据工具异常。
- 长会话 / 大文本性能保护：最近消息加载、长文本折叠、Markdown memo、大 JSON 按需展开。

---

## Mock 与真实 Agent 模式

### 公开演示模式

公开演示模式用于稳定展示产品流程：

- 不需要登录
- 不消耗 quota
- 不调用真实模型
- 不写真实私有数据
- 适合公开预览和基础流程演示
- 与真实 Agent 共用聊天区、Run Trace、图表、报告和来源展示结构

### 真实 Agent 模式

真实 Agent 模式使用 CloudBase 服务端受控链路：

- 需要 CloudBase Auth 身份
- 需要服务端校验 CloudBase access token
- 需要 `agent_run` quota
- 真实 Agent Run 开始后扣减 1 次额度
- 模型调用统一走 CloudBase `workbench-agent-run-stream` 和 `_shared/modelGateway.js`
- 前端只提交 `selectedModelId`，服务端通过 catalog 白名单映射到 SiliconFlow / Zhipu OpenAI-compatible API
- 模型 Key 只读取 CloudBase 函数环境变量中的 `SILICONFLOW_API_KEY` / `ZHIPU_API_KEY`
- 前端不接收、不保存、不传递模型调用密钥
- 服务端校验 conversation 属于当前用户
- 失败后不会自动静默 fallback 到 Mock

公开演示兜底必须由用户明确选择。`recommended_mode = agent` 的示例任务会提示用户选择“使用真实 Agent”或“使用公开演示模式”。

---

## 数据持久化能力

当前持久化范围：

```txt
conversations
messages
agent_runs
run_events
tool_invocations
report_artifacts
agent_run_usage
knowledge_documents
knowledge_chunks
```

这些数据分别用于：

- 会话和消息可刷新恢复。
- `agent_run_usage` 记录真实 Agent quota 使用和审计信息。
- `agent_runs` 保存一次真实 Agent 执行概览。
- `run_events` 保存 Run Trace 事件流。
- `tool_invocations` 保存工具调用记录，并作为最近工具统计来源。
- `report_artifacts` 将报告作为独立 artifact 保存。
- `knowledge_documents` / `knowledge_chunks` 提供 CloudBase RAG demo 知识源，检索结果随 `knowledge_search` 写入 `tool_invocations` 和 `run_events`。

`agent_run_usage` 不等同于完整 Run Trace，它只负责 quota / audit；完整执行过程由 `agent_runs`、`run_events` 和 `tool_invocations` 承担。

---

## RAG 最小闭环

当前 RAG 是最小可演示闭环，不是完整知识库后台。

已实现：

- 小规模教学评价知识库 seed 数据
- CloudBase MySQL `knowledge_documents` / `knowledge_chunks`
- `knowledge_search` 服务端受控工具
- 政策 / 制度 / 依据类问题走 `knowledge_qa`
- 回答中使用 `[S1]` / `[S2]` 引用真实检索结果
- 右侧来源面板展示真实检索来源
- 检索结果写入 `tool_invocations`，Run Trace 可通过 CloudBase runs 恢复
- Mock 来源和真实 RAG 来源在 UI 上明确区分

当前限制：

- 没有完整知识库管理后台
- 没有文档上传
- 没有完整 embedding pipeline
- 没有复杂向量库管理
- 第一版使用 CloudBase MySQL 小规模关键词检索，后续可升级为 embedding / hybrid search

---

## 长会话 / 大文本处理

当前已经加入基础前端性能保护：

- 登录用户消息首屏默认加载最近 30 条
- 支持“加载更早消息”
- 长 assistant / report 内容默认折叠
- Markdown 渲染 memo 化
- 大 JSON / Tool payload 默认摘要展示，点击后展开
- Run Trace 摘要优先，详情按需展开
- 报告长内容有阅读保护

超长上下文示例不是通过一次性塞超大 DOM 展示能力，而是通过分页、折叠、懒加载和摘要展示控制前端压力。

---

## 技术栈

- React
- Vite
- TypeScript
- Zustand
- EdgeOne Pages
- CloudBase Auth
- CloudBase HTTP Functions
- CloudBase MySQL
- 轻量 modelGateway / OpenAI-compatible provider
- ECharts
- react-markdown / remark-gfm
- Tailwind CSS
- shadcn/ui / Radix UI

Vercel / Supabase 只作为历史迁移来源记录，旧 `api/`、`src/server/`、`supabase/` 主体代码已经删除，不再是当前运行主线。

---

## 核心链路

```txt
EdgeOne / Vite 前端
  ↓
CloudBase Auth 用户名密码登录
  ↓
CloudBase private APIs
  ↓
CloudBase MySQL
```

真实 Agent 运行链路：

```txt
ChatInput / sendPrompt
  ↓
CloudBase conversation / messages
  ↓
/api/agent/run/stream
  ↓
服务端校验 token / conversation / quota
  ↓
Planner / Intent Router
  ↓
Tool Registry
  ↓
schema_inspect / aggregate_table / chart_render / knowledge_search
  ↓
SSE Run Events
  ↓
Run Trace / Tool Invocations / Chart / Report / RAG Sources
  ↓
conversation / messages / runs / tools / reports 持久化
```

真实 Agent 的数据访问必须经过服务端工具链。模型不能直接执行 SQL。

---

## 安全边界

当前项目遵守以下边界：

- 前端不保存模型调用密钥
- 前端不保存数据库连接串
- 前端不使用 service role
- 前端不直接连接数据库
- 真实 Agent API 由服务端保护
- 模型调用只使用 CloudBase 函数端 `SILICONFLOW_API_KEY` / `ZHIPU_API_KEY` 和 modelGateway catalog 白名单
- CloudBase access token 只用于 CloudBase private APIs
- Tool 调用由服务端受控执行
- 模型不能直接执行 SQL
- API 不返回 service role、模型调用密钥或数据库连接串
- Run payload / RAG logs / Report 不应写入 token、key、connection string
- Markdown 不启用原始 HTML
- 健康检查只返回配置状态和连接状态，不返回 secret

---

## 环境变量

本地 `.env.local` 示例：

```env
VITE_API_BASE_URL=
VITE_CLOUDBASE_ENV_ID=ai-agent-workbench-poc-d6731923d
VITE_CLOUDBASE_REGION=ap-shanghai
CLOUDBASE_PROXY_TARGET=https://ai-agent-workbench-poc-d6731923d-1317403720.ap-shanghai.app.tcloudbase.com
```

说明：

- `.env.local` 不提交。
- `VITE_` 开头的变量会进入浏览器，只能放前端公开变量。
- `VITE_API_BASE_URL` 本地留空，让 Vite dev server 代理相对路径 `/api`。
- 本地 CloudBase 开发推荐保持 `VITE_API_BASE_URL=` 为空，并用 `CLOUDBASE_PROXY_TARGET` 让 Vite dev server 代理 `/api`，避免 localhost CORS。
- `CLOUDBASE_PROXY_TARGET` 不是 `VITE_` 变量，只供本地 Vite dev server 读取，不会暴露给浏览器。
- CloudBase 控制台需要开启“用户名密码登录”；未开启时前端登录会提示开启该身份源。
- 正式登录弹窗只调用 CloudBase 用户名密码登录，不再调用 Supabase 密码登录。
- 公开 CloudBase API，例如 demo templates，可直接使用 `VITE_API_BASE_URL`，不需要 token。
- 私有 CloudBase API 默认使用 CloudBase Auth 产生的 `access_token`，不使用 Supabase token。
- conversations、messages、reports、demo-copy、quota 和 Agent Run stream 默认走 CloudBase private APIs。
- `VITE_ENABLE_CLOUDBASE_PRIVATE_API` 不再作为前端运行时开关，也不应配置到新环境。
- Vercel / Supabase legacy 主体代码已删除；当前仓库运行主线是 EdgeOne + CloudBase。
- Run persistence 已通过 CloudBase `workbench-runs` 恢复；主 Agent Run SSE、messages、reports 和 RAG 闭环均走 CloudBase。
- service role、模型 Key 和数据库连接串不能加 `VITE_`。

EdgeOne 生产环境推荐：

```env
VITE_API_BASE_URL=https://ai-agent-workbench-poc-d6731923d-1317403720.ap-shanghai.app.tcloudbase.com
VITE_CLOUDBASE_ENV_ID=ai-agent-workbench-poc-d6731923d
VITE_CLOUDBASE_REGION=ap-shanghai
```

CloudBase 函数环境变量：

所有使用 `tencent/functions/_shared/mysql.js` 的 CloudBase HTTP Function 都需要：

```env
CLOUDBASE_ENV_ID=ai-agent-workbench-poc-d6731923d
```

`workbench-agent-run-stream` 通过 `_shared/modelGateway.js` 调用国内 OpenAI-compatible provider。模型 Key 只放 CloudBase 函数环境变量，不放 EdgeOne / 前端：

```env
SILICONFLOW_API_KEY=
ZHIPU_API_KEY=

# 可选：覆盖默认 endpoint / model / timeout。
SILICONFLOW_BASE_URL=https://api.siliconflow.cn/v1
ZHIPU_BASE_URL=https://open.bigmodel.cn/api/paas/v4
SILICONFLOW_MODEL_QWEN=Qwen/Qwen2.5-7B-Instruct
SILICONFLOW_MODEL_GLM=THUDM/GLM-4-9B-0414
ZHIPU_MODEL_GLM_FLASH=glm-4-flash-250414
MODEL_GATEWAY_TIMEOUT_MS=30000
```

## CloudBase 默认链路状态

当前 CloudBase 单轨演示链路已覆盖：

- Public demo templates
- CloudBase Auth 用户名密码登录 / session 恢复
- Conversations / messages
- Reports / demo-copy / quota
- Agent Run SSE / fallback
- Agent Run 幂等保护与 quota 原子扣减
- teaching_metrics 数据分析工具
- modelGateway 轻量模型网关
- Agent Run 读取恢复 / Run Trace 恢复
- Workbench 生命周期闭环
- Report 闭环
- knowledge_qa / RAG knowledge_search
- 本地 Vite proxy

`authStore` 默认恢复 CloudBase 用户名密码登录 session；没有 session 时保持访客状态，公开演示仍可使用，私有会话和真实 Agent 需要登录。正式登录弹窗调用 CloudBase Auth，不再调用 Supabase `/auth/v1/token`。业务 private API 使用 CloudBase access token。Agent Run 运行走 `/api/agent/run/stream`，刷新页面或切换会话后的 Run Trace 恢复走 `/api/workbench/runs`。`VITE_ENABLE_CLOUDBASE_PRIVATE_API` 已退出正式前端运行分支；旧 Vercel / Supabase 主体代码已删除。匿名登录只保留给 `local-tools` 或明确 demo fallback，不作为正式页面登录主线。`local-tools/cloudbase-auth-test.html` 仅用于本地快速验证，不属于正式产品页面，也不应提交为正式能力。

当前模型主链路为：前端 `selectedModelId` -> CloudBase `workbench-agent-run-stream` -> `_shared/modelGateway.js` -> catalog 白名单 -> SiliconFlow / Zhipu OpenAI-compatible API -> `modelTrace` / `tokenUsage` / `latency` / `fallbackReason`。未配置模型 Key、模型不可用或 provider 返回错误时，真实 Agent 会通过明确 `fallbackReason` 完成 SSE、持久化、quota、Run Trace 恢复和报告闭环，不会伪装成真实模型输出。

旧链路主体删除后仍需要完成 EdgeOne Preview / Production 回归，确认无 CORS、无 health 404、无重复 POST、Agent Run 不重复写 assistant message、quota 只 consume 一次。

---

## 本地运行

安装依赖：

```bash
pnpm install
```

基础检查：

```bash
pnpm lint
pnpm build
```

前端开发模式：

```bash
pnpm dev
```

说明：

```txt
pnpm dev 适合查看前端基础页面和公开演示模式。
本地 CloudBase 联调用 Vite proxy 转发 `/api` 到 CloudBase HTTP Functions。
```

---

## CloudBase Migration

当前表结构和 seed 以 `tencent/migrations/`、`tencent/seeds/` 为准，并在 CloudBase MySQL 中执行。旧 `supabase/migrations/` 主体目录已删除，不再是启动或回归步骤。

CloudBase 单轨需要确认：

- `conversations` / `messages` 缺失：会话和消息无法持久化。
- demo templates 缺失：示例任务和示例会话无法从模板读取。
- run artifacts 缺失：Run Trace、工具调用和报告 artifact 无法恢复。
- RAG migration 缺失：CloudBase `knowledge_search` 无法读取 `knowledge_documents` / `knowledge_chunks`。
- quota 表结构或幂等约束缺失：真实 Agent quota 扣减、usage 结束状态和重复请求保护无法正常工作。

---

## 推荐演示路径

```txt
1. 未登录打开项目，查看公开示例任务
2. 登录 CloudBase 用户
3. 查看会话列表和真实 Agent quota
4. 从示例任务触发真实 Agent
5. 查看 SSE 流式输出和 Run Trace
6. 查看 schema_inspect / aggregate_table / chart_render 工具调用
7. 查看图表和 assistant 结论
8. 保存报告
9. 刷新页面，恢复会话、消息、Run Trace 和报告
10. 切换会话，确认 reports / messages / runs 不串会话
11. 运行 RAG 示例：解释 warning_count 是什么
12. 展示 knowledge_search 来源和 [S1] / [S2] 引用
```

建议部署或投递前做一次浏览器 smoke test，确认 CloudBase migrations / seeds 已执行、真实 Agent quota 可用、RAG seed 数据存在。

---

## 当前能力边界

当前项目是阶段性 CloudBase 单轨演示版，不是完整生产系统。

当前没有：

- 完整 Admin UI
- 完整多租户 Workspace
- 完整知识库管理后台
- 文档上传
- 完整 embedding pipeline
- pgvector / hybrid search 高级检索
- 完整模型网关后台
- Token / Cost / Latency 统计面板
- 完整监控告警
- 完整 Run History 搜索
- PDF 导出
- Three.js Agent Flow
- 部署自动化 / migration 自动化 / smoke test 自动化

---

## 后续规划

- 国内模型 Provider / OpenAI-compatible 接入
- CloudBase 部署自动化 / migration 自动化 / smoke test 自动化
- Planner 正规化 / Intent Router 收口
- 代码结构优化 / 大文件拆分
- 面试讲法和演示文档收口
- Admin UI / quota 重置任务 / Run History 搜索
- 文档上传、知识库管理和 hybrid search
- Token / Cost / Latency 面板与更完整的观测监控

---

## 构建说明

生产构建：

```bash
pnpm build
```

当前可能出现 Vite chunk size warning，主要来自 ECharts、Markdown 和业务代码体积；对当前 Demo 演示不构成阻塞。
