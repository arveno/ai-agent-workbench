# AI Agent Workbench / AI 应用工作台

AI Agent Workbench 是一个面向 B 端教育数据分析场景的 AI 应用工作台 Demo。

它不是普通聊天框，而是围绕 Agent Planner、真实数据源、服务端受控工具、Run Trace、流式输出、Conversation Timeline、报告确认、Prompt 配置、Model Gateway 和 RAG Source UI 构建的 AI Workbench。

项目重点展示 AI 应用前端在复杂工作台布局、会话时间线、工具调用、流式输出、状态治理、受控数据访问和可观测 Run Trace 等方面的工程能力。

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

---

## 当前核心能力

- Sidebar + Workspace 工作台布局
- Tailwind CSS + shadcn/ui + Radix UI 统一 UI 体系
- Mock / Agent 双模式
- 统一 Run 状态模型
- Session / Message / Run 会话时间线模型
- ChatBlock Conversation Timeline Renderer
- Agent Run SSE 流式事件
- ChatGPT 类发送 / 停止体验
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
- 环境健康检查
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

### Workspace Header

Workspace Header 是当前会话的上下文控制区：

- 当前会话标题
- Run 状态摘要
- 环境健康状态
- 模型配置入口
- 数据源配置入口
- 工具库入口
- 工作流 / Prompt 配置入口

模型 / 数据源 / 工具库 / 工作流是当前 Workspace 的上下文配置入口，而不是独立全局页面。

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
/api/agent/run/stream
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
不调用工具
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
Model Gateway 调用 Groq 生成结论
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
不调用工具
返回暂不支持说明
```

---

## Mock 与真实 Agent 模式

### Mock 模式

Mock 模式用于稳定演示：

- 使用本地模拟 RunEvent
- 不依赖真实模型
- 不依赖真实数据库
- 写入统一 `currentRun`
- 同步到 `session.runsById`
- 通过 ChatBlock 展示工具摘要、结论和报告确认
- 右侧 Run Trace、工具调用、图表、RAG 来源和报告确认都可展示

### Agent 模式

Agent 模式使用真实后端链路：

- 调用 `/api/agent/run/stream`
- 通过 fetch + ReadableStream 消费 SSE
- 每个 RunEvent 更新 `currentRun`
- `currentRun` 持久化到当前 Session
- 支持流式结论输出
- 支持停止 / 中断
- 支持右侧 Run Trace 逐步更新

两种模式共享同一套 Run / ChatBlock / Run Trace 展示结构。

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
- 保存到 `sessionStorage`
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

Agent Run 和 Agent Stream 的模型结论生成已收敛到 Model Gateway。没有 Groq Key 或调用失败时，业务层仍会回退到 fallback 本地摘要。

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

健康检查只返回配置状态和连接状态，不返回任何 Key 或连接串。

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
  datasources/
  health.ts
  chat.ts

src/
  components/
    analytics/
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
pnpm dev 适合查看前端 Mock 演示。
pnpm exec vercel dev 适合测试 Serverless API、数据源连接、Agent Run、环境健康检查。
```

---

## 环境变量

本地 `.env.local` 示例：

```env
GROQ_API_KEY=
SUPABASE_DB_CONNECTION_STRING=
POSTGRES_CONNECTION_STRING=
```

说明：

- `.env.local` 不应提交
- 线上需要在 Vercel Project Settings → Environment Variables 中配置
- 修改 Vercel 环境变量后需要重新部署
- 不要把 API Key 或数据库连接串写入 README、代码或 URL

---

## Vercel 部署说明

项目可部署在 Vercel。

```txt
Serverless API 位于 api/ 目录。
生产环境需要在 Vercel 中配置服务端环境变量。
```

建议部署后先检查：

```txt
/api/health
```

如果环境状态显示未配置，需要到 Vercel Project Settings → Environment Variables 中补充对应变量并重新部署。

---

## 安全边界

当前 Demo 明确遵守以下边界：

- 前端不保存数据库连接串
- 前端不直接连接数据库
- API Key 不进 URL
- API Key 不写仓库
- BYOK 只保存到 `sessionStorage`
- 数据库连接串只在服务端环境变量使用
- 模型不能直接执行 SQL
- 工具调用由服务端控制
- 表、字段、指标、limit 受白名单限制
- Markdown 不启用原始 HTML
- 健康检查不返回 secret

---

## 当前能力边界

当前项目没有实现：

- 用户系统
- 登录 / Workspace
- Run History 后端持久化
- 完整 RAG 后端
- 向量库
- 任意 SQL 编辑器
- 多租户
- RBAC
- 复杂报表平台
- Three.js 3D Agent Flow

---

## 后续规划

- 登录 / Workspace
- 后端数据库持久化 Session / Message / Run
- Run History 持久化
- API Key / 数据源密钥加密保存
- Prompt 配置接入后端
- 完整 RAG 检索后端
- Three.js 3D Agent Flow
- 工具详情展开
- 更完整的 Debug / Trace 面板
- 会话列表分页、消息分页和虚拟滚动

---

## 演示路径

推荐演示顺序：

```txt
1. 打开在线预览
2. 查看环境状态
3. 打开模型配置，选择 Mock 或 Groq
4. 打开数据源配置，查看 Supabase / PostgreSQL
5. 打开工具库，查看 Tool Registry 面板
6. 打开工作流，查看执行流程和 Prompt 模板
7. 输入“你能做什么”
8. 查看 capability_intro 分支
9. 输入“分析 2026 年 5 月教学质量数据，找出异常指标”
10. 查看 Agent Run SSE 流式过程
11. 查看右侧 Run Trace
12. 查看工具调用、图表和 RAG 来源
13. 点击生成报告
14. 刷新页面，说明 Conversation Timeline 可恢复
15. 切换 Mock 模式，说明 Mock 与 Agent 共享同一套展示结构
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
