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
