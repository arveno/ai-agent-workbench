# AI Agent Workbench / AI 应用工作台

AI Agent Workbench 是一个面向 B 端教育数据分析场景的 AI 应用前端 Demo。

它不是一个普通聊天框，而是一个带有 Agent 执行过程、工具调用、知识库结果、数据分析图表、人工确认和模型配置能力的 AI 工作台。

## 在线预览

https://ai-agent-workbench.vercel.app

## 项目截图

> 待补充截图

## 项目定位

本项目以“工作台”而非“单轮对话框”为核心形态，重点展示 AI 应用在前端侧的复杂状态组织能力：

- 左中右三栏协同工作区
- URL-First 页面状态恢复
- Agent 执行步骤可视化
- 工具调用与结果承接
- 真实模型接入与 Mock 稳定兜底

## 核心功能

- 三栏式 AI Agent 工作台布局
- URL-First 页面状态恢复
- Mock 流式输出，保证公开演示稳定
- Groq 真实模型接入
- Groq 真实流式输出
- AI 回复 Markdown 渲染
- 模型配置中心
- BYOK API Key 输入
- 服务端 `/api/chat` 转发模型请求
- Groq 失败自动回退 Mock
- Agent 执行步骤可视化
- 工具调用卡片展示
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

## 模型接入状态

| 模型方式 | 当前状态 |
|---|---|
| Mock 演示模式 | 已完成，默认稳定演示 |
| Groq 免费 API | 已接入主聊天流程，支持真实流式输出 |
| Gemini API | 配置入口预留 |
| OpenRouter Free | 配置入口预留 |
| OpenAI API Key | 配置入口预留 |
| OpenAI / Codex OAuth | 仅保留入口，不实现登录授权 |
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
2. 展开 “Groq 免费 API”
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

Key 仅保存在当前浏览器 `sessionStorage` 中，不进入 URL，也不会写入代码仓库。

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

## 构建

```bash
pnpm build
```

当前构建可能出现 chunk size warning，主要来自 ECharts、Markdown 渲染和业务代码打包体积，对当前 Demo 不影响。

## 安全说明

- 不在前端代码中写死模型 API Key
- 不通过 URL 传递模型 API Key
- 不使用 `localStorage` 长期保存 Key
- BYOK 输入的 Key 仅保存在当前浏览器会话
- `/api/chat` 负责服务端转发模型请求
- Markdown 渲染不启用原始 HTML

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
  services/
  stores/
  types/
  utils/
api/
```

## 后续扩展方向

- 接入 Gemini / OpenRouter / OpenAI API Key
- 接入本地 Ollama
- 增加 AbortController，真正中断真实模型流式请求
- 对 ECharts 和 Markdown 依赖做按需拆包
- 将 Agent 步骤与真实工具调用结果进一步联动
