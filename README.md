# AI Agent Workbench

一个面向 B 端数据分析场景的 AI Agent 工作台 Demo。

本项目基于 React / TypeScript 实现，重点展示 AI 应用前端中常见的复杂交互：流式输出、Agent 执行步骤、工具调用、知识库来源、数据分析图表、人工确认、错误重试，以及 URL-First 状态恢复。

## 在线预览

> 待部署后补充

## 项目截图

> 待补充截图

## 项目定位

本项目不是普通聊天框 Demo，而是面向企业数据分析场景的 AI Agent Workbench。

重点能力包括：

- AI Agent 工作台形态（左中右三栏）
- 教育数据分析场景任务承接
- Agent 执行过程可视化
- 工具调用与结果承接
- 真实模型接入能力（Groq）
- Mock 兜底演示能力

## 核心功能

- 三栏式 AI Agent 工作台
- URL-First 页面状态恢复
- Mock 流式输出
- Groq 真实模型接入
- Groq 真实流式输出
- AI 回复 Markdown 渲染
- 模型配置中心
- BYOK API Key 输入
- 服务端 `/api/chat` 转发
- 失败自动回退 Mock
- Agent 执行步骤可视化
- 工具调用卡片
- 知识库来源展示
- ECharts 数据分析图表
- 人工确认生成流程
- 错误模拟与重试

## 真实模型接入

项目默认使用 Mock 演示模式，保证公开访问时稳定可用。

同时支持 Groq 真实模型接入：

- 用户可在“连接模型服务”中输入自己的 Groq API Key
- API Key 仅保存在当前浏览器 `sessionStorage`
- API Key 不进入 URL
- API Key 不写入代码仓库
- 前端不会直接调用 Groq API
- 模型请求通过服务端 `/api/chat` 转发
- Groq 模式支持真实流式输出
- 模型返回内容支持 Markdown 渲染
- Groq 请求失败时会自动回退到 Mock 演示结果

当前版本状态：

| 模型方式 | 状态 |
|---|---|
| Mock 演示模式 | 已完成 |
| Groq 免费 API | 已接入主聊天流程，支持真实流式输出 |
| Gemini API | 配置入口预留 |
| OpenRouter Free | 配置入口预留 |
| OpenAI API Key | 配置入口预留 |
| OpenAI / Codex OAuth | 仅保留入口 |
| 本地 Ollama | 配置入口预留 |

## 主要流程

```txt
用户选择示例任务 / 输入问题
          ↓
AI 开始流式输出（Mock 或 Groq）
          ↓
Agent 步骤动态推进
          ↓
触发知识库检索工具
          ↓
展示知识库来源
          ↓
触发数据查询工具
          ↓
展示数据分析结果和图表
          ↓
等待用户确认
          ↓
生成最终结论
```

## 本地运行

安装依赖：

```bash
pnpm install
```

启动普通前端开发服务：

```bash
pnpm dev
```

如果只查看 Mock 演示，使用 `pnpm dev` 即可。

如果需要测试 `/api/chat` 和 Groq 真实模型接入，请使用 Vercel 本地开发服务：

```bash
pnpm exec vercel dev
```

然后访问：

```txt
http://localhost:3000
```

## Groq 测试方式

1. 打开模型配置中心
2. 展开“Groq 免费 API”
3. 输入自己的 Groq API Key
4. 点击“保存”
5. 点击“测试连接”
6. 测试通过后点击“启用”
7. 在底部输入框发送问题

启用 Groq 后，AI 回复会通过 `/api/chat` 请求真实模型，并以流式方式逐步展示。

如果 Groq 请求失败，页面会自动回退到 Mock 演示结果。

## 环境变量

项目支持两种 Groq Key 使用方式。

### 方式一：页面输入 Key

适合公开 Demo 或本地演示。

Key 仅保存在当前浏览器 `sessionStorage` 中。

### 方式二：服务端环境变量

也可以在服务端配置：

```env
GROQ_API_KEY=
```

部署到 Vercel 时，可在：

```txt
Project Settings → Environment Variables
```

中配置 `GROQ_API_KEY`。

如果请求头中携带用户输入的 Key，会优先使用用户输入的 Key；否则回退使用服务端环境变量。

## 技术栈

- React
- TypeScript
- Vite
- Zustand
- ECharts
- lucide-react
- react-markdown
- remark-gfm
- Vercel Serverless Function
- Groq OpenAI-compatible API
- pnpm

## 构建

```bash
pnpm build
```

当前构建可能出现 chunk size warning，主要来自 ECharts、Markdown 渲染和业务代码打包体积，对当前 Demo 不影响。

## 目录结构

```txt
src/
  components/
    chat/
    layout/
    analytics/
    model/
    common/
  mocks/
  stores/
  services/
  types/
  utils/
api/
```

## 后续可扩展方向

- 接入 Gemini / OpenRouter / OpenAI / Ollama 的真实服务端路由
- 增加多轮会话历史持久化
- 接入真实知识库检索
- 支持报告导出
- 支持更多数据图表

## 项目说明

本项目用于展示 AI 应用前端开发能力，重点不在模型能力本身，而在前端如何组织和承接 AI 应用中的复杂状态、执行过程、工具结果和用户确认流程，并在真实模型与稳定演示之间提供可切换方案。
