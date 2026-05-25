# Source / RAG Lineage Contract

本文档是 Source / RAG Lineage 契约。后续涉及 `knowledge_search`、RAG sources、citations、report sources、retrieval、source persistence 的修改，必须先对齐本文。ID 主关系以 `docs/id-contract.md` 为准，工具治理以 `docs/tool-governance.md` 为准。

## 1. 契约范围

本文约束以下能力：

- `knowledge_search`
- retrieval 记录
- run sources
- citation label
- Source Panel
- Report sources
- Run Trace sources
- Evaluation 输入中的 retrieval / source

目标是让 Chat、Run Trace、Source Panel、Report、Evaluation 消费同一份标准化 Source model。

长期终态下，RAG 能力必须向 LangChain Retriever / Document / metadata / citation 链路收敛，并由 LangGraph runtime 调度。当前自研检索和打分逻辑只作为待替换旧链路，不得在其旁边新增 LangChain RAG 旁路。

## 2. 主事实源

`retrieval_logs` / `run_sources` 是 Source Lineage 主事实源。

- `retrieval_logs` 表达一次检索行为。
- `run_sources` 表达一次 Agent Run 中可展示、可引用、可评估的来源片段。
- `run_events.rag_sources_ready`、`tool_invocations.output` 和 `RunSnapshot.sources` 只能作为 raw / debug / 旧数据恢复来源。
- raw event 或 raw tool output 不得作为 UI、Report 或 Evaluation 的主来源。

## 3. 核心对象模型

```ts
type RunSource = {
  id: string
  runId: string
  conversationId: string
  toolInvocationId?: string
  retrievalLogId?: string
  documentId?: string
  chunkId?: string
  citationLabel?: string
  sourceOrder: number
  title: string
  preview: string
  score?: number
  sourceType: 'knowledge' | 'tool' | 'report' | 'manual'
  usedInAnswer?: boolean
  noSourceReason?: string
  createdAt: string
}

type RetrievalLog = {
  id: string
  runId: string
  conversationId: string
  toolInvocationId?: string
  query: string
  provider: 'knowledge_search'
  matchedChunkCount: number
  createdAt: string
}
```

`RunSource` 表达来源片段，`RetrievalLog` 表达检索行为。两者都必须回到 canonical `runId = agent_runs.id`。

LangChain `Document` 的 `pageContent`、`metadata`、score 和 citation 信息必须标准化为 `RunSource` / `RetrievalLog`。LangChain document id、retriever run id 或 LangSmith trace id 都不能替代 canonical `runId`、`toolInvocationId`、`sourceId` 或 `retrievalId`。

## 4. `retrieval_logs` 字段

| 字段 | 契约 |
| --- | --- |
| `id` | Retrieval log 主键。 |
| `_openid` | CloudBase Auth 用户边界。 |
| `user_id` | Workbench 业务用户边界。 |
| `run_id` | 绑定 DB `agent_runs.id`。 |
| `conversation_id` | 绑定当前 conversation。 |
| `tool_invocation_id` | 绑定 DB `tool_invocations.id`，失败或兼容路径可为空。 |
| `query` | 本次 `knowledge_search` 检索 query。 |
| `provider` | 检索 provider，当前为 `knowledge_search`。 |
| `matched_chunk_count` | 本次命中的 chunk 数量。 |
| `created_at` | 记录创建时间。 |
| `metadata` | 检索策略、provider 参数、fallback / no-source 等附加信息。 |

必要索引：

```sql
idx_retrieval_logs_user_run (user_id, run_id, created_at)
idx_retrieval_logs_run (run_id)
idx_retrieval_logs_tool_invocation (tool_invocation_id)
idx_retrieval_logs_conversation_created (conversation_id, created_at)
```

## 5. `run_sources` 字段

| 字段 | 契约 |
| --- | --- |
| `id` | Run source 主键。 |
| `_openid` | CloudBase Auth 用户边界。 |
| `user_id` | Workbench 业务用户边界。 |
| `run_id` | 绑定 DB `agent_runs.id`。 |
| `conversation_id` | 绑定当前 conversation。 |
| `tool_invocation_id` | 绑定 DB `tool_invocations.id`，表示来源来自哪个工具调用。 |
| `retrieval_log_id` | 绑定本次检索记录。 |
| `document_id` | 绑定 `knowledge_documents.id`，允许为空以保留历史快照。 |
| `chunk_id` | 绑定 `knowledge_chunks.id`，允许为空以保留历史快照。 |
| `citation_label` | UI 展示用 citation label，例如 `[S1]`，不作为主关系。 |
| `source_order` | 来源排序，保证 citation 和 Report 展示顺序稳定。 |
| `title` | 来源标题快照。 |
| `preview` | 来源内容摘要快照。 |
| `score` | 检索相关度分数。 |
| `source_type` | 来源类型：`knowledge` / `tool` / `report` / `manual`。 |
| `used_in_answer` | 是否被最终回答引用。 |
| `no_source_reason` | 无来源或未命中原因。 |
| `created_at` | 记录创建时间。 |
| `metadata` | 检索策略、provider、fallback / no-source 等附加信息。 |

必要索引：

```sql
idx_run_sources_user_run_order (user_id, run_id, source_order)
idx_run_sources_run (run_id)
idx_run_sources_tool_invocation (tool_invocation_id)
idx_run_sources_retrieval_log (retrieval_log_id)
idx_run_sources_document_chunk (document_id, chunk_id)
idx_run_sources_conversation_created (conversation_id, created_at)
```

## 6. 关系契约

```text
retrieval_logs.run_id -> agent_runs.id
retrieval_logs.conversation_id -> conversations.id
retrieval_logs.tool_invocation_id -> tool_invocations.id

run_sources.run_id -> agent_runs.id
run_sources.conversation_id -> conversations.id
run_sources.tool_invocation_id -> tool_invocations.id
run_sources.retrieval_log_id -> retrieval_logs.id
run_sources.document_id -> knowledge_documents.id
run_sources.chunk_id -> knowledge_chunks.id
```

要求：

- 所有私有查询必须带 `_openid + user_id` 边界。
- `citationLabel` 只用于展示，不作为主关系。
- `runtimeRunId` / `metadata.runtimeRunId` 不得用于 source 归属。
- 不能从文本 citation 或展示 label 反推主归属。

## 7. 数据流

```text
knowledge_search
  -> tool_invocations
  -> LangChain Retriever / Document
  -> retrieval_logs
  -> run_sources
  -> mapper
  -> canonical Source
  -> ViewModel
  -> Chat / Run Trace / Source Panel / Report / Evaluation
```

要求：

- 同一轮 `knowledge_search` 的来源数据只能标准化一次。
- LangChain Document 只能在 mapper / lineage 边界标准化，component 不得直接读取 raw metadata。
- Chat、Run Trace、Report、Evaluation 不各自解析 raw tool output。
- 无来源时必须保留明确空态或 `noSourceReason`。
- 旧 run 没有 `run_sources` 时，不得从 raw event 假装完整 lineage。

LangGraph Retriever node 契约：

- retriever node 调度 LangChain Retriever / Document，但输出必须标准化为 `RetrievalLog` 和 `RunSource`。
- LangChain Document 的 `pageContent`、`metadata`、score、citation 信息只在 lineage 边界解析一次。
- retriever node 的 stream / trace event 只能作为 Run Trace 事件来源，不能替代 `retrieval_logs` / `run_sources` 主事实源。
- LangGraph checkpoint id、retriever run id 或 LangSmith trace id 只能进入 metadata / debug，不能作为 source / retrieval 主关系。
- 无命中、权限拒绝、检索错误和 fallback 必须写入明确 `noSourceReason` 或 error / fallback 状态。

## 8. Report / Trace / Evaluation 关系

Chat：

- 可以展示 citation label。
- 必须能关联标准化 source。
- 不能只靠文本 citation 判断来源归属。

Run Trace：

- 展示 `knowledge_search` 过程和 sources。
- 不把 raw tool payload 作为主视图。
- tool invocation 和 source 必须回到同一个 canonical `runId`。

Report：

- report source 必须绑定同一个 `runId`。
- 刷新后 report 应能恢复它引用的 source。
- Report 不得长期只依赖 `run_events.payload`。

Evaluation：

- RAG 质量评估必须基于 retrieval / source lineage。
- 输入应能拿到 query、matched chunks、scores、usedInAnswer 和 noSourceReason。
- 不能只靠文本 citation 或 raw event 判断。

## 9. 验收标准

- source 能按 `runId` 查询。
- source 能绑定 `toolInvocationId`。
- source 能绑定 `documentId` / `chunkId`。
- `retrieval_logs` 能按 `run_id` 查询。
- `run_sources` 能按 `run_id + source_order` 查询。
- `run_sources` 保留 `document_id` / `chunk_id` / `score` / `citation_label`。
- Chat / Run Trace / Report 消费同一份标准化 source。
- Report 刷新后能恢复 source。
- 多轮 run 下 source 不串。
- Evaluation 消费 retrieval / source 标准化结果。
- raw event 不作为主来源。
- `runtimeRunId` 不参与 source 归属。
