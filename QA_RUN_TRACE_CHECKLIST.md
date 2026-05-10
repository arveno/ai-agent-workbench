# Run Trace 状态矩阵验收清单

生成日期：2026-05-10

本清单用于 Step 16 验收当前 AI Agent Workbench 的 Run Trace 主链路。检查范围覆盖 Mock、Agent SSE、停止/中断、报告确认、图表、工具摘要和环境状态。

## 本次代码检查结论

- [x] `currentRun` 已作为右侧 Workspace Inspector 的主数据源。
- [x] Mock 模式会写入 `currentRun` 并通过 RunEvent 推进状态。
- [x] Agent 模式会消费 `/api/agent/run/stream` 并逐个应用 RunEvent。
- [x] 新建会话、切换会话、URL hydrate 会中断 Agent stream 并清理 `currentRun`。
- [x] `run_stopped` 会把 running step/tool 标记为 `stopped`。
- [x] 报告确认基于 `currentRun.reportState` 和 `data_analysis + success` 条件。
- [x] 右侧图表只在存在有效 `currentRun.chartData` 时渲染。
- [x] 工具调用展示使用 formatter，避免直接展示完整 JSON。
- [x] 环境状态组件只读取 `/api/health`，不影响发送流程。
- [x] 已修复 Agent 流式运行时工具摘要可能插入上一轮 assistant 消息前的展示问题。

## 1. 新会话空态

操作：

```txt
点击新建会话
```

预期：

- [ ] 聊天区为空。
- [ ] 右侧 Run 概览显示“暂无 Run”。
- [ ] 执行步骤显示“暂无执行步骤”。
- [ ] 数据源显示“尚未访问数据源”。
- [ ] 工具调用显示“暂无工具调用”。
- [ ] 数据分析结果显示“暂无分析结果”。
- [ ] 当前结论显示“暂无结论”。
- [ ] 没有报告确认。
- [ ] 输入框可输入。

代码检查：

- [x] `createSession()` 会清理 `currentRun`、`runEventLog`、`currentAgentRun`、`activeAgentRunRequestId`、`activeAgentRunAbortController`。
- [x] `RightPanel` 各卡片在 `currentRun === null` 时显示空态。

## 2. Mock 模式 running

操作：

```txt
切换 Mock 模式
输入：分析本月教学质量数据
点击发送
```

预期：

- [ ] user 消息立即出现。
- [ ] 输入框立即清空。
- [ ] 发送按钮变停止按钮。
- [ ] 聊天区显示 Mock 流式内容。
- [ ] 右侧 Run 概览显示 Mock 演示 / 运行中。
- [ ] 右侧执行步骤开始推进。
- [ ] 右侧工具调用开始出现。
- [ ] 右侧不再空态。

代码检查：

- [x] Mock 分支调用 `createMockRunStartedEvent()` 并写入 `currentRun`。
- [x] Mock 预览步骤通过 `applyRunEvent()` 推进 step/tool/chart/conclusion。
- [x] `ChatInput` 会在 Mock `generationStatus === 'streaming'` 时显示停止按钮。

## 3. Mock 模式 success

预期：

- [ ] 聊天区显示工具摘要和结论。
- [ ] 右侧状态为已完成。
- [ ] 右侧图表正常显示。
- [ ] 右侧结论显示 Mock 生成。
- [ ] 报告确认显示。

代码检查：

- [x] Mock 完成后会发送 `conclusion_completed`、`report_pending`、`run_completed`。
- [x] `shouldShowReportConfirm(currentRun)` 可在 Mock `data_analysis + success + pending` 时显示确认区。
- [x] Mock `chart_ready` 写入统一 `RunChartData`。

## 4. Mock 模式 stopped

操作：

```txt
Mock 生成中点击停止
```

预期：

- [ ] 发送按钮恢复。
- [ ] `currentRun.status = stopped`。
- [ ] 右侧显示已停止。
- [ ] running step/tool 标记为已停止。
- [ ] 不再继续追加内容。

代码检查：

- [x] `stopGenerating()` 在 Mock running 时发送 `run_stopped`。
- [x] reducer 会将 running step/tool 标记为 `stopped`。

## 5. Agent capability_intro

操作：

```txt
Groq / Agent 模式
输入：你能做什么
点击发送
```

预期：

- [ ] 调用 stream API。
- [ ] 不出现工具调用。
- [ ] 不出现图表。
- [ ] 不出现报告确认。
- [ ] 聊天区显示能力说明。
- [ ] 右侧 Run 概览显示真实 Agent / 能力说明 / 已完成。
- [ ] 数据源显示本次未访问数据源。
- [ ] 工具显示本次未调用工具。
- [ ] 图表显示未生成分析结果。

代码检查：

- [x] Agent 发送调用 `streamAgentRunAnalysis()`。
- [x] `report_pending` 仅由后端 data_analysis 流程发送，前端确认区只看 `currentRun.reportState`。
- [x] 右侧数据源、工具、图表卡片在无工具/无 chartData 时显示空态。

## 6. Agent data_analysis

操作：

```txt
输入：分析 2026 年 5 月教学质量数据，找出异常指标
点击发送
```

预期：

- [ ] user 消息立即出现。
- [ ] 输入框立即清空。
- [ ] 发送按钮变停止按钮。
- [ ] 右侧进入 running。
- [ ] 工具调用逐步出现。
- [ ] 图表最终显示 ECharts。
- [ ] 结论流式出现。
- [ ] 完成后 assistant 最终消息写入会话。
- [ ] 报告确认出现。
- [ ] 结论不引用非 2026 年 5 月数据。

代码检查：

- [x] 前端对每个 `RunEvent` 调用 `applyRunEvent()`。
- [x] `conclusion_delta` 会更新 `currentRun.conclusion`，ChatPanel 显示非持久 streaming 气泡。
- [x] `conclusion_completed` 后只追加一次最终 assistant 消息。
- [x] 运行中的 Agent 工具摘要固定显示在当前 streaming 气泡前，不再依赖上一轮 active assistant。
- [x] Step 10 已在服务端把时间范围、指标和维度约束传入受控工具。

## 7. Agent unsupported

操作：

```txt
输入：帮我写一首诗
点击发送
```

预期：

- [ ] 不出现工具调用。
- [ ] 不出现图表。
- [ ] 不出现报告确认。
- [ ] 聊天区显示暂不支持说明。
- [ ] 右侧显示暂不支持 Run。

代码检查：

- [x] 前端不做 intent 分流，完全使用后端 RunEvent。
- [x] 无工具、无 chartData 时右侧会显示空态，不残留上一轮数据。

## 8. Agent stopped

操作：

```txt
Agent 流式运行中点击停止
```

预期：

- [ ] 请求被 abort。
- [ ] 发送按钮恢复。
- [ ] Run 状态为 stopped。
- [ ] 右侧 running step/tool 变 stopped。
- [ ] 不显示普通错误。
- [ ] 部分结论如果存在则保留并标记已停止。
- [ ] 不会继续追加最终消息。

代码检查：

- [x] `stopGenerating()` 会 abort `activeAgentRunAbortController`。
- [x] `stopGenerating()` 会清理 `activeAgentRunRequestId`，旧 stream 事件无法继续写入当前页面。
- [x] AbortError 不按普通错误处理。
- [x] 如已有 partial conclusion，会追加带“已停止生成”提示的 assistant 消息。

## 9. Agent error

操作：

```txt
可以通过临时断开数据源或使用错误环境测试
```

预期：

- [ ] Run 状态为 error。
- [ ] 右侧显示错误。
- [ ] 聊天区不追加假结论。
- [ ] 输入框可继续输入。

代码检查：

- [x] `run_failed` 会设置 `currentRun.status = error` 和 `errorMessage`。
- [x] `run_failed` 分支不会追加 assistant 假消息。
- [x] `CurrentConclusionCard` 会展示错误文案。

## 10. 会话切换

操作：

```txt
Agent 运行中切换会话 / 新建会话
```

预期：

- [ ] 旧 stream 被中断。
- [ ] 旧事件不污染新会话。
- [ ] 新会话右侧为空态。
- [ ] 不会把旧 assistant 消息追加到新会话。

代码检查：

- [x] `createSession()`、`switchSession()`、`hydrateFromUrl()` 都会 abort 当前 Agent stream。
- [x] Agent stream 事件处理同时校验 `activeAgentRunRequestId` 与 `currentSessionId`。

## 11. 报告确认

预期：

- [ ] 仅 data_analysis success 后显示。
- [ ] capability_intro 不显示。
- [ ] unsupported 不显示。
- [ ] Agent error 不显示。
- [ ] stopped 不显示。
- [ ] 新会话无 Run 不显示。

代码检查：

- [x] `shouldShowReportConfirm()` 只基于 `currentRun.intent === 'data_analysis'`、`status === 'success'`、`conclusion`、`reportState === 'pending'`。
- [x] `ConfirmActionCard` 生成报告后发送 `report_generated`，跳过时发送 `report_skipped`。

## 12. 图表展示

预期：

- [ ] 有有效 `chartData` 时显示 ECharts。
- [ ] 无 `chartData` 时显示空态。
- [ ] running 时显示等待数据分析结果。
- [ ] stopped/error 时显示对应空态。

代码检查：

- [x] `AnalyticsResultCard` 使用 `isValidRunChartData(currentRun.chartData)` 控制图表渲染。
- [x] Mock 和 Agent 都映射到统一 `RunChartData`。

## 13. 工具卡片不显示 JSON

预期：

- [ ] 聊天区工具卡片不显示完整 JSON。
- [ ] 右侧工具调用不显示完整 JSON。
- [ ] 长文本换行正常。

代码检查：

- [x] `ToolCallCard` 使用 `formatToolInvocationForChat()`。
- [x] Agent 聊天区工具摘要使用 `formatToolInvocationForChat()`。
- [x] 右侧 `ToolInvocationsCard` 使用 `formatToolInvocationForInspector()`。

## 14. 环境状态

预期：

- [ ] 环境状态显示正常。
- [ ] `/api/health` 失败不会阻塞页面。
- [ ] 环境状态不影响 Mock / Agent 发送。

代码检查：

- [x] `EnvironmentStatus` 独立请求 `/api/health`。
- [x] 环境状态未写入发送流程和 Run 状态机。

## 工程校验

- [x] `pnpm exec tsc --noEmit` 通过。
- [x] `pnpm build` 通过。

## 待人工确认说明

以上带 `[ ]` 的项目需要在浏览器中按步骤操作确认，尤其是视觉位置、按钮状态、流式过程和真实数据源返回内容。代码检查项已覆盖状态清理、事件应用、确认区条件、停止中断、工具 formatter 和右侧空态逻辑。
