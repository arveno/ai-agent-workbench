# AI Agent Workbench ID Contract

本文档是核心对象与 ID 契约。后续涉及 conversation / message / run / event / tool / source / report / usage / evaluation 的修改，必须先对齐本文。Source / retrieval 细则见 `docs/source-lineage.md`。

## 1. 核心原则

- canonical `runId` 只指 DB `agent_runs.id`。
- `clientRunId` 只用于前端 pending、请求幂等和 `run_reused`。
- `displayRunId` 只用于 UI 展示。
- `canonicalRunId` 是已退出的历史迁移字段，禁止回归。
- `runtimeRunId` / `runtime_run_id` 是旧命名，禁止进入当前运行时代码。
- 所有执行后资产必须绑定 canonical `runId`。
- LangGraph checkpoint / thread / node id 和 LangSmith trace / run id 只能作为外部观测或恢复 ID，不替代 canonical `runId` 或任何业务主外键。
- 组件和业务 UI 不得自行判断 ID 格式。
- 不保留 `idA || idB` 类型兜底作为常态逻辑。

## 2. ID 定义

| ID | 定义 | 生成位置 | 是否持久化 | 主关系 / 外键 | UI 展示 | 幂等 | 禁止用途 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `conversationId` | 会话主 ID，对应 `conversations.id`。 | 后端创建 conversation；匿名本地模式可由前端创建临时 session id。 | 是 | 绑定 messages / runs / reports。 | 可以 | 不建议 | 禁止把匿名临时 id 当作已持久化 conversation。 |
| `sessionId` | 前端工作区会话 ID，可能等于 `conversationId`，也可能是本地临时 `s_...`。 | 前端 store。 | 匿名模式可进入 sessionStorage。 | 否 | 可以 | 否 | 禁止作为 DB 外键。 |
| `messageId` | 消息主 ID。DB 消息对应 `messages.id`，UI 消息可能使用临时 id。 | 后端 DB 或前端创建。 | 是 | DB `messages.id` 可以。 | 可以 | 否 | 禁止把前端临时 id 当作 DB 主键。 |
| `clientMessageId` | 前端消息幂等 ID。 | 前端创建 message 时生成。 | 是，写入 `messages.client_message_id`。 | 否 | 调试可见 | 是 | 禁止作为 message -> run 或 message -> conversation 主关系。 |
| `runId` | Agent Run canonical ID，只能指 DB `agent_runs.id`。 | 后端创建 `agent_runs` 时生成。 | 是 | run 相关对象主关系。 | 可以，通常展示短格式。 | 否 | 禁止指代 `clientRunId` 或 `runtimeRunId`。 |
| `clientRunId` | 前端创建 run 前生成的请求幂等 / pending key。 | 前端发起 run 时生成。 | 可写入 `agent_runs.client_run_id`。 | 否 | 仅调试或 pending 可见。 | 是 | 禁止作为 run_events / messages / reports / usage 主外键。 |
| `displayRunId` | UI 展示用短 ID。 | mapper / ViewModel 生成。 | 否 | 否 | 是 | 否 | 禁止参与持久化、查询、外键、幂等。 |
| `canonicalRunId` | 历史迁移字段，已退出当前运行时代码。 | 不再生成。 | 否 | 否 | 否 | 否 | 禁止回归为字段、兜底链或业务逻辑依赖。 |
| `runtimeRunId` | 旧命名，已退出当前运行时代码。 | 不再生成。 | 否 | 否 | 否 | 否 | 禁止恢复为字段、metadata fallback、幂等字段或业务关系。 |
| `usageId` | 用量记录 ID，对应 `agent_run_usage.id`。 | 后端 quota / stream 链路。 | 是 | `agent_runs.usage_id` 可绑定它。 | 可以 | 部分 | 禁止用旧 runtime ID 作为 usage 的 run 关系。 |
| `reportId` | Report Artifact ID，对应 `report_artifacts.id`。 | 后端 report 函数。 | 是 | report 自身主键；report -> run 必须靠 canonical `runId`。 | 可以 | 否 | 禁止通过 `metadata.runtimeRunId` 绑定 run。 |
| `sourceId` / `retrievalId` | Source 或 RAG retrieval 的 lineage ID。 | RAG 工具、retrieval log 或 mapper。 | 是 | 绑定 canonical `runId`、conversationId、toolInvocationId。 | 可以 | 否 | 禁止只把 source 当展示数组而无 lineage。 |
| `evaluationId` / `caseId` | Evaluation result / case ID。 | Evaluation 后端 / DB。 | 是 | `eval_results.run_id` 绑定 canonical `runId`；`case_id` 绑定 case。 | 可以 | 否 | 禁止在 ID 双轨未清理时扩展 Evaluation。 |
| `langGraphThreadId` / `langGraphCheckpointId` / `langGraphNodeId` / `langSmithTraceId` / `langSmithRunId` | 外部 runtime / observability ID。 | LangGraph / LangSmith。 | 可进入 metadata；如需查询或恢复能力，必须先通过文档和 migration 增加专用字段。 | 否，不能替代业务主关系。 | 调试可见 | 否 | 禁止作为 messages / reports / sources / usage / evaluation 主外键。 |

## 2.1 外部 Runtime ID 边界

LangGraph / LangSmith 外部 ID 的长期边界：

- `agent_runs.id` 仍是 Agent Run canonical `runId`。
- LangGraph thread / checkpoint / node id 可以记录在 `agent_runs.metadata`、`run_events.payload` 或调试 metadata 中，用于恢复、排障和外部 trace 对齐。
- LangSmith trace / run id 可以记录在 run / event / evaluation metadata 中，用于跳转、上报状态和外部观测。
- 如果需要按外部 ID 查询、恢复或建立唯一约束，必须先更新本文档并新增数据库 migration，不能临时用 metadata 字符串扫描替代正式字段。
- 外部 ID 不能进入 `messages.run_id`、`report_artifacts.run_id`、`run_sources.run_id`、`retrieval_logs.run_id`、`tool_invocations.run_id`、`agent_run_usage.run_id` 或 `eval_results.run_id`。
- 外部 ID 不能作为 `clientRunId`、`displayRunId`、`runtimeRunId` 或 `canonicalRunId` 的兼容兜底。

## 3. Run ID 契约

```ts
type RunSnapshot = {
  id: string              // DB agent_runs.id，canonical runId
  clientRunId?: string    // pending / idempotency
  displayRunId?: string   // UI only
}
```

要求：

- `currentRun.id` 和 `RunSnapshot.id` 语义是 canonical `runId`。
- `runsById` 的 key 语义是 canonical `runId`。
- `clientRunId` 只能留在 service / store 边界层处理 pending 和幂等。
- `displayRunId` 不进入持久化、查询或主外键。
- LangGraph / LangSmith 外部 ID 不进入业务主外键。
- `canonicalRunId` 不属于当前字段。
- `runtimeRunId` / `runtime_run_id` 不属于当前运行时字段。

禁止恢复：

- `RunSnapshot.canonicalRunId`。
- `metadata.canonicalRunId`。
- `metadata.runtimeRunId` 读取或写入。
- `canonicalRunId || runtimeRunId || id` 兜底链。
- SSE payload 中的 `runtimeRunId`。
- 组件层根据 ID 格式判断语义。

## 4. 对象绑定表

| 关系 | 契约 |
| --- | --- |
| conversation -> message | `messages.conversation_id -> conversations.id` |
| message -> run | `messages.run_id -> agent_runs.id` |
| run -> run_events | `run_events.run_id -> agent_runs.id` |
| run -> tool_invocations | `tool_invocations.run_id -> agent_runs.id` |
| run -> report | `report_artifacts.run_id -> agent_runs.id` |
| run -> usage | `agent_runs.usage_id -> agent_run_usage.id`；如保留 `agent_run_usage.run_id`，必须写 `agent_runs.id`。 |
| run -> source / retrieval | 绑定 `agent_runs.id`、conversationId、toolInvocationId / sourceId，细则见 `docs/source-lineage.md`。 |
| run -> evaluation | `eval_results.run_id -> agent_runs.id`。 |

`clientMessageId` 只用于消息幂等，`clientRunId` 只用于 run pending / idempotency。二者都不能成为已持久化业务主关系。

## 5. Live 与 Refresh 契约

Live path：

```text
前端生成 clientRunId
  -> 请求发送 clientRunId
  -> 后端创建 agent_runs.id
  -> SSE run_started 返回 DB runId
  -> 前端将 pending run 收敛到 canonical runId
  -> 后续 events / tools / messages / report / usage 使用 canonical runId
```

Refresh path：

```text
/workbench-runs 恢复 agent_runs.id
  -> runPersistenceMapper 生成 RunSnapshot.id = agent_runs.id
  -> live 与 refresh 的 currentRun.id 语义一致
```

live run 和 refresh run 不能因为入口不同而产生不同的 `currentRun.id` 语义。

## 6. 允许边界

允许：

- service / store 边界层为 pending run 使用 `clientRunId`。
- 后端用 `client_run_id` 处理 idempotency / duplicate run / `run_reused`。
- UI 使用 `displayRunId`。
- debug 面板展示 `clientRunId`。

## 7. 禁止写法

禁止：

- `runtimeRunId ?? id` 作为主 ID。
- `metadata.runtimeRunId || run_id`。
- `canonicalRunId || runtimeRunId || id`。
- `clientRunId || runId` 写入持久化主关系。
- component 判断 UUID 格式。
- component 读取 `runtimeRunId` 做业务关系。
- 新代码新增 `runtimeRunId` 兜底。
- 把 DB `runId` 写进 `runtimeRunId` 字段。
- 新 report 写 `run_id = null`。
- 新 usage 写旧 runtime ID。
- 多处 mapper 各自处理 `runId` fallback。

## 8. 验收扫描

代码任务涉及 ID 时必须检查：

- live run 和 refresh run 的 `currentRun.id` 都指向 `agent_runs.id`。
- `clientRunId` 独立存在，只用于 pending / idempotency。
- `displayRunId` 独立存在，只用于 UI。
- `canonicalRunId` 没有回归为运行时字段。
- `runtimeRunId` / `metadata.runtimeRunId` 不出现在当前运行时代码。
- 新 message / report / usage 不把 runtime ID 当主关系。
- Run Trace / Run Overview / Report / assistant message 对同一 run 使用同一个 canonical ID。
- source / retrieval 绑定遵守 `docs/source-lineage.md`。
- Evaluation 未在 ID 双轨风险下被扩展。

建议扫描关键词：

```text
canonicalRunId
runtimeRunId
runtime_run_id
metadata.runtimeRunId
clientRunId ||
|| clientRunId
|| runtimeRunId
|| canonicalRunId
run_id: null
```
