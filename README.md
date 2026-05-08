# AI Agent Workbench

一个面向企业数据分析场景的 AI Agent 工作台 Demo。

本项目基于 React / TypeScript 实现，重点展示 AI 应用前端中常见的复杂交互：流式输出、Agent 执行步骤、工具调用、知识库来源、数据分析图表、人工确认、错误重试以及 URL-First 状态恢复。

## 在线预览

> 待部署后补充

## 项目截图

> 待补充截图

## 核心功能

- 三栏式 AI 工作台布局
- 会话列表与示例任务
- URL-First 页面状态恢复
- AI 回复 mock 流式输出
- Agent 执行步骤动态推进
- 工具调用卡片动态出现
- 知识库来源展示
- 数据分析结果展示
- ECharts 数据图表
- 人工确认流程
- 最终结论生成
- 停止生成
- 重新生成
- 错误状态与重试
- 底部输入框发送问题

## 技术栈

- React
- TypeScript
- Vite
- Zustand
- ECharts
- CSS
- pnpm

## 项目亮点

### 1. AI 应用前端工作台形态

本项目不是普通聊天框 Demo，而是将 AI 对话、Agent 执行步骤、工具调用、知识库来源、数据分析结果和人工确认流程组织在同一个工作台界面中。

### 2. URL-First 状态设计

项目将 `sessionId` 和 `taskId` 同步到 URL 中，使当前会话和任务状态支持刷新恢复。

示例：

```txt
/?sessionId=s_001&taskId=t_month_analytics
```

页面初始化时会从 URL 恢复当前会话和任务。

### 3. 流式输出与停止控制

项目使用 mock 流式输出模拟 AI 回复逐字生成，并支持停止生成、重新生成和任务切换。

### 4. Agent 执行过程可视化

右侧面板展示 Agent 执行步骤，包含 `pending`、`running`、`success`、`error` 等状态，用于表达 AI 任务的执行过程。

### 5. 工具调用与结果承接

中间消息区支持工具调用卡片，模拟知识库检索和数据查询过程，并在右侧同步展示知识库来源和数据分析结果。

### 6. 人工确认闭环

流程执行到关键节点后，需要用户确认是否生成报告。确认后继续生成最终结论，取消则进入停止状态。

### 7. 错误状态与重试

项目提供模拟失败入口，用于展示错误提示、Agent 步骤中断和重试流程。

## 主要流程

```txt
用户选择示例任务 / 输入问题
          ↓
AI 开始流式输出
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

```bash
pnpm install
pnpm dev
```

如果本机 localhost 访问异常，可以使用：

```bash
pnpm dev -- --host 127.0.0.1 --port 5173
```

访问：

```txt
http://127.0.0.1:5173/
```

## 构建

```bash
pnpm build
```

## 真实模型接入

项目预留了服务端接口 `/api/chat`，用于接入真实模型服务。

当前示例使用 Groq OpenAI-compatible API。

本地需要配置：

```env
GROQ_API_KEY=
```

部署到 Vercel 后，需要在：

```txt
Project Settings → Environment Variables
```

中配置：

```txt
GROQ_API_KEY
```

前端不会直接持有模型 API Key，模型请求统一通过服务端接口转发。

## 目录结构

```txt
src/
  components/
    chat/
    layout/
    analytics/
  mocks/
  stores/
  types/
  utils/
```

## 后续可扩展方向

- 接入真实 SSE 流式接口
- 增加 Node.js BFF 层
- 接入真实大模型 API
- 支持多轮会话历史
- 支持真实知识库检索
- 支持报告导出
- 支持更多数据图表

## 项目说明

本项目用于展示 AI 应用前端开发能力，重点不在模型能力本身，而在前端如何组织和承接 AI 应用中的复杂状态、执行过程、工具结果和用户确认流程。
