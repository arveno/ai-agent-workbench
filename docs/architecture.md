# Architecture

本文档只定义 AI Agent Workbench 的架构分层、模块职责、数据流和前后端边界。生命周期主线见 `docs/agent-run-lifecycle.md`，ID 语义见 `docs/id-contract.md`，Source / RAG lineage 见 `docs/source-lineage.md`，Tool Governance 见 `docs/tool-governance.md`。

## 1. 主链路

当前运行链路：

```text
EdgeOne / Vite
  -> React / TypeScript
  -> CloudBase Auth
  -> CloudBase HTTP Functions
  -> CloudBase MySQL
```

长期模型链路：

```text
selectedModelId
  -> model catalog
  -> LangChain model layer
  -> provider client
  -> modelTrace / tokenUsage / latency / fallbackReason
```

前端只传 `selectedModelId`。provider / model / apiKeyEnv 由后端 catalog 决定，模型 Key 不进入前端。

长期 Agent Runtime 链路：

```text
CloudBase HTTP Function
  -> LangGraph graph runtime
  -> LangChain Model / Tool / Retriever
  -> LangSmith Trace / Evaluation
  -> CloudBase MySQL persistence
```

当前自研 imperative runtime 和 `_shared/modelGateway.js` 只作为待替换旧链路，不作为长期终态。后续重构必须单轨替换，不允许在旧 runtime 旁新增 LangChain 旁路包装层。

## 2. 核心执行链路

```text
User Input
  -> Conversation / Message
  -> Agent Run
  -> LangGraph state / node / edge / checkpoint / stream event
  -> LangChain Tool / Retriever / Model
  -> LangSmith Trace
  -> Response
  -> Report / Source
  -> Persistence
```

Agent Run 是执行中心。Chat、Run Trace、Report、Source Panel、Evaluation、Usage 必须围绕同一 Run 关系组织，具体 ID 契约以 `docs/id-contract.md` 为准。

### 2.1 LangGraph Runtime 运行态契约

LangGraph Run State 是后续 Agent Runtime 的唯一运行态容器。核心 state 必须覆盖：

```text
identity:
  runId, conversationId, clientMessageId, clientRunId
input:
  selectedModelId, userInput, userContext, workspaceContext
planning:
  normalizedIntent, normalizedPlan
execution:
  toolInvocationState, ragSourceState, modelResponseState
artifact:
  reportState, artifactState
governance:
  errorState, fallbackState, usageCostState
external:
  langGraphThreadId, langGraphCheckpointId, langGraphNodeId, langSmithTraceId
```

约束：

- `runId` 只能指 DB `agent_runs.id`，是 Agent Run 相关对象的 canonical 主关系。
- `conversationId`、`clientMessageId`、`clientRunId` 语义以 `docs/id-contract.md` 为准，不能被 LangGraph / LangSmith 外部 ID 替代。
- `selectedModelId` 是模型选择输入，后续由 LangChain model layer 解析到 provider client，前端不得传 provider / model / apiKeyEnv。
- tool / RAG / model / report / fallback / usage 状态必须能映射到 canonical Run Trace、Source、Report 和 Usage 对象。
- LangGraph thread / checkpoint / node id 和 LangSmith trace id 只能作为外部恢复、观测或调试 ID，不得作为业务主外键。

### 2.2 Graph Node / Edge 边界

CloudBase HTTP Function 仍是服务端安全、请求和持久化边界；LangGraph 负责 Agent Run 内部编排。

| 边界 | 职责 |
| --- | --- |
| CloudBase HTTP Function | Auth / user context、conversation 权限、run creation / idempotency、quota / usage 预检或结算、SSE HTTP 响应边界、最终持久化事务边界。 |
| LangGraph graph state | 持有单次 run 的 normalized input、plan、tool、source、model、report、error、fallback、usage 和 external trace/checkpoint 状态。 |
| LangGraph nodes | planner / intent、context / RAG、tool execution、model call / streaming、report artifact decision / generation、final response、error / fallback、trace event emission intent。 |
| LangGraph edges | 表达生命周期依赖和错误路径，例如 planner -> RAG / tool -> model -> report -> final，以及 tool / model failure -> fallback / final。 |
| Persistence boundary | 将 graph 输出标准化写入 `agent_runs`、`run_events`、`tool_invocations`、`retrieval_logs`、`run_sources`、`report_artifacts`、usage / evaluation 相关表。 |

Graph node 粒度必须服务生命周期和可观察性：不能把 planner、RAG、tool、model、report、fallback 全部重新塞进一个大函数；也不能为了显得架构化拆成大量无业务边界的小 node。

### 2.3 Stream Event 映射契约

后续 LangGraph stream event 必须在后端边界标准化，再进入现有 SSE / Run Trace 链路：

```text
LangGraph raw stream event
  -> server event mapper
  -> canonical SSE / Run Trace event
  -> frontend mapper / reducer
  -> ViewModel
  -> Chat / Run Trace / Report / Source Panel
```

约束：

- 前端不直接消费 LangGraph raw event。
- Chat、Run Trace、Report、Source Panel 不得各自解析 raw payload。
- 后端只能产出项目 canonical event / ViewModel 所需结构，不新增第二套 event formatter。
- `run_events` 是项目 Run Trace 持久化主链路；LangGraph event name 只能作为 metadata / debug 信息保留。
- SSE live path 与 `/workbench-runs` refresh path 必须恢复出同一份 canonical run snapshot。

### 2.4 Checkpoint / Persistence 契约

LangGraph checkpoint / thread / node id 服务运行恢复和外部 runtime 观测，不改变项目持久化主事实源。

允许进入 metadata 的字段：

- `langGraphThreadId`
- `langGraphCheckpointId`
- `langGraphNodeId`
- checkpoint namespace / step / graph version 等恢复或调试信息
- `langSmithTraceId`

持久化规则：

- 当前主事实源仍是 `agent_runs`、`run_events`、`tool_invocations`、`retrieval_logs`、`run_sources`、`report_artifacts` 和 usage / evaluation 相关表。
- 外部 ID 不得作为 message、report、source、usage、evaluation 的业务主外键。
- 如果后续需要按 LangGraph checkpoint 查询或恢复 run，必须先更新 `docs/id-contract.md` 并通过数据库 migration 新增专用字段或索引，不能临时依赖 metadata 字符串兜底。
- Checkpoint 恢复不得形成 old/new runtime 双轨；恢复后的输出仍必须落到 canonical Run / Event / Tool / Source / Report 对象。

### 2.5 LangSmith Trace / Evaluation 映射契约

LangSmith 是长期 Trace / Evaluation / Observability 标准平台，项目可以保留自己的 Run Trace UI。

映射规则：

- Project `runId` 映射 LangSmith trace / run 的 external metadata，LangSmith trace id 不替代 canonical `runId`。
- Run Trace UI 展示的步骤、工具、source、model、token、latency、fallback、error 必须能对应 LangSmith trace 语义。
- LangSmith 不可用时，Run Trace 必须明确显示 trace 未上报或上报失败，不得伪装真实 LangSmith trace。
- Evaluation 后续应向 LangSmith dataset / example / run / feedback / experiment 语义靠拢，但项目 `eval_results.run_id` 仍绑定 canonical `runId`。
- Bad Case / Dataset 后续可以引用 LangSmith 外部 ID，但项目质量闭环主关系仍以 DB run / source / evaluation 对象为准。

### 2.6 旧 runtime 删除与迁移边界

后续代码迁移必须以单轨替换为目标：

- `workbench-agent-run-stream` 内手写 planner / tool chain / RAG / model streaming 应被 LangGraph graph nodes 替换，同一阶段删除旧编排逻辑。
- `_shared/modelGateway.js` 不再扩展为新模型平台；模型调用应迁入 LangChain model layer 后删除旧 gateway 调用链。
- 当前 mock / real / fallback 必须收敛为明确状态：Mock 只能用于显式 demo / seed / 测试路径，Real 走 LangGraph + LangChain，Fallback 必须写明 `fallbackReason` / `modelErrorType`，不得伪装真实模型结果。
- 前端 Run Trace mapper / ViewModel 可以保留，但只能消费 canonical event / snapshot；凡是依赖旧 raw payload、旧字段 fallback 或重复 formatter 的代码必须删除或改写。
- Report artifact 链路保留 `report_artifacts` 主事实源；如 report 在 graph 内生成，graph 只产出标准化 report state，持久化仍回到 report 主关系。
- Source lineage 链路保留 `retrieval_logs` / `run_sources` 主事实源；LangChain Document 必须在 lineage 边界标准化，不能作为 UI 或 Report 主来源。
- 不允许通过 wrapper / adapter 在旧 runtime 旁边长期并存，不允许 old/new 字段兼容兜底。

## 3. 数据分层

所有业务展示数据必须走：

```text
Raw -> Canonical -> ViewModel -> UI
```

分层要求：

- Raw：后端响应、SSE event、tool raw input / output、debug payload。
- Canonical：mapper / reducer 产出的标准业务对象。
- ViewModel：UI 可直接消费的展示模型。
- UI：component 只展示 ViewModel 并触发 action。

约束：

- raw 数据只能进入 debug / rawText / 日志 / 调试详情。
- component 不解析 raw JSON，不清洗 markdown，不拼接业务结论。
- 同源数据只能标准化一次。
- Chat、Run Trace、Report、Source Panel 不得各自维护 formatter / parser。

## 4. 前端模块职责

### `src/components`

展示 ViewModel 和触发交互。组件层限制以 `AGENTS.md` 为准。

### `src/services`

负责前端 API 请求：

- 调用 CloudBase HTTP Functions。
- 组织请求参数。
- 处理响应边界。
- 暴露语义明确的请求函数。

### `src/stores`

负责业务状态：

- conversation
- message
- run
- report
- selectedModelId
- loading / error
- 当前会话和当前选中 run

### `src/utils`

负责纯函数工具、mapper、reducer helper、ViewModel builder。

### `src/types`

负责 API DTO、domain model、ViewModel、run / message / report / source 相关类型。

### `scripts`

负责本地工程化脚本。CloudBase 打包、部署和 smoke 边界见 `docs/cloudbase-functions-deploy.md`。

## 5. 后端函数职责

### `auth-me`

当前用户识别和 profile 映射。

### `demo-tasks` / `demo-conversations`

公开 demo 读取类数据。

### `workbench-conversations`

私有 conversation 的创建、读取和更新。

### `workbench-messages`

message 的写入和读取。

### `workbench-reports`

report artifact 的生成状态、保存和读取。

### `workbench-demo-copy`

将预置内容复制到用户私有空间。

### `workbench-quota`

quota / usage 状态读取。

### `workbench-runs`

读取 Agent Run、Run Events、Tool Invocations 和标准化运行快照。

### `workbench-evaluations`

Evaluation 结果读取和写入。Evaluation 的推进顺序以 `docs/agent-run-lifecycle.md` 为准。

### `workbench-agent-run-stream`

Agent Run SSE 主链路：

```text
Auth
Quota
Conversation / Message
LangGraph Runtime
LangChain Tool / Retriever / Model
Conclusion
Report Pending
Run Persistence
SSE Events
```

该函数承担服务端安全边界、Run 创建、SSE 输出和持久化边界。长期终态下，Agent 编排必须进入 LangGraph；模型、工具和 RAG 能力必须进入 LangChain。当前函数内手写 planner / tool chain / RAG / model streaming 属于待替换旧链路。

## 6. 共享后端模块

### `_shared/auth.js`

共享 Auth helper。

### `_shared/mysql.js`

共享 CloudBase MySQL helper。

### `_shared/modelGateway.js`

当前共享模型网关是旧链路：

```text
selectedModelId
  -> catalog
  -> provider
  -> model
  -> apiKeyEnv
  -> request
  -> tokenUsage / latency / fallbackReason
```

长期终态应由 LangChain model layer 承担模型调用、错误归类和 usage 归集。后续不得继续扩展 `_shared/modelGateway.js` 为新的模型平台。

## 7. 核心对象关系

架构层只描述对象关系，不定义字段契约：

```text
Conversation
  -> Message
  -> Agent Run
  -> Run Event
  -> Tool Invocation
  -> Report Artifact
  -> Source
  -> Usage
  -> Evaluation
```

字段、主外键和 ID 禁止项以 `docs/id-contract.md` 为准。Source / retrieval 关系以 `docs/source-lineage.md` 为准。

## 8. Run Trace

Run Trace 是执行过程视图，不是 raw JSON dump 面板。

长期 Trace / Evaluation / Observability 语义必须向 LangSmith 对齐。项目可以保留自己的 UI 展示，但不能在 LangSmith 不可用时伪装真实 trace。

默认展示：

```text
执行步骤
工具调用
数据源
provider
model
tokenUsage
latency
fallbackReason
modelErrorType
conclusion summary
```

raw payload 只进入调试详情或可展开区域。工具展示字段和工具名以 `docs/tool-governance.md` 为准。

## 9. 安全边界

前端禁止：

- 保存模型 Key。
- 保存数据库连接串。
- 保存 service role。
- 直接连接数据库。
- 直接执行 SQL。
- 直接调用任意工具。

后端负责：

- Auth 校验。
- 数据权限。
- 工具白名单。
- 参数校验。
- 表 / 字段 / limit 控制。
- 模型调用。
- 数据库访问。

模型只负责生成或规划，不拥有直接执行权限。
