# Tool Governance Contract

本文档冻结 AI Agent Workbench 的 Tool Registry / Tool Governance 契约。后续涉及工具定义、工具参数、工具展示、Tool Invocation、Run Trace、Workflow 工具说明的修改，都必须先对齐本文。

## 1. 文档定位

本文是 AI Agent Workbench 的工具治理契约，服务于 AI Agent Enterprise Lifecycle 中的以下节点：

- Planner / Workflow
- Guardrail / Approval
- Tool Governance / Data Access
- Execution / Streaming
- Observability / Trace
- Source / Report / Evaluation

工具治理的目标不是扩展更多工具，而是让工具定义、服务端执行、参数边界、持久化、Trace 展示和前端工具库展示回到同一条主链路。

后续涉及以下事项时，必须先对齐本文：

- 新增、删除或重命名工具。
- 修改工具参数、输出、白名单、limit 或 topK。
- 修改 Tool Invocation 写入、Run Trace 展示或 Workflow 工具说明。
- 修改前端工具库、工具中文名、category、icon、风险说明。
- 修改 `knowledge_search` 与 Source / RAG lineage 的关系。
- 为 Evaluation 提供工具期望、工具摘要或工具质量输入。

如果本文与 `docs/source-lineage.md` 或 `docs/id-contract.md` 冲突，涉及 Source / RAG lineage 和 ID 绑定的部分以对应契约为准，并应先更新相关文档事实源。

## 2. 当前工具事实源问题

当前工具事实源存在多套定义：

- 当前后端真实工具在 `tencent/functions/workbench-agent-run-stream` 中，包括 planner、工具调用顺序、参数构造、输出结构和 `tool_invocations` 写入。
- 前端工具库在 `src/utils/toolRegistryView.ts` 中单独定义工具清单、中文名、状态、风险等级、输入摘要和输出摘要。
- Run Trace formatter 维护另一套工具中文名、category 和输入输出解释。
- Workflow 文案、Header tooltip、mock run 中仍有工具名和工具阶段说明的重复定义。
- `query_table`、`query_data`、`rag_search` 等命名存在历史残留或演示路径残留，当前不应作为正式工具混入主链路。

这些重复定义会导致：

- 前端展示工具与后端真实可执行工具不一致。
- Run Trace 工具名和工具库工具名漂移。
- Workflow 说明误把策略说明、历史工具或 mock 工具表达成真实后端工具。
- Evaluation expected tools 继承错误工具清单。
- 新工具接入绕过服务端治理和参数白名单。

当前不能长期维持多套工具事实源。后续代码收口目标是让服务端可执行工具、前端工具展示、Run Trace formatter 和 Workflow 工具说明都从同一份 Tool Registry / ViewModel 派生。

## 3. 工具分类

工具能力域按当前主链路冻结为：

| 能力域 | 工具 | 说明 |
| --- | --- | --- |
| `data_schema` | `schema_inspect` | 读取受控数据源 schema、表和字段说明。 |
| `data_analysis` | `aggregate_table`, `chart_render` | 对受控数据进行聚合分析，并生成前端可渲染图表数据。 |
| `knowledge` | `knowledge_search` | 基于 CloudBase MySQL 知识库执行受控检索，并产生可引用来源。 |
| `report` | `report_generate` | 当前不是 Agent Run 内部工具；归属 Artifact / Report API，不作为 Tool Invocation 主工具。 |
| `evaluation` | 后置 | Evaluation 相关工具或质量判断能力后置，不纳入当前 Tool Registry 主链路。 |

`report_generate` 可以作为前端或 Artifact / Report API 能力展示，但不能被表达为当前 Agent Run 的服务端 Tool Invocation。Evaluation 相关能力只能消费已有 Run / Tool / Source / Report 的标准化结果，不在当前阶段新增工具。

## 4. 当前正式工具清单

第一批正式服务端工具只认以下四个：

- `schema_inspect`
- `aggregate_table`
- `chart_render`
- `knowledge_search`

当前正式工具定义如下：

| toolId | category | description | allowed phase | input summary | output summary | persisted to `tool_invocations` | shown in Run Trace | affects Source Lineage |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `schema_inspect` | `data_schema` | 读取当前允许访问的数据源 schema、表、字段和字段类型。 | Planner / Workflow 后，Execution / Streaming 内。 | `includeColumns`，以及服务端固定数据源上下文。 | `schemas`, `tables`, `columns`, `tableCount`。 | 是 | 是 | 否 |
| `aggregate_table` | `data_analysis` | 基于受控教学指标数据做聚合分析，不开放任意 SQL。 | `schema_inspect` 后，`chart_render` 前。 | `metric`, `groupBy`, `timeRange`, `comparison`, `limit`。 | `metric`, `groupBy`, `totalRecords`, `rowCount`, `averages`, grouped rows。 | 是 | 是 | 否 |
| `chart_render` | `data_analysis` | 将聚合结果转换为前端可渲染图表数据结构，不渲染图片。 | `aggregate_table` 后，模型结论前。 | `title`, `chartType`, `labelKey`, `valueKey`, rows summary。 | `chartType`, `labels`, `values`, `series`, `summary`, chart config。 | 是 | 是 | 否 |
| `knowledge_search` | `knowledge` | 基于 CloudBase MySQL `knowledge_documents` / `knowledge_chunks` 做受控知识检索，返回可引用来源片段。 | `knowledge_qa` intent 下，模型回答前。 | `prompt`, `topK`。 | `query`, `matchedChunks`, `retrievedChunkCount`, citation labels, scores。 | 是 | 是 | 是，写入 `retrieval_logs` / `run_sources`。 |

非正式或后置工具边界：

- `query_table` / `query_data` / `rag_search` 不属于正式工具；后续只能作为 planned / mock / legacy 标记存在，不进入正式 Tool Registry，不作为 Agent Run 服务端 Tool Invocation。
- `report_generate` 不进入 Agent Run `tool_invocations` 主工具链；当前归属 Artifact / Report API 和报告产物生成流程。

## 5. 工具参数治理

工具调用必须遵守以下安全边界：

- 模型不能直接执行 SQL。
- 前端不能直接执行工具。
- 工具调用必须由服务端受控，服务端负责 Auth、数据访问、白名单、参数标准化和错误归类。
- 表名、字段名、metric、groupBy 必须来自白名单或服务端 normalize，不允许由模型或前端透传任意值。
- `topK`、`limit` 必须有服务端上限。
- 参数错误、白名单拒绝、数据源错误和工具异常必须进入 Run Trace，并写入可观察的 `fallbackReason` / error summary。
- tool args 的标准化发生在服务端边界，不在 component。
- component 不解析 raw tool args，不根据 raw payload 拼接业务结论。

正式工具的参数治理要求：

- `schema_inspect`：数据源由服务端固定或从受控 registry 解析，不接受任意数据库连接、schema 或表名。
- `aggregate_table`：`metric`、`groupBy`、`timeRange`、`comparison`、`limit` 必须标准化；不允许拼接 SQL；行数和聚合维度必须有上限。
- `chart_render`：只能消费已经标准化的聚合结果；`chartType`、`labelKey`、`valueKey` 必须来自允许范围或由服务端生成。
- `knowledge_search`：`topK` 必须 capped；检索范围必须受 visibility / enabled / ownership 边界控制；无来源时必须明确 `noSourceReason` 或 fallback reason。

## 6. Tool Invocation 与 Run Trace

每次真实服务端工具调用必须写入 `tool_invocations`：

- `run_id` 必须绑定 DB `agent_runs.id`。
- `conversation_id` 必须绑定当前 conversation。
- `_openid` / `user_id` 必须作为用户边界。
- `tool_name` 必须使用正式 `toolId`。
- `input` / `output` 可以保存 raw JSON，但 raw 只能作为 debug / 恢复兜底。
- `input_summary` / `output_summary` 应用于 Trace 展示摘要，不应替代 canonical output。
- `status` 必须区分 `running` / `completed` / `failed` / `skipped`。
- 工具失败必须写入 failed `tool_invocations`，并写入对应 `run_events`。

`run_events` 记录工具过程事件：

- `tool_started`
- `tool_completed`
- `tool_failed`
- 与工具阶段相关的 `step_started` / `step_completed` / `step_failed`

UI 只能消费 mapper / ViewModel 后的标准结构，不能把 `tool_invocations.output` 或 `run_events.payload` 当主视图数据源。

`knowledge_search` 额外遵守 `docs/source-lineage.md`：

- 写入 `retrieval_logs`。
- 写入 `run_sources`。
- source / retrieval 必须绑定同一个 canonical `runId`、conversationId 和 DB `toolInvocationId`。
- Chat、Run Trace、Source Panel、Report、Evaluation 后续应消费同一份标准化 Source model。

## 7. 前端展示规则

前端工具库展示必须来自统一 Tool Registry ViewModel：

- 工具中文名、category、icon、风险说明、runtime、status、输入摘要、输出摘要不能在多个 component / formatter 中硬编码。
- component 不应各自维护 tool label / category。
- Run Trace 工具名和工具库工具名必须一致。
- Header tooltip、Workflow、Tool Library、Tool Invocation inspector 应消费同一份标准化工具展示模型。
- `query_table`、`query_data`、`rag_search` 不能作为正式工具混入主工具库。
- `report_generate` 如展示，必须标注为 Artifact / Report API 或本地辅助能力，不得标注为 Agent Run 内部服务端工具。

Workflow 中的工具说明必须标注语义：

- 如果描述真实后端可执行工具，必须使用正式 `toolId`。
- 如果描述策略阶段，例如“选择工具”，必须明确它是 Planner / Workflow 说明，不是一个可执行工具。
- 如果描述 mock / demo 能力，必须明确是 Mock，不得伪装成真实服务端工具调用。

## 8. 分阶段收口计划

Phase 3B-1：Tool Governance 契约文档

- 新增本文档。
- 在生命周期、架构、流程和 Codex 规则中引用本文。
- 不改代码，不推进 Evaluation。

Phase 3B-2：后端 Tool Registry SSOT 抽取

- 从 `workbench-agent-run-stream` 中抽取正式工具 registry / schema / display metadata。
- 保留服务端白名单和参数 normalize。
- 不引入新工具。

Phase 3B-3：前端 Tool Registry ViewModel 对齐

- 前端工具库只展示正式 registry 派生的 ViewModel。
- `query_table` 若未实现，必须隐藏或标记为 planned / not connected。

Phase 3B-4：Run Trace formatter 对齐

- Run Trace formatter 不再维护独立工具中文名和 category。
- 工具状态、失败原因、输入输出摘要通过统一 ViewModel 生成。

Phase 3B-5：清理 `query_table` / `query_data` / `rag_search` 命名残留

- `query_data` 收敛到 mock-only 或删除。
- `rag_search` 收敛为 `knowledge_search` alias 的边界兼容，不进入主模型。
- `query_table` 在没有真实后端实现前不得作为 connected 工具。

Phase 3B-6：Workflow / Prompt 工具说明归位

- Workflow 中区分真实工具、策略阶段和 mock 说明。
- Prompt 模板中的 available tools 必须来自正式 registry。

## 9. 验收标准

- 正式工具清单唯一。
- 前端展示与后端可执行工具一致。
- Run Trace 工具名和工具库一致。
- `query_table` / `query_data` / `rag_search` 不再作为正式工具混入主链路。
- 参数校验和安全边界明确。
- Tool Invocation raw output 不直接进 component。
- 每次真实工具调用都能绑定 canonical `runId` 并写入 `tool_invocations`。
- `knowledge_search` 与 Source Lineage 的关系清楚，且不绕过 `docs/source-lineage.md`。
- `report_generate` 不被误表达为 Agent Run 内部工具。
- Evaluation 继续后置，不因工具契约冻结而新增质量评测功能。
