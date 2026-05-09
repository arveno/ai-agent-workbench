# AI Agent Workbench / AI 应用工作台

AI Agent Workbench 是一个面向 B 端教育数据分析场景的 AI 应用工作台 Demo。

它不是一个普通聊天框，而是一个具备 **Agent Planner、真实数据源连接、服务端受控工具调用、执行过程可视化、数据分析结论生成和报告确认流程** 的 AI 应用前端项目。

项目重点展示 AI 应用在前端侧的复杂交互组织能力，以及前端主导项目中对轻量后端、真实数据源和 Agent 执行链路的整合能力。

---

## 在线预览

https://ai-agent-workbench.vercel.app

---

## 项目截图

> 待补充截图

---

## 项目定位

本项目以“AI 应用工作台”而不是“单轮聊天框”为核心形态。

它展示的是一个真实 AI 应用前端常见的完整闭环：

```txt
用户输入问题
  ↓
Agent Planner 判断任务类型
  ↓
根据任务类型选择执行流程
  ↓
数据分析类请求访问真实数据源
  ↓
服务端受控工具执行
  ↓
聊天区展示工具摘要与结论
  ↓
右侧展示完整 Run 过程
  ↓
用户确认是否生成简版报告
```

项目当前聚焦教育数据分析场景，使用 Supabase 托管 PostgreSQL 作为真实 Demo 数据源，同时保留通用 PostgreSQL 数据源接入能力展示。

---

## 核心能力

### 工作台交互

- 左中右三栏式 AI Agent 工作台布局
- 左侧会话列表与示例任务
- 中间聊天区展示用户问题、工具调用摘要、AI 结论和报告确认
- 右侧展示完整 Agent Run 执行过程
- URL-First 页面状态恢复
- 多轮会话本地持久化
- Markdown 回复渲染
- 中文输入法组合输入处理
- 发送入口收口：输入框 + 发送按钮为唯一主入口

### Agent 执行链路

- 服务端 Agent Planner 判断任务类型
- 支持三类任务：
  - `capability_intro`：能力说明类问题
  - `data_analysis`：数据分析类问题
  - `unsupported`：暂不支持类问题
- 数据分析类请求进入真实 Agent Run
- 非数据分析类请求不访问数据源、不调用工具
- Agent Run 结果写入当前会话
- 右侧同步展示本轮执行步骤、数据源、工具调用、分析结果和结论

### 真实数据源

- Supabase PostgreSQL 真实连接
- 通用 PostgreSQL 数据源能力展示
- 数据源连接测试 API
- 数据库 Schema 读取 API
- 服务端读取数据库连接串
- 前端不保存数据库连接串
- 前端不直接连接数据库

### 服务端工具能力

已实现服务端 Tool Registry，当前工具包括：

- `schema_inspect`：读取数据库结构
- `query_table`：受控查询白名单表
- `aggregate_table`：受控聚合教学指标
- `chart_render`：生成前端图表数据结构

工具调用全部在服务端执行，前端只展示结果。

### 模型与兜底

- Mock 演示模式：保证公开 Demo 稳定可用
- Groq 免费 API 接入
- BYOK API Key 输入
- API Key 仅保存在当前浏览器 `sessionStorage`
- API Key 不进入 URL
- API Key 不写入代码仓库
- 服务端支持 `GROQ_API_KEY` 环境变量
- Groq 不可用或未配置时，Agent Run 使用本地工具摘要兜底
- 兜底结论会明确提示来源，不伪装成模型生成

### 报告确认流程

数据分析类 Agent Run 成功后，聊天区会出现后续操作：

```txt
是否基于本次分析生成简版报告？
```

用户可以选择：

- 生成报告
- 暂不生成

生成报告时，会基于当前 Agent Run 结果生成 Markdown 简版报告，不使用假数据。

---

## 当前任务类型

### 1. 能力说明类

示例：

```txt
你能做什么？
怎么用？
有什么功能？
```

执行逻辑：

```txt
不访问数据库
不调用工具
直接返回能力说明
右侧展示本次未访问数据源 / 未调用工具 / 未生成分析结果
```

---

### 2. 数据分析类

示例：

```txt
分析本月教学质量数据，找出异常指标
```

执行逻辑：

```txt
Agent Planner 判断为 data_analysis
  ↓
读取数据库 Schema
  ↓
执行受控聚合工具
  ↓
生成图表数据
  ↓
生成分析结论
  ↓
聊天区展示工具摘要和结论
  ↓
右侧展示完整 Run 详情
  ↓
可选择生成简版报告
```

---

### 3. 暂不支持类

示例：

```txt
帮我写一首诗
```

执行逻辑：

```txt
不访问数据库
不调用工具
返回当前工作台暂不支持说明
```

---

## 主流程

```txt
用户输入问题
  ↓
点击发送
  ↓
/api/agent/run
  ↓
Agent Planner 判断任务类型
  ↓
根据 intent 分流

capability_intro:
  直接返回能力说明

unsupported:
  返回暂不支持说明

data_analysis:
  schema_inspect
    ↓
  aggregate_table / query_table
    ↓
  chart_render
    ↓
  Groq 生成结论或 fallback 本地摘要
    ↓
  聊天区展示工具摘要和结论
    ↓
  右侧展示完整 Run
    ↓
  用户确认是否生成报告
```

---

## 模型接入状态

| 模型方式 | 当前状态 |
|---|---|
| Mock 演示模式 | 已完成，保留稳定演示流程 |
| Groq 免费 API | 已接入 Agent Run 主流程 |
| Gemini API | 配置入口预留 |
| OpenRouter Free | 配置入口预留 |
| OpenAI API Key | 配置入口预留 |
| OpenAI / Codex OAuth | 仅保留入口，不实现登录授权 |
| 本地 Ollama | 配置入口预留 |

---

## 数据源接入状态

| 数据源 | 当前状态 |
|---|---|
| Supabase PostgreSQL | 当前 Demo 实际使用的数据源 |
| PostgreSQL | 通用 PostgreSQL 数据源能力展示 |
| MySQL | 入口预留，暂未接入 |

说明：

Supabase 底层使用 PostgreSQL。当前 Demo 使用 Supabase 托管 PostgreSQL 作为真实数据源，同时保留通用 PostgreSQL 接入能力展示。

---

## 已实现 API

### 模型相关

```txt
POST /api/chat
```

用于服务端转发 Groq 请求，支持模型连接测试和基础模型调用能力。

---

### 数据源相关

```txt
POST /api/datasources/test
```

测试服务端是否可以连接 PostgreSQL / Supabase 数据源。

```txt
POST /api/datasources/schema
```

读取数据库结构信息，包括 schema、table 和 column 信息。

---

### Agent Run

```txt
POST /api/agent/run
```

执行完整 Agent Run 流程。

包括：

- Planner 判断任务类型
- 数据分析类执行受控工具链
- 非数据分析类直接返回说明
- 返回 steps、toolInvocations、chartData、conclusion 等 Run 结果

---

## 技术栈

### 前端

- React
- TypeScript
- Vite
- Zustand
- ECharts
- lucide-react
- react-markdown
- remark-gfm

### 后端 / Serverless

- Vercel Serverless Function
- Node.js / TypeScript
- pg
- dotenv
- Groq OpenAI-compatible API

### 数据源

- Supabase PostgreSQL
- PostgreSQL

---

## 项目结构

```txt
api/
  agent/
    run.ts
  datasources/
    test.ts
    schema.ts
  chat.ts

src/
  components/
    chat/
    datasource/
    layout/
    model/
    tools/
    workflow/
    analytics/
    common/

  server/
    agent/
      runAgent.ts
      planner.ts
      prompt.ts
      capabilityReply.ts
      intent.ts
      types.ts
    datasources/
      connection.ts
    tools/
      registry.ts
      schemaInspectTool.ts
      queryTableTool.ts
      aggregateTableTool.ts
      chartRenderTool.ts
      types.ts

  services/
    agentRunApi.ts
    datasourceApi.ts
    chatApi.ts

  stores/
    workbenchStore.ts
    slices/

  styles/
  types/
  utils/
  mocks/
```

---

## 本地运行

安装依赖：

```bash
pnpm install
```

如果只查看前端 Mock 演示：

```bash
pnpm dev
```

如果需要测试 Serverless API、数据源连接、Schema 读取和 Agent Run，请使用：

```bash
pnpm exec vercel dev
```

然后访问：

```txt
http://localhost:3000
```

---

## 环境变量

本地开发可在项目根目录创建：

```txt
.env.local
```

示例：

```env
GROQ_API_KEY=

SUPABASE_DB_CONNECTION_STRING=
POSTGRES_CONNECTION_STRING=
```

说明：

- `GROQ_API_KEY`：服务端 Groq Key，可选
- `SUPABASE_DB_CONNECTION_STRING`：Supabase PostgreSQL 连接串
- `POSTGRES_CONNECTION_STRING`：通用 PostgreSQL 连接串

如果用户在页面模型配置中心输入 Groq Key，则优先使用用户输入的 Key。

如果没有配置 Groq Key，Agent Run 不会失败，会使用本地工具结果生成兜底摘要，并明确提示该结论不是模型生成。

---

## Groq 使用方式

1. 打开模型配置中心
2. 展开 “Groq 免费 API”
3. 输入自己的 Groq API Key
4. 点击保存
5. 点击测试连接
6. 启用 Groq
7. 在输入框发送问题

Groq 模式下，发送会进入 Agent Run 主流程：

```txt
用户问题
  ↓
/api/agent/run
  ↓
Planner
  ↓
工具链 / 说明分支
  ↓
Groq 生成结论或 fallback 摘要
```

---

## 数据源使用方式

1. 打开数据源配置
2. 选择 Supabase 或 PostgreSQL
3. 点击测试连接
4. 点击读取 Schema
5. 发送数据分析类问题

示例：

```txt
分析本月教学质量数据，找出异常指标
```

Agent 会根据当前问题进入数据分析流程，并在右侧展示执行过程。

---

## 安全说明

- 前端不保存数据库连接串
- 前端不直接连接数据库
- 数据库连接串只在服务端环境变量中使用
- 不在代码仓库中写死模型 API Key
- 不通过 URL 传递 API Key
- BYOK 输入的模型 Key 仅保存在 `sessionStorage`
- Markdown 渲染不启用原始 HTML
- 模型不能直接执行 SQL
- 模型不能自由调用任意工具
- 数据查询必须经过服务端 Tool Registry
- 工具内部限制表、字段、指标和 limit
- Agent Planner 只负责判断任务类型，最终执行由后端受控流程完成

---

## 构建

```bash
pnpm build
```

当前构建可能出现 chunk size warning，主要来自 ECharts、Markdown 渲染和业务代码打包体积，对当前 Demo 不影响。

---

## 当前能力边界

当前项目已完成第一版真实闭环，但仍然保持小而可控。

已完成：

- AI Agent 工作台 UI
- Mock 演示模式
- Groq 模型接入
- 数据源连接测试
- Schema 读取
- 服务端 Tool Registry
- Agent Planner
- Agent Run
- 聊天区工具摘要
- 右侧完整 Run 展示
- 报告确认与 Markdown 报告生成

暂未实现：

- 用户系统
- 权限系统
- 多租户
- 任意 SQL 编辑器
- 多数据库联合查询
- 复杂报表中心
- 完整 RAG 平台
- 长期后端持久化
- 生产级审计日志
- 真正可取消的后端 Agent Run

---

## 后续扩展方向

- 补齐时间范围识别与受控过滤能力
- 优化 Planner 对指标、维度和时间条件的结构化提取
- 接入更多数据源类型
- 增加真正的报告生成 API
- 增加 Run 历史持久化
- 增加更完整的错误追踪和执行日志
- 对 ECharts 和 Markdown 依赖做按需拆包
- 增加 AbortController，支持中断真实 Agent Run

---

## 项目价值

这个项目展示的重点不是“做一个 AI 聊天框”，而是一个更接近真实业务场景的 AI 应用前端：

```txt
复杂工作台布局
真实数据源
服务端受控工具
Agent 执行过程
模型生成与兜底
Run 可视化
报告确认闭环
```

它适合用于展示 AI 应用前端、B 端数据分析工作台、Agentic UI、Serverless API 与真实数据源接入等方向的综合能力。