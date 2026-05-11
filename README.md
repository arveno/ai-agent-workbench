# AI Agent Workbench / AI 应用工作台

AI Agent Workbench 是一个面向 B 端教育数据分析场景的 AI 应用工作台 Demo。

它不是普通聊天框，而是围绕 Agent Planner、真实数据源、服务端受控工具、Run Trace、流式输出、Conversation Timeline、报告确认、Prompt 配置、Model Gateway、RAG Source UI、登录身份和真实 Agent 使用额度构建的 AI Workbench。

项目重点展示 AI 应用前端在复杂工作台布局、会话时间线、工具调用、流式输出、状态治理、受控数据访问、登录态、服务端鉴权和可观测 Run Trace 等方面的工程能力。

---

## 在线预览

https://ai-agent-workbench.vercel.app

---

## 项目定位

本项目定位为：

```txt
AI Agent Workbench / AI 应用工作台
```

面向场景：

```txt
B 端教育数据分析
```

核心目标不是做一个普通 AI 聊天机器人，而是做一个小而完整的 AI Workbench 闭环：

```txt
用户输入问题
  ↓
Agent Planner 判断任务类型
  ↓
真实数据源 + 服务端受控工具链
  ↓
模型流式生成结论或 fallback 本地摘要
  ↓
Conversation Timeline 展示消息、工具摘要、结论和报告确认
  ↓
右侧 Inspector 展示完整 Run Trace
  ↓
用户确认是否生成简版报告
```

当前体验分为两层：

```txt
公开演示模式：所有访问者可直接使用，基于 Mock RunEvent 稳定展示完整 Workbench 流程。
真实 Agent 模式：登录后使用，经过服务端鉴权和 agent_run quota 校验后，调用服务端受控模型与数据工具链。
```

---

## 当前核心能力

- Sidebar + Workspace 工作台布局
- Tailwind CSS + shadcn/ui + Radix UI 统一 UI 体系
- 公开演示 / Mock 模式
- 登录后真实 Agent 模式
- Supabase Auth 登录 / 退出 / session 恢复
- 左下角用户卡片登录状态展示
- profiles / role / quota 基础结构
- AgentAccessView 权限与额度视图
- demo_user / admin 角色基础区分
- `agent_run` quota 展示与扣减
- `agent_run_usage` 使用记录
- 真实 Agent 前端入口权限提示
- 服务端保护 `/api/agent/run/stream`
- 统一 Run 状态模型
- Session / Message / Run 会话时间线模型
- ChatBlock Conversation Timeline Renderer
- Agent Run SSE 流式事件
- ChatGPT 类发送 / 停止体验
- 聊天消息复制成功反馈
- 多轮报告确认基于 `runId`
- Run Trace 右侧观察面板
- Supabase / PostgreSQL 数据源连接
- 数据源连接测试
- Schema 读取
- 服务端 Tool Registry
- Agent Planner
- 时间范围、指标、维度约束
- 图表数据结构统一
- ECharts 图表展示
- 工具调用 formatter
- RAG Source / Citation UI
- Prompt 配置中心
- Model Gateway
- 模型配置状态 ViewModel
- 环境健康检查
- 前端用户自填模型密钥链路已移除
- 模型密钥只存在服务端环境变量
- 旧兼容链路清理

---

## 工作台布局

当前页面采用 Sidebar + Workspace 信息架构。

```txt
App Shell
├─ Sidebar
└─ Workspace
   ├─ Workspace Header
   ├─ Workspace Main
   └─ Workspace Inspector
```

### Sidebar

左侧 Sidebar 负责全局导航：

- 会话导航
- 示例任务
- 用户入口
- 登录状态
- 角色与真实 Agent Run 额度展示

### Workspace Header

Workspace Header 是当前会话的上下文控制区：

- 当前会话标题
- Run 状态摘要
- 环境健康状态
- 模型配置入口
- 数据源配置入口
- 工具库入口
- 工作流 / Prompt 配置入口

模型 / 数据源 / 工具库 / 工作流是当前 Workspace 的上下文配置入口，而不是独立全局页面。登录入口统一收敛在左下角用户卡片中。

### Workspace Main

Workspace Main 是当前会话主工作区：

- Conversation Timeline
- 用户消息
- Assistant 回复
- 工具调用摘要
- 流式生成状态
- 报告确认
- Markdown 报告消息
- 输入框

### Workspace Inspector

Workspace Inspector 是右侧 Run Trace 面板：

- Run 概览
- 执行时间线
- 当前数据源
- 工具调用
- 检索来源
- 数据分析结果
- 当前结论

---

## Conversation Timeline

当前 ChatPanel 已从普通 messages renderer 升级为 Conversation Timeline Renderer。

数据结构：

```txt
Session
├─ messages[]
├─ runsById
└─ latestRunId
```

渲染链路：

```txt
session.messages
+ session.runsById
+ currentRun
→ buildChatBlocks()
→ ChatPanel
```

支持的 ChatBlock：

```txt
user / assistant message
tool_summary
streaming_assistant
report_confirm
run_error
run_stopped
report message
```

每轮 Agent Run 都通过 `runId` 与 user message、assistant message、工具摘要和报告确认绑定，支持多轮、刷新、切换会话后的恢复。

当前会话时间线模型的关键字段：

```txt
WorkbenchSession.messages
WorkbenchSession.runsById
WorkbenchSession.latestRunId
WorkbenchMessage.runId
WorkbenchMessage.kind
RunSnapshot.reportState
```

---

## Agent Run 主流程

Agent 模式下，前端使用 `fetch + ReadableStream` 消费 POST SSE，不使用 EventSource。

```txt
用户输入
  ↓
创建 runId
  ↓
写入 user message
  ↓
携带 Supabase access_token 请求 /api/agent/run/stream
  ↓
服务端校验登录态、角色和 agent_run quota
  ↓
服务端扣减 quota 并写入 usage started
  ↓
后端持续输出 RunEvent
  ↓
前端 applyRunEvent
  ↓
currentRun 同步到 session.runsById
  ↓
buildChatBlocks 生成 Conversation Timeline
  ↓
右侧 Run Trace 同步展示
  ↓
Run 结束后刷新 AgentAccessView 额度
  ↓
报告确认基于 runId 独立操作
```

Agent Run 分为三类任务。

### capability_intro

用户询问系统能力或使用方式，例如：

```txt
你能做什么？
怎么用？
有什么功能？
```

执行逻辑：

```txt
不访问数据库
不调用数据分析工具
返回能力说明
右侧展示说明类 Run 和空态卡片
```

### data_analysis

用户要求分析教学质量、成绩、出勤率、作业完成率、异常指标、趋势或对比，例如：

```txt
分析 2026 年 5 月教学质量数据，找出异常指标
```

执行逻辑：

```txt
Planner 识别时间范围、指标、维度
  ↓
schema_inspect 读取 schema
  ↓
aggregate_table / query_table 执行受控查询或聚合
  ↓
chart_render 生成图表数据
  ↓
Model Gateway 调用服务端模型生成结论
  ↓
如果模型不可用，使用 fallback 本地摘要
```

### unsupported

用户输入超出当前工作台范围的问题，例如：

```txt
帮我写一首诗
```

执行逻辑：

```txt
不访问数据库
不调用数据分析工具
返回暂不支持说明
```

---

## Mock 与真实 Agent 模式

### 公开演示模式 / Mock

公开演示模式用于稳定展示产品流程：

- 不需要登录
- 不需要模型密钥
- 不需要数据库配置
- 使用本地模拟 RunEvent
- 写入统一 `currentRun`
- 同步到 `session.runsById`
- 共享真实 Agent 的 Timeline / Run Trace / Chart / Report 展示结构
- 右侧 Run Trace、工具调用、图表、RAG 来源和报告确认都可展示
- 适合公开预览和面试演示基础流程

### 真实 Agent 模式

真实 Agent 模式使用服务端受控链路：

- 需要 Supabase Auth 登录
- 需要服务端校验 access token
- 需要用户具备真实 Agent 使用权限
- 受 `agent_run` quota 控制
- 请求进入 `/api/agent/run/stream` 前由服务端校验权限
- 服务端开始执行真实 Agent Run 后扣减一次 quota
- 通过 fetch + ReadableStream 消费 SSE
- 每个 RunEvent 更新 `currentRun`
- `currentRun` 持久化到当前 Session
- 支持流式结论输出
- 支持停止 / 中断
- 支持右侧 Run Trace 逐步更新
- 模型调用统一走服务端 `GROQ_API_KEY`
- 前端不接收、不保存、不传递模型密钥

两种模式共享同一套 Run / ChatBlock / Run Trace 展示结构。

---

## Auth / Quota 设计

当前真实 Agent 访问分为三层：

```txt
anonymous：只能使用公开演示模式
demo_user：登录后可使用有限次数真实 Agent Run
admin：管理员账号，可配置为不限或高额度
```

真实 Agent 权限判断不绑定具体模型供应商，而是判断：

```txt
是否登录
是否有真实 Agent 使用权限
agent_run quota 是否足够
服务端环境是否可用
```

Quota 粒度：

```txt
agent_run
```

不按 message、chat 或模型供应商调用次数统计。

核心表：

```txt
profiles
agent_run_quota
agent_run_usage
```

真实 Agent Run 开始时扣减一次 quota；即使后续模型失败或用户中途停止，也算作一次真实 Agent Run。Mock / 公开演示模式不消耗 quota。

---

## Run Trace

右侧 Workspace Inspector 展示当前 Run 的可观测过程：

- Run 概览
- 执行时间线
- 当前数据源
- 工具调用
- 检索来源
- 数据分析结果
- 当前结论

Run Trace 基于 `currentRun` 展示。`currentRun` 会从当前会话的 `latestRunId` 恢复，因此刷新页面或切换会话后可以恢复最新 Run 的右侧状态。

---

## 数据源能力

当前 Demo 使用 Supabase 托管 PostgreSQL 作为真实数据源，同时保留通用 PostgreSQL 接入能力展示。

支持 API：

```txt
POST /api/datasources/test
POST /api/datasources/schema
```

数据源状态：

```txt
Supabase：当前演示数据源
PostgreSQL：通用接入展示
MySQL：规划中
```

数据源配置面板展示连接方式、连接状态、Schema 状态、表数量、更新时间和服务端环境变量说明。

---

## 工具调用能力

当前工具体系：

```txt
schema_inspect：读取数据库结构
query_table：受控数据查询
aggregate_table：受控聚合分析
chart_render：图表数据生成
knowledge_search：RAG 来源模拟展示
report_generate：前端 Markdown 报告生成
```

模型不能直接执行 SQL，所有数据访问必须经过服务端 Tool Registry。

工具库配置面板已对齐当前真实 / 模拟工具体系，展示：

- 工具状态
- 执行位置
- 风险等级
- 输入摘要
- 输出摘要
- 是否进入 Run Trace

---

## 报告确认与报告生成

报告确认不再依赖全局 `currentRun`，而是绑定具体 `runId`。

多轮 data_analysis 中，每一轮的“生成报告 / 暂不生成”都是独立操作：

- 点击某一轮生成报告，只生成该 Run 的报告
- 报告消息插入到对应 assistant message 后
- 只更新该 Run 的 `reportState`
- 不影响其他 Run 的报告确认
- 同一个 Run 防重复生成报告

前端通过 `generateReportForRun(runId)` 和 `skipReportForRun(runId)` 操作指定 Run，不再默认操作全局 `currentRun`。

当前报告由前端基于 run snapshot 生成 Markdown，暂未接入后端报告生成 API。

---

## Prompt 配置中心

Prompt 配置中心位于工作流弹窗中。

当前支持：

```txt
Planner Prompt
Analysis Prompt
Report Prompt
Fallback Summary Prompt
```

功能：

- 查看默认模板
- 编辑模板
- 保存当前浏览器本地配置
- 恢复当前默认
- 恢复全部默认

当前 Prompt 模板只做前端配置展示，暂未接入后端执行 prompt。

---

## Model Gateway

服务端已抽象 Model Gateway。

当前状态：

```txt
Groq provider 已实现
OpenAI / OpenRouter / Gemini / Ollama 为 adapter stub
```

Agent Run 和 Agent Stream 的模型结论生成已收敛到 Model Gateway。没有服务端 Groq 配置或调用失败时，业务层仍会回退到 fallback 本地摘要。

---

## RAG Source / Citation UI

当前已具备 RAG Source / Citation 的前端展示结构。

当前状态：

```txt
Mock 模式展示模拟来源
Agent 模式无真实 sources 时显示空态
暂未接入真实向量库
```

展示字段包括：

- citation label
- document title
- content preview
- relevance score
- source type
- used in answer

---

## 环境健康检查

项目提供环境健康检查接口：

```txt
GET /api/health
```

检查内容：

```txt
Groq 是否配置
Supabase 是否配置 / 可连接
PostgreSQL 是否配置 / 可连接
当前运行环境
```

健康检查只返回配置状态和连接状态，不返回任何密钥或连接串。

---

## 技术栈

- React
- TypeScript
- Vite
- Zustand
- Tailwind CSS
- shadcn/ui
- Radix UI
- ECharts
- react-markdown
- remark-gfm
- Supabase Auth
- Supabase PostgreSQL
- Vercel Serverless Function
- Groq OpenAI-compatible API
- PostgreSQL / Supabase

---

## 项目结构

```txt
api/
  agent/
    run.ts
    run/
      stream.ts
  auth/
    agent-access.ts
  datasources/
  health.ts
  chat.ts

src/
  components/
    analytics/
    auth/
    chat/
    common/
    datasource/
    layout/
    model/
    tools/
    ui/
    workflow/

  server/
    agent/
    auth/
    datasources/
    models/
      providers/
    tools/

  services/
  stores/
    slices/
  styles/
  types/
  utils/

supabase/
  migrations/
```

---

## 本地运行

安装依赖：

```bash
pnpm install
```

前端开发模式：

```bash
pnpm dev
```

Vercel 本地 Serverless 模式：

```bash
pnpm exec vercel dev
```

说明：

```txt
pnpm dev 适合查看前端公开演示模式。
pnpm exec vercel dev 适合测试 Serverless API、Supabase Auth、Agent Run、quota 扣减、数据源连接和环境健康检查。
```

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

- `.env.local` 不应提交
- `VITE_` 开头的变量会进入浏览器，只能放前端公开变量
- `SUPABASE_SERVICE_ROLE_KEY` 不能加 `VITE_`
- `GROQ_API_KEY` 不能加 `VITE_`
- 数据库连接串不能加 `VITE_`
- 前端公开变量用于 Supabase Auth 初始化
- 服务端私密变量只用于 Vercel Serverless Function 或本地 Serverless 调试
- 线上需要在 Vercel Project Settings → Environment Variables 中配置
- 修改 Vercel 环境变量后需要重新部署

---

## Vercel 部署说明

项目可部署在 Vercel。

```txt
Serverless API 位于 api/ 目录。
生产环境需要在 Vercel 中配置前端公开变量和服务端私密变量。
```

建议部署后先检查：

```txt
/api/health
```

真实 Agent 是否可用取决于以下配置是否完成：

- Supabase Auth 前端公开变量
- Supabase Service Role 服务端变量
- Supabase quota RPC migration
- Groq 服务端模型变量
- Supabase / PostgreSQL 数据库连接串
- demo_user / admin 的 profile 与 quota 数据

Production / Preview 环境变量修改后，需要重新部署。

---

## 安全边界

当前项目遵守以下边界：

- 前端不保存数据库连接串
- 前端不直接连接数据库
- 前端不接收、不保存、不传递模型密钥
- 模型密钥只存在服务端环境变量，例如 `GROQ_API_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` 只用于服务端
- `SUPABASE_DB_CONNECTION_STRING` / `POSTGRES_CONNECTION_STRING` 只用于服务端
- 真实 Agent API 必须经过服务端鉴权和 quota 校验
- 真实 Agent Run 开始后扣减 `agent_run` quota
- Mock / 公开演示模式不消耗真实模型和数据库资源
- 模型不能直接执行 SQL
- 数据访问必须经过服务端 Tool Registry
- 表、字段、指标和 limit 由服务端工具控制
- API 不返回密钥、数据库连接串、service role 等敏感信息
- Markdown 不启用原始 HTML
- 健康检查不返回 secret

---

## 当前能力边界

当前已经具备基础登录、角色和 quota 结构，但仍不是完整生产级权限系统。

当前没有实现：

- 完整 Admin UI
- quota 重置任务
- 完整多租户隔离
- 后端持久化 Session / Message / Run History
- 完整 RAG 后端和向量库
- 完整模型网关管理后台
- Token / Cost / Latency 统计面板
- 完整监控、告警和日志聚合
- 企业级数据权限与审计系统
- Three.js 3D Agent Flow

---

## 后续规划

- Admin UI
- quota 重置任务
- 后端持久化 Session / Message / Run
- Run History 查询
- 完整 RAG 检索后端
- 向量库接入
- 模型网关配置后台
- Token / Cost / Latency 统计
- 更完整的 Debug / Trace 面板
- 会话列表分页、消息分页和虚拟滚动
- Three.js 3D Agent Flow

---

## 演示路径

推荐演示顺序：

```txt
1. 打开在线预览
2. 说明公开演示模式无需登录即可体验
3. 使用 Mock 模式输入“你能做什么”
4. 查看 Conversation Timeline 和右侧 Run Trace
5. 输入“分析 2026 年 5 月教学质量数据，找出异常指标”
6. 查看 Mock Run Trace、工具摘要、图表和报告确认
7. 登录 Demo 账号
8. 左下角查看 demo_user 和 Agent Run 额度
9. 切换真实 Agent 模式
10. 发送数据分析问题
11. 查看真实 Agent SSE 流式输出
12. 查看 quota 扣减和 usage 记录
13. 说明真实 Agent API 由服务端鉴权和 quota 控制
14. 说明前端不保存模型密钥，模型调用统一由服务端转发
```

---

## 构建说明

类型检查：

```bash
pnpm exec tsc --noEmit
```

生产构建：

```bash
pnpm build
```

当前可能出现 Vite chunk size warning，主要来自 ECharts、Markdown、业务代码体积，对当前 Demo 不影响。
