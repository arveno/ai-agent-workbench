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

当前模型链路：

```text
selectedModelId
  -> model catalog
  -> _shared/modelGateway.js
  -> provider client
  -> modelTrace / tokenUsage / latency / fallbackReason
```

前端只传 `selectedModelId`。provider / model / apiKeyEnv 由后端 catalog 决定，模型 Key 不进入前端。

## 2. 核心执行链路

```text
User Input
  -> Conversation / Message
  -> Agent Run
  -> Tool Invocation
  -> Model Gateway
  -> Run Trace
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
Intent / Capability
Tool Chain
Model Gateway
Conclusion
Report Pending
Run Persistence
SSE Events
```

该函数承担服务端安全边界、模型调用、工具调用、RAG、报告状态和 SSE 编排。工具定义、参数边界和 Tool Invocation 必须遵守 `docs/tool-governance.md`。

## 6. 共享后端模块

### `_shared/auth.js`

共享 Auth helper。

### `_shared/mysql.js`

共享 CloudBase MySQL helper。

### `_shared/modelGateway.js`

共享模型网关：

```text
selectedModelId
  -> catalog
  -> provider
  -> model
  -> apiKeyEnv
  -> request
  -> tokenUsage / latency / fallbackReason
```

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
