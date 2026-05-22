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

## 5. 持久化表设计

本阶段先冻结 schema 决策，不立即建表。第一批目标表为 `retrieval_logs` 和 `run_sources`。

这两个表服务于 Report source 引用、Run Trace 刷新恢复、后续 Evaluation / Quality Gate。当前 `run_events` / `tool_invocations` 仍可短期作为兼容和 raw/debug 来源，但不是长期 source 主数据源。

### 5.1 `retrieval_logs`

`retrieval_logs` 表达一次检索行为，记录 query、provider、命中数量和对应 run / tool invocation。

建议字段：

```sql
id VARCHAR(36) PRIMARY KEY
_openid VARCHAR(128) NOT NULL
user_id VARCHAR(128) NOT NULL
run_id VARCHAR(36) NOT NULL
conversation_id VARCHAR(36) NOT NULL
tool_invocation_id VARCHAR(36) NULL
query TEXT NOT NULL
provider VARCHAR(64) NOT NULL
matched_chunk_count INT UNSIGNED NOT NULL DEFAULT 0
created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
metadata JSON NOT NULL
```

字段用途：

| 字段 | 用途 |
| --- | --- |
| `id` | Retrieval log 主键。 |
| `_openid` | CloudBase Auth 用户边界。 |
| `user_id` | Workbench 业务用户边界。 |
| `run_id` | 绑定 DB `agent_runs.id`。 |
| `conversation_id` | 绑定当前 conversation。 |
| `tool_invocation_id` | 绑定 DB `tool_invocations.id`，允许为空以兼容历史或失败路径。 |
| `query` | 本次 `knowledge_search` 的检索 query。 |
| `provider` | 检索 provider，第一批为 `knowledge_search`。 |
| `matched_chunk_count` | 本次命中的 chunk 数量。 |
| `created_at` | 记录创建时间。 |
| `metadata` | 检索策略、provider 参数、fallback / no-source 等附加信息。 |

建议索引：

```sql
idx_retrieval_logs_user_run (user_id, run_id, created_at)
idx_retrieval_logs_run (run_id)
idx_retrieval_logs_tool_invocation (tool_invocation_id)
idx_retrieval_logs_conversation_created (conversation_id, created_at)
```

### 5.2 `run_sources`

`run_sources` 表达一次 Agent Run 中可展示、可引用、可评估的来源片段。

建议字段：

```sql
id VARCHAR(36) PRIMARY KEY
_openid VARCHAR(128) NOT NULL
user_id VARCHAR(128) NOT NULL
run_id VARCHAR(36) NOT NULL
conversation_id VARCHAR(36) NOT NULL
tool_invocation_id VARCHAR(36) NULL
retrieval_log_id VARCHAR(36) NULL
document_id VARCHAR(36) NULL
chunk_id VARCHAR(36) NULL
citation_label VARCHAR(32) NULL
source_order INT UNSIGNED NOT NULL DEFAULT 0
title VARCHAR(255) NOT NULL
preview TEXT NOT NULL
score DECIMAL(8,4) NULL
source_type VARCHAR(32) NOT NULL
used_in_answer TINYINT(1) NOT NULL DEFAULT 0
no_source_reason VARCHAR(128) NULL
created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
metadata JSON NOT NULL
```

字段用途：

| 字段 | 用途 |
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
| `source_type` | 来源类型，例如 `knowledge` / `tool` / `report` / `manual`。 |
| `used_in_answer` | 是否被最终回答引用。 |
| `no_source_reason` | 无来源或未命中原因。 |
| `created_at` | 记录创建时间。 |
| `metadata` | 检索策略、provider、fallback / no-source 等附加信息。 |

建议索引：

```sql
idx_run_sources_user_run_order (user_id, run_id, source_order)
idx_run_sources_run (run_id)
idx_run_sources_tool_invocation (tool_invocation_id)
idx_run_sources_retrieval_log (retrieval_log_id)
idx_run_sources_document_chunk (document_id, chunk_id)
idx_run_sources_conversation_created (conversation_id, created_at)
```

### 5.3 字段取舍

- 第一批不加 `raw_payload`。raw 继续留在 `tool_invocations.output`，避免多事实源和存储膨胀。
- 保留 `metadata`，用于检索策略、provider、fallback / no-source 等附加信息。
- 必须保留 `source_order`，保证 citation 展示顺序稳定。
- `content_hash` / `content_snapshot` 后置。当前先用 `title + preview + citation_label + score` 形成轻量快照。

### 5.4 关系与删除策略

目标关系：

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

删除策略建议：

- `run_id`：`ON DELETE CASCADE`
- `conversation_id`：`ON DELETE CASCADE`
- `tool_invocation_id`：`ON DELETE SET NULL`
- `retrieval_log_id`：`ON DELETE SET NULL`
- `document_id` / `chunk_id`：nullable + `ON DELETE SET NULL`，避免知识库删除后历史 source 丢失。
- `_openid` / `user_id`：所有私有查询必须带上。

如果 CloudBase MySQL FK 行为不稳定，可采用逻辑外键策略：

- migration 保留索引，不加 FK。
- 后端写入前校验 ownership。
- 查询以 `_openid + user_id + run_id` 过滤。
- 逻辑外键是 fallback 方案，不是首选。

## 6. ID 绑定规则

- `runId` 必须是 DB `agent_runs.id`。
- `toolInvocationId` 长期应绑定 DB `tool_invocations.id`。
- `documentId` 对应 `knowledge_documents.id`。
- `chunkId` 对应 `knowledge_chunks.id`。
- `citationLabel` 只用于展示，不作为主关系。
- `runtimeRunId` 不得用于 source 归属。
- `metadata.runtimeRunId` 不得优先于 DB `runId`。

source / retrieval 的主关系必须跟随 `docs/id-contract.md`。任何从 `runtimeRunId`、文本 citation 或展示 label 反推归属的做法，都只能作为临时兼容或调试手段，不能进入长期业务主链路。

## 7. 数据流目标

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

## 8. 短期兼容策略

当前允许短期保留：

- 从 `run_events.rag_sources_ready` 恢复展示型 sources。
- 从 `tool_invocations.output` 兜底重建 sources。
- `RunSnapshot.sources` 可以继续作为展示型 ViewModel 输入。

但必须明确：

- 这不是完整 lineage。
- 后续 Report / Evaluation 不能长期只依赖 event payload。
- 新 source / retrieval 持久化实现后，应逐步收敛 event payload、tool output 和 `RunSnapshot.sources` 的职责。

短期兼容只能服务现有展示和迁移，不得阻止后续将 source / retrieval 变成可查询、可绑定、可评估的持久化对象。

## 9. Report / Chat / Run Trace / Evaluation 要求

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

## 10. 分阶段实施计划

Phase 2D-2A：Source / RAG Lineage 契约文档

- 新增本文档。
- 在生命周期、架构、ID 契约、流程和 Codex 规则中引用本文。

Phase 2D-2B：后端 schema / migration 方案只读审查

- 明确是否新增 retrieval/source 表。
- 明确表字段、索引、权限边界和迁移顺序。

Phase 2D-2B-doc：冻结持久化表设计

- 冻结 `retrieval_logs` / `run_sources` 的字段、索引、关系和删除策略。
- 不立即建表，不改后端写入。

Phase 2D-2C：新增 migration

- 只建 `retrieval_logs` / `run_sources`。
- 不改函数，不改 UI。

Phase 2D-2D：`knowledge_search` 写入 retrieval/source

- 写入 retrieval log 和 run sources。
- 绑定 DB `runId`、conversationId、DB `toolInvocationId`、documentId、chunkId。

Phase 2D-2E：`workbench-runs` 读取 canonical sources

- 读取并返回 retrieval/source。
- 旧 run 没有 `run_sources` 时保留明确空态和短期兼容路径。

Phase 2D-2F：Run Trace / Source Panel 消费 canonical sources

- 从 raw tool output / event payload 统一映射 canonical Source。
- component 只消费 ViewModel。

Phase 2D-2G：Report source 引用

- Report 引用同一份 source model。
- report 刷新后能恢复 source / citation 明细。

Phase 2D-2H：为 Evaluation 提供 RAG 质量输入

- Evaluation 能消费 retrieval / source lineage。
- 支撑 RAG 命中、引用、fallback 和 noSourceReason 评估。

后续阶段：Chat / Run Trace / Report 同源展示

- Chat citation、Source Panel、Run Trace、Report 使用同一 source 数据。
- 避免多处 formatter / parser。

## 11. 验收标准

- source 能按 `runId` 查询。
- source 能绑定 `toolInvocationId`。
- source 能绑定 `documentId` / `chunkId`。
- Chat / Run Trace / Report 能消费同一份标准化 source。
- Report 刷新后能恢复 source。
- 多轮 run 下 source 不串。
- Evaluation 能拿到 retrieval / source 作为输入。
- component 不解析 raw tool payload。
- `runtimeRunId` 不参与 source 归属。
- migration 后表结构可验证。
- `retrieval_logs` 能按 `run_id` 查询。
- `run_sources` 能按 `run_id + source_order` 查询。
- `run_sources` 能保留 `document_id` / `chunk_id` / `score` / `citation_label`。
- 旧 run 没有 `run_sources` 时应显示明确空态，不从 raw event 假装完整 lineage。
- Report / Evaluation 后续不得只依赖 `run_events.payload`。
