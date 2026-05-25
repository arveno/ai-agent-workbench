# Tool Governance Contract

本文档是 Tool Registry / Tool Governance 契约。后续涉及工具定义、工具参数、工具展示、Tool Invocation、Run Trace 或 Workflow 工具说明的修改，必须先对齐本文。Source 细则见 `docs/source-lineage.md`，ID 主关系见 `docs/id-contract.md`。

## 1. 契约范围

本文约束：

- 正式服务端工具清单。
- 工具参数边界。
- Tool Invocation 写入。
- Run Trace 工具展示。
- 前端工具库展示。
- legacy / planned / mock 工具边界。

工具治理目标是让服务端执行、参数白名单、持久化、Trace 展示和前端工具库展示回到同一条主链路。

长期终态下，正式服务端工具必须向 LangChain Tool / Structured Tool 收敛，并由 LangGraph runtime 调度。当前自研工具执行链路只作为待替换旧链路，不得在其旁边新增 LangChain wrapper 旁路。

## 2. 正式工具清单

当前 Agent Run 内部正式服务端工具只包括：

| toolId | category | allowed phase | input summary | output summary | persisted to `tool_invocations` | shown in Run Trace | affects Source Lineage |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `schema_inspect` | `data_schema` | Planner / Workflow 后，Execution / Streaming 内。 | `includeColumns`，以及服务端固定数据源上下文。 | `schemas`, `tables`, `columns`, `tableCount`。 | 是 | 是 | 否 |
| `aggregate_table` | `data_analysis` | `schema_inspect` 后，`chart_render` 前。 | `metric`, `groupBy`, `timeRange`, `comparison`, `limit`。 | `metric`, `groupBy`, `totalRecords`, `rowCount`, `averages`, grouped rows。 | 是 | 是 | 否 |
| `chart_render` | `data_analysis` | `aggregate_table` 后，模型结论前。 | `title`, `chartType`, `labelKey`, `valueKey`, rows summary。 | `chartType`, `labels`, `values`, `series`, `summary`, chart config。 | 是 | 是 | 否 |
| `knowledge_search` | `knowledge` | `knowledge_qa` intent 下，模型回答前。 | `prompt`, `topK`。 | `query`, `matchedChunks`, `retrievedChunkCount`, citation labels, scores。 | 是 | 是 | 是，写入 `retrieval_logs` / `run_sources`。 |

`report_generate` 归属 Artifact / Report API，不是当前 Agent Run 内部 Tool Invocation 主工具。

Evaluation 相关能力后置，不纳入当前正式 Tool Registry。

## 3. legacy / planned / mock 边界

- `query_table` / `query_data` / `rag_search` 不属于正式工具。
- legacy / planned / mock 工具不得混入正式 Tool Registry。
- mock 工具必须标注 Mock，不得伪装成真实服务端工具调用。
- planned 工具必须标注未连接，不得显示为可执行工具。
- legacy alias 只能在迁移或旧数据恢复边界处理，不得进入主链路。

## 4. 参数治理

工具调用必须遵守：

- 模型不能直接执行 SQL。
- 前端不能直接执行工具。
- 工具调用必须由服务端受控。
- LangChain Tool schema 必须与服务端白名单、参数标准化和 Tool Invocation 契约一致。
- 服务端负责 Auth、数据访问、白名单、参数标准化和错误归类。
- 表名、字段名、metric、groupBy 必须来自白名单或服务端 normalize。
- 不允许由模型或前端透传任意表名、字段名或 SQL。
- `topK`、`limit` 必须有服务端上限。
- 参数错误、白名单拒绝、数据源错误和工具异常必须进入 Run Trace。
- tool args 标准化发生在服务端边界，不在 component。
- component 不解析 raw tool args，不根据 raw payload 拼接业务结论。

正式工具边界：

- `schema_inspect`：数据源由服务端固定或从受控 registry 解析，不接受任意数据库连接、schema 或表名。
- `aggregate_table`：`metric`、`groupBy`、`timeRange`、`comparison`、`limit` 必须标准化；不允许拼接 SQL；行数和聚合维度必须有上限。
- `chart_render`：只消费标准化聚合结果；`chartType`、`labelKey`、`valueKey` 必须来自允许范围或由服务端生成。
- `knowledge_search`：`topK` 必须 capped；检索范围必须受 visibility / enabled / ownership 边界控制；无来源时必须写明 `noSourceReason` 或 fallback reason。

## 5. Tool Invocation 契约

每次真实服务端工具调用必须写入 `tool_invocations`：

- `run_id` 绑定 DB `agent_runs.id`。
- `conversation_id` 绑定当前 conversation。
- `_openid` / `user_id` 作为用户边界。
- `tool_name` 使用正式 `toolId`。
- `input` / `output` 可保存 raw JSON，但 raw 只能作为 debug / 恢复兜底。
- `input_summary` / `output_summary` 用于 Trace 展示摘要，不替代 canonical output。
- `status` 区分 `running` / `completed` / `failed` / `skipped`。
- 工具失败必须写入 failed `tool_invocations` 和对应 `run_events`。

`run_events` 可记录：

- `tool_started`
- `tool_completed`
- `tool_failed`
- 与工具阶段相关的 `step_started` / `step_completed` / `step_failed`

UI 只能消费 mapper / ViewModel 后的标准结构，不能把 `tool_invocations.output` 或 `run_events.payload` 当主视图数据源。

LangChain Tool 的 name / args / output 必须映射到同一条 `tool_invocations` 主链路。不得为 LangChain 工具另建一套独立展示字段、独立 formatter 或独立 trace 事实源。

## 6. `knowledge_search` Source 契约

`knowledge_search` 必须遵守 `docs/source-lineage.md`：

- 写入 `retrieval_logs`。
- 写入 `run_sources`。
- source / retrieval 绑定同一个 canonical `runId`、conversationId 和 DB `toolInvocationId`。
- Chat、Run Trace、Source Panel、Report、Evaluation 消费同一份标准化 Source model。

## 7. 前端展示规则

前端工具库展示必须来自统一 Tool Registry ViewModel：

- 工具中文名、category、icon、风险说明、runtime、status、输入摘要、输出摘要不能在多个 component / formatter 中硬编码。
- component 不各自维护 tool label / category。
- Run Trace 工具名和工具库工具名必须一致。
- Header tooltip、Workflow、Tool Library、Tool Invocation inspector 消费同一份标准化工具展示模型。
- `query_table`、`query_data`、`rag_search` 不能作为正式工具混入主工具库。
- `report_generate` 如展示，必须标注为 Artifact / Report API，不得标注为 Agent Run 内部服务端工具。

Workflow 工具说明必须区分：

- 真实后端可执行工具：使用正式 `toolId`。
- 策略阶段：标注为 Planner / Workflow 说明，不表达成可执行工具。
- mock / demo 能力：标注 Mock，不伪装成真实服务端工具调用。

## 8. 禁止项

禁止：

- 新增工具绕过服务端白名单。
- 在旧工具链旁新增 LangChain 旁路工具链。
- 前端直接执行工具。
- 模型输出任意 SQL 或任意表字段后直接执行。
- 多处维护工具中文名、category、icon、风险说明。
- Run Trace formatter 维护独立工具事实源。
- LangChain Tool 展示绕过统一 Tool Registry ViewModel。
- Workflow 文案把策略阶段写成真实工具。
- Evaluation expected tools 使用 legacy / mock / planned 工具。
- `report_generate` 被表达为 Agent Run 内部 Tool Invocation。
- raw tool output 直接进入 component 主视图。

## 9. 验收标准

- 正式工具清单唯一。
- 前端展示与后端可执行工具一致。
- Run Trace 工具名和工具库一致。
- legacy / planned / mock 工具未混入主链路。
- 参数校验和安全边界明确。
- 每次真实工具调用绑定 canonical `runId` 并写入 `tool_invocations`。
- Tool Invocation raw output 不直接进 component。
- `knowledge_search` 不绕过 Source Lineage。
- Evaluation 未因工具契约变更而被提前推进。
