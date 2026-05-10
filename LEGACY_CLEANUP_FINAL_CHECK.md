# Legacy Cleanup Final Check

## 1. 当前结论

清理后，前端主线已经基本收敛到单轨结构：

```txt
Session.messages
+ Session.runsById
+ latestRunId
+ currentRun
→ buildChatBlocks()
→ ChatPanel
→ RightPanel currentRun
```

本轮复查结论：

- `currentAgentRun` 已无代码引用。
- 旧 Mock UI 状态已无代码引用。
- 旧报告 action 和 `report_generated` / `report_skipped` 兼容事件已无代码引用。
- `ToolCallCard` 已无代码引用且文件已删除。
- `ChatPanel` 只通过 `buildChatBlocks` + `ChatBlockRenderer` 渲染会话时间线。
- `RightPanel` 只围绕 `currentRun` 展示，无 `currentAgentRun` fallback。
- Agent 前端主流程使用 `/api/agent/run/stream`。
- `src/services/agentRunApi.ts` 当前无调用，作为非流式 debug / 兼容 service 暂时保留。
- sessionStorage 已按 v2 结构校验，旧缓存不迁移。

## 2. 搜索检查结果

### currentAgentRun

命令：

```bash
rg "currentAgentRun|setCurrentAgentRun|clearCurrentAgentRun" src
```

结果：无代码引用。

结论：`currentAgentRun` 双状态源已清理完成。

### 旧 Mock UI 状态

命令：

```bash
rg "visibleToolCallIds|showKnowledgeSources|showAnalyticsResult|agentSteps|finalMessage|mockToolCalls|SUMMARY_MESSAGE_CONTENT" src
```

结果：无代码引用。

结论：旧 Mock UI 状态已清理完成。Mock 展示现在依赖 `currentRun`、RunEvent、ChatBlock 和 RightPanel。

### 旧报告确认逻辑

命令：

```bash
rg "confirmGenerateReport|cancelGenerateReport|report_generated|report_skipped|RunReportGeneratedEvent|RunReportSkippedEvent" src
```

结果：无代码引用。

结论：旧 currentRun-only 报告操作路径已清理完成。报告确认主线为：

```txt
report_pending
→ run.reportState = pending
→ ChatBlock report_confirm
→ ConfirmActionCard(run)
→ generateReportForRun(runId) / skipReportForRun(runId)
→ session.runsById[runId] 更新
```

### ToolCallCard

命令：

```bash
rg "ToolCallCard" src
```

结果：无代码引用。

结论：旧工具调用卡片路径已清理完成。聊天区工具摘要统一由 `ToolSummaryBlock` 渲染。

### agentRunApi

命令：

```bash
rg "agentRunApi|runAgentAnalysis" src
```

结果：

```txt
src/services/agentRunApi.ts:3:export async function runAgentAnalysis(...)
```

结论：`agentRunApi.ts` 当前没有调用方。它不是前端主流程依赖，建议暂时保留为非流式 debug / 兼容 service。

## 3. ChatPanel 主线检查

文件：`src/components/chat/ChatPanel.tsx`

当前结构：

```txt
sessions + currentSessionId + currentRun
→ currentSession
→ buildChatBlocks({ session: currentSession, currentRun })
→ chatBlocks.map(ChatBlockRenderer)
```

检查结果：

| 项目 | 结果 |
| --- | --- |
| 使用 `buildChatBlocks` | 是 |
| 使用 `ChatBlockRenderer` | 是 |
| 直接渲染 currentRun 工具摘要 | 否 |
| 直接渲染 currentAgentRun | 否 |
| 直接渲染旧 Mock tool cards | 否 |
| 直接判断 report_confirm | 否 |

仍保留的非 ChatBlock 内容：

- `generationStatus === 'error'` 的请求级错误兜底。
- `realModelNotice` 的模型不可用提示。

判断：这两项属于全局请求/模型状态，不是旧 Mock 卡片分支。可以暂时保留，后续如需更纯粹可迁移为 `system_notice` / `global_error` block。

## 4. ChatBlockRenderer 检查

文件：`src/components/chat/ChatBlockRenderer.tsx`

当前支持：

```txt
message
tool_summary
streaming_assistant
report_confirm
run_error
run_stopped
```

检查结果：

- `message` 根据 `message.role` 和 `message.kind` 渲染用户 / assistant / report / partial / error。
- `tool_summary` 渲染 `ToolSummaryBlock`。
- `streaming_assistant` 渲染 `StreamingAssistantBlock`。
- `report_confirm` 渲染 `ConfirmActionCard(run)`。
- `run_error` 渲染 `RunErrorBlock`。
- `run_stopped` 渲染 `RunStoppedBlock`。
- 使用 exhaustive switch，无旧 Mock / Agent UI 分支。

结论：ChatBlockRenderer 已是统一渲染入口。

## 5. RightPanel 主线检查

文件：

```txt
src/components/layout/RightPanel.tsx
src/components/layout/right-panel/*
```

检查结果：

| 组件 | 数据源 | 结论 |
| --- | --- | --- |
| `RunOverviewCard` | `currentRun` | 无旧 fallback |
| `AgentStepsCard` | `currentRun.steps` | 无旧 fallback |
| `DataSourceCard` | `currentRun` | 无旧 fallback |
| `ToolInvocationsCard` | `currentRun.toolInvocations` | 无旧 fallback |
| `RagSourcesCard` | `currentRun` | 无旧 fallback |
| `AnalyticsResultCard` | `currentRun.chartData` | 无旧 fallback |
| `CurrentConclusionCard` | `currentRun` | 无旧 fallback |

结论：RightPanel 已经只基于 `currentRun` 展示；无 Run 时展示空态。

## 6. Agent 前端主流程检查

### Stream 主流程

文件：

```txt
src/stores/slices/createUiSlice.ts
src/services/agentRunStreamApi.ts
```

当前流程：

```txt
runCurrentAgentAnalysis()
→ 生成 runId / requestId / AbortController
→ append user message(runId)
→ apply pending run_started
→ streamAgentRunAnalysis()
→ fetch('/api/agent/run/stream')
→ onEvent(applyRunEvent)
→ conclusion_completed 后写 assistant message(runId)
```

结论：Agent 前端主流程使用 `/api/agent/run/stream`。

### 非流式 service

文件：`src/services/agentRunApi.ts`

现状：

```txt
runAgentAnalysis()
→ fetch('/api/agent/run')
```

搜索结果显示无调用方。

结论：暂时保留为非流式 debug / 兼容 service；不属于主流程依赖。

## 7. Session / Run 主线检查

### WorkbenchMessage

文件：`src/types/workbench.ts`

结构包含：

```ts
kind: 'normal' | 'report' | 'partial' | 'error'
runId?: string
createdAt: number
```

结论：消息可以稳定绑定 Run。

### WorkbenchSession

文件：`src/types/workbench.ts`

结构包含：

```ts
messages: WorkbenchMessage[]
runsById: Record<string, RunSnapshot>
latestRunId?: string
```

结论：Session 已具备 Run 持久化和 latestRun 恢复能力。

### currentRun 持久化

文件：`src/stores/slices/createRunSlice.ts`

当前行为：

- `setCurrentRun(run)` 会写入 active session 的 `runsById`。
- `applyRunEvent(event)` 会更新 `currentRun` 并写入 active session。
- `run.sessionId` 缺失时补当前 session id。

结论：RunEvent 进入 `currentRun` 后会同步持久化到 session。

### 切换 / 刷新恢复

文件：`src/stores/slices/createSessionSlice.ts` 和 `src/stores/slices/shared.ts`

当前行为：

- 新建会话：`currentRun = null`。
- 切换会话：从目标 session 的 `latestRunId` 恢复 `currentRun`。
- hydrate：从匹配 session 的 `latestRunId` 恢复 `currentRun`。
- sessionStorage v2 读取时会校验 `messages/runsById/latestRunId`。
- 刷新时 `running/pending` Run 会 settle 为 `stopped`。

结论：Session / Run 主线符合当前单轨架构。

## 8. 暂时保留项

| 项目 | 保留原因 |
| --- | --- |
| `src/services/agentRunApi.ts` | 非流式 debug / 兼容 service，目前前端主流程不使用。 |
| `/api/agent/run` | 非流式 debug / curl 回归接口，不在本轮前端清理范围。 |
| `agentRunStatus` | ChatInput 发送/停止状态和 Agent 请求级状态仍依赖。 |
| `agentRunErrorMessage` | Agent 请求级错误提示仍依赖。 |
| `activeAgentRunRequestId` | SSE 旧请求防护必须保留。 |
| `activeAgentRunAbortController` | 停止生成 / 切换会话中断 stream 必须保留。 |
| `runEventLog` | 当前 UI 未消费，但可作为 RunEvent debug buffer 暂留。 |
| `assistantStream` | Mock/Groq 旧文本流逻辑仍用作当前 assistant 内容缓存。 |
| ChatPanel 请求级 error fallback | 处理未落入 `run_error` 的全局请求错误。 |
| `realModelNotice` | Groq 不可用回退 Mock 的用户提示。 |

## 9. 后续可选清理项

1. 标注 `agentRunApi.ts` 为非主流程 debug service，避免未来误用。
2. 如不计划做 RunEvent log 面板，可删除 `runEventLog`。
3. 如果 Mock/Groq 旧文本流逻辑后续全部迁移到 RunEvent，可继续收敛 `assistantStream`。
4. 可将 ChatPanel 的请求级 error fallback / `realModelNotice` 迁移成统一 `system_notice` 或 `global_error` ChatBlock。
5. 可补充一份最终 Demo 截图验收清单，覆盖 Mock / Agent / 多轮报告 / 刷新 / 切换会话。
