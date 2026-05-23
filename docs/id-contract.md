# AI Agent Workbench ID Contract

本文档冻结 AI Agent Workbench 的核心对象与 ID 契约。后续涉及 Run、Trace、Report、Source、Usage、Evaluation 的代码修改，都必须先对齐本文。Source / RAG Lineage 的对象语义和数据流详见 `docs/source-lineage.md`。若 ID 契约本身需要调整，必须先更新并提交本文，再进入代码治理。

## 1. 文档定位

本文是 AI Agent Workbench 的核心对象与 ID 契约文档。

它服务于 `docs/agent-run-lifecycle.md`，用于约束 conversation / message / run / event / tool / source / report / usage / evaluation 的 ID 语义。source / retrieval 的 lineage 细则见 `docs/source-lineage.md`。

后续所有涉及 Run、Trace、Report、Source、Usage、Evaluation 的代码修改，都必须先对齐本文，再进入类型、mapper、service、store、component 或后端函数修改。

## 2. 当前问题摘要

当前最大风险是 `runId` / `clientRunId` / `runtimeRunId` 三轨混用，以及 `canonicalRunId` 过渡字段被长期化：

- `currentRun.id` / `RunSnapshot.id` 当前可能代表 `clientRunId` 或 `runtimeRunId`，但 DB 主关系使用 `agent_runs.id`。
- `canonicalRunId` 可能被误用为另一个长期主 ID，而不是迁移期过渡字段。
- `message.runId`、DB `messages.run_id`、`metadata.runtimeRunId` 不一致。
- `report_artifacts.run_id` 可能为 null，靠 `metadata.runtimeRunId` 兜底。
- `agent_run_usage.run_id` 不是严格 FK，可能保存 `runtimeRunId`。
- SSE live event 被前端改写 `runId`，导致 live event 与 persisted event 语义不同。
- source / RAG 缺少独立 retrieval / run lineage。
- Evaluation 如果现在继续推进，会继承并固化 ID 双轨问题。

这些问题会影响 Run Trace、Run Overview、Report、Source、Usage、Evaluation 对同一 Agent Run 的一致理解。

## 3. 核心原则

1. canonical `runId` = DB `agent_runs.id`，长期唯一主身份是 `RunSnapshot.id` / `agent_runs.id`。
2. `clientRunId` = 前端请求幂等 / pending key，不作为主外键。
3. `canonicalRunId` = Phase 2B / 2C 迁移期过渡字段，不是长期字段。
4. `runtimeRunId` = 兼容读取 / metadata / 幂等相关字段，不作为 UI 主 ID，不作为主外键，不进入长期业务主链路。
5. 如果需要展示短 ID，使用 `displayRunId`。
6. 旧数据可以短期按 `runtimeRunId` 兼容读取，但新数据不得继续把 `runtimeRunId` 当主关系。
7. 所有执行后资产必须绑定 canonical `runId`。
8. 所有 `idA || idB` 类型兜底必须收敛在 mapper / service / store 边界层，并逐步删除。
9. 组件和业务 UI 不得自行判断 ID 格式，不得消费 `runtimeRunId` 做业务关系。

## 4. 无历史包袱与单轨目标

本项目没有需要长期兼容的大规模历史数据包袱。`runtimeRunId` / `canonicalRunId` 这类过渡字段只能服务迁移期，不能作为长期业务模型扩展点。

迁移完成后，业务主链路必须回到单轨字段语义：

- `RunSnapshot.id` 是 canonical `runId`，对应 DB `agent_runs.id`。
- `clientRunId` 只服务 pending / idempotency。
- `displayRunId` 只服务 UI 展示。
- `canonicalRunId` 不属于长期目标字段。
- `runtimeRunId` 不属于长期业务主模型字段。

禁止长期保留 `idA || idB` 兜底作为常态逻辑。任何兜底必须说明原因、所在层级和删除条件；无法说明删除条件的兜底不得进入新代码。

## 5. ID 定义表

| ID | 定义 | 生成位置 | 是否持久化 | 可作为外键 / 主关系 | 可用于 UI 展示 | 可用于幂等 | 可用于兼容查询 | 禁止用途 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `conversationId` | 会话主 ID，持久化会话时对应 `conversations.id`。 | 后端创建 conversation；匿名本地模式可由前端创建临时 session id。 | 是 | 是，绑定 messages / runs / reports。 | 可以 | 不建议 | 可以 | 禁止把匿名本地 session id 当作已持久化 conversation 关系。 |
| `sessionId` | 前端工作区会话 ID，可能等于 `conversationId`，也可能是本地临时 `s_...`。 | 前端 store。 | 匿名模式可进入 sessionStorage。 | 否 | 可以 | 否 | 可以 | 禁止作为 DB 外键。 |
| `messageId` | 消息主 ID。DB 消息对应 `messages.id`，UI 消息当前可能使用 client message id。 | 后端 DB 或前端创建消息。 | 是 | DB `messages.id` 可以；前端临时 id 不可以。 | 可以 | 否 | 可以 | 禁止把前端临时 message id 当作 DB 主键。 |
| `clientMessageId` | 前端消息幂等 ID。 | 前端创建 message 时生成。 | 是，写入 `messages.client_message_id`。 | 否 | 不作为主展示 ID；可用于调试。 | 是 | 可以 | 禁止作为 message -> run 或 message -> conversation 主关系。 |
| `runId` | Agent Run canonical ID，只能指 DB `agent_runs.id`。 | 后端创建 `agent_runs` 时生成。 | 是 | 是，是 run 相关对象主关系。 | 可以，通常展示短格式。 | 否 | 是 | 禁止指代 `clientRunId` 或 `runtimeRunId`。 |
| `canonicalRunId` | Phase 2B / 2C 迁移期过渡字段，用于在 `RunSnapshot.id` 语义尚未完全稳定时承载 DB `agent_runs.id`。 | mapper / store 迁移边界。 | 迁移期可存在于前端模型；不应作为长期 DB 字段。 | 否，长期主关系必须直接使用 `runId` / `RunSnapshot.id`。 | 否 | 否 | 仅迁移期 | 禁止作为另一个长期主 ID；禁止 component 或业务逻辑长期依赖。 |
| `clientRunId` | 前端创建 run 前生成的请求幂等 / pending key。 | 前端发起 run 时生成。 | 可以写入 `agent_runs.runtime_run_id` 或 metadata。 | 否 | 仅调试或 pending 状态可见。 | 是 | 可以 | 禁止作为 run_events / messages / reports / usage 的主外键；禁止用于已持久化 run 的业务关系。 |
| `runtimeRunId` | 迁移期兼容 ID，当前通常等于 `clientRunId`。 | 后端从 `clientRunId` 派生或从旧数据读取。 | 是，存在于 `agent_runs.runtime_run_id` 或 metadata。 | 否 | 不作为 UI 主 ID；仅旧数据调试辅助。 | 可以用于旧请求幂等 | 是 | 禁止作为 `currentRun.id`、`RunSnapshot.id`、新数据主关系或 component 业务判断依据。 |
| `displayRunId` | UI 展示用短 ID。 | mapper / ViewModel 生成。 | 否 | 否 | 是 | 否 | 否 | 禁止参与持久化、查询、外键、幂等。 |
| `usageId` | 用量记录 ID，对应 `agent_run_usage.id`。 | 后端 quota / stream 链路。 | 是 | `agent_runs.usage_id` 可以绑定它。 | 可以 | 部分 | 可以 | 禁止用 `agent_run_usage.run_id` 保存 runtime ID 作为新主关系。 |
| `reportId` | Report Artifact ID，对应 `report_artifacts.id`。 | 后端 report 函数。 | 是 | 是，report 自身主键；report -> run 必须靠 canonical `runId`。 | 可以 | 否 | 可以 | 禁止新 report 只靠 `metadata.runtimeRunId` 绑定 run。 |
| `sourceId` / `retrievalId` | Source 或 RAG retrieval 的 lineage ID。 | RAG 工具、retrieval log 或 mapper。 | 目标状态应持久化。 | 是，应绑定 canonical `runId`、conversationId、toolInvocationId。 | 可以 | 否 | 可以 | 禁止只把 source 当作展示数组而无 lineage。 |
| `evaluationId` / `caseId` | Evaluation result / case ID。 | Evaluation 后端 / DB。 | 是 | `eval_results.run_id` 必须绑定 canonical `runId`；`case_id` 绑定 case。 | 可以 | 否 | 可以 | 禁止在当前 ID 双轨未治理前继续扩展 Evaluation。 |

## 6. Run ID 契约

- `runId`：只能指 DB `agent_runs.id`。
- `clientRunId`：前端创建 run 前生成，用于 pending 状态、请求幂等、断线前临时关联。
- `canonicalRunId`：Phase 2B / 2C 迁移期过渡字段，用于在 `RunSnapshot.id` 语义尚未完全稳定时承载 DB `agent_runs.id`。
- `runtimeRunId`：迁移期兼容读取 / metadata / 幂等相关字段，当前通常等于 `clientRunId`。
- `displayRunId`：UI 展示用，可以来自 `runId` 短格式；旧数据迁移期可显示 `runtimeRunId` 短格式，但不能参与持久化关系。
- `currentRun.id`：目标语义是 canonical `runId`。
- `RunSnapshot.id`：目标语义是 canonical `runId`。
- `runsById` 的 key：目标语义是 canonical `runId`。

新代码不得再让 `runId` 同时表示 DB run ID、client request ID 和 runtime compatibility ID。

当 live path 和 refresh path 均已确认 `RunSnapshot.id = agent_runs.id` 后，`canonicalRunId` 应视为冗余字段。后续应通过文档更新和代码治理删除 `canonicalRunId`，不允许 component 或业务逻辑长期依赖它，新代码不得把它当作另一个长期主 ID。

`runtimeRunId` 不得作为业务主关系，不应长期进入 `RunSnapshot` 主结构，除非明确用于边界层兼容。如果项目确认无历史数据需要兼容，应逐步将 `runtimeRunId` 限制到后端字段 / mapper 内部兜底，并从前端业务模型中移除。`metadata.runtimeRunId` 只能作为旧数据兜底，不得优先于 DB `run_id`。

## 7. RunSnapshot 目标模型

RunSnapshot 长期目标字段：

```ts
type RunSnapshot = {
  id: string              // DB agent_runs.id，canonical runId
  clientRunId?: string    // pending / idempotency
  displayRunId?: string   // UI only
}
```

`canonicalRunId` 不属于长期目标字段。`runtimeRunId` 不属于长期业务主模型字段。如果短期仍存在 `runtimeRunId` / `canonicalRunId`，必须标记为 migration-only，并明确删除条件。

## 8. 迁移字段退出条件

本节定义 `canonicalRunId` / `runtimeRunId` / `metadata.runtimeRunId` 的退出边界。删除迁移字段前必须先确认本节条件，避免把仍服务 pending、幂等或旧数据恢复的字段误删。

### 8.1 canonicalRunId 退出条件

`canonicalRunId` 是 Phase 2B / 2C 迁移期字段，只用于 `RunSnapshot.id` 语义尚未完全稳定时承载 DB `agent_runs.id`。

当 live path 和 refresh path 均满足 `RunSnapshot.id = agent_runs.id` 后，`canonicalRunId` 应视为冗余字段。第一批可删除范围：

- `RunSnapshot.canonicalRunId` 类型字段。
- `runPersistenceMapper` 中的 `canonicalRunId` 输出。
- `agentRunStreamApi` 中仅用于 `canonicalRunId` 的辅助字段写入。
- `createRunSlice` 中 report metadata 的 `canonicalRunId`。
- `workbench-reports` skipped marker metadata 中的 `canonicalRunId`。

删除后，所有业务主关系统一使用 `id` / `runId`，且二者必须指向 DB `agent_runs.id`。如果需要表示“缺少后端 DB runId”，不能通过 `canonicalRunId` 表示，应使用明确错误状态或 `nonCanonical` / `missingCanonicalRunId` 这类显式标记；不得把 `clientRunId` 静默提升为 canonical `runId`。

删除 `canonicalRunId` 不得影响 `clientRunId` / `runtimeRunId` 的合法用途。`clientRunId` 仍可用于 pending / idempotency，`runtimeRunId` 仍可用于后端幂等和旧数据兼容边界。

### 8.2 runtimeRunId 保留边界

`runtimeRunId` 不是业务主关系，不能作为 message / event / tool / report / usage / source 的主外键。

当前后端 `agent_runs.runtime_run_id` 和 `003_agent_run_idempotency.sql` 中的唯一约束仍用于 idempotency / duplicate run 防护，不能在 canonical ID 清理阶段删除。

`runtimeRunId` 可以短期存在于以下边界：

- 后端 idempotency 查询、等待和 duplicate run 防护。
- mapper / backend 对旧数据的兼容兜底。
- pending / `run_reused` 迁移边界。

`runtimeRunId` 不应长期存在于 `RunSnapshot` 主模型。从 `RunSnapshot` 移除 `runtimeRunId` 前，必须先确认：

- `createUiSlice` 不再依赖 `RunSnapshot.runtimeRunId` 做 pending 匹配。
- `reportArtifactApi` 不再需要从 `RunSnapshot` 读取 `runtimeRunId`。
- run reuse 展示不再需要 `runtimeRunId`。
- `messageMapper` / `reportArtifactMapper` 的旧数据恢复仍有明确替代策略。

### 8.3 metadata.runtimeRunId 保留边界

`metadata.runtimeRunId` 只允许作为旧数据兜底。DB `run_id` 永远优先，mapper 和后端读取逻辑不得让 `metadata.runtimeRunId` 覆盖 DB `run_id`。

新写入不得把 DB `runId` 塞进 `metadata.runtimeRunId`。如确实需要新写入 `metadata.runtimeRunId`，必须说明它是真实 runtime / client id，且不同于 DB `runId`。

长期目标是只在 mapper / backend 边界处理 `metadata.runtimeRunId`，不让它进入 component / ViewModel，也不让 UI 依赖它判断业务关系。

### 8.4 Phase 2E 后续阶段

- Phase 2E-2A：补充 ID 迁移字段退出条件文档。
- Phase 2E-3：删除 `canonicalRunId`。
- Phase 2E-4：收口 `runtimeRunId` 到边界层。
- Phase 2E-5：清理 `metadata.runtimeRunId` 新写入和旧兜底策略。

### 8.5 禁止误删范围

后续字段清理不得误删：

- `clientRunId`。
- `agent_runs.runtime_run_id`。
- `003_agent_run_idempotency.sql` 中的唯一约束。
- `workbench-agent-run-stream` 的 idempotency 查询 / 等待 / `run_reused` 逻辑。
- `messageMapper` / `reportArtifactMapper` 的旧数据 fallback，除非已有明确替代策略。

## 9. 对象绑定规则

conversation -> message：

- `messages.conversation_id -> conversations.id`

message -> run：

- `messages.run_id -> agent_runs.id`
- `clientMessageId` 只用于幂等。
- `metadata.runtimeRunId` 只用于旧数据兼容，不允许优先于 DB `messages.run_id`。

run -> run_events：

- `run_events.run_id -> agent_runs.id`

run -> tool_invocations：

- `tool_invocations.run_id -> agent_runs.id`

run -> report：

- `report_artifacts.run_id -> agent_runs.id`
- `metadata.runtimeRunId` 只作旧数据兜底，不允许优先于 DB `report_artifacts.run_id`。

run -> usage：

- `agent_runs.usage_id -> agent_run_usage.id`
- 如保留 `agent_run_usage.run_id`，应写 `agent_runs.id`，而不是 `runtimeRunId`。

run -> metadata：

- `metadata.runtimeRunId` 只能作为旧数据兜底。
- 新写入时不得把 DB `runId` 塞进 `runtimeRunId` 字段冒充 runtime ID。

run -> source / RAG：

- 后续 retrieval log 必须绑定 `agent_runs.id`、conversationId、toolInvocationId / sourceId。
- 当前 `RunSnapshot.sources` 只能作为展示层数据，不代表完整 lineage。
- `sourceId` / `retrievalId` / `toolInvocationId` 与 `runId` 的详细语义以 `docs/source-lineage.md` 为准。

run -> evaluation：

- `eval_results.run_id -> agent_runs.id`
- `runtime_run_id` 只能用于迁移兼容。
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
  -> runtimeRunId 仅作为附加字段
  -> live 与 refresh 的 currentRun.id 语义一致
```

目标状态下，live run 和 refresh run 不能因为入口不同而产生不同的 `currentRun.id` 语义。

## 11. 兼容策略

允许短期兼容：

- 通过 `runtime_run_id` 查询旧 run。
- 从 `metadata.runtimeRunId` 恢复旧 message / report。
- `displayRunId` 可显示 `runtimeRunId` 短格式。
- mapper 层短期使用 `run_id || metadata.runtimeRunId` 兼容旧数据。
- service / store 边界层为 pending run 使用 `clientRunId`。

必须逐步删除或收敛：

- 前端无条件把 SSE `event.runId` 重写成 `clientRunId`。
- 新 report 写 `run_id=null`。
- 新 usage 写 `runtimeRunId`。
- 组件层直接根据 `runId` 格式判断语义。
- 多处 mapper 各自处理 `runId` fallback。
- `canonicalRunId` / `runtimeRunId` 在业务主链路长期存在。

兼容读取只服务历史数据和迁移窗口，不能成为新数据写入规范。

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

- mapper 层短期用 `run_id || metadata.runtimeRunId` 兼容旧数据。
- service / store 边界层为 pending run 使用 `clientRunId`。
- UI 使用 `displayRunId`。

## 13. 分阶段治理计划

Phase 2B-1：ID 契约文档冻结

- 新增 `docs/id-contract.md`。
- `docs/architecture.md` / `AGENTS.md` 引用本文。

Phase 2B-2：类型与 mapper 收口

- `RunSnapshot` 迁移期显式拆分 `id` / `clientRunId` / `runtimeRunId` / `displayRunId`，并将 `runtimeRunId` 标记为 compatibility-only。
- `WorkbenchMessage` 显式拆分 `id` / `clientMessageId` / `runId`。
- `runPersistenceMapper` / `messageMapper` / `reportArtifactMapper` 对齐契约。

Phase 2C：SSE live 链路 canonical runId 收敛

- `run_started` 后以 DB `runId` 建立 canonical run。
- 不再无条件重写 `event.runId` 为 `clientRunId`。
- pending run 到 canonical run 做一次迁移。

Phase 2C-3：ID 契约一致性审查

- 检查代码是否符合当前 `docs/id-contract.md`。
- 不直接删除契约允许的字段。
- 如果发现契约本身需要简化，先修改 `docs/id-contract.md`。

Phase 2C-4：ID 契约一致性修正

- 只修正违反当前契约的代码。
- 例如 DB `run_id` 优先级、silent fallback、`runtimeRunId` 写入语义错误。
- 不直接删除 `canonicalRunId` / `runtimeRunId`。

Phase 2C-5：ID 契约简化

- 在文档明确 `canonicalRunId` / `runtimeRunId` 的退出条件后，再删除冗余字段和 fallback。
- 目标是让 `RunSnapshot.id` 成为唯一 canonical `runId`。

Phase 2D：Report / Usage / Source 持久化关系收敛

- `report_artifacts.run_id` 写 DB `runId`。
- `usage.run_id` 或 usage 关联写 DB `runId`。
- source / retrieval lineage 后续补独立表或明确 mapper 契约。

Phase 2E：旧兼容清理

- Phase 2E-2A 先补充 ID 迁移字段退出条件文档。
- Phase 2E-3 优先删除已冗余的 `canonicalRunId`。
- Phase 2E-4 将 `runtimeRunId` 收口到后端幂等、pending / `run_reused` 和 mapper / backend 兼容边界。
- Phase 2E-5 清理 `metadata.runtimeRunId` 新写入和旧兜底策略。
- 保留必要历史数据读取兼容，直到替代策略明确。

## 14. 验收标准

- live run 和 refresh run 的 `currentRun.id` 都指向 `agent_runs.id`。
- `clientRunId` 独立字段存在，只用于 pending / idempotency。
- `canonicalRunId` 如仍存在，只能标记为 migration-only，并有明确删除条件。
- `runtimeRunId` 如仍存在，只用于兼容 / metadata / 幂等相关字段，并有明确删除条件。
- `displayRunId` 独立字段存在，只用于 UI。
- 新 message / report / usage 不再把 runtime ID 当主关系。
- Run Trace / Run Overview / Report / assistant message 对同一 run 使用同一个 canonical ID。
- 旧数据仍可通过兼容读取。
- Evaluation 继续后置，不继承当前 ID 双轨。

## 15. 面试解释口径

ID 契约治理是为了让 Trace、Report、Source、Usage、Evaluation 都能指向同一次 Agent Run，而不是各自维护不同的执行 ID。

DB `agent_runs.id` 成为 canonical `runId`，是因为它已经是 run_events、tool_invocations、messages、report_artifacts、eval_results 等表的主关系目标。

`clientRunId` 解决前端发起请求时的 pending 和幂等问题，`runtimeRunId` 只解决旧数据、metadata 和迁移期兼容问题，`canonicalRunId` 只是在 `RunSnapshot.id` 尚未稳定时的过渡字段。

完成后，live run 与 refresh run 会使用同一套 ID 语义：`RunSnapshot.id = agent_runs.id`。后续 Evaluation / Bad Case / Improvement 才能建立可信的质量闭环。
