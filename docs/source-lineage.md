# Source / RAG Lineage Contract

本文档冻结 AI Agent Workbench 的 Source / RAG Lineage 契约。后续涉及 `knowledge_search`、RAG sources、citations、report sources、retrieval、source persistence 的修改，都必须先对齐本文。

## 1. 文档定位

本文是 AI Agent Workbench 的 Source / RAG Lineage 契约文档。

它服务于 AI Agent Enterprise Lifecycle 中的以下节点：

- Context / Memory / Data
- Tool Governance / Data Access
- Observability / Trace
- Artifact / Source / Report
- Persistence / Lineage
- Evaluation / Quality Gate

后续涉及 `knowledge_search`、RAG sources、citations、report sources、retrieval、source persistence 的修改，都必须先对齐本文。如果 Source / RAG lineage 契约本身需要调整，必须先更新本文，再进入 schema、API、mapper、store、ViewModel 或 component 修改。

## 2. 当前现状

当前 Source / RAG 已有展示链路，但不是完整 lineage：

- `knowledge_documents` / `knowledge_chunks` 已存在，作为当前 CloudBase MySQL 知识库。
- `knowledge_search` 通过 `tool_invocations` 和 `run_events` 进入 Run Trace。
- RAG sources 当前主要通过 `rag_sources_ready` event 恢复。
- `RunSnapshot.sources` 是展示型数组，不是完整 lineage。
- 当前没有独立 `source` / `retrieval` / `run_sources` 表。
- Chat 主要通过文本 citation 展示来源，例如 `[S1]`。
- Report 当前不包含结构化 source / citation 明细。
- Evaluation 当前不能可靠评估 RAG 质量。

因此，当前实现可以支撑基础 Source Panel 展示，但不能支撑可追踪、可恢复、可评估的 Source / RAG lineage。

## 3. 长期目标

Source / Retrieval 必须成为可追踪对象。每个 source 必须能追溯到：

- `runId = agent_runs.id`
- `conversationId`
- `toolInvocationId = tool_invocations.id`
- `documentId`
- `chunkId`
- `citationLabel`
- `score`
- `sourceType`
- `createdAt`

长期目标是让 Report / Chat / Run Trace / Evaluation 消费同一份标准化 Source model。原始 tool output 只能作为 raw/debug 数据，不作为 UI 主数据源，不作为 Report 或 Evaluation 的长期判定来源。

## 4. 核心对象模型

目标对象语义如下。名称可以根据后续实际实现调整；本文先冻结语义，不要求 Phase 2D-2A 立即建表。

```ts
type RunSource = {
  id: string
  runId: string
  conversationId: string
  toolInvocationId?: string
  documentId?: string
  chunkId?: string
  citationLabel?: string
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

`RunSource` 表达可展示和可引用的来源片段。`RetrievalLog` 表达一次检索行为。两者都必须能回到同一个 canonical `runId`。

## 5. ID 绑定规则

- `runId` 必须是 DB `agent_runs.id`。
- `toolInvocationId` 长期应绑定 DB `tool_invocations.id`。
- `documentId` 对应 `knowledge_documents.id`。
- `chunkId` 对应 `knowledge_chunks.id`。
- `citationLabel` 只用于展示，不作为主关系。
- `runtimeRunId` 不得用于 source 归属。
- `metadata.runtimeRunId` 不得优先于 DB `runId`。

source / retrieval 的主关系必须跟随 `docs/id-contract.md`。任何从 `runtimeRunId`、文本 citation 或展示 label 反推归属的做法，都只能作为临时兼容或调试手段，不能进入长期业务主链路。

## 6. 数据流目标

目标链路：

```text
knowledge_search
  -> tool_invocations
  -> retrieval log
  -> run sources
  -> Run Trace / Source Panel
  -> Chat citations
  -> Report sources
  -> Evaluation
```

数据分层要求：

- Raw tool output 进入 mapper。
- mapper 生成 canonical Source。
- store 保存标准化 Source。
- ViewModel 给 UI。
- component 不解析 raw payload。

同一轮 `knowledge_search` 的来源数据只能标准化一次。Chat、Run Trace、Report、Evaluation 不应各自解析 raw tool output 或各自维护不同 source formatter。

## 7. 短期兼容策略

当前允许短期保留：

- 从 `run_events.rag_sources_ready` 恢复展示型 sources。
- 从 `tool_invocations.output` 兜底重建 sources。
- `RunSnapshot.sources` 可以继续作为展示型 ViewModel 输入。

但必须明确：

- 这不是完整 lineage。
- 后续 Report / Evaluation 不能长期只依赖 event payload。
- 新 source / retrieval 持久化实现后，应逐步收敛 event payload、tool output 和 `RunSnapshot.sources` 的职责。

短期兼容只能服务现有展示和迁移，不得阻止后续将 source / retrieval 变成可查询、可绑定、可评估的持久化对象。

## 8. Report / Chat / Run Trace / Evaluation 要求

Chat：

- 可以展示 citation label。
- 后续应能关联标准化 source。
- 不能只靠文本 citation 判断来源归属。

Run Trace：

- 展示 `knowledge_search` 过程和 sources。
- 不直接展示 raw tool payload 作为主视图。
- tool invocation 和 source 应能回到同一个 DB `runId`。

Report：

- 后续报告应包含 source / citation 明细。
- report source 必须绑定同一个 `runId`。
- 刷新后 report 应能恢复它引用的 source。

Evaluation：

- RAG 质量评估必须基于 retrieval / source lineage。
- 不能只靠文本 citation 判断。
- Evaluation 输入应能拿到 query、matched chunks、scores、usedInAnswer 和 noSourceReason。

## 9. 分阶段实施计划

Phase 2D-2A：Source / RAG Lineage 契约文档

- 新增本文档。
- 在生命周期、架构、ID 契约、流程和 Codex 规则中引用本文。

Phase 2D-2B：后端 schema / migration 方案，只读或文档

- 明确是否新增 retrieval/source 表。
- 明确表字段、索引、权限边界和迁移顺序。

Phase 2D-2C：新增 source / retrieval 持久化

- 写入 retrieval log 和 run sources。
- 绑定 DB `runId`、conversationId、DB `toolInvocationId`、documentId、chunkId。

Phase 2D-2D：mapper / ViewModel 收口

- 从 raw tool output / event payload 统一映射 canonical Source。
- component 只消费 ViewModel。

Phase 2D-2E：Report source 引用

- Report 引用同一份 source model。
- report 刷新后能恢复 source / citation 明细。

Phase 2D-2F：Chat / Run Trace / Report 同源展示

- Chat citation、Source Panel、Run Trace、Report 使用同一 source 数据。
- 避免多处 formatter / parser。

Phase 2D-2G：为 Evaluation 提供 RAG 质量输入

- Evaluation 能消费 retrieval / source lineage。
- 支撑 RAG 命中、引用、fallback 和 noSourceReason 评估。

## 10. 验收标准

- source 能按 `runId` 查询。
- source 能绑定 `toolInvocationId`。
- source 能绑定 `documentId` / `chunkId`。
- Chat / Run Trace / Report 能消费同一份标准化 source。
- Report 刷新后能恢复 source。
- 多轮 run 下 source 不串。
- Evaluation 能拿到 retrieval / source 作为输入。
- component 不解析 raw tool payload。
- `runtimeRunId` 不参与 source 归属。
