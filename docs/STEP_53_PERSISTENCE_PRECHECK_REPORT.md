# Step 53 前置自检报告：Workbench 持久化与示例体系

生成日期：2026-05-12

审计范围：当前仓库代码、前端状态、Mock 数据、Vercel API、服务端 Agent / Tool、Supabase migration。

本轮限制：只新增本 Markdown 文档；未修改 `src/*`、`api/*`、`supabase/*`、`package.json`、`pnpm-lock.yaml`、`README.md`、`.env*`。

## 1. 当前总体结论

当前 Workbench 已经有一套前端统一运行态结构：`WorkbenchSession`、`WorkbenchMessage`、`RunSnapshot`、`RunEvent`，Mock 模式和真实 Agent 模式最终都会落到这套结构上展示。会话、消息、Run Snapshot 会写入浏览器 `sessionStorage`，因此同一浏览器会话内刷新页面通常可以恢复。

但当前不存在数据库级会话 / 消息 / Run / Tool / Report 持久化。`agent_run_usage` 只记录真实 Agent Run 的 quota usage 和基础状态，不是完整 Run Trace，不包含消息、完整事件、工具输入输出详情、图表、报告 artifact 或 RAG 检索日志。

左侧默认会话列表、示例任务、Mock RAG 来源、最近使用工具都属于假数据 / 静态数据 / mock 数据。示例任务点击后会在当前前端会话中直接运行 Mock Prompt，不会复制模板生成独立用户会话，也没有用户归属边界。

当前真实 RAG 链路不存在。右侧“检索来源”面板只读取 `currentRun.sources`；Mock Run 会注入 `createMockRagSources()`，真实 Agent Run 当前不会返回来源片段。当前只是占位展示，未接入真实检索数据。

长会话和大文本性能目前没有系统性保护。消息列表会一次性渲染全部 `chatBlocks`，assistant 消息用 `ReactMarkdown` 直接渲染，未见消息分页、虚拟滚动、Markdown memo、长文本折叠或 JSON lazy expand。

## 2. 当前已有能力

核心前端能力：

| 能力 | 当前实现 | 关键文件 |
| --- | --- | --- |
| React + Vite + TypeScript 工作台 | 已有 | `src/App.tsx`、`src/main.tsx`、`vite.config.ts` |
| Zustand store | 已有，多 slice 合并 | `src/stores/workbenchStore.ts`、`src/stores/slices/*` |
| Mock 模式 | 已有，本地流式回复和本地 Run Event | `src/stores/slices/createGenerationSlice.ts`、`src/utils/mockRun.ts` |
| 真实 Agent 模式 | 已有，前端调用 `/api/agent/run/stream` | `src/stores/slices/createUiSlice.ts`、`src/services/agentRunStreamApi.ts` |
| Supabase Auth | 已有登录、退出、session 恢复 | `src/lib/supabaseClient.ts`、`src/stores/authStore.ts` |
| Agent 权限视图 | 已有只读查询 | `api/auth/agent-access.ts`、`src/server/auth/agentAccess.ts` |
| Agent Run quota 扣减 | 已有 RPC | `src/server/auth/agentQuota.ts`、`supabase/migrations/20260511_agent_run_quota_rpc.sql` |
| 服务端 Tool Registry | 已有 | `src/server/tools/registry.ts` |
| 真实 Agent 流式 Run Event | 已有 | `src/server/agent/streamAgentRun.ts` |
| 报告确认流程 | 已有前端状态实现 | `src/components/chat/ConfirmActionCard.tsx`、`src/stores/slices/createGenerationSlice.ts` |

当前主要目录结构：

```txt
api/
  agent/
  auth/
  datasources/
src/
  components/
    chat/
    layout/
      right-panel/
    tools/
    workflow/
  mocks/
  server/
    agent/
    auth/
    datasources/
    models/
    tools/
  services/
  stores/
    slices/
  types/
  utils/
supabase/
  migrations/
public/
docs/
```

当前与会话 / 消息 / Agent Run / 工具 / 报告相关的核心文件：

| 方向 | 文件 | 关键结构 / 函数 |
| --- | --- | --- |
| 会话 / 消息类型 | `src/types/workbench.ts` | `WorkbenchSession`、`WorkbenchMessage`、`SessionSlice` |
| Run 类型 | `src/types/run.ts` | `RunSnapshot`、`RunEvent`、`RunToolInvocation`、`RunReportState` |
| Zustand 合并入口 | `src/stores/workbenchStore.ts` | `useWorkbenchStore` |
| 会话持久化与默认数据 | `src/stores/slices/shared.ts` | `WORKBENCH_SESSIONS_SESSION_KEY`、`getInitialWorkbenchSessionState()`、`persistWorkbenchSessions()` |
| 会话操作 | `src/stores/slices/createSessionSlice.ts` | `createSession()`、`switchSession()`、`startTask()` |
| Mock 生成 | `src/stores/slices/createGenerationSlice.ts` | `sendPrompt()`、`runMockPrompt()`、`runAgentStepsPreview()`、`generateReportForRun()` |
| 真实 Agent 前端入口 | `src/stores/slices/createUiSlice.ts` | `runCurrentAgentAnalysis()` |
| Run 状态 reducer | `src/utils/runReducer.ts` | `applyRunEventToSnapshot()` |
| Mock Run | `src/utils/mockRun.ts` | `createMockRunStartedEvent()`、`createMockToolInvocation()` |
| 报告生成 | `src/utils/report.ts` | `createRunReportMarkdown()` |
| 工具展示 | `src/utils/toolRegistryView.ts`、`src/utils/toolInvocationFormat.ts` | `WORKBENCH_TOOL_DEFINITIONS`、`formatToolInvocationForInspector()` |
| 右侧面板 | `src/components/layout/right-panel/*` | `RunOverviewCard`、`ToolInvocationsCard`、`RagSourcesCard` |
| 服务端真实 Agent | `src/server/agent/streamAgentRun.ts` | `streamAgentRun()` |
| 服务端工具 | `src/server/tools/*` | `schemaInspectTool`、`queryTableTool`、`aggregateTableTool`、`chartRenderTool` |

当前 Zustand store 结构：

| Slice | 状态字段 | 关键 action |
| --- | --- | --- |
| `SessionSlice` | `sessions`、`currentSessionId`、`currentTaskId`、`currentPrompt`、`activeAssistantMessageId` | `createSession`、`switchSession`、`appendUserMessageToCurrentSession`、`appendAssistantMessageToCurrentSession`、`startTask`、`hydrateFromUrl` |
| `GenerationSlice` | `generationStatus`、`errorMessage`、`realModelNotice`、`assistantStream`、`confirmStatus`、`streamRunId` | `sendPrompt`、`runMockPrompt`、`generateReportForRun`、`skipReportForRun`、`stopGenerating` |
| `UiSlice` | `chatDraft`、modal 开关、`agentRunStatus`、`activeAgentRunRequestId`、`currentReportRunId` | `runCurrentAgentAnalysis`、modal open/close |
| `RunSlice` | `currentRun`、`runEventLog` | `setCurrentRun`、`clearCurrentRun`、`applyRunEvent` |
| `ModelSlice` | `currentModelProvider`、`modelConfigs`、`modelTestStatusMap` | `setCurrentModelProvider`、`saveModelConfig`、`clearModelConfig` |

当前 Supabase / 数据库相关文件：

| 文件 | 当前内容 |
| --- | --- |
| `supabase/migrations/20260511_auth_quota.sql` | `profiles`、`agent_run_quota`、`agent_run_usage`、RLS select own policy、创建用户 profile/quota trigger |
| `supabase/migrations/20260511_agent_run_quota_rpc.sql` | `consume_agent_run_quota()`、`finish_agent_run_usage()` |
| `src/server/auth/types.ts` | 服务端表类型只覆盖 `profiles`、`agent_run_quota`、`agent_run_usage` |
| `src/server/auth/agentQuota.ts` | 调 RPC 消耗 / 结束 usage |
| `src/server/auth/agentAccess.ts` | 读取 profile 和 quota 生成 AgentAccessView |

当前是否有 localStorage / sessionStorage 持久化逻辑：

| 存储 | 当前情况 |
| --- | --- |
| `sessionStorage` | 存在。`src/utils/sessionStorage.ts` 提供 JSON 读写；`shared.ts` 持久化 sessions；`promptTemplates.ts` 持久化 Prompt Template；`createModelSlice.ts` 写 model provider/config，但初始化时会清掉 model config/provider。 |
| `localStorage` | 仓库内未出现显式 `localStorage` 读写。Supabase Auth 恢复由 `supabase.auth.getSession()` 和 supabase-js 内部机制处理，代码层未自定义 localStorage key。 |
| 数据库持久化 | 会话、消息、Run、Tool、Report 不存在数据库持久化。 |

当前数据是否刷新丢失：

| 数据 | 刷新是否恢复 | 边界 |
| --- | --- | --- |
| `sessions/messages/runsById/latestRunId` | 同一浏览器会话内可从 `sessionStorage` 恢复 | 新浏览器会话、清 storage、不同设备不可恢复 |
| `currentRun` | 可从当前 session 的 `latestRunId` 恢复为 Run Snapshot | 原始 `runEventLog` 不恢复 |
| `runEventLog` | 刷新丢失 | 只在内存，最多保留 200 条 |
| `agentRunStatus/activeAgentRunRequestId/AbortController` | 刷新丢失 | 运行中请求会断开 |
| `Report` | 生成后作为 `WorkbenchMessage.kind='report'` 写入 sessionStorage，可同会话刷新恢复 | 不是数据库 artifact |
| `Prompt Template` | sessionStorage 恢复 | 不进数据库 |

## 3. 当前假数据 / 临时数据 / 易丢失数据

假数据 / 静态数据 / mock 数据：

| 数据 | 来源 | 说明 |
| --- | --- | --- |
| 默认会话列表 | `src/mocks/sessions.ts` | `mockSessions`，默认 `s_001` 到 `s_007`，假数据 / 静态数据 / mock 数据 |
| 示例任务 | `src/mocks/tasks.ts` | `mockTasks`，假数据 / 静态数据 / mock 数据 |
| Mock Run 步骤和工具 | `src/utils/mockRun.ts` | `MOCK_RUN_STEPS`、`MOCK_RUN_TOOL_IDS`、`createMockToolInvocation()` |
| Mock RAG 来源 | `src/utils/ragSources.ts` | `createMockRagSources()` 返回 3 条来源 |
| 最近使用工具 | `src/components/layout/Sidebar.tsx` | 写死为“知识库检索 / 数据分析 / 报告生成” |
| 未使用 mock 知识源 | `src/mocks/knowledgeSources.ts` | 文件存在，但当前未被业务引用 |
| 未使用 mock 分析结果 | `src/mocks/analytics.ts` | 文件存在，但当前未被业务引用 |
| 工具库中的 RAG / Report 工具 | `src/utils/toolRegistryView.ts` | `knowledge_search` 和 `report_generate` 标记为 `mock` |

易丢失数据：

| 数据 | 当前存放 | 易丢失原因 |
| --- | --- | --- |
| 会话 / 消息 / Run Snapshot | `sessionStorage` | 不是 DB；不同设备 / 清理 storage / 会话结束会丢失 |
| 原始 Run Event Log | Zustand 内存 `runEventLog` | 不写 storage / DB，刷新丢失 |
| 流式中的 partial state | 内存状态和当前 session message | 刷新会中断请求，运行中状态会被归一为 stopped 或只能保留已写入内容 |
| 真实 Agent Tool 事件 | `currentRun.toolInvocations` 和 sessionStorage Run Snapshot | 不写 DB，不可跨设备统计 |
| 报告 artifact | `WorkbenchMessage.kind='report'` | 不是独立 artifact 表，不支持后续检索 / 版本 / 权限 |

Mock 模式和真实 Agent 模式的数据结构是否一致：

部分一致。前端统一使用 `RunSnapshot` 和 `RunEvent`，右侧面板与 chat block 都从该结构读取。但实际字段不完全一致：

| 对比项 | Mock | 真实 Agent |
| --- | --- | --- |
| `mode` | `mock` | `agent` |
| `runId` 前缀 | `mock_run_*` | 前端 `agent_run_*`，服务端可回退 `run_stream_*` |
| `sources` | 有 `createMockRagSources()` | 当前不存在 |
| 工具名称 | `knowledge_search`、`query_data`、`chart_render` | 流式路径实际调用 `schema_inspect`、`aggregate_table`、`chart_render` |
| `query_table` | 工具定义存在，Mock 不用 | 服务端 registry 存在，但当前 `streamAgentRun()` 未调用 |
| report | 前端生成 | 前端生成 |

## 4. 当前数据流

当前数据流：

```txt
用户输入
↓
ChatInput / sendPrompt
↓
message 创建
↓
Mock 或真实 Agent 分流
↓
Agent Run / Run Event
↓
Tool Invocation
↓
Chart / Report
↓
UI 展示
```

逐步标注：

| 步骤 | 关键文件 / 函数 | 是否持久化 | 是否刷新丢失 | 是否绑定 userId | 是否绑定 conversationId | 是否绑定 runId |
| --- | --- | --- | --- | --- | --- | --- |
| 用户输入 | `src/components/chat/ChatInput.tsx` | 草稿 `chatDraft` 只在内存 | 是 | 否 | 否 | 否 |
| `sendPrompt` | `createGenerationSlice.ts` `sendPrompt()` | action 本身不持久化 | 是 | 否 | 使用 `currentSessionId` | 分流后生成 |
| 用户 message 创建 | Mock: `runMockPrompt()`；真实: `runCurrentAgentAnalysis()` 调 `appendUserMessageToCurrentSession()` | 写入 `sessionStorage` 中的 `sessions.messages` | 同一浏览器会话刷新不丢；无 DB | 否 | 绑定 `WorkbenchSession.id`，无 `conversationId` 字段 | 有 `message.runId` |
| Mock / 真实分流 | `sendPrompt()` 根据 `currentModelProvider === 'groq'` 进入真实 Agent，否则 Mock | 分流结果不单独持久化 | 部分丢失 | 否 | 仅前端 session | 是 |
| Agent Run 创建 | Mock: `createMockRunStartedEvent()`；真实: `createAgentPendingRunStartedEvent()` + `/api/agent/run/stream` | Run Snapshot 写入 `sessions.runsById` 的 sessionStorage | Snapshot 可恢复，raw events 丢失 | 否 | `RunSnapshot.sessionId` | `RunSnapshot.id` |
| Run Event | `applyRunEvent()`、`runEventLog` | Snapshot 派生结果写入 sessionStorage；`runEventLog` 不持久化 | raw event 是 | 否 | 通过当前 session 写入 | 是 |
| Tool Invocation | `tool_started` / `tool_completed` 更新 `RunSnapshot.toolInvocations` | sessionStorage Snapshot | 同一浏览器会话可恢复；无 DB | 否 | 间接属于 session | 是 |
| Chart | `chart_ready` 更新 `RunSnapshot.chartData` | sessionStorage Snapshot | 同一浏览器会话可恢复；无 DB | 否 | 间接属于 session | 是 |
| Report | `generateReportForRun()` 创建 `WorkbenchMessage.kind='report'` | sessionStorage message | 同一浏览器会话可恢复；无 DB artifact | 否 | 属于当前 session | 是 |
| UI 展示 | `ChatPanel`、`RightPanel` | 展示不持久化 | 重新从 store/storage 派生 | 否 | 当前 session | 当前 run |

## 5. 会话系统现状

左侧会话列表数据来源：

`src/components/layout/Sidebar.tsx` 从 `useWorkbenchStore((state) => state.sessions)` 读取，然后按 `updatedAt` 排序渲染。`sessions` 初始化来自 `src/stores/slices/shared.ts` 的 `getInitialWorkbenchSessionState()`。

当前会话列表是否是真实数据：

不是数据库真实数据。默认来源是 `src/mocks/sessions.ts` 的 `mockSessions`，属于假数据 / 静态数据 / mock 数据。用户运行产生的新会话和消息只存在前端 Zustand + `sessionStorage`。

会话是否持久化：

有浏览器 `sessionStorage` 持久化；不存在数据库持久化。关键函数：

- `persistWorkbenchSessions(sessions, activeSessionId)`
- `getInitialWorkbenchSessionState()`
- `createDefaultSessions()`
- `normalizeWorkbenchSession()`

刷新后会话和消息是否丢失：

同一浏览器会话内刷新通常不会丢失，因为 `WORKBENCH_SESSIONS_SESSION_KEY = 'ai-agent-workbench-sessions'` 写入了 `sessionStorage`。但数据不是 DB 持久化，换设备、清理 storage、新浏览器会话会丢失。

新建会话逻辑：

- `src/components/layout/Sidebar.tsx`：`handleCreateSession()`
- `src/stores/slices/createSessionSlice.ts`：`createSession()`
- `src/stores/slices/shared.ts`：`createEmptySession()`、`createSessionId()`

切换会话逻辑：

- `Sidebar.handleSessionClick(sessionId)`
- `createSessionSlice.switchSession(sessionId)`
- `createSessionSlice.setCurrentSessionId(sessionId)`
- URL 同步由 `src/utils/urlState.ts` 的 `replaceWorkbenchUrl()` 处理

当前 session / conversation / message 的状态结构：

```ts
WorkbenchSession {
  id: string;
  title: string;
  updatedAt: number;
  messages: WorkbenchMessage[];
  taskId?: string;
  runsById: Record<string, RunSnapshot>;
  latestRunId?: string;
}

WorkbenchMessage {
  id: string;
  role: 'user' | 'assistant';
  kind: 'normal' | 'report' | 'partial' | 'error';
  content: string;
  createdAt: number;
  runId?: string;
}
```

是否有 conversationId / sessionId / runId：

- 有 `SessionId` 和 `WorkbenchSession.id`。
- 有 `RunSnapshot.sessionId`。
- 有 `WorkbenchMessage.runId`。
- 不存在单独命名的 `conversationId` 字段。
- 不存在数据库 conversation id。

是否有用户归属：

当前会话 / 消息 / Run 状态没有 `userId`、`ownerUserId`、`workspaceId`、`visibility` 字段。

是否区分 Mock 会话 / 真实 Agent 会话 / 示例会话：

不存在明确会话级区分。`RunSnapshot.mode` 可以区分单个 Run 是 `mock` 还是 `agent`，但 `WorkbenchSession` 本身没有 `mode`、`visibility`、`templateId`、`isDemo` 等字段。

当前默认会话列表是否是假数据：

是。`src/mocks/sessions.ts` 的 `mockSessions` 是默认会话列表。

当前示例会话是否会污染用户真实会话：

存在污染风险。`Sidebar.handleTaskClick()` 会把 provider 切换到 `mock`，然后调用 `startTask(taskId, prompt)`；`startTask()` 不创建新会话，而是在当前 `currentSessionId` 上运行 `runMockPrompt(prompt)`。如果用户正在真实 Agent 会话中点击示例任务，Mock 消息 / Mock Run 会进入同一个前端 session。

## 6. 消息系统现状

用户消息在哪里创建：

| 路径 | 函数 | 场景 |
| --- | --- | --- |
| `src/stores/slices/createGenerationSlice.ts` | `runMockPrompt()` | Mock 模式一次性创建 user + 空 assistant message |
| `src/stores/slices/createUiSlice.ts` | `runCurrentAgentAnalysis()` 调 `appendUserMessageToCurrentSession()` | 真实 Agent 模式 |
| `src/stores/slices/createSessionSlice.ts` | `appendUserMessageToCurrentSession()` | 通用追加 user message |

assistant 消息在哪里创建：

| 路径 | 函数 | 场景 |
| --- | --- | --- |
| `createGenerationSlice.runMockPrompt()` | 先创建空 assistant，再流式更新内容 | Mock 模式 |
| `createUiSlice.runCurrentAgentAnalysis()` | Run 结束后 `appendAssistantMessageToCurrentSession()` | 真实 Agent 模式 |
| `createGenerationSlice.generateReportForRun()` | 创建 `kind='report'` assistant message | 报告生成 |
| `createGenerationSlice.stopGenerating()` | 真实 Agent 停止时可能创建 `kind='partial'` assistant message | 停止生成 |

消息结构：

见 `src/types/workbench.ts` 的 `WorkbenchMessage`。关键字段是 `id`、`role`、`kind`、`content`、`createdAt`、`runId?`。

是否支持 Markdown：

支持 assistant Markdown。`src/components/chat/MessageBubble.tsx` 使用 `react-markdown` 和 `remark-gfm` 渲染 assistant 的字符串内容。用户消息只按普通文本渲染。

是否支持长文本：

数据结构上 `content: string` 可以存长文本。输入框有 `MAX_PROMPT_LENGTH = 2000`。渲染层没有长文本折叠、分页或虚拟滚动保护。

是否有消息分页 / 懒加载 / 虚拟滚动：

不存在。

是否有长文本折叠：

不存在。

是否有消息级状态：

| 状态 | 当前情况 |
| --- | --- |
| `pending` | 不存在消息级字段 |
| `streaming` | 不存在消息级字段；由全局 `generationStatus`、`assistantStream.status` 和 `activeAssistantMessageId` 推断 |
| `completed` | 不存在消息级字段；完成后仍是 `kind='normal'` |
| `failed` | 不存在消息级字段；有 `kind='error'` 类型，但当前主要失败展示来自 Run 状态 / error card |

是否有 client_message_id 或幂等字段：

不存在。消息 `id` 由 `createWorkbenchMessage()` 用 `Date.now()` + `Math.random()` 在前端生成，不具备跨端幂等能力。

刷新后消息是否恢复：

同一浏览器会话内可从 `sessionStorage` 恢复；不是数据库恢复。

是否存在一次性渲染大量消息导致卡顿风险：

存在。`ChatPanel` 对 `chatBlocks.map(...)` 一次性渲染，assistant Markdown 直接渲染，没有分页、虚拟滚动、Markdown memo 或折叠。

## 7. Agent Run 现状

当前一次 Agent Run 的结构：

`src/types/run.ts` 的 `RunSnapshot`：

```ts
RunSnapshot {
  id: string;
  sessionId?: string;
  mode: 'mock' | 'agent';
  status: 'idle' | 'pending' | 'running' | 'success' | 'error' | 'stopped';
  intent: 'capability_intro' | 'data_analysis' | 'unsupported' | 'unknown';
  prompt: string;
  plan?: RunPlanSnapshot;
  dataSource?: RunDataSourceSnapshot;
  steps: RunStep[];
  toolInvocations: RunToolInvocation[];
  sources?: RagSourceChunk[];
  chartData?: RunChartData;
  conclusion: string;
  conclusionSource: 'model' | 'fallback' | 'mock' | 'none';
  reportState: 'hidden' | 'pending' | 'generated' | 'skipped';
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  elapsedMs?: number;
  errorMessage?: string;
}
```

runId 从哪里生成：

| 场景 | 函数 |
| --- | --- |
| 前端通用 | `src/utils/run.ts` `createRunId(prefix)` |
| Mock | `createGenerationSlice.runMockPrompt()` 使用 `createRunId('mock_run')` |
| 真实 Agent 前端 | `createUiSlice.runCurrentAgentAnalysis()` 使用 `createRunId('agent_run')` |
| 真实 Agent stream API fallback | `api/agent/run/stream.ts` `createFallbackRunId()` |
| 服务端 stream fallback | `src/server/agent/streamAgentRun.ts` `createRunId()` |
| legacy `/api/agent/run` | `api/agent/run.ts` `createLegacyRunId()` 和 `src/server/agent/runAgent.ts` `createRunId()` |

Run Trace 数据在哪里存：

- 当前 Run Snapshot：Zustand `currentRun`。
- 当前会话历史 Run：`WorkbenchSession.runsById`。
- 浏览器持久化：`sessionStorage` 的 `ai-agent-workbench-sessions`。
- 原始事件：Zustand `runEventLog`，最多 200 条，不持久化。
- 数据库：不存在完整 Run Trace 持久化。

Run Event 数据结构：

`src/types/run.ts` 定义 `RunEvent` union：

- `run_started`
- `step_started`
- `step_completed`
- `tool_started`
- `tool_completed`
- `chart_ready`
- `conclusion_delta`
- `conclusion_completed`
- `report_pending`
- `run_completed`
- `run_failed`
- `run_stopped`

Run 和 message / conversation 是否绑定：

- message 通过 `WorkbenchMessage.runId` 绑定 Run。
- Run 通过 `RunSnapshot.sessionId` 间接绑定 `WorkbenchSession.id`。
- 不存在数据库 `conversationId`。
- 不绑定 `userId`。

Run 是否持久化到数据库：

不存在。只写入 `sessionStorage` 的前端会话状态。

Run 结束后是否有 completed / failed / stopped 状态：

有。前端统一状态是 `RunStatus = 'success' | 'error' | 'stopped'`，事件分别为 `run_completed`、`run_failed`、`run_stopped`。

真实 Agent 和 Mock Run 是否共用结构：

共用前端 `RunSnapshot` / `RunEvent`。但工具名称、RAG sources、步骤 ID 和数据来源不完全一致。

右侧 Run 面板的数据来源：

全部读取 `useWorkbenchStore((state) => state.currentRun)`：

- `RunOverviewCard`
- `AgentStepsCard`
- `DataSourceCard`
- `ToolInvocationsCard`
- `RagSourcesCard`
- `AnalyticsResultCard`
- `CurrentConclusionCard`

刷新后 Run Trace 是否丢失：

Run Snapshot 不一定丢，原始 Run Event Log 会丢。`currentRun` 会从当前 session 的 `latestRunId` 恢复，`runEventLog` 初始化为空。

`agent_run_usage` 当前是否只记录 quota usage：

是。`agent_run_usage` 字段为 `user_id`、`run_id`、`quota_type`、`status`、`started_at`、`finished_at`、`error_code`、`metadata`。当前 metadata 只写 endpoint/provider/quotaType 等，不包含完整 Run Trace、Tool 输入输出、消息、图表或报告。

如果要做完整 Run 持久化，当前缺少字段：

- `user_id`
- `conversation_id`
- `client_run_id`
- `server_run_id`
- `mode`
- `provider`
- `model_provider`
- `prompt`
- `status`
- `intent`
- `plan jsonb`
- `data_source_snapshot jsonb`
- `started_at`
- `completed_at`
- `elapsed_ms`
- `error_message`
- `conclusion`
- `conclusion_source`
- `report_state`
- `latest_event_seq`
- `metadata jsonb`

## 8. Tool Invocation 现状

当前工具：

| 工具 | 定义位置 | 当前状态 |
| --- | --- | --- |
| `schema_inspect` | `src/server/tools/schemaInspectTool.ts`、`src/utils/toolRegistryView.ts` | 服务端真实工具，已接入 |
| `query_table` | `src/server/tools/queryTableTool.ts`、`src/utils/toolRegistryView.ts` | 服务端真实工具，已接入 registry，但当前 stream Agent 主流程未调用 |
| `aggregate_table` | `src/server/tools/aggregateTableTool.ts`、`src/utils/toolRegistryView.ts` | 服务端真实工具，真实 Agent 主流程调用 |
| `chart_render` | `src/server/tools/chartRenderTool.ts`、`src/utils/toolRegistryView.ts` | 服务端真实工具，真实 Agent 主流程调用 |
| `knowledge_search` | `src/utils/toolRegistryView.ts`、`src/utils/mockRun.ts` | mock 工具，无真实 RAG |
| `report_generate` | `src/utils/toolRegistryView.ts`、`src/utils/report.ts` | 前端 mock 报告生成，不进入 Run Trace |
| `query_data` | `src/utils/mockRun.ts`、`src/utils/toolInvocationFormat.ts` | Mock Run 使用的旧式工具名，不是 server registry 工具 |

工具调用记录在哪里生成：

- Mock：`createGenerationSlice.runAgentStepsPreview()` 通过 `createMockToolInvocation()` + `tool_started/tool_completed` 生成。
- 真实 stream：`src/server/agent/streamAgentRun.ts` 的 `createTool()` 生成 `RunToolInvocation`，随后 emit `tool_started/tool_completed`。
- legacy non-stream：`src/server/agent/runAgent.ts` 生成 `AgentToolInvocationResult[]`，但当前前端主链路未使用 `runAgentAnalysis()`。

工具调用是否持久化：

只作为 `RunSnapshot.toolInvocations` 写入前端 `sessionStorage`。不存在数据库 `tool_invocations` 表。

右侧“工具调用”面板数据来源：

`src/components/layout/right-panel/ToolInvocationsCard.tsx` 读取 `currentRun?.toolInvocations ?? []`。

左侧“最近使用工具”是否真实：

不真实。`src/components/layout/Sidebar.tsx` 写死三个标签：知识库检索、数据分析、报告生成。

是否能从真实 tool invocation 统计最近工具：

当前只能从前端当前 session 的 `runsById[*].toolInvocations` 临时推导，不能跨会话 / 跨刷新持久统计到数据库。缺少 `tool_invocations` 表和统计接口。

工具调用字段覆盖情况：

| 字段 | 当前是否有 |
| --- | --- |
| `toolName` | 有 |
| `input` | 没有完整 input；只有 `inputSummary` 字符串 |
| `output summary` | 有 `outputSummary` |
| `status` | 有 |
| `startedAt` | Mock 和 stream `tool_started` 有；legacy result 没有 |
| `finishedAt` | 字段名是 `completedAt`，不是 `finishedAt` |
| `error` | 没有独立 `error` 字段；只有工具 `status='error'` 可表达，当前 reducer `tool_completed` 只设置 success |

当前工具调用信息是否只存在于前端状态或 Run Event 中：

是。真实服务端执行期间通过 SSE Run Event 传给前端；前端归并到 `RunSnapshot.toolInvocations`。数据库没有完整 tool invocation。

## 9. 报告 / Artifact 现状

当前报告确认按钮在哪里：

`src/components/chat/ConfirmActionCard.tsx`。`ChatBlockRenderer` 在 `report_confirm` block 时渲染它。

报告内容如何生成：

`src/stores/slices/createGenerationSlice.ts` 的 `generateReportForRun(runId)` 调用 `src/utils/report.ts` 的 `createRunReportMarkdown(run)`，基于当前 `RunSnapshot` 拼接 Markdown。

报告是否只是前端状态：

是。报告生成后作为一条 `WorkbenchMessage` 写回当前 session：

```ts
role: 'assistant'
kind: 'report'
content: createRunReportMarkdown(run)
runId
```

报告是否持久化：

只进入 `sessionStorage`。不存在数据库 `report_artifacts` 或 artifact 表。

刷新后报告是否丢失：

同一浏览器会话内通常不会丢，因为 report message 在 `sessions.messages` 中；但没有 DB，跨设备 / 清 storage 会丢。

是否已有 artifact / report 类型：

- 有消息级 `WorkbenchMessage.kind = 'report'`。
- 有 `RunReportState = 'hidden' | 'pending' | 'generated' | 'skipped'`。
- 不存在独立 `artifact` 类型和 artifact 表。

报告是否和 runId / conversationId 绑定：

- 绑定 `runId`。
- 通过 message 所在 `WorkbenchSession` 间接绑定 session。
- 不存在 `conversationId`。
- 不绑定 `userId`。

是否支持复制 / 下载 / 再编辑：

- 复制：支持。`ChatBlockRenderer` 的 message copy button 可复制任意 message content，包括 report。
- 下载：不存在。
- 再编辑：不存在。

如果要做 `report_artifacts` 表，需要迁移字段：

- `id`
- `user_id`
- `conversation_id`
- `run_id`
- `source_message_id`
- `title`
- `content_markdown`
- `status`
- `version`
- `created_at`
- `updated_at`
- `metadata`

## 10. 示例任务 / 示例会话现状

示例任务来自哪里：

`src/mocks/tasks.ts` 的 `mockTasks`。

是否是写死 UI：

任务数据是静态数组；UI 在 `src/components/layout/Sidebar.tsx` 中 map 渲染。属于假数据 / 静态数据 / mock 数据。

是否有 mock 数据文件：

有：

- `src/mocks/tasks.ts`
- `src/mocks/sessions.ts`
- `src/mocks/knowledgeSources.ts`
- `src/mocks/analytics.ts`

示例任务点击后会发生什么：

`Sidebar.handleTaskClick(taskId, prompt)`：

1. 如果当前不是 `mock` provider，调用 `setCurrentModelProvider('mock')`。
2. 调用 `startTask(taskId, prompt)`。
3. 更新 URL query。
4. `startTask()` 在当前 session 设置 `taskId`，然后调用 `runMockPrompt(prompt)`。

是否会创建真实会话：

不会。示例任务点击不会调用 `createSession()`。

是否会污染用户真实会话：

会有风险。示例任务直接向当前 session 写入 Mock 消息和 Mock Run，没有示例模板与用户会话的数据边界。

当前默认会话列表是否是假数据：

是，来自 `mockSessions`。

是否有“超长上下文示例”：

不存在。

是否有“RAG 检索示例”：

没有独立示例任务。Mock Run 内部包含 `knowledge_search` 步骤和 Mock sources，但没有单独的 RAG demo template。

是否适合改造成 demo templates：

适合。`mockTasks`、`mockSessions`、`createMockRagSources()` 都可以迁移为 seed template，但需要先设计模板表和复制机制。

当前示例任务和真实会话系统之间是否有数据边界：

不存在。当前所有前端会话共用同一个 `sessions` 数组。

## 11. 最近使用工具现状

左侧“最近使用工具”数据来源：

`src/components/layout/Sidebar.tsx` 第 211-218 行附近写死 JSX。

是否写死：

是。假数据 / 静态数据。

是否能从 `run_events` / `tool_invocations` 推导：

当前不存在数据库 `run_events` / `tool_invocations`。只能从前端 `sessions[*].runsById[*].toolInvocations` 临时推导，不适合作为真实最近工具。

当前是否有统计逻辑：

不存在。

是否有点击交互：

不存在。只是静态 `<span>` 标签。

是否有空状态：

不存在。

如果要真实化，需要新增：

- 表：`tool_invocations`
- 可选表：`agent_runs`、`run_events`
- API：读取当前用户最近工具统计
- Selector：按 `user_id + tool_name` 聚合最近时间和次数
- UI：空状态、最近时间、调用次数、点击后过滤 Run History 或打开工具详情

## 12. RAG 现状

逐项检查：

| 能力 | 当前情况 |
| --- | --- |
| knowledge source | `src/types/workbench.ts` 有 `KnowledgeSource` 类型；`src/mocks/knowledgeSources.ts` 有 mock 数据，但当前未接入真实链路 |
| document | 不存在真实 document 表或模型 |
| chunk | 只有 `RagSourceChunk` 展示类型，不存在真实 chunk 表 |
| embedding | 不存在 |
| vector search | 不存在 |
| `rag_search` tool | 不存在；当前工具名是 mock `knowledge_search` |
| retrieval logs | 不存在 |
| citation / source display | 有 UI 展示：`RagSourcesCard`；数据来自 `RunSnapshot.sources` |
| 右侧“检索来源”面板真实数据来源 | 没有真实来源；Mock Run 使用 `createMockRagSources()` |
| 相关 mock / placeholder | `src/utils/ragSources.ts`、`src/utils/toolRegistryView.ts` 的 `knowledge_search` |

当前不存在真实 RAG 链路。

当前只是占位展示，未接入真实检索数据。

## 13. 长会话 / 大文本性能现状

当前消息列表是否一次性渲染全部消息：

是。`src/components/chat/ChatPanel.tsx` 对 `chatBlocks.map(...)` 一次性渲染。

是否有分页：

不存在。

是否有虚拟滚动：

不存在。`package.json` 未见 `react-window`、`virtuoso` 等虚拟列表依赖。

是否有 Markdown memo：

不存在。`MessageBubble.tsx` 中 `MarkdownMessage` 不是 `React.memo`，也没有按 message id/content 做缓存。

是否有长文本折叠：

不存在。

是否有大 JSON 展示保护：

部分有摘要截断，但不是通用大 JSON 保护：

- `streamAgentRun.ts` 的 `stringifySummary()` 将工具 input summary 截到 180 字符。
- `toolInvocationFormat.ts` 展示层会截断 input/output。
- 不存在 JSON lazy expand。

超长会话是否可能卡顿：

可能。风险来自一次性渲染全部消息、每条 assistant Markdown 重新解析、Run Trace / Tool list 没有 lazy 展开、报告作为整段 Markdown message 渲染。

当前最容易卡顿的位置：

1. `ChatPanel` 的 `chatBlocks.map(...)`。
2. `MessageBubble` 的 `ReactMarkdown` 渲染长内容。
3. `buildChatBlocks()` 每次对当前 session 全量遍历并插入工具摘要 / 确认 block。
4. `ToolInvocationsCard` 和 `RagSourcesCard` 对当前 Run 全量 map。
5. 报告 message 作为普通 Markdown 一次性渲染。

如果要做“超长数据长会话示例”，现有结构风险：

- 大量 message 存进 `sessionStorage` 容易触达浏览器容量和序列化成本。
- 全量 `persistWorkbenchSessions()` 每次会写完整 sessions。
- 长 Markdown 每次 rerender 成本高。
- 没有最近 N 条加载策略。
- 没有 artifact 分离，报告和消息混在同一个数组。

推荐第一阶段避免卡顿：

- 消息分页
- 最近 N 条加载
- 长文本折叠
- Run Trace 摘要
- Markdown memo
- JSON lazy expand
- 虚拟滚动预留

第二阶段再上虚拟滚动、Run History lazy load、artifact 分离加载。

## 14. 权限归属与数据边界

当前会话 / 消息 / run 是否有 userId：

不存在。

是否有 ownerUserId：

不存在。

是否有 workspaceId：

不存在。

是否有 visibility：

不存在 `private` / `demo` / `system` 字段。

是否有 conversation owner / run owner / message owner：

不存在。只有 Supabase Auth 和 AgentAccessView 层有 `userId`，但 Workbench session/message/run 没有归属字段。

示例模板和用户会话是否隔离：

未隔离。示例任务直接写入当前前端 session。

当前 RLS 只覆盖哪些表：

`supabase/migrations/20260511_auth_quota.sql` 中 RLS 只覆盖：

- `profiles`
- `agent_run_quota`
- `agent_run_usage`

Policy 只允许用户 select 自己的记录；写入通过 service role RPC / trigger。

如果新增 conversations / messages / runs，需要怎样设计 RLS：

建议：

- 所有用户私有数据表必须有 `user_id uuid not null references auth.users(id)`。
- `conversations`：`select/insert/update/delete using user_id = auth.uid()`；demo/system template 不直接混在用户私有 conversation 表，或用单独 template 表。
- `messages`：通过 `user_id = auth.uid()`，并校验 `conversation_id` 属于当前用户；服务端写入可用 service role。
- `agent_runs`：`user_id = auth.uid()`；`conversation_id` 必须属于当前用户。
- `run_events` / `tool_invocations` / `report_artifacts`：通过 `user_id = auth.uid()` 或 join parent run/conversation 做归属校验。
- template 表：用 `visibility in ('demo','system')` 控制公开读；用户复制后生成 `private` conversation。

是否有删除策略 / 数据保留策略：

不存在。

真实 usage 是否应该随会话删除而删除：

不建议直接随会话删除 quota/audit usage。`agent_run_usage` 代表额度消耗和审计记录，应该保留；可以把 `conversation_id` / `run_id` 设为 nullable 或保留引用快照，用户删除会话时删除私有消息和 artifact，但 usage 作为审计记录保留。

## 15. 主要问题分级

P0：

- 会话 / 消息 / Run / Tool / Report 不存在数据库持久化，只在前端 `sessionStorage`。
- 左侧默认会话列表是假数据 / 静态数据 / mock 数据。
- 示例任务是假数据，且点击后直接写入当前会话，没有模板复制边界。
- Tool Invocation 没有数据库表，无法跨会话 / 跨设备统计。
- Report 不是 artifact，只是 `WorkbenchMessage.kind='report'`。
- `agent_run_usage` 不是完整 Run Trace，只是 quota usage。

P1：

- 最近使用工具是假数据 / 静态标签。
- 当前不存在真实 RAG 链路，右侧检索来源只是占位展示。
- 长会话可能卡顿，消息全量渲染且 Markdown 无 memo。
- Raw Run Event Log 刷新丢失。
- 示例模板和用户会话边界不清。
- Mock 和真实 Agent 的工具命名不完全一致：`query_data` vs `query_table/aggregate_table`。
- 当前会话 / 消息 / run 没有 userId / owner / visibility。

P2：

- 虚拟滚动。
- 多工作区 / workspaceId。
- Admin UI。
- Run History 检索。
- Token / Cost / Latency 面板。
- Three.js Agent Flow。
- 报告下载 / 再编辑 / 版本管理。

## 16. Step 53 设计建议

### 16.1 建议新增的表

| 表 | 作用 | 字段方向 |
| --- | --- | --- |
| `conversations` | 用户真实会话 | `id`、`user_id`、`title`、`summary`、`mode`、`status`、`visibility`、`source_template_id`、`latest_run_id`、`message_count`、`created_at`、`updated_at`、`archived_at` |
| `messages` | 会话消息 | `id`、`conversation_id`、`user_id`、`role`、`kind`、`content`、`run_id`、`client_message_id`、`status`、`created_at`、`metadata` |
| `agent_runs` | Run Snapshot | `id`、`conversation_id`、`user_id`、`mode`、`status`、`intent`、`prompt`、`plan`、`data_source_snapshot`、`conclusion`、`conclusion_source`、`report_state`、`started_at`、`completed_at`、`elapsed_ms`、`error_message`、`metadata` |
| `run_events` | 原始 Run Event | `id`、`run_id`、`conversation_id`、`user_id`、`seq`、`event_type`、`payload`、`created_at` |
| `tool_invocations` | 工具调用记录 | `id`、`run_id`、`conversation_id`、`user_id`、`tool_name`、`display_name`、`status`、`input`、`input_summary`、`output`、`output_summary`、`started_at`、`finished_at`、`elapsed_ms`、`error` |
| `report_artifacts` | 报告 artifact | `id`、`conversation_id`、`run_id`、`user_id`、`title`、`content_markdown`、`status`、`version`、`created_at`、`updated_at`、`metadata` |
| `demo_conversation_templates` | 示例会话模板 | `id`、`title`、`description`、`category`、`visibility`、`seed_messages`、`seed_runs`、`created_at`、`updated_at` |
| `demo_task_templates` | 示例任务模板 | `id`、`title`、`description`、`prompt`、`category`、`recommended_mode`、`sort_order`、`created_at`、`updated_at` |
| `knowledge_sources` | 知识源 | `id`、`user_id` 或 `visibility`、`name`、`type`、`status`、`created_at`、`updated_at` |
| `knowledge_documents` | 文档 | `id`、`source_id`、`user_id`、`title`、`uri`、`mime_type`、`status`、`metadata`、`created_at` |
| `knowledge_chunks` | 文档 chunk | `id`、`document_id`、`source_id`、`user_id`、`chunk_index`、`content`、`embedding`、`metadata`、`created_at` |
| `rag_retrieval_logs` | RAG 检索日志 | `id`、`run_id`、`conversation_id`、`user_id`、`query`、`top_k`、`results`、`latency_ms`、`created_at` |

### 16.2 哪些现有状态应该持久化

- 当前会话：`WorkbenchSession` 的 `title`、`updatedAt`、`taskId`、`latestRunId`。
- 消息列表：`WorkbenchMessage` 的 `role`、`kind`、`content`、`runId`、`createdAt`。
- Run Snapshot：`RunSnapshot` 的核心字段。
- Run Events：当前 `RunEvent` union 的原始 payload。
- Tool 调用记录：`RunToolInvocation`，并补齐完整 input/output/error。
- Chart 数据：`RunChartData`。
- Report Markdown：从 message 中拆出到 `report_artifacts`。
- RAG Sources：未来从 `rag_retrieval_logs` 和 chunks 派生，不应只放在 Run Snapshot。

### 16.3 哪些假数据应该改成 seed template

- 默认会话列表：`src/mocks/sessions.ts`。
- 示例任务：`src/mocks/tasks.ts`。
- 最近使用工具：先做空状态，后从 `tool_invocations` 统计；不要 seed 成“最近”。
- 超长上下文示例：新增 demo template，不直接塞入默认用户会话。
- RAG 示例：新增 demo task/template 和少量 seed documents/chunks。
- Mock RAG 来源：`createMockRagSources()` 可迁移为 demo template 的 seed retrieval result。

### 16.4 会话列表如何真实化

- 从 `conversations` 读取。
- 按 `updated_at desc` 排序。
- 展示 `title`、`summary`、`mode`、`status`、`updated_at`。
- 新建会话时写入数据库。
- 切换会话时加载最近 N 条 `messages` 和 latest `agent_run`。
- `sessionStorage` 可保留为短期 UI cache，但不能作为唯一持久化来源。

### 16.5 示例会话如何设计

示例模板不直接污染用户真实会话。

用户点击示例时，复制模板生成一条属于当前用户的 conversation。

建议流程：

```txt
读取 demo_task_templates / demo_conversation_templates
↓
用户点击示例
↓
服务端创建 private conversation
↓
复制 seed messages / seed run snapshot
↓
进入该用户 conversation
```

### 16.6 最近工具如何真实化

从 `tool_invocations` 按以下维度统计：

```txt
user_id
tool_name
recent time
count
```

建议接口返回：

- `tool_name`
- `display_name`
- `last_used_at`
- `usage_count`
- `last_run_id`
- `last_conversation_id`

### 16.7 RAG 最小闭环怎么接

第一版最小可演示：

- `knowledge_sources`
- `knowledge_documents`
- `knowledge_chunks`
- `rag_search` tool
- `rag_retrieval_logs`
- 右侧检索来源展示
- 回答引用来源

可以先做固定 seed 文档和服务端检索，不做完整企业知识库后台。检索可先用简单关键词 / pg_trgm / 小规模 embedding 之一，重点是完成“query -> chunks -> citations -> answer -> retrieval log -> UI”的闭环。

### 16.8 长会话性能如何分阶段做

第一阶段：

- 消息分页。
- 最近 N 条加载。
- 长文本折叠。
- Markdown memo。
- 大 JSON lazy expand。
- Run Trace 摘要。

第二阶段：

- 虚拟滚动。
- Run History lazy load。
- artifact 分离加载。
- 对 `sessionStorage` 写入做瘦身或完全迁移到 DB cache。

### 16.9 哪些改动必须小步进行

- 不要一次性重构全部 store。
- 不要一次性接完整 RAG。
- 不要直接删除所有 mock。
- 不要先做复杂 workspace。
- 不要先做 Admin UI。
- 不要先做 Three.js 3D Agent Flow。
- 不要把示例任务直接写进用户真实会话。
- 不要为了长会话示例直接塞超大 DOM。

## 17. 不建议马上做的事

- 不要马上做完整 RAG。
- 不要一次性重构全部 Zustand store。
- 不要直接把所有假数据删掉。
- 不要先做复杂 Workspace / 多租户。
- 不要先做 Admin UI。
- 不要先做 Three.js 3D Agent Flow。
- 不要把示例任务直接写进用户真实会话。
- 不要为了长会话示例直接塞超大 DOM。
- 不要把 `agent_run_usage` 直接改造成完整 Run 表；它更适合继续承担 quota/audit usage。
- 不要先做报告编辑器，先把 report artifact 持久化边界做清楚。

## 18. 推荐实施顺序

### Step 53：Workbench 数据持久化与示例体系设计

目标：完成 conversations / messages / runs / tools / reports / templates / RAG / 性能分阶段设计。

改动范围：文档、表结构设计、API 设计、前端迁移计划。

不做什么：不写完整业务实现，不接完整 RAG，不重构全部 store。

验收标准：设计文档明确表、接口、状态迁移、RLS、灰度步骤和回滚策略。

### Step 54：conversations / messages 持久化

目标：用户真实会话和消息写入数据库。

改动范围：Supabase migration、RLS、会话 / 消息 API、前端新建 / 发送 / 加载改造。

不做什么：不持久化完整 Run Trace，不做 RAG。

验收标准：登录用户刷新 / 新窗口打开后可恢复真实会话和消息；匿名或 mock demo 仍可运行。

### Step 55：真实会话列表与刷新恢复

目标：左侧会话列表从 `conversations` 读取。

改动范围：会话列表 API、加载态、空状态、按 `updated_at` 排序、切换会话加载 messages。

不做什么：不做复杂搜索 / 多工作区。

验收标准：默认假会话不再作为用户真实会话展示；用户自己的会话可跨刷新恢复。

### Step 56：demo templates / 示例会话复制机制

目标：示例任务模板化，点击后复制为当前用户私有 conversation。

改动范围：`demo_task_templates`、`demo_conversation_templates`、复制 API、左侧示例任务 UI。

不做什么：不把示例直接插入当前真实会话。

验收标准：示例模板和用户会话隔离；点击示例后生成新会话并归属当前用户。

### Step 57：agent_runs / run_events / tool_invocations / report_artifacts 持久化

目标：完整 Run Trace、工具调用和报告 artifact 入库。

改动范围：表、RLS、服务端写入、前端 Run Snapshot 恢复、报告生成保存。

不做什么：不做复杂 Run History 搜索，不做 token/cost 面板。

验收标准：真实 Agent Run 完成后，刷新可恢复 Run 概览、步骤、工具、图表、报告。

### Step 58：最近使用工具真实化

目标：左侧最近工具从真实 `tool_invocations` 统计。

改动范围：统计 API、selector、UI 空状态和最近工具展示。

不做什么：不做完整工具市场或工具配置后台。

验收标准：新用户显示空状态；运行工具后显示真实最近工具、最近时间和次数。

### Step 59：RAG 最小闭环

目标：完成最小检索闭环和来源引用展示。

改动范围：知识源 / 文档 / chunk / 检索日志表，`rag_search` tool，右侧来源展示，回答 citation。

不做什么：不做完整企业知识库后台、不做复杂权限分发、不做多租户。

验收标准：示例知识文档可被检索；回答展示引用；右侧来源来自真实 retrieval log。

### Step 60：长会话性能优化

目标：降低长会话、大 Markdown、大 Run Trace 的渲染和持久化压力。

改动范围：消息分页、最近 N 条加载、长文本折叠、Markdown memo、JSON lazy expand；预留虚拟滚动。

不做什么：不直接塞超大 DOM 做演示，不先上复杂 3D Flow。

验收标准：超长示例会话首屏加载稳定，滚动和输入不卡顿，Run Trace 可按需展开。

## 19. Git 状态

审计开始时运行：

```bash
git status --short
```

输出为空，表示工作区干净。

本文件生成后，实际 `git status --short` 输出为：

```txt
?? docs/
```

原因：`docs` 目录此前未被 Git 跟踪，Git short status 以目录形式折叠显示未跟踪内容。使用 `git status --short --untracked-files=all` 展开后只包含：

```txt
?? docs/STEP_53_PERSISTENCE_PRECHECK_REPORT.md
```
