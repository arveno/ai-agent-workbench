# AI Agent Workbench / AI 应用工作台

AI Agent Workbench 是一个面向 B 端教育数据分析场景的 AI 应用工作台 Demo。

它不是普通聊天框，而是围绕 Agent Planner、真实数据源、服务端受控工具、Run Trace、流式输出、Prompt 配置、模型网关、RAG 来源展示和报告确认构建的 AI Workbench。

项目重点展示 AI 应用前端在复杂交互、Agentic UI、LLM 流式输出、工具调用可视化、轻量后端和真实数据源整合方面的工程能力。

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
聊天区展示过程摘要和结论
  ↓
右侧 Inspector 展示完整 Run Trace
  ↓
用户确认是否生成简版报告
```

---

## 当前核心能力

- Sidebar + Workspace 工作台布局
- Tailwind CSS + shadcn/ui 基础组件
- Mock / Agent 双模式
- 统一 Run 状态模型
- Mock / Agent 共享 `currentRun` 展示结构
- Agent Run SSE 流式事件
- ChatGPT 类发送 / 停止体验
- Run Trace 右侧观察面板
- Supabase / PostgreSQL 数据源连接
- 数据源连接测试
- 数据库 Schema 读取
- 服务端 Tool Registry
- Agent Planner
- 时间范围、指标、维度约束
- 图表数据结构统一
- ECharts 图表展示
- 工具调用 formatter
- 报告确认与 Markdown 报告生成
- Prompt 配置中心
- Model Gateway
- RAG Source / Citation UI
- 环境健康检查
- Vercel Serverless API

---

## 主流程

```txt
用户输入问题
  ↓
点击发送
  ↓
创建 Run
  ↓
Agent Planner 判断任务类型
  ↓
capability_intro / data_analysis / unsupported
  ↓
数据分析类进入受控工具链
  ↓
schema_inspect
  ↓
aggregate_table / query_table
  ↓
chart_render
  ↓
Groq 流式生成结论或 fallback 本地摘要
  ↓
聊天区展示工具摘要和结论
  ↓
右侧展示 Run Trace
  ↓
用户确认是否生成报告
```

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

- 品牌信息
- 新建会话
- 会话列表
- 示例任务
- 用户信息占位

### Workspace Header

Workspace Header 负责当前会话上下文入口：

- 当前会话标题
- Run 状态摘要
- 模型配置入口
- 数据源入口
- 工具库入口
- 工作流入口
- 环境状态提示

### Workspace Main

Workspace Main 是当前会话主工作区：

- 用户消息
- Assistant 回复
- 工具调用摘要
- 流式生成状态
- 报告确认
- 输入框

### Workspace Inspector

Workspace Inspector 是右侧 Run Trace 面板：

- Run 概览
- 执行时间线
- 当前数据源
- 工具调用
- 检索来源
- 数据分析图表
- 当前结论

---

## Agent Run 流程

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
- 仍然写入统一 `currentRun`
- 右侧 Run Trace、工具调用、图表、RAG 来源和报告确认都可展示

### Agent 模式

Agent 模式使用真实后端链路：

- 调用 `/api/agent/run/stream`
- 通过 fetch + ReadableStream 消费 SSE
- 每个 RunEvent 更新 `currentRun`
- 支持流式结论输出
- 支持停止 / 中断
- 支持右侧 Run Trace 逐步更新

两种模式共享同一套 UI 展示结构和统一 Run 状态模型。

---

## 数据源能力

当前 Demo 使用 Supabase 托管 PostgreSQL 作为真实数据源，同时保留通用 PostgreSQL 数据源能力展示。

已支持 API：

```txt
POST /api/datasources/test
POST /api/datasources/schema
```

能力：

- PostgreSQL / Supabase 连接测试
- 读取 public schema
- 返回表、字段、字段类型、nullable 等结构信息
- 前端不直接连接数据库
- 数据库连接串只在服务端环境变量中使用

相关环境变量：

```env
SUPABASE_DB_CONNECTION_STRING=
POSTGRES_CONNECTION_STRING=
```

不要把真实值写入仓库。

---

## 工具调用能力

当前服务端 Tool Registry 已实现：

| 工具 | 说明 | 当前状态 |
|---|---|---|
| `schema_inspect` | 读取数据库结构 | 已接入，服务端执行 |
| `query_table` | 受控数据查询 | 已接入，服务端执行 |
| `aggregate_table` | 受控聚合分析 | 已接入，服务端执行 |
| `chart_render` | 图表数据生成 | 已接入，服务端执行 |
| `knowledge_search` | RAG 来源模拟展示 | 前端模拟 |
| `report_generate` | Markdown 报告生成 | 前端模拟 |

安全原则：

```txt
模型不能直接执行 SQL
所有数据访问必须经过服务端 Tool Registry
表、字段、指标和 limit 都受白名单限制
```

---

## Run Trace

右侧 Workspace Inspector 展示完整 Run Trace：

- Run ID
- Run 模式：Mock / Agent
- Run 状态：running / success / error / stopped
- 任务类型：capability_intro / data_analysis / unsupported
- 执行时间线
- 当前数据源
- 工具调用记录
- RAG 检索来源
- ECharts 图表
- 当前结论
- 结论来源：模型生成 / 本地摘要 / Mock 生成

Run Trace 由统一 `RunSnapshot` 和 `RunEvent` 驱动。

---

## Prompt 配置中心

Prompt 配置中心位于“工作流”弹窗中的 `Prompt 模板` Tab。

当前支持：

- Planner Prompt
- Analysis Prompt
- Report Prompt
- Fallback Summary Prompt

能力：

- 查看模板
- 编辑模板
- 保存到 `sessionStorage`
- 恢复当前模板默认值
- 恢复全部默认值

当前限制：

```txt
Prompt 模板目前只做前端配置展示，暂未接入后端 Agent 执行 prompt。
```

---

## Model Gateway

服务端已抽象 Model Gateway：

```txt
Agent Run / Stream
  ↓
ModelGateway
  ↓
Provider Adapter
```

当前 provider 状态：

| Provider | 状态 |
|---|---|
| Groq | 已实现 generateText / streamText |
| OpenAI | Adapter stub |
| OpenRouter | Adapter stub |
| Gemini | Adapter stub |
| Ollama | Adapter stub |

当前真实 Agent 结论生成仍使用 Groq。其他 provider 暂未接入真实请求。

---

## RAG Source / Citation UI

项目已具备 RAG Source / Citation 的前端展示结构。

右侧“检索来源”卡片展示：

- 引用标识，例如 `[S1]`
- 文档标题
- 片段标题
- 内容摘要
- 相关性分数
- 是否用于回答
- 来源类型

当前状态：

```txt
Mock 模式展示模拟来源
Agent 模式没有真实 sources 时显示空态
暂未接入真实向量库或 RAG 后端
```

---

## 报告生成流程

数据分析类 Run 成功后，聊天区会展示：

```txt
是否基于本次分析生成简版报告？
```

用户可选择：

- 生成报告
- 暂不生成

生成报告时，前端基于当前 `currentRun` 生成 Markdown 报告，包括：

- 分析问题
- 使用数据源
- 调用工具
- 分析结论
- 后续建议

当前报告生成不调用后端，不使用假数据。

---

## 技术栈

- React 19
- TypeScript
- Vite
- Zustand
- Tailwind CSS
- shadcn/ui
- Radix UI
- ECharts
- React Markdown
- Vercel Serverless Functions
- PostgreSQL / Supabase
- Groq OpenAI-compatible API

---

## 项目结构

```txt
api/
  chat.ts                       # 旧 Groq 聊天接口，保留兼容
  health.ts                     # 环境健康检查
  agent/run.ts                  # 一次性 Agent Run JSON 接口
  agent/run/stream.ts           # Agent Run SSE 流式接口
  datasources/test.ts           # 数据源连接测试
  datasources/schema.ts         # Schema 读取

src/components/
  chat/                         # 聊天区、输入框、工具摘要、报告确认
  layout/                       # Sidebar、Workspace、Header、Inspector
  layout/right-panel/           # Run Trace 卡片
  model/                        # 模型配置中心
  datasource/                   # 数据源配置弹窗
  tools/                        # 工具库配置弹窗
  workflow/                     # 工作流弹窗与 Prompt 配置中心
  analytics/                    # 图表组件
  ui/                           # shadcn/ui 基础组件

src/server/
  agent/                        # Planner、Agent Run、Prompt 构造、SSE 执行
  datasources/                  # 服务端数据源连接工具
  models/                       # Model Gateway 与 provider adapters
  tools/                        # Tool Registry 与受控工具

src/services/                   # 前端 API service
src/stores/                     # Zustand store 与 slices
src/types/                      # Run、Prompt、RAG、工具、Workbench 类型
src/utils/                      # Run reducer、formatter、mapping、report 等工具函数
src/styles/                     # 拆分后的样式文件
```

---

## 本地运行

安装依赖：

```bash
pnpm install
```

仅查看前端和 Mock：

```bash
pnpm dev
```

测试 Vercel API、数据源、Agent Run、环境健康检查：

```bash
pnpm exec vercel dev
```

构建：

```bash
pnpm build
```

说明：

```txt
当前构建可能出现 Vite chunk size warning，主要来自 ECharts、Markdown 和业务代码体积。
这对当前 Demo 功能不构成影响。
```

---

## 环境变量

本地可在 `.env.local` 中配置：

```env
GROQ_API_KEY=
SUPABASE_DB_CONNECTION_STRING=
POSTGRES_CONNECTION_STRING=
```

说明：

- `.env.local` 不应提交到仓库
- 线上部署需要在 Vercel Project Settings → Environment Variables 中配置
- `GROQ_API_KEY` 未配置时，Agent Run 会使用 fallback 本地摘要
- 数据库连接串未配置时，真实数据源能力不可用
- 前端页面 BYOK Key 只保存到 `sessionStorage`

---

## Vercel 部署说明

推荐部署到 Vercel。

线上至少需要配置：

```env
SUPABASE_DB_CONNECTION_STRING=
```

如需服务端 Groq 默认可用，配置：

```env
GROQ_API_KEY=
```

如需通用 PostgreSQL 数据源能力，配置：

```env
POSTGRES_CONNECTION_STRING=
```

部署后可通过页面 Header 的环境状态查看：

- 当前运行环境
- Groq 是否配置
- Supabase 是否配置 / 可连接
- PostgreSQL 是否配置 / 可连接

也可以直接访问：

```txt
GET /api/health
```

---

## 安全边界

当前项目明确遵守以下边界：

- 前端不保存数据库连接串
- 前端不直接连接数据库
- API Key 不进 URL
- API Key 不写仓库
- BYOK 只保存到 `sessionStorage`
- 数据库连接串只在服务端环境变量使用
- 模型不能直接执行 SQL
- 工具调用由服务端控制
- 表、字段、指标、limit 受白名单限制
- 数据分析工具只执行受控查询或聚合
- Markdown 渲染不启用原始 HTML
- 不返回数据库连接串
- 不返回 Groq API Key

---

## 当前能力边界

当前项目仍然没有实现：

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
- Prompt 配置后端执行接入
- 真实 OpenAI / Gemini / OpenRouter / Ollama 请求

---

## 后续规划

优先级较高：

- 登录 / Workspace
- Run History 持久化
- API Key / 数据源密钥加密保存
- Prompt 配置接入后端
- 完整 RAG 检索后端
- 工具详情展开
- 更完整的 Debug / Trace 面板

后续增强：

- Three.js 3D Agent Flow
- 更完整的模型网关
- 多数据源管理
- Run 事件回放
- 可配置工具启用策略

---

## 演示路径

建议演示顺序：

1. 打开在线预览。
2. 查看 Header 中的环境状态。
3. 打开模型配置，选择 Mock 或 Groq。
4. 输入：

   ```txt
   你能做什么
   ```

5. 展示 `capability_intro` 分支：不访问数据源、不调用工具、右侧显示说明类 Run。
6. 输入：

   ```txt
   分析 2026 年 5 月教学质量数据，找出异常指标
   ```

7. 展示 Agent Run SSE 流式过程。
8. 查看右侧 Run Trace：执行时间线、数据源、工具调用、检索来源、图表、结论。
9. 点击“生成报告”，展示 Markdown 简版报告。
10. 切换 Mock 模式，说明 Mock 和 Agent 共享同一套 Run 展示结构。
11. 打开工作流弹窗，展示 Prompt 配置中心。
12. 打开工具库弹窗，展示 Tool Registry 对齐后的工具定义视图。

---

## 备注

这是一个用于作品集和面试展示的 AI Workbench Demo。项目更强调 AI 应用前端、Agentic UI、Run Trace、工具调用可视化、模型流式输出和轻量后端整合能力，而不是生产级 BI、权限系统或完整 RAG 平台。
