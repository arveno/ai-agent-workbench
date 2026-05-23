# AI Agent Workbench ID Contract

本文档冻结 AI Agent Workbench 的核心对象与 ID 契约。后续涉及 Run、Trace、Report、Source、Usage、Evaluation 的代码修改，都必须先对齐本文。Source / RAG Lineage 的对象语义和数据流详见 `docs/source-lineage.md`。若 ID 契约本身需要调整，必须先更新并提交本文，再进入代码治理。

## 1. 文档定位

本文是 AI Agent Workbench 的核心对象与 ID 契约文档。

它服务于 `docs/agent-run-lifecycle.md`，用于约束 conversation / message / run / event / tool / source / report / usage / evaluation 的 ID 语义。source / retrieval 的 lineage 细则见 `docs/source-lineage.md`。

后续所有涉及 Run、Trace、Report、Source、Usage、Evaluation 的代码修改，都必须先对齐本文，再进入类型、mapper、service、store、component 或后端函数修改。

## 2. 当前问题摘要

当前最大风险是 canonical `runId` 已收敛后发生回归，以及旧 `runtimeRunId` 命名被再次恢复：

- `canonicalRunId` 已完成 runtime 代码清理，不再作为当前迁移字段使用，后续只作为历史迁移字段和禁止回归项。
- `runId` / `clientRunId` 的语义必须防止重新混用。
- `message.runId`、DB `messages.run_id`、`report_artifacts.run_id` 和 usage 关联必须只使用 DB `runId`。
- `clientRunId` / `client_run_id` 承担 pending / idempotency / `run_reused`。
- Source / RAG lineage 的 source / retrieval 主关系必须绑定 canonical `runId`，细则见 `docs/source-lineage.md`。
- Evaluation 如果现在继续推进，会继承并固化 ID 双轨问题。

这些问题会影响 Run Trace、Run Overview、Report、Source、Usage、Evaluation 对同一 Agent Run 的一致理解。

## 3. 核心原则

1. canonical `runId` = DB `agent_runs.id`，长期唯一主身份是 `RunSnapshot.id` / `agent_runs.id`。
2. `clientRunId` = 前端请求幂等 / pending key，不作为主外键。
3. `canonicalRunId` = 已完成 runtime 代码清理的历史迁移字段，不是当前迁移字段，禁止回归。
4. `runtimeRunId` = 旧命名，不再进入当前运行时代码。
5. 如果需要展示短 ID，使用 `displayRunId`。
6. 不保留 `metadata.runtimeRunId` 读取或写入 fallback。
7. 所有执行后资产必须绑定 canonical `runId`。
8. 所有 `idA || idB` 类型兜底不得进入当前运行时代码。
9. 组件和业务 UI 不得自行判断 ID 格式。

## 4. 无历史包袱与单轨目标

本项目没有需要长期兼容的大规模历史数据包袱。`canonicalRunId` 已完成 runtime 代码清理，不能回归为业务模型字段；`runtimeRunId` / `runtime_run_id` 是旧命名，不再进入当前运行时代码。

迁移完成后，业务主链路必须回到单轨字段语义：

- `RunSnapshot.id` 是 canonical `runId`，对应 DB `agent_runs.id`。
- `clientRunId` 只服务 pending / idempotency / `run_reused`。
- `displayRunId` 只服务 UI 展示。
- `canonicalRunId` 不属于长期目标字段。
- `runtimeRunId` / `runtime_run_id` 不属于当前运行时字段。

禁止长期保留 `idA || idB` 兜底作为常态逻辑。任何兜底必须说明原因、所在层级和删除条件；无法说明删除条件的兜底不得进入新代码。

## 5. ID 定义表

| ID | 定义 | 生成位置 | 是否持久化 | 可作为外键 / 主关系 | 可用于 UI 展示 | 可用于幂等 | 可用于兼容查询 | 禁止用途 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `conversationId` | 会话主 ID，持久化会话时对应 `conversations.id`。 | 后端创建 conversation；匿名本地模式可由前端创建临时 session id。 | 是 | 是，绑定 messages / runs / reports。 | 可以 | 不建议 | 可以 | 禁止把匿名本地 session id 当作已持久化 conversation 关系。 |
| `sessionId` | 前端工作区会话 ID，可能等于 `conversationId`，也可能是本地临时 `s_...`。 | 前端 store。 | 匿名模式可进入 sessionStorage。 | 否 | 可以 | 否 | 可以 | 禁止作为 DB 外键。 |
| `messageId` | 消息主 ID。DB 消息对应 `messages.id`，UI 消息当前可能使用 client message id。 | 后端 DB 或前端创建消息。 | 是 | DB `messages.id` 可以；前端临时 id 不可以。 | 可以 | 否 | 可以 | 禁止把前端临时 message id 当作 DB 主键。 |
| `clientMessageId` | 前端消息幂等 ID。 | 前端创建 message 时生成。 | 是，写入 `messages.client_message_id`。 | 否 | 不作为主展示 ID；可用于调试。 | 是 | 可以 | 禁止作为 message -> run 或 message -> conversation 主关系。 |
| `runId` | Agent Run canonical ID，只能指 DB `agent_runs.id`。 | 后端创建 `agent_runs` 时生成。 | 是 | 是，是 run 相关对象主关系。 | 可以，通常展示短格式。 | 否 | 是 | 禁止指代 `clientRunId` 或 `runtimeRunId`。 |
| `canonicalRunId` | 历史迁移字段，曾用于 `RunSnapshot.id` 语义未稳定时承载 DB `agent_runs.id`。 | 已完成 runtime 代码清理。 | 否，不应作为当前字段恢复。 | 否，主关系必须直接使用 `runId` / `RunSnapshot.id`。 | 否 | 否 | 否 | 禁止回归为新字段、兜底链或业务逻辑依赖。 |
| `clientRunId` | 前端创建 run 前生成的请求幂等 / pending key。 | 前端发起 run 时生成。 | 可以写入 `agent_runs.client_run_id` 或 metadata。 | 否 | 仅调试或 pending 状态可见。 | 是 | 否 | 禁止作为 run_events / messages / reports / usage 的主外键；禁止用于已持久化 run 的业务关系。 |
| `runtimeRunId` | 旧命名，已退出当前运行时代码。 | 历史迁移记录。 | 否；历史 migration 中可能出现 `runtime_run_id`。 | 否 | 否 | 否 | 否 | 禁止恢复为字段、metadata fallback、幂等字段或业务关系。 |
| `displayRunId` | UI 展示用短 ID。 | mapper / ViewModel 生成。 | 否 | 否 | 是 | 否 | 否 | 禁止参与持久化、查询、外键、幂等。 |
| `usageId` | 用量记录 ID，对应 `agent_run_usage.id`。 | 后端 quota / stream 链路。 | 是 | `agent_runs.usage_id` 可以绑定它。 | 可以 | 部分 | 可以 | 禁止用 `agent_run_usage.run_id` 保存 runtime ID 作为新主关系。 |
| `reportId` | Report Artifact ID，对应 `report_artifacts.id`。 | 后端 report 函数。 | 是 | 是，report 自身主键；report -> run 必须靠 canonical `runId`。 | 可以 | 否 | 可以 | 禁止 report 通过 `metadata.runtimeRunId` 绑定 run。 |
| `sourceId` / `retrievalId` | Source 或 RAG retrieval 的 lineage ID。 | RAG 工具、retrieval log 或 mapper。 | 目标状态应持久化。 | 是，应绑定 canonical `runId`、conversationId、toolInvocationId。 | 可以 | 否 | 可以 | 禁止只把 source 当作展示数组而无 lineage。 |
| `evaluationId` / `caseId` | Evaluation result / case ID。 | Evaluation 后端 / DB。 | 是 | `eval_results.run_id` 必须绑定 canonical `runId`；`case_id` 绑定 case。 | 可以 | 否 | 可以 | 禁止在当前 ID 双轨未治理前继续扩展 Evaluation。 |

## 6. Run ID 契约

- `runId`：只能指 DB `agent_runs.id`。
- `clientRunId`：前端创建 run 前生成，用于 pending 状态、请求幂等、断线前临时关联。
- `canonicalRunId`：历史迁移字段，已完成 runtime 代码清理，不再作为当前迁移字段使用。
- `runtimeRunId`：旧命名，不再进入当前运行时代码。
- `displayRunId`：UI 展示用，可以来自 `runId` 短格式，不能参与持久化关系。
- `currentRun.id`：目标语义是 canonical `runId`。
- `RunSnapshot.id`：目标语义是 canonical `runId`。
- `runsById` 的 key：目标语义是 canonical `runId`。

新代码不得再让 `runId` 同时表示 DB run ID、client request ID 和 runtime compatibility ID。

`canonicalRunId` 已完成 runtime 代码清理。后续不得恢复 `RunSnapshot.canonicalRunId`、metadata `canonicalRunId` 或 `canonicalRunId || runtimeRunId || id` 这类兜底链。

`runtimeRunId` 不得作为业务主关系，不得进入 `RunSnapshot` 主结构、后端幂等字段、mapper fallback 或 metadata。`metadata.runtimeRunId` 不再读取和写入。

## 7. RunSnapshot 目标模型

RunSnapshot 长期目标字段：

```ts
type RunSnapshot = {
  id: string              // DB agent_runs.id，canonical runId
  clientRunId?: string    // pending / idempotency
  displayRunId?: string   // UI only
}
```

`canonicalRunId` 不属于当前字段，发现残留默认删除或标记为历史兼容问题。`runtimeRunId` 不属于当前运行时字段，发现残留默认删除。

## 8. 迁移字段退出条件

本节定义历史 `canonicalRunId` 禁止回归边界，以及 `runtimeRunId` / `metadata.runtimeRunId` 的退出边界。

### 8.1 canonicalRunId 已清理边界

`canonicalRunId` 是历史迁移字段，runtime 代码清理已完成，不再作为当前迁移字段使用。

后续不得恢复：

- `RunSnapshot.canonicalRunId` 类型字段。
- `runPersistenceMapper` 中的 `canonicalRunId` 输出。
- `agentRunStreamApi` 中仅用于 `canonicalRunId` 的辅助字段写入。
- `createRunSlice` 中 report metadata 的 `canonicalRunId`。
- `workbench-reports` skipped marker metadata 中的 `canonicalRunId`。

所有业务主关系统一使用 `id` / `runId`，且二者必须指向 DB `agent_runs.id`。如果需要表示“缺少后端 DB runId”，不能通过 `canonicalRunId` 表示，应使用明确错误状态或 `nonCanonical` / `missingCanonicalRunId` 这类显式标记；不得把 `clientRunId` 静默提升为 canonical `runId`。

`canonicalRunId` 清理不得影响 `clientRunId` 的合法用途。`clientRunId` 仍用于 pending / idempotency / `run_reused`。

### 8.2 runtimeRunId 退出边界

`runtimeRunId` 是旧命名，不再进入当前运行时代码，不能作为 message / event / tool / report / usage / source 的主外键。

当前后端 idempotency / duplicate run / `run_reused` 统一使用 `agent_runs.client_run_id`。

不得恢复：

- `agent_runs.runtime_run_id` 的运行时代码读写。
- `metadata.runtimeRunId` 的读取或写入。
- mapper / backend 旧数据 fallback。
- SSE payload 中的 `runtimeRunId`。

历史 migration 中出现 `runtime_run_id` 只表示历史建表或退出迁移记录，不是当前运行时契约。

### 8.3 metadata.runtimeRunId 退出边界

`metadata.runtimeRunId` 不再读取，不再写入，不作为旧数据兜底。

如果需要记录客户端 pending / idempotency 信息，只能使用 `clientRunId` / `client_run_id`。

### 8.4 已完成阶段摘要

- Phase 2B / 2C 已完成 canonical `runId` 契约、类型 / mapper 和 SSE live 链路收敛。
- `canonicalRunId` runtime 代码清理已完成，后续只作为禁止回归项审查。
- `runtimeRunId` / `runtime_run_id` 已进入退出阶段，不再作为当前运行时代码字段。
- `metadata.runtimeRunId` 不再读取和写入。

### 8.5 禁止误删范围

后续字段清理不得误删：

- `clientRunId`。
- `agent_runs.client_run_id`。
- `workbench-agent-run-stream` 基于 `client_run_id` 的 idempotency 查询 / 等待 / `run_reused` 逻辑。

## 9. 对象绑定规则

conversation -> message：

- `messages.conversation_id -> conversations.id`

message -> run：

- `messages.run_id -> agent_runs.id`
- `clientMessageId` 只用于幂等。
- `metadata.runtimeRunId` 不再读取和写入。

run -> run_events：

- `run_events.run_id -> agent_runs.id`

run -> tool_invocations：

- `tool_invocations.run_id -> agent_runs.id`

run -> report：

- `report_artifacts.run_id -> agent_runs.id`
- `metadata.runtimeRunId` 不再读取和写入。

run -> usage：

- `agent_runs.usage_id -> agent_run_usage.id`
- 如保留 `agent_run_usage.run_id`，应写 `agent_runs.id`。

run -> metadata：

- `metadata.runtimeRunId` 不再读取和写入。
- `clientRunId` 可用于请求追踪，但不能作为主关系。

run -> source / RAG：

- 后续 retrieval log 必须绑定 `agent_runs.id`、conversationId、toolInvocationId / sourceId。
- 当前 `RunSnapshot.sources` 只能作为展示层数据，不代表完整 lineage。
- `sourceId` / `retrievalId` / `toolInvocationId` 与 `runId` 的详细语义以 `docs/source-lineage.md` 为准。

run -> evaluation：

- `eval_results.run_id -> agent_runs.id`
- `runtime_run_id` 属于旧命名，不能进入当前运行时代码。
- Evaluation 继续后置，不在本阶段推进。

所有主关系都必须优先 DB ID。`messages.run_id`、`run_events.run_id`、`tool_invocations.run_id`、`report_artifacts.run_id`、`eval_results.run_id` 和 usage 的 run 关联字段，只要存在并写入新数据，都必须指向 `agent_runs.id`。

## 10. Live Run 与 Refresh Run 目标契约

Live path：

```text
前端生成 clientRunId
  -> 请求发送 clientRunId
  -> 后端创建 agent_runs.id
  -> SSE run_started 返回 DB runId
  -> 前端收到 DB runId 后，将 pending run 收敛到 canonical runId
  -> 后续 events / tools / messages / report / usage 都围绕 canonical runId
```

Refresh path：

```text
/workbench-runs 恢复 agent_runs.id
  -> runPersistenceMapper 生成 RunSnapshot.id = agent_runs.id
  -> live 与 refresh 的 currentRun.id 语义一致
```

目标状态下，live run 和 refresh run 不能因为入口不同而产生不同的 `currentRun.id` 语义。

## 11. 兼容策略

允许：

- service / store 边界层为 pending run 使用 `clientRunId`。
- 后端用 `client_run_id` 处理 idempotency / duplicate run / `run_reused`。

必须逐步删除或收敛：

- 前端无条件把 SSE `event.runId` 重写成 `clientRunId`。
- 新 report 写 `run_id=null`。
- 新 usage 写旧 runtime ID。
- 组件层直接根据 `runId` 格式判断语义。
- 多处 mapper 各自处理 `runId` fallback。
- 恢复 `canonicalRunId` 或 `runtimeRunId`。

当前不保留旧 runtime 兼容读取。

## 12. 禁止写法

禁止：

- `runtimeRunId ?? id` 作为长期主 ID。
- `metadata.runtimeRunId || run_id` 这种把 metadata 放在 DB `run_id` 前面的写法。
- `canonicalRunId || runtimeRunId || id` 这种无语义兜底链。
- component 判断 UUID 格式。
- component 读取 `runtimeRunId` 做业务关系。
- 新代码继续新增 `runtimeRunId` 兜底。
- 把 DB `runId` 写进 `runtimeRunId` 字段。

允许：

- service / store 边界层为 pending run 使用 `clientRunId`。
- UI 使用 `displayRunId`。

## 13. 已完成阶段摘要

- Phase 2B / 2C 的 ID 契约、类型 / mapper 和 SSE live canonical `runId` 收敛已完成。
- `canonicalRunId` runtime 代码清理已完成，后续不得作为当前迁移字段恢复。
- Report / Source 持久化关系继续围绕 canonical `runId` 收敛，Source 细则见 `docs/source-lineage.md`。
- `runtimeRunId` / `runtime_run_id` 不再作为当前运行时代码字段。

## 14. 验收标准

- live run 和 refresh run 的 `currentRun.id` 都指向 `agent_runs.id`。
- `clientRunId` 独立字段存在，只用于 pending / idempotency。
- `canonicalRunId` 不得回归；如发现残留，只能作为历史兼容问题处理并默认删除。
- `runtimeRunId` 不应出现在当前运行时代码。
- `displayRunId` 独立字段存在，只用于 UI。
- 新 message / report / usage 不再把 runtime ID 当主关系。
- Run Trace / Run Overview / Report / assistant message 对同一 run 使用同一个 canonical ID。
- 旧数据仍可通过兼容读取。
- Evaluation 继续后置，不继承当前 ID 双轨。

## 15. 面试解释口径

ID 契约治理是为了让 Trace、Report、Source、Usage、Evaluation 都能指向同一次 Agent Run，而不是各自维护不同的执行 ID。

DB `agent_runs.id` 成为 canonical `runId`，是因为它已经是 run_events、tool_invocations、messages、report_artifacts、eval_results 等表的主关系目标。

`clientRunId` 解决前端发起请求时的 pending 和幂等问题，`runtimeRunId` 是已退出当前运行时代码的旧命名，`canonicalRunId` 是已完成清理的历史过渡字段。

完成后，live run 与 refresh run 会使用同一套 ID 语义：`RunSnapshot.id = agent_runs.id`。后续 Evaluation / Bad Case / Improvement 才能建立可信的质量闭环。
