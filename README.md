# AI Agent Workbench / AI 应用工作台

AI Agent Workbench 是一个面向教育数据分析场景的 AI 应用工作台 Demo。

它不是普通聊天框，而是一个包含会话管理、真实 Agent 调用、工具执行可视化、Run Trace、报告生成、RAG 来源展示和权限 / quota 控制的 AI 应用前端样例。项目重点展示 AI 应用从公开演示到登录后的真实 Agent 执行、从消息到工具调用和报告产物的完整闭环。

在线预览：

```txt
https://ai-agent-workbench.vercel.app
```

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

当前主要面向教育数据分析场景，例如教学质量指标分析、月度对比、异常指标定位、简版报告生成、教学评价制度问答和公开演示任务。

---

## 当前核心能力

- 公开演示模式 / Mock：匿名用户可直接体验完整工作台流程。
- Supabase Auth：支持登录、退出和 session 恢复。
- AgentAccessView / role / quota：展示用户角色和真实 Agent Run 额度。
- 真实 Agent 服务端保护：`/api/agent/run/stream` 由服务端鉴权、校验 conversation 归属并扣减 quota。
- 会话与消息持久化：`conversations` / `messages` 支持刷新恢复。
- Demo Templates：示例任务和示例会话模板与用户真实会话隔离。
- Run / Tool / Report 持久化：真实 Agent Run、事件、工具调用和报告 artifact 可恢复。
- 最近使用工具真实化：从真实 `tool_invocations` 聚合展示。
- RAG 最小闭环：通过 `rag_search` 检索示例知识库，回答可带 `[S1]` / `[S2]` 引用。
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

真实 Agent 模式使用服务端受控链路：

- 需要 Supabase Auth 登录
- 需要服务端校验 Supabase access token
- 需要 `agent_run` quota
- 真实 Agent Run 开始后扣减 1 次额度
- 模型调用统一走服务端 `GROQ_API_KEY`
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
rag_retrieval_logs
```

这些数据分别用于：

- 会话和消息可刷新恢复。
- `agent_run_usage` 记录真实 Agent quota 使用和审计信息。
- `agent_runs` 保存一次真实 Agent 执行概览。
- `run_events` 保存 Run Trace 事件流。
- `tool_invocations` 保存工具调用记录，并作为最近工具统计来源。
- `report_artifacts` 将报告作为独立 artifact 保存。
- `rag_retrieval_logs` 记录 RAG 检索结果，用于恢复右侧来源展示。

`agent_run_usage` 不等同于完整 Run Trace，它只负责 quota / audit；完整执行过程由 `agent_runs`、`run_events` 和 `tool_invocations` 承担。

---

## RAG 最小闭环

当前 RAG 是最小可演示闭环，不是完整知识库后台。

已实现：

- 小规模教学评价知识库 seed 数据
- `knowledge_sources` / `knowledge_documents` / `knowledge_chunks`
- `rag_search` 服务端工具
- 政策 / 制度 / 依据类问题走 `knowledge_qa`
- 回答中使用 `[S1]` / `[S2]` 引用真实检索结果
- 右侧来源面板展示真实检索来源
- 检索日志写入 `rag_retrieval_logs`
- Mock 来源和真实 RAG 来源在 UI 上明确区分

当前限制：

- 没有完整知识库管理后台
- 没有文档上传
- 没有完整 embedding pipeline
- 没有复杂向量库管理
- 第一版使用小规模 PostgreSQL 关键词检索，后续可升级为 pgvector / hybrid search

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
- Supabase Auth
- Supabase / PostgreSQL
- Vercel Serverless Functions
- Groq
- ECharts
- react-markdown / remark-gfm
- Tailwind CSS
- shadcn/ui / Radix UI

---

## 核心链路

```txt
用户输入
  ↓
ChatInput / sendPrompt
  ↓
Mock 或真实 Agent 分流
  ↓
真实 Agent：/api/agent/run/stream
  ↓
服务端校验 token / conversation / quota
  ↓
Planner
  ↓
Tool Registry
  ↓
schema_inspect / aggregate_table / query_table / chart_render / rag_search
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
- 模型调用只使用服务端 `GROQ_API_KEY`
- Supabase service role 只用于服务端 API
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
# Frontend public env
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=

# Server-only env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
GROQ_API_KEY=
SUPABASE_DB_CONNECTION_STRING=
POSTGRES_CONNECTION_STRING=
```

说明：

- `.env.local` 不提交。
- `VITE_` 开头的变量会进入浏览器，只能放前端公开变量。
- service role、`GROQ_API_KEY` 和数据库连接串不能加 `VITE_`。
- Vercel 线上需要在 Environment Variables 中配置这些变量。
- 修改 Vercel 环境变量后需要重新部署。

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

完整 Serverless 本地模式：

```bash
pnpm exec vercel dev
```

说明：

```txt
pnpm dev 适合查看前端基础页面和公开演示模式。
pnpm exec vercel dev 适合完整测试 Serverless API、Auth、真实 Agent、quota、持久化和 RAG。
```

---

## Supabase 初始化 / Migration

项目依赖多份 Supabase SQL migration，需要按顺序执行：

```txt
1. auth / quota 基础结构
2. agent_run quota RPC
3. conversations / messages
4. demo templates
5. run artifacts
6. RAG minimal
```

对应文件位于：

```txt
supabase/migrations/
```

如果没有执行对应 migration，相关能力会不可用：

- `conversations` / `messages` 缺失：会话和消息无法持久化。
- demo templates 缺失：示例任务和示例会话无法从模板读取。
- run artifacts 缺失：Run Trace、工具调用和报告 artifact 无法恢复。
- RAG migration 缺失：`rag_search` 无法读取知识切片或写入 retrieval logs。
- quota RPC 缺失：真实 Agent quota 扣减和 usage 结束状态无法正常工作。

---

## 推荐演示路径

```txt
1. 打开项目，先展示匿名公开演示模式
2. 点击“你能做什么？”
3. 展示 Chat / Run Trace / 右侧面板
4. 登录 Demo 用户
5. 展示左下角 role / Agent Run 额度
6. 新建或恢复真实会话
7. 运行真实 Agent 数据分析示例
8. 展示 quota 扣减、Run Trace、图表和报告
9. 展示报告 artifact / 刷新恢复
10. 展示最近使用工具
11. 运行 RAG 示例，展示 [S1] / [S2] 引用和右侧来源
12. 展示长文本折叠 / 加载更早消息 / 大 JSON 展开
```

建议部署或投递前做一次浏览器 smoke test，确认 Supabase migrations 已执行、真实 Agent quota 可用、RAG seed 数据存在。

---

## 当前能力边界

当前项目是阶段性 Demo，不是完整生产系统。

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

---

## 后续规划

- Admin UI
- quota 重置任务
- Run History 搜索
- 模型网关配置后台
- Token / Cost / Latency 面板
- 文档上传与知识库管理
- pgvector / hybrid search
- 更完整的观测与监控
- Three.js Agent Flow

---

## 构建说明

生产构建：

```bash
pnpm build
```

当前可能出现 Vite chunk size warning，主要来自 ECharts、Markdown 和业务代码体积；对当前 Demo 演示不构成阻塞。
