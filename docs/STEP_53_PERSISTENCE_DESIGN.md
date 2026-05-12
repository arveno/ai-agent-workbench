# Step 53 正式设计文档：Workbench 数据持久化与示例体系

生成日期：2026-05-12

参考文档：`docs/STEP_53_PERSISTENCE_PRECHECK_REPORT.md`

本阶段只做正式设计，不创建 SQL migration，不写业务代码，不改前端逻辑，不提交 Git。

## 1. 当前问题总结

当前 Workbench 已经具备统一前端运行态，核心结构是 `WorkbenchSession`、`WorkbenchMessage`、`RunSnapshot`、`RunEvent`。Mock 和真实 Agent 最终都落到这套结构展示，右侧 Run Trace、工具调用、图表和报告确认流程也已经可用。

但当前数据底座仍停留在浏览器运行态：

1. 会话、消息、Run、Tool、Report 当前没有数据库级持久化。
2. 当前主要依赖 `sessionStorage` 保存 `sessions/messages/runsById/latestRunId`，只适合同一浏览器会话内刷新恢复。
3. 左侧默认会话来自 `src/mocks/sessions.ts`，属于假数据 / 静态数据 / mock 数据。
4. 示例任务来自 `src/mocks/tasks.ts`，属于假数据 / 静态数据 / mock 数据。
5. 示例任务点击后不是复制模板，而是直接写入当前会话，可能把 Mock 示例写进用户正在使用的真实 Agent 会话。
6. 最近使用工具在 `Sidebar.tsx` 中写死为静态标签，不来自真实工具调用。
7. RAG 没有真实检索链路，当前只有 Mock 来源和右侧展示占位。
8. Report 不是 artifact，只是 `WorkbenchMessage.kind = 'report'` 的消息。
9. `agent_run_usage` 只是 quota usage / audit 记录，不是完整 Run Trace。
10. 长会话一次性渲染 `chatBlocks`，assistant Markdown 直接渲染，可能卡顿。
11. 当前会话 / 消息 / run 缺少 `userId` / owner / visibility。
12. Mock 和真实 Agent 工具命名存在不完全一致风险，例如 `query_data`、`knowledge_search`、`query_table`、`aggregate_table` 混用。

本阶段原则：

### 1. 功能完整，规模小，方案专业

本阶段不是做大型企业平台，而是做一个小规模但逻辑闭环的 AI Workbench。

必须做到：

```txt
刷新可恢复
数据有归属
示例和用户会话隔离
Run / Tool / Report 有结构化数据
Mock 和真实 Agent 共用展示结构
RAG 有最小闭环
长会话有基础性能保护
```

### 2. 不是补丁式开发

后续实现不允许用“哪里假改哪里”的补丁方式。

必须先形成：

```txt
数据模型
API 边界
RLS 边界
前端状态迁移
ViewModel / selector
组件拆分标准
验收标准
```

再逐步落地。

### 3. 不过度抽象，但要易读、好维护

代码风格原则：

- 不追求复杂架构。
- 不做当前用不到的大抽象。
- 不写万能 utils。
- 不写巨型组件。
- 允许为可读性拆组件，即使组件只使用一次。
- 文件按业务职责拆分。
- 组件只展示和触发 action，不解释复杂业务状态。
- 复杂状态必须先进入 ViewModel / selector。
- Store action 负责状态一致性。
- 不使用 `any`。
- 所有 API 返回值必须有清晰类型。
- Mock 和真实流程共用同一套 UI 结构，差异只体现在数据来源。

## 2. 设计目标

正式目标：

```txt
建立 Workbench 数据底座，让会话、消息、Run、Tool、Report、示例模板、RAG 来源和最近工具形成逻辑闭环。
```

### 1. 真实会话系统

- 登录用户有真实 `conversations`。
- 消息写入 `messages`。
- 刷新后恢复。
- 跨浏览器可恢复。
- 左侧会话从数据库读取。
- 支持 loading / empty / error。

### 2. 示例模板系统

- 示例任务不再是纯 UI 假数据。
- 示例模板和用户真实会话隔离。
- 点击示例后复制成用户 private conversation。
- 支持超长上下文示例。
- 支持 RAG 示例。

### 3. Run / Tool / Report 持久化

- `agent_runs` 存 Run 概览。
- `run_events` 存事件流。
- `tool_invocations` 存工具调用。
- `report_artifacts` 存报告。
- 刷新后恢复右侧 Run Trace 和报告。

### 4. 最近工具真实化

- 左侧最近工具从 `tool_invocations` 聚合。
- 新用户显示空状态。
- 显示工具名、最近时间、调用次数。

### 5. RAG 最小闭环

- 有 knowledge source / document / chunk。
- 有 `rag_search` tool。
- 有 retrieval log。
- 回答带引用。
- 右侧检索来源来自真实 retrieval log。

### 6. 长会话性能

- 不一次性渲染所有历史消息。
- 最近 N 条加载。
- 长文本折叠。
- Markdown memo。
- 大 JSON lazy expand。
- Run Trace 摘要展示。

## 3. 非目标 / 暂不做

本阶段不做：

- 完整企业级 RAG 后台。
- 完整向量库管理。
- 多工作区 / 多租户复杂体系。
- Admin UI。
- Token / Cost / Latency 面板。
- 完整报告编辑器。
- 报告 PDF 导出。
- Three.js Agent Flow。
- 复杂 Run History 搜索。
- 全量重构 Zustand store。
- 一次性删除所有 mock。
- 直接把示例任务写进用户真实会话。
- 为了长会话示例直接塞超大 DOM。

## 4. 领域模型总览

核心链路：

```txt
User
  ↓
Conversation
  ↓
Message
  ↓
AgentRun
  ↓
RunEvent
  ↓
ToolInvocation
  ↓
Chart / ReportArtifact / RagRetrievalLog
```

最小闭环说明：

- User 是 Supabase Auth 用户。
- Conversation 是会话容器，负责归属、标题、状态、最新 Run 和消息数量。
- Message 是聊天消息，负责用户输入、assistant 回复、错误、系统提示和报告消息映射。
- AgentRun 是一次 Agent 执行，负责 Run 概览、状态、prompt、plan、结论、图表和报告状态。
- RunEvent 是流式事件和 Trace，保留 SSE 事件序列，便于恢复和排查。
- ToolInvocation 是工具调用记录，保留工具名、输入摘要、输出摘要、耗时和错误。
- ReportArtifact 是报告产物，和普通聊天消息分离，支持版本、状态和后续下载 / 编辑扩展。
- DemoTemplate 是系统示例模板，包括任务模板和会话模板。
- KnowledgeSource / Document / Chunk 是 RAG 数据源。
- RagRetrievalLog 是检索记录，用于回答引用和右侧真实来源展示。

模板复制关系：

```txt
DemoTaskTemplate / DemoConversationTemplate
  ↓ copy
Conversation(private, user_id)
  ↓
Messages / AgentRuns / ReportArtifacts
```

RAG 关系：

```txt
KnowledgeSource
  ↓
KnowledgeDocument
  ↓
KnowledgeChunk
  ↓ rag_search
RagRetrievalLog
  ↓
Run Trace / RagSourcesCard / Answer citations
```

## 5. 数据表设计

说明：本节只定义设计，不创建 migration。后续 Step 54 开始按阶段落地。

### 1. `conversations`

用途：用户真实会话容器，替代当前只在前端存在的 `WorkbenchSession` 持久化边界。

核心字段：

```txt
id uuid primary key
user_id uuid references auth.users(id)
title text
summary text
mode text -- mock / agent / mixed
status text -- active / running / completed / failed / archived
visibility text -- private / demo / system
source_template_id uuid nullable
latest_run_id uuid nullable
message_count integer
created_at timestamptz
updated_at timestamptz
archived_at timestamptz nullable
metadata jsonb
```

索引建议：

- `(user_id, updated_at desc)`：会话列表。
- `(user_id, status, updated_at desc)`：过滤 active / archived。
- `(source_template_id)`：追踪模板复制来源。
- `(latest_run_id)`：恢复最新 Run。

RLS 建议：

- private conversation：`auth.uid() = user_id` 才能 select / insert / update / delete。
- 不建议把 demo/system 会话直接暴露为用户会话；demo/system 走 template 表。

是否用户私有：是，真实用户会话必须私有。

是否允许匿名访问：不允许访问真实表。匿名用户继续使用 sessionStorage demo。

和其他表关系：

- 一对多 `messages`。
- 一对多 `agent_runs`。
- 一对多 `tool_invocations`。
- 一对多 `report_artifacts`。
- 一对多 `rag_retrieval_logs`。

### 2. `messages`

用途：持久化会话消息，替代当前仅写入 `sessionStorage` 的 `WorkbenchMessage`。

核心字段：

```txt
id uuid primary key
conversation_id uuid
user_id uuid
role text -- user / assistant / system
kind text -- text / tool_summary / report / error / system_notice
content text
run_id uuid nullable
client_message_id text nullable
status text -- pending / streaming / completed / failed
created_at timestamptz
metadata jsonb
```

索引建议：

- `(conversation_id, created_at asc)`：消息时间线。
- `(user_id, created_at desc)`：用户消息审计和回收。
- `(run_id)`：从 Run 找关联消息。
- `(user_id, client_message_id)` unique partial：防重复写入。

RLS 建议：

- `user_id = auth.uid()`。
- insert 时服务端或 RLS check 要保证 `conversation_id` 属于当前用户。

是否用户私有：是。

是否允许匿名访问：不允许。匿名 demo 仍用 sessionStorage。

和其他表关系：

- 多对一 `conversations`。
- 可关联 `agent_runs`。
- report message 可由 `report_artifacts` 映射生成，不应成为报告唯一来源。

### 3. `agent_runs`

用途：持久化一次 Agent 执行的概览和可恢复快照。

核心字段：

```txt
id uuid primary key
conversation_id uuid
user_id uuid
mode text -- mock / agent
status text -- pending / running / completed / failed / stopped
intent text
prompt text
plan jsonb
data_source_snapshot jsonb
chart_data jsonb
conclusion text
conclusion_source text
report_state text
started_at timestamptz
completed_at timestamptz
elapsed_ms integer
error_message text
metadata jsonb
```

索引建议：

- `(conversation_id, started_at desc)`：会话内 Run History。
- `(user_id, started_at desc)`：用户 Run History。
- `(user_id, status, started_at desc)`：运行中恢复和异常查询。

RLS 建议：

- `user_id = auth.uid()`。
- insert/update 主要由服务端 API 执行，避免客户端伪造真实 Agent Run。

是否用户私有：是。

是否允许匿名访问：不允许。

和其他表关系：

- 多对一 `conversations`。
- 一对多 `run_events`。
- 一对多 `tool_invocations`。
- 一对多 `report_artifacts`。
- 一对多 `rag_retrieval_logs`。

### 4. `run_events`

用途：持久化原始 Run Event 序列，补齐当前刷新后 `runEventLog` 丢失的问题。

核心字段：

```txt
id uuid primary key
run_id uuid
conversation_id uuid
user_id uuid
seq integer
event_type text
payload jsonb
created_at timestamptz
```

索引建议：

- `(run_id, seq asc)` unique：事件重放和幂等。
- `(conversation_id, created_at asc)`：按会话调试。
- `(user_id, created_at desc)`：用户事件审计。

RLS 建议：

- `user_id = auth.uid()`。
- 客户端只读；写入由服务端流式 API 负责。

是否用户私有：是。

是否允许匿名访问：不允许。

和其他表关系：

- 多对一 `agent_runs`。
- 冗余 `conversation_id` 和 `user_id` 是为了 RLS、查询和避免深 join。

### 5. `tool_invocations`

用途：持久化工具调用，支撑 Run Inspector 恢复和最近工具真实统计。

核心字段：

```txt
id uuid primary key
run_id uuid
conversation_id uuid
user_id uuid
tool_name text
display_name text
status text
input jsonb
input_summary text
output jsonb
output_summary text
started_at timestamptz
finished_at timestamptz
elapsed_ms integer
error text
metadata jsonb
```

索引建议：

- `(run_id, started_at asc)`：Run 详情。
- `(user_id, tool_name, finished_at desc)`：最近工具聚合。
- `(conversation_id, finished_at desc)`：会话工具历史。

RLS 建议：

- `user_id = auth.uid()`。
- 客户端只读；真实 Agent 工具调用由服务端写入。

是否用户私有：是。

是否允许匿名访问：不允许。

和其他表关系：

- 多对一 `agent_runs`。
- 多对一 `conversations`。
- `rag_search` 调用会产生对应 `rag_retrieval_logs`。

### 6. `report_artifacts`

用途：持久化报告产物，替代报告只作为 message 的状态。

核心字段：

```txt
id uuid primary key
conversation_id uuid
run_id uuid
user_id uuid
title text
content_markdown text
status text -- draft / generated / archived
version integer
created_at timestamptz
updated_at timestamptz
metadata jsonb
```

索引建议：

- `(conversation_id, updated_at desc)`：会话报告列表。
- `(run_id, version desc)`：Run 下报告版本。
- `(user_id, updated_at desc)`：用户报告历史。

RLS 建议：

- `user_id = auth.uid()`。
- 用户只能读写自己的报告。

是否用户私有：是。

是否允许匿名访问：不允许。

和其他表关系：

- 多对一 `conversations`。
- 多对一 `agent_runs`。
- 可映射成 `WorkbenchMessage.kind = 'report'` 展示。

### 7. `demo_task_templates`

用途：公开示例任务模板，替代 `src/mocks/tasks.ts` 作为长期数据来源。

核心字段：

```txt
id uuid primary key
title text
description text
prompt text
category text -- intro / analysis / rag / long_context / report / fallback
recommended_mode text -- mock / agent
sort_order integer
is_enabled boolean
created_at timestamptz
updated_at timestamptz
metadata jsonb
```

索引建议：

- `(is_enabled, sort_order asc)`：示例列表。
- `(category, sort_order asc)`：分类展示。

RLS 建议：

- 所有人可 select enabled templates。
- 普通用户不可 insert/update/delete。
- 写入使用 migration seed 或 service role。

是否用户私有：否，系统模板。

是否允许匿名访问：允许公开读取 enabled templates。

和其他表关系：

- 点击后通过 copy/create 流程生成用户 private conversation。

### 8. `demo_conversation_templates`

用途：公开示例会话模板，支持超长上下文、多轮追问、RAG 和兜底示例。

核心字段：

```txt
id uuid primary key
title text
description text
category text
visibility text -- demo / system
seed_messages jsonb
seed_runs jsonb
seed_reports jsonb
sort_order integer
is_enabled boolean
created_at timestamptz
updated_at timestamptz
metadata jsonb
```

索引建议：

- `(visibility, is_enabled, sort_order asc)`：公开模板读取。
- `(category, sort_order asc)`：分类展示。

RLS 建议：

- 所有人可 select `visibility in ('demo', 'system') and is_enabled = true`。
- 普通用户不可写。

是否用户私有：否，系统模板。

是否允许匿名访问：允许公开读取 enabled templates。

和其他表关系：

- copy API 将 seed 内容复制到 `conversations/messages/agent_runs/report_artifacts`。

### 9. `knowledge_sources`

用途：RAG 知识源容器。

核心字段：

```txt
id uuid primary key
user_id uuid nullable
visibility text -- private / demo / system
name text
type text -- policy / faq / guide / dataset_doc
status text
created_at timestamptz
updated_at timestamptz
metadata jsonb
```

索引建议：

- `(user_id, updated_at desc)`：私有知识库。
- `(visibility, status, updated_at desc)`：demo/system 知识源。

RLS 建议：

- private：`user_id = auth.uid()`。
- demo/system：允许公开读 enabled / active 数据。
- 普通用户不可写 demo/system。

是否用户私有：private 是；demo/system 不是。

是否允许匿名访问：允许读取 demo/system，不允许读取 private。

和其他表关系：

- 一对多 `knowledge_documents`。
- 一对多 `knowledge_chunks`。

### 10. `knowledge_documents`

用途：知识源下的文档记录。

核心字段：

```txt
id uuid primary key
source_id uuid
user_id uuid nullable
title text
uri text nullable
mime_type text
status text
content_text text nullable
metadata jsonb
created_at timestamptz
updated_at timestamptz
```

索引建议：

- `(source_id, created_at asc)`：知识源文档列表。
- `(user_id, updated_at desc)`：用户文档。
- `(status, updated_at desc)`：处理状态。

RLS 建议：

- 继承 source 可见性，同时冗余 `user_id` 方便校验。
- private 文档只允许 owner 访问。
- demo/system 文档允许公开读 active 记录。

是否用户私有：取决于 source visibility。

是否允许匿名访问：只允许 demo/system active 文档。

和其他表关系：

- 多对一 `knowledge_sources`。
- 一对多 `knowledge_chunks`。

### 11. `knowledge_chunks`

用途：RAG 检索最小单位。

核心字段：

```txt
id uuid primary key
document_id uuid
source_id uuid
user_id uuid nullable
chunk_index integer
content text
embedding vector nullable 或 metadata 预留
metadata jsonb
created_at timestamptz
```

说明：第一版可以先不启用 vector，允许 keyword / pg_trgm / 小规模 embedding 之一。

索引建议：

- `(document_id, chunk_index asc)`：文档内 chunk。
- `(source_id, chunk_index asc)`：知识源检索。
- `(user_id, created_at desc)`：私有 chunk。
- 若采用 `pg_trgm`：对 `content` 建 trigram GIN 索引。
- 若采用 vector：对 `embedding` 建向量索引，但第一版不强制。

RLS 建议：

- 继承 source/document 可见性，同时冗余 `user_id`。
- private chunk 只允许 owner 访问。
- demo/system chunk 允许公开读。

是否用户私有：取决于 source visibility。

是否允许匿名访问：只允许 demo/system active chunk。

和其他表关系：

- 多对一 `knowledge_documents`。
- 多对一 `knowledge_sources`。
- 被 `rag_retrieval_logs.results` 引用。

### 12. `rag_retrieval_logs`

用途：记录每次 RAG 检索，支撑回答引用、右侧来源展示和调试。

核心字段：

```txt
id uuid primary key
run_id uuid
conversation_id uuid
user_id uuid
query text
top_k integer
results jsonb
latency_ms integer
created_at timestamptz
metadata jsonb
```

索引建议：

- `(run_id, created_at asc)`：Run 内检索记录。
- `(conversation_id, created_at desc)`：会话检索历史。
- `(user_id, created_at desc)`：用户检索历史。

RLS 建议：

- `user_id = auth.uid()`。
- 写入由服务端 `rag_search` tool 完成。

是否用户私有：是。

是否允许匿名访问：不允许用户私有日志；匿名 demo 可以只在前端展示 seed mock。

和其他表关系：

- 多对一 `agent_runs`。
- 多对一 `conversations`。
- `results` 内引用 `knowledge_chunks`、document title、score、citationLabel。

## 6. RLS 与数据归属设计

### 用户私有数据

这些表必须有 `user_id`：

```txt
conversations
messages
agent_runs
run_events
tool_invocations
report_artifacts
rag_retrieval_logs
```

用户只能访问自己的数据。所有写入接口都必须从服务端认证结果取 `user_id`，不能信任客户端传入的 `user_id`。

### 模板数据

```txt
demo_task_templates
demo_conversation_templates
```

模板可公开读取，但不能由普通用户写入。新增 / 更新模板通过 migration seed、管理脚本或 service role 完成。

### RAG 数据

```txt
knowledge_sources
knowledge_documents
knowledge_chunks
```

支持三种 visibility：

```txt
private：用户自己的知识库
demo：公开演示知识库
system：系统内置知识库
```

读取规则：

- private：仅 `user_id = auth.uid()` 可读。
- demo/system：可公开读 active / enabled 数据。
- 写入规则：普通用户只能写 private；demo/system 只能由 service role 写入。

### `agent_run_usage`

`agent_run_usage` 继续作为 quota / audit usage，不要直接改造成完整 Run 表。

原因：

- 它的职责是额度扣减、审计、状态收口。
- 它不适合承载完整消息、事件、工具输入输出、图表、报告或 RAG 来源。
- 它不建议随会话删除而删除。
- 可以保留或补充 `run_id` / `conversation_id` 快照字段，但它和完整 Run Trace 分工不同。

## 7. API 设计

通用约定：

- 登录用户 API 使用 Supabase access token 鉴权。
- 服务端从 token 解析 user，不接受客户端传 `user_id` 决定归属。
- 返回结构使用清晰 discriminated union：`{ ok: true, data }` 或 `{ ok: false, errorCode, message }`。
- 需要 service role 的 API 只在服务端内部使用 service role，前端永远不能获得 service role key。

### Conversation API

#### `GET /api/workbench/conversations`

用途：读取当前用户会话列表。

请求参数：

```txt
limit number optional
cursor string optional
status active / archived optional
```

返回结构：

```txt
ConversationRecord[]
nextCursor nullable
```

鉴权方式：登录用户 access token。

错误态：unauthorized、auth_unavailable、db_error。

是否需要 service role：通常不需要，可使用用户 JWT + RLS；服务端聚合统计可用 service role。

#### `POST /api/workbench/conversations`

用途：创建当前用户 private conversation。

请求参数：

```txt
title optional
mode mock / agent / mixed optional
source_template_id optional
metadata optional
```

返回结构：

```txt
ConversationRecord
```

鉴权方式：登录用户 access token。

错误态：unauthorized、validation_error、db_error。

是否需要 service role：不需要；如服务端统一写入也可用 service role 但必须校验 user。

#### `GET /api/workbench/conversations/:id`

用途：读取单个 conversation 概览。

请求参数：path `id`。

返回结构：

```txt
ConversationRecord
latestRun optional AgentRunRecord
```

鉴权方式：登录用户 access token。

错误态：unauthorized、not_found、db_error。

是否需要 service role：通常不需要。

#### `PATCH /api/workbench/conversations/:id`

用途：更新标题、摘要、状态或归档。

请求参数：

```txt
title optional
summary optional
status optional
archived_at optional
metadata optional
```

返回结构：

```txt
ConversationRecord
```

鉴权方式：登录用户 access token。

错误态：unauthorized、not_found、validation_error、db_error。

是否需要 service role：通常不需要。

#### `DELETE /api/workbench/conversations/:id`

用途：删除或归档当前用户会话。第一版建议软删除 / archived，避免误删数据链。

请求参数：path `id`。

返回结构：

```txt
{ deleted: true } 或 ConversationRecord(status=archived)
```

鉴权方式：登录用户 access token。

错误态：unauthorized、not_found、conflict_running_run、db_error。

是否需要 service role：通常不需要。若真实删除 cascade，需要严格确认不删除 `agent_run_usage`。

### Message API

#### `GET /api/workbench/conversations/:id/messages`

用途：读取会话消息，第一版默认最近 N 条。

请求参数：

```txt
limit number default 30
before string optional
after string optional
direction older / newer optional
```

返回结构：

```txt
MessageRecord[]
hasMoreBefore boolean
hasMoreAfter boolean
```

鉴权方式：登录用户 access token。

错误态：unauthorized、not_found、db_error。

是否需要 service role：通常不需要。

#### `POST /api/workbench/conversations/:id/messages`

用途：写入用户消息或服务端 assistant 消息。

请求参数：

```txt
role user / assistant / system
kind text / tool_summary / report / error / system_notice
content string
client_message_id optional
run_id optional
status pending / streaming / completed / failed
metadata optional
```

返回结构：

```txt
MessageRecord
idempotent boolean
```

鉴权方式：登录用户 access token。

错误态：unauthorized、not_found、validation_error、duplicate_client_message、db_error。

是否需要 service role：用户消息不需要；真实 Agent assistant 消息可由服务端 service role 写入。

### Demo Template API

#### `GET /api/workbench/demo-tasks`

用途：读取 enabled demo task templates。

请求参数：

```txt
category optional
```

返回结构：

```txt
DemoTaskTemplateRecord[]
```

鉴权方式：可匿名读取。

错误态：db_error。

是否需要 service role：不需要。

#### `GET /api/workbench/demo-conversations`

用途：读取 enabled demo conversation templates。

请求参数：

```txt
category optional
```

返回结构：

```txt
DemoConversationTemplateRecord[]
```

鉴权方式：可匿名读取。

错误态：db_error。

是否需要 service role：不需要。

#### `POST /api/workbench/demo-conversations/:id/copy`

用途：将 demo conversation template 复制为当前用户 private conversation。

请求参数：

```txt
target_title optional
```

返回结构：

```txt
conversation ConversationRecord
messages MessageRecord[]
latestRun optional AgentRunRecord
reports optional ReportArtifactRecord[]
```

鉴权方式：登录用户 access token。匿名用户可选择只复制到 sessionStorage demo，不写 DB。

错误态：unauthorized、not_found、template_disabled、db_error。

是否需要 service role：建议需要。复制 seed messages / runs / reports 是服务端批量写入，必须保证 owner 是当前 user。

### Run API

现有：

```txt
POST /api/agent/run/stream
```

设计要求：该 API 后续在真实 Agent Run 开始时创建 `agent_runs`，流式过程中写 `run_events` / `tool_invocations`，结束时更新 `agent_runs` 和 `agent_run_usage`。

#### `GET /api/workbench/runs/:id`

用途：读取 Run 概览，用于刷新恢复右侧 Run Inspector。

请求参数：path `id`。

返回结构：

```txt
AgentRunRecord
```

鉴权方式：登录用户 access token。

错误态：unauthorized、not_found、db_error。

是否需要 service role：通常不需要。

#### `GET /api/workbench/runs/:id/events`

用途：读取 Run Event 序列，支持重放或调试。

请求参数：

```txt
after_seq optional
limit optional
```

返回结构：

```txt
RunEventRecord[]
```

鉴权方式：登录用户 access token。

错误态：unauthorized、not_found、db_error。

是否需要 service role：通常不需要。

#### `GET /api/workbench/runs/:id/tools`

用途：读取 Run 下工具调用记录。

请求参数：path `id`。

返回结构：

```txt
ToolInvocationRecord[]
```

鉴权方式：登录用户 access token。

错误态：unauthorized、not_found、db_error。

是否需要 service role：通常不需要。

### Report API

#### `GET /api/workbench/reports/:id`

用途：读取报告 artifact。

请求参数：path `id`。

返回结构：

```txt
ReportArtifactRecord
```

鉴权方式：登录用户 access token。

错误态：unauthorized、not_found、db_error。

是否需要 service role：通常不需要。

#### `POST /api/workbench/runs/:id/report`

用途：为 Run 生成并保存报告 artifact。

请求参数：

```txt
title optional
content_markdown optional
source generated / user_confirmed optional
```

返回结构：

```txt
ReportArtifactRecord
message optional MessageRecord
```

鉴权方式：登录用户 access token。

错误态：unauthorized、not_found、run_not_completed、duplicate_report、db_error。

是否需要 service role：建议需要。服务端生成报告时要保证 Run 属于当前用户，并同步更新 `agent_runs.report_state`。

### Recent Tools API

#### `GET /api/workbench/recent-tools`

用途：从真实 `tool_invocations` 聚合当前用户最近工具。

请求参数：

```txt
limit number default 6
```

返回结构：

```txt
RecentToolStat[]
```

字段：

```txt
tool_name
display_name
count
last_used_at
last_conversation_id
last_run_id
```

鉴权方式：登录用户 access token。

错误态：unauthorized、db_error。

是否需要 service role：可不用；复杂 SQL 聚合可放服务端使用 service role，但仍必须按当前 user 过滤。

### RAG API / Tool

#### `rag_search tool`

用途：真实 Agent 需要政策 / 制度 / 依据类信息时检索 chunks。

请求参数：

```txt
query string
top_k number
visibility_scope private / demo / system / mixed
conversation_id
run_id
```

返回结构：

```txt
sources RagSourceRecord[]
retrieval_log_id uuid
latency_ms number
```

鉴权方式：服务端工具内部执行。私有知识库需要登录用户上下文。

错误态：rag_unavailable、no_sources、db_error。

是否需要 service role：建议需要，由服务端工具按 user 和 visibility 显式过滤。

#### `GET /api/workbench/knowledge-sources`

用途：读取当前用户可用知识源，包括 private 和 demo/system。

请求参数：

```txt
visibility optional
```

返回结构：

```txt
RagSourceRecord[]
```

鉴权方式：登录用户可读 private + public；匿名只读 demo/system。

错误态：db_error。

是否需要 service role：通常不需要。

#### `GET /api/workbench/rag-retrievals/:runId`

用途：读取 Run 的真实检索日志和来源。

请求参数：path `runId`。

返回结构：

```txt
RagRetrievalLogRecord[]
```

鉴权方式：登录用户 access token。

错误态：unauthorized、not_found、db_error。

是否需要 service role：通常不需要。

## 8. 前端状态迁移设计

当前 Zustand 不一次性重构。迁移原则是保留 UI runtime model，逐步引入 DB record、API service 和 mapper。

### 当前保留

```txt
WorkbenchSession
WorkbenchMessage
RunSnapshot
RunEvent
```

这些结构继续作为 UI runtime model。组件和现有 reducer 不应在 Step 54 立刻被全量替换。

### 新增 DB record 类型

建议新增：

```txt
ConversationRecord
MessageRecord
AgentRunRecord
RunEventRecord
ToolInvocationRecord
ReportArtifactRecord
DemoTaskTemplateRecord
DemoConversationTemplateRecord
RecentToolStat
RagSourceRecord
```

命名原则：

- `*Record` 表示数据库 / API 原始记录。
- `Workbench*` / `RunSnapshot` 表示 UI runtime。
- ViewModel 表示组件消费结构。

### 新增 Mapper

设计：

```txt
conversationRecordToView
messageRecordToWorkbenchMessage
agentRunRecordToRunSnapshot
runEventsToRunSnapshot
toolInvocationRecordToView
reportArtifactToMessage
demoTemplateToConversationSeed
```

Mapper 职责：

- 处理字段命名转换，例如 `updated_at` -> `updatedAt`。
- 处理状态映射，例如 DB `completed` -> UI `success`。
- 处理缺省值和旧数据兼容。
- 处理 report artifact 到 chat message 的展示映射。
- 不发请求，不读 store，不操作组件状态。

### Store 迁移原则

- store 继续负责 UI runtime 状态。
- API 负责数据库读写。
- mapper 负责 DB record 和 UI model 转换。
- 组件不直接消费 DB raw record。
- `sessionStorage` 短期保留为匿名 / UI cache。
- 登录用户以数据库为主。
- 新增 action 应该以“加载 conversations”“加载 messages”“发送消息并持久化”这种业务意图命名，而不是暴露底层 DB 操作。
- 真实 Agent SSE 回调必须校验 `requestId + conversationId + runId`，防止旧流写入新会话。

### 匿名与登录分流

匿名用户：

- 继续使用当前 Mock / sessionStorage demo。
- 不写用户私有 DB 表。
- 可读取公开 demo templates 和 demo/system knowledge。

登录用户：

- conversations / messages 以 DB 为主。
- sessionStorage 仅做短期 UI cache 或恢复过渡。
- 真实 Agent Run 使用服务端鉴权和 quota。

## 9. ViewModel / Selector 设计

ViewModel 负责把权限、quota、mode、empty/error 文案和复杂状态统一生成，组件只消费 ViewModel。

### `ConversationListView`

输入：`ConversationRecord[]`、加载状态、错误、当前 conversation id、auth 状态。

输出：排序后的列表项、active id、loading/empty/error 文案、是否可新建。

负责：会话列表展示状态、时间格式化、空状态。

不负责：请求 API、修改数据库、解析 Run。

### `ConversationDetailView`

输入：`ConversationRecord`、`MessageRecord[]`、latest run、reports、loading 状态。

输出：标题、摘要、mode/status badge、消息时间线输入、右侧 latest run 输入。

负责：把 conversation 聚合为详情页需要的数据。

不负责：消息分页请求、Run Event 重放。

### `MessageTimelineView`

输入：`WorkbenchMessage[]`、current run、generation status、pagination state。

输出：`ChatBlock[]`、hasMoreBefore、loadingOlder、autoScroll 策略。

负责：消息块构建、report confirm block、error/stopped block、分页状态。

不负责：Markdown 渲染细节、DB record 转换。

### `RunInspectorView`

输入：`RunSnapshot`、`RunEventRecord[]`、`ToolInvocationRecord[]`、`RagRetrievalLogRecord[]`。

输出：概览、步骤摘要、工具摘要、RAG 来源、图表、结论文案。

负责：右侧 Run Inspector 的统一展示结构。

不负责：运行 Agent、写事件。

### `ToolInvocationView`

输入：`ToolInvocationRecord` 或 `RunToolInvocation`。

输出：工具名、展示名、状态、耗时、输入摘要、输出摘要、错误文案、是否可展开 JSON。

负责：工具调用单项展示。

不负责：最近工具聚合。

### `RecentToolsView`

输入：`RecentToolStat[]`、loading、error、auth 状态。

输出：工具列表、空状态、最近时间、次数。

负责：左侧最近工具真实展示状态。

不负责：执行工具、配置工具市场。

### `DemoTaskView`

输入：`DemoTaskTemplateRecord[]`、auth 状态、copy/create 状态。

输出：示例卡片、推荐模式、点击行为提示、loading/empty/error。

负责：公开示例任务列表展示。

不负责：直接写入当前用户会话。

### `DemoConversationTemplateView`

输入：`DemoConversationTemplateRecord[]`、copy 状态、auth 状态。

输出：模板卡片、分类、复制状态、登录提示。

负责：展示可复制的示例会话模板。

不负责：批量写 DB。

### `ReportArtifactView`

输入：`ReportArtifactRecord`、run、conversation。

输出：报告标题、版本、状态、Markdown content、复制/归档按钮状态。

负责：报告 artifact 展示。

不负责：报告生成算法。

### `RagSourcesView`

输入：`RagRetrievalLogRecord[]` 或 `RagSourceRecord[]`。

输出：引用列表、score、document title、chunk preview、usedInAnswer、empty 文案。

负责：真实来源展示和引用标签。

不负责：检索算法。

### `LongMessageView`

输入：message content、kind、折叠阈值、是否展开。

输出：预览内容、展开状态、Markdown render key、是否显示展开按钮。

负责：长文本折叠和 Markdown memo 输入。

不负责：消息持久化。

## 10. 组件拆分与代码风格标准

### 组件拆分

允许为了可读性拆分一次性组件。后续建议结构：

```txt
components/conversation/
  ConversationList.tsx
  ConversationListItem.tsx
  ConversationEmptyState.tsx
  ConversationLoadingState.tsx

components/demo/
  DemoTaskList.tsx
  DemoTaskCard.tsx
  DemoConversationCard.tsx

components/tools/
  RecentToolsCard.tsx
  ToolInvocationList.tsx

components/rag/
  RagSourceList.tsx
  RagSourceCard.tsx

components/report/
  ReportArtifactCard.tsx
```

### Services

```txt
services/conversationApi.ts
services/messageApi.ts
services/demoTemplateApi.ts
services/recentToolsApi.ts
services/reportArtifactApi.ts
services/ragApi.ts
```

Service 原则：

- 每个 service 只处理一个业务边界。
- API 返回值必须有明确类型。
- 不在 service 中直接操作 Zustand。
- 不把所有 API 放进一个巨型 service。

### Utils / Mapper

```txt
utils/conversationMapper.ts
utils/messageMapper.ts
utils/runMapper.ts
utils/toolInvocationMapper.ts
utils/reportArtifactMapper.ts
utils/ragSourceMapper.ts
```

Mapper 原则：

- 只做纯转换。
- 不读写 storage。
- 不发 API。
- 不依赖 React。

### 禁止

- 不写万能 `utils/index.ts`。
- 不写万能 `helpers.ts`。
- 不把所有 API 放进一个巨型 service。
- 不在组件里拼复杂业务规则。
- 不使用 `any`。
- 不在前端 import `src/server/*`。
- 不让旧流写入新会话。
- 不让示例模板污染用户会话。

## 11. 示例任务 / 示例会话模板设计

模板不直接写入用户真实会话。点击后复制为当前用户 private conversation。

### Demo Task Templates

第一版至少 8 个：

#### 1. 你能做什么？

```txt
title: 你能做什么？
description: 了解工作台支持的数据分析、工具调用、图表和报告能力。
prompt: 你能做什么？请用教学质量分析场景举例说明。
category: intro
recommended_mode: mock
展示价值: 展示 capability intro、Run Trace 和工具说明入口。
```

#### 2. 分析 2026 年 5 月教学质量数据，找出异常指标

```txt
title: 分析 2026 年 5 月教学质量数据，找出异常指标
description: 从成绩、出勤、作业完成率等指标中定位异常波动。
prompt: 请分析 2026 年 5 月教学质量数据，找出异常指标，并说明优先排查方向。
category: analysis
recommended_mode: agent
展示价值: 展示真实 Agent 数据分析主链路、工具调用和图表生成。
```

#### 3. 对比本月和上月教学质量指标变化

```txt
title: 对比本月和上月教学质量指标变化
description: 对比月度指标变化，识别显著上升或下降项。
prompt: 请对比本月和上月教学质量指标变化，按年级列出变化最大的指标。
category: analysis
recommended_mode: agent
展示价值: 展示 comparison plan、聚合查询和结论解释。
```

#### 4. 分析最近 6 个月教学质量趋势

```txt
title: 分析最近 6 个月教学质量趋势
description: 观察长期趋势，识别持续改善或持续走低的指标。
prompt: 请分析最近 6 个月教学质量趋势，说明哪些指标持续改善，哪些需要关注。
category: analysis
recommended_mode: agent
展示价值: 展示趋势分析、折线图和长期数据摘要。
```

#### 5. 生成一份简版教学质量报告

```txt
title: 生成一份简版教学质量报告
description: 基于当前分析结果生成 Markdown 简版报告。
prompt: 请基于本月教学质量分析结果生成一份简版报告，包含结论、异常指标和建议。
category: report
recommended_mode: mock
展示价值: 展示报告确认流程和 Report Artifact 后续落点。
```

#### 6. 超长上下文数据分析示例

```txt
title: 超长上下文数据分析示例
description: 使用较长历史数据和多轮消息，验证分页、折叠和懒加载体验。
prompt: 请基于这组较长教学质量历史数据，总结关键变化和异常风险。
category: long_context
recommended_mode: mock
展示价值: 展示长会话性能保护，而不是一次性塞超大 DOM。
```

#### 7. 教学评价政策 RAG 检索示例

```txt
title: 教学评价政策 RAG 检索示例
description: 检索教学评价政策，并在回答中引用来源。
prompt: 请根据教学评价政策说明，哪些情况应被标记为教学质量异常？请引用依据。
category: rag
recommended_mode: agent
展示价值: 展示 `rag_search`、retrieval log、右侧来源和回答引用。
```

#### 8. 数据源异常与兜底示例

```txt
title: 数据源异常与兜底示例
description: 模拟数据源不可用、工具失败或模型兜底回答。
prompt: 如果数据源暂时不可用，请说明你会如何处理，并给出可继续排查的建议。
category: fallback
recommended_mode: mock
展示价值: 展示 error/stopped/fallback 状态和用户可恢复路径。
```

### Demo Conversation Templates

第一版至少 4 个：

#### 1. 超长教学质量数据分析示例

- category：`long_context`
- seed 内容：多轮用户问题、assistant 分析、摘要化 Run Snapshot、较长报告 artifact。
- 展示价值：验证最近 N 条加载、向上加载历史、长文本折叠。

#### 2. 多轮追问生成报告示例

- category：`report`
- seed 内容：用户先问异常指标，再追问原因，最后确认生成报告。
- 展示价值：展示多轮上下文、报告确认和 artifact。

#### 3. 教学评价政策 RAG 检索示例

- category：`rag`
- seed 内容：政策类问题、`rag_search` 检索记录、引用来源和回答。
- 展示价值：展示真实 retrieval log 映射到右侧来源。

#### 4. 数据源异常兜底示例

- category：`fallback`
- seed 内容：工具失败、fallback conclusion、error message、用户重试提示。
- 展示价值：展示异常状态、兜底文案和不污染真实会话的模板复制机制。

复制规则：

```txt
模板不直接写入用户真实会话。
点击后复制为当前用户 private conversation。
```

匿名用户点击模板时可以创建 sessionStorage demo 副本；登录用户点击模板时必须创建 DB private conversation。

## 12. 最近使用工具真实化设计

数据来源：

```txt
tool_invocations
```

聚合维度：

```txt
user_id + tool_name
```

展示字段：

```txt
display_name
count
last_used_at
last_conversation_id
last_run_id
```

空状态：

```txt
完成一次 Agent Run 后，这里会展示最近使用过的工具
```

第一版行为：

- 新用户无工具调用时显示空状态，不再展示写死标签。
- 只展示最近 3-6 个工具。
- 点击工具第一版可以不做跳转，或跳到最近一次 conversation/run。
- 统计只包括 completed / failed 的真实记录，是否包含 mock 由 Step 57 实现时决定。建议登录用户 mock run 也可以写入 `mode=mock` 的 `agent_runs/tool_invocations`，但要和真实 Agent quota 区分。

第一版不做：

- 工具市场。
- 工具配置后台。
- 用户自定义工具。
- 工具权限矩阵。

## 13. RAG 最小闭环设计

必须形成这些对象：

```txt
knowledge_sources
knowledge_documents
knowledge_chunks
rag_search tool
rag_retrieval_logs
RagSourcesCard
回答引用
```

流程：

```txt
用户问政策 / 制度 / 依据类问题
↓
Planner 判断需要 RAG
↓
rag_search tool
↓
检索 chunks
↓
写 rag_retrieval_logs
↓
Run Trace 显示检索步骤
↓
右侧显示真实来源
↓
回答里引用来源
```

第一版检索方案建议：选择 `pg_trgm` / keyword search，不先上完整 vector。

理由：

- 当前项目目标是 Demo Workbench 闭环，不是企业级知识库。
- 教学评价政策示例规模小，关键词和 trigram 足够展示 query -> chunks -> citations。
- 不需要立即引入 embedding 生成、向量索引、批处理和后台管理复杂度。
- 表结构已预留 `embedding vector nullable` 或 metadata，后续可升级。

第一版实现边界：

- seed 少量 demo/system 知识文档。
- chunk 可由 migration seed 写入。
- `rag_search` 按 query 匹配 `knowledge_chunks.content`，返回 top K。
- results 写入 `rag_retrieval_logs.results`，包含 chunk id、document title、content preview、score、citationLabel、usedInAnswer。
- 回答中使用 `[S1]`、`[S2]` 这类引用标签。
- `RagSourcesCard` 不再依赖 `createMockRagSources()`，而是优先读取 retrieval log 映射结果。

不要设计完整企业知识库后台。

## 14. 长会话 / 大文本性能设计

### 第一阶段

```txt
消息分页
最近 N 条加载
长文本折叠
Markdown memo
大 JSON lazy expand
Run Trace 摘要
```

设计细节：

- 会话打开时只加载最近 30 条消息。
- 历史消息通过“向上加载”读取。
- 单条长消息超过阈值时默认折叠，例如 1200-2000 字。
- assistant Markdown 组件用 `React.memo` 或等价 memo 策略，输入以 message id + content hash 控制。
- 工具 input/output JSON 默认只展示 summary，详情点击后再渲染。
- Run Trace 默认显示步骤摘要、工具数量、耗时和状态，详情按需展开。

### 第二阶段

```txt
虚拟滚动
Run History lazy load
artifact 分离加载
sessionStorage 瘦身或迁移
```

设计细节：

- 当消息数量明显增长后，引入虚拟滚动。
- 历史 Run 不随 conversation 首屏全量加载。
- report artifact 独立加载，消息中只保留 artifact 引用摘要。
- 登录用户逐步减少 sessionStorage 中的大对象，只保留 UI cache。

必须遵守：

- 不为了演示超长能力直接塞超大 DOM。
- 超长示例应该通过 seed data + 分页 / 折叠展示。
- 首屏只加载最近消息。
- 历史消息向上加载。
- Run Trace 只显示摘要，详情按需展开。

## 15. Report Artifact 设计

当前报告是 `WorkbenchMessage.kind = 'report'`。后续应把报告升级为 `report_artifacts`。

设计原则：

- 报告正文以 `content_markdown` 存在 artifact 表。
- 消息时间线可以展示一条 report message，但这条 message 应由 artifact 映射生成或引用 artifact。
- 同一个 run 可有多个 report version，但第一版只生成 version 1。
- 报告状态包括 `draft / generated / archived`。
- 报告归属必须包含 `user_id + conversation_id + run_id`。

生成流程：

```txt
Run completed
↓
report_state = pending
↓
用户确认生成报告
↓
POST /api/workbench/runs/:id/report
↓
写 report_artifacts
↓
更新 agent_runs.report_state = generated
↓
消息时间线展示 report artifact
```

第一版不做报告编辑器、PDF 导出、复杂版本对比。

## 16. Run / Tool / Event 持久化设计

真实 Agent Run 后续写入顺序：

```txt
收到发送请求
↓
校验 auth / quota
↓
创建 agent_runs(status=pending/running)
↓
写 run_started event(seq=1)
↓
每个 step/tool 写 run_events
↓
tool_started 创建或 upsert tool_invocations
↓
tool_completed 更新 tool_invocations
↓
chart_ready 更新 agent_runs.chart_data
↓
conclusion_completed 更新 agent_runs.conclusion
↓
report_pending 更新 agent_runs.report_state
↓
run_completed / failed / stopped 更新 agent_runs.status
↓
finish_agent_run_usage
```

Mock Run 设计：

- 匿名 Mock 继续只写 sessionStorage。
- 登录用户 Mock 如果作为正式会话的一部分，可以写入 `agent_runs(mode=mock)` 和对应 events/tools，便于 UI 统一恢复。
- Mock 不扣减 `agent_run` quota。

事件幂等：

- `run_events` 使用 `(run_id, seq)` 唯一。
- tool invocation 使用稳定 tool invocation id。
- `agent_runs.status` 只允许按状态机推进，不允许 completed 回 running。

工具命名标准：

- 第一版统一展示时以 registry name 为准。
- 建议将真实 RAG 工具命名为 `rag_search`。
- 逐步淘汰只在 mock 中存在的 `query_data`，改为 `aggregate_table` 或 `query_table`。
- `knowledge_search` 可保留为旧 mock 展示名，但真实链路用 `rag_search`。

## 17. 刷新恢复、幂等与异常处理

### 刷新恢复

```txt
登录用户从 DB 恢复 conversations / messages / latest run
匿名用户可继续用 sessionStorage demo
```

登录用户恢复流程：

```txt
auth session restored
↓
GET /api/workbench/conversations
↓
选择 URL conversationId 或最近 conversation
↓
GET /api/workbench/conversations/:id/messages?limit=30
↓
读取 latest_run_id
↓
GET /api/workbench/runs/:id
↓
按需 GET events/tools/retrievals/reports
```

运行中刷新：

- 如果 DB 中 run 是 running，但 SSE 已断开，前端显示“运行状态待确认”或 stopped。
- 后续可以增加 server-side resume；第一版不做。
- 进入会话时可把超时 running run 标记为 stopped / failed，或显示 refresh action。

### 幂等

需要：

```txt
client_message_id
run_id
event seq
status
```

防止：

```txt
重复点击发送
接口重试重复写消息
旧 SSE 写入新会话
刷新后 running 状态不一致
```

设计措施：

- 前端发送前生成 `client_message_id`。
- `POST messages` 对 `(user_id, client_message_id)` 做幂等。
- Agent Run 使用前端 `clientRunId` + 服务端 `run_id` 映射，第一版可直接使用同一个 UUID。
- SSE 回调必须校验 `requestId + conversationId + runId`。
- Event 写入使用 seq，重复 seq 忽略或返回已有记录。

### 异常处理

每个流程要有：

```txt
loading
empty
error
stopped
refresh
session switch
```

具体要求：

- 会话列表有 loading / empty / error。
- 消息列表有 loading older / empty / error。
- Run Inspector 有 no run / running / stopped / failed。
- Demo templates 有 loading / empty / error。
- Recent tools 有新用户空状态。
- RAG sources 有未检索 / 无结果 / 检索失败。
- session switch 时终止旧请求或阻止旧 SSE 写入。

## 18. 分阶段实施计划

### Step 54：conversations / messages 持久化

目标：

```txt
登录用户真实会话和消息写入数据库。
```

改动范围：

```txt
Supabase migration
RLS
conversation/message API
前端新建 / 发送 / 加载改造
```

不做：

```txt
不持久化完整 Run Trace
不做 RAG
不改最近工具
```

验收：

```txt
登录用户刷新 / 新窗口打开后可恢复真实会话和消息
匿名 Mock 仍可运行
```

建议实现顺序：

1. 创建 `conversations/messages` migration 和 RLS。
2. 新增 conversation/message API。
3. 新增 Record 类型和 mapper。
4. 登录用户新建会话写 DB。
5. 登录用户发送消息写 DB。
6. 刷新后从 DB 恢复最近会话和最近消息。
7. 保留匿名 sessionStorage demo。

### Step 55：真实会话列表与刷新恢复

目标：

```txt
左侧会话列表从 conversations 读取。
```

不做：

```txt
不做复杂搜索
不做多工作区
```

验收：

```txt
默认假会话不再作为用户真实会话展示
用户自己的会话可跨刷新恢复
```

建议实现顺序：

1. Conversation list loading / empty / error。
2. 侧边栏使用 `ConversationListView`。
3. URL conversationId 恢复。
4. 切换会话加载 messages。
5. 归档 / 删除第一版可只做软归档或先不暴露。

### Step 56：demo templates / 示例会话复制机制

目标：

```txt
示例任务模板化，点击后复制为当前用户私有 conversation。
```

验收：

```txt
示例模板和用户会话隔离
点击示例后生成新会话并归属当前用户
```

建议实现顺序：

1. 创建 `demo_task_templates/demo_conversation_templates`。
2. seed 第一版 8 个 task 和 4 个 conversation template。
3. 新增读取 API。
4. 新增 copy API。
5. 侧边栏示例任务改为模板数据。
6. 点击示例不再调用当前 session 的 `startTask()` 直接写入。

### Step 57：agent_runs / run_events / tool_invocations / report_artifacts 持久化

目标：

```txt
完整 Run Trace、工具调用和报告 artifact 入库。
```

验收：

```txt
真实 Agent Run 完成后，刷新可恢复 Run 概览、步骤、工具、图表、报告。
```

建议实现顺序：

1. 创建四张表和 RLS。
2. 扩展 `/api/agent/run/stream` 写入 run/events/tools。
3. 新增 Run 详情 API。
4. 新增 report artifact API。
5. 前端通过 mapper 恢复 `RunSnapshot`。
6. 报告生成写 artifact，不再只写 message。

### Step 58：最近使用工具真实化

目标：

```txt
左侧最近工具从真实 tool_invocations 统计。
```

验收：

```txt
新用户显示空状态
运行工具后显示真实最近工具、最近时间和次数
```

建议实现顺序：

1. 新增 recent tools API。
2. 新增 `RecentToolStat` 类型。
3. 新增 `RecentToolsView`。
4. 替换 Sidebar 静态标签。
5. 对无数据、加载失败做明确状态。

### Step 59：RAG 最小闭环

目标：

```txt
完成最小检索闭环和来源引用展示。
```

验收：

```txt
示例知识文档可被检索
回答展示引用
右侧来源来自真实 retrieval log
```

建议实现顺序：

1. 创建 knowledge 和 retrieval log 表。
2. seed demo/system 政策文档与 chunks。
3. 实现 `rag_search` tool。
4. Planner 对政策 / 制度 / 依据类问题选择 RAG。
5. 写 `rag_retrieval_logs`。
6. 回答携带引用。
7. 右侧 `RagSourcesCard` 使用真实 retrieval log。

### Step 60：长会话性能优化

目标：

```txt
降低长会话、大 Markdown、大 Run Trace 的渲染和持久化压力。
```

验收：

```txt
超长示例会话首屏加载稳定
滚动和输入不卡顿
Run Trace 可按需展开
```

建议实现顺序：

1. 消息 API 分页。
2. 前端最近 N 条加载和向上加载。
3. 长文本折叠。
4. Markdown memo。
5. 大 JSON lazy expand。
6. Run Trace 摘要 / 展开。
7. 评估是否需要虚拟滚动。

## 19. 每一步验收标准

Step 54：

- 登录用户新建 conversation 后 DB 有记录。
- 登录用户发送消息后 DB 有 `messages`。
- 刷新页面后可恢复 conversation 和 messages。
- 新窗口登录同一用户可恢复数据。
- 匿名 Mock demo 不受影响。
- `pnpm lint` / `pnpm build` 通过。

Step 55：

- 左侧会话列表来自 `conversations`。
- 新用户显示空状态，不展示默认假会话。
- 加载失败有 error state 和重试入口。
- 切换会话不会把旧 SSE 写入新会话。
- `pnpm lint` / `pnpm build` 通过。

Step 56：

- 示例任务来自 `demo_task_templates`。
- 示例会话来自 `demo_conversation_templates`。
- 登录用户点击示例生成 private conversation。
- 模板 seed 不被用户修改。
- 示例不会写进当前真实会话。
- `pnpm lint` / `pnpm build` 通过。

Step 57：

- 真实 Agent Run 创建 `agent_runs`。
- Run Event 按 seq 写入 `run_events`。
- 工具调用写入 `tool_invocations`。
- 报告确认后写入 `report_artifacts`。
- 刷新后右侧 Run 概览、步骤、工具、图表、报告可恢复。
- `agent_run_usage` 仍只作为 quota / audit。
- `pnpm lint` / `pnpm build` 通过。

Step 58：

- 新用户最近工具为空状态。
- 完成一次含工具的 Run 后显示真实工具。
- 显示工具名、次数、最近时间。
- 静态写死工具标签移除或只作为匿名 demo fallback。
- `pnpm lint` / `pnpm build` 通过。

Step 59：

- seed 知识文档可检索。
- `rag_search` 生成 retrieval log。
- 回答包含 `[S1]` 等引用。
- 右侧来源来自 `rag_retrieval_logs`。
- 无检索结果有明确空状态。
- `pnpm lint` / `pnpm build` 通过。

Step 60：

- 会话首屏只加载最近消息。
- 历史消息可向上加载。
- 长文本默认折叠且可展开。
- 大 JSON 不默认全量渲染。
- 大报告或长 Markdown 不导致明显输入卡顿。
- Run Trace 默认摘要，详情按需展开。
- `pnpm lint` / `pnpm build` 通过。

## 20. 风险与回滚策略

### 风险

- 一次性重构 store 导致主链路破坏。
- RLS 配错导致用户数据越权。
- 示例模板污染用户真实会话。
- Run Trace 持久化过大导致性能下降。
- 长会话直接渲染超大 DOM 卡顿。
- Mock 和真实 Agent 数据结构分叉。
- 旧 sessionStorage 与新 DB 状态冲突。

### 回滚策略

- 每一步只改一个层面。
- 先 API / DB，再前端消费。
- Mock 模式保留。
- `sessionStorage` 短期作为 fallback。
- migration 可单独回滚。
- 新功能通过 feature flag / 状态开关逐步接入。
- 每步都保持 `pnpm lint` / `pnpm build` 通过。

具体回滚建议：

- Step 54 若 DB 会话恢复异常，登录用户临时回退到 sessionStorage UI cache，但保留 migration。
- Step 56 若 template copy 出错，关闭 copy 入口，保留只读 template list。
- Step 57 若 Run Trace 写入过重，先只写 `agent_runs` 概览和 `tool_invocations` summary，暂停 raw events。
- Step 59 若 RAG 不稳定，保留 demo/system 知识源读取，关闭 planner 自动调用。
- Step 60 若虚拟滚动引入交互问题，回退到分页 + 折叠。

## 21. 后续面试讲法

可以这样讲：

```txt
我没有继续堆 UI，而是把 Workbench 的数据底座补起来。
会话、消息、Run、工具调用、报告和 RAG 来源都有清晰的数据归属。
公开示例通过 template 机制和用户真实会话隔离。
长会话不靠一次性渲染超大 DOM，而是通过分页、折叠和懒加载控制性能。
真实 Agent 的使用资格仍由服务端鉴权和 agent_run quota 控制。
```

补充表达：

- `agent_run_usage` 保持 quota / audit 职责，完整 Trace 进入 `agent_runs/run_events/tool_invocations`。
- Mock 和真实 Agent 继续共用 `RunSnapshot` 展示结构，避免 UI 分叉。
- RAG 第一版只做最小闭环，用小规模 keyword / pg_trgm 检索支撑引用展示，后续再升级向量检索。

## 22. Git 状态

本轮设计阶段只允许新增：

```txt
docs/STEP_53_PERSISTENCE_DESIGN.md
```

不允许修改业务代码、SQL migration、README、环境文件或前置自检报告。

完成后需要运行：

```bash
git status --short
```

预期只出现：

```txt
?? docs/STEP_53_PERSISTENCE_DESIGN.md
```

如果出现其他文件变更，必须在生成报告中说明。
