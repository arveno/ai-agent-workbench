# Architecture

本文档说明 AI Agent Workbench 的项目架构、模块职责、数据流、状态边界和前后端边界。

AI Agent Enterprise Lifecycle（AI Agent 企业级运行生命周期）SSOT 见 `docs/agent-run-lifecycle.md`。核心对象与 ID 契约见 `docs/id-contract.md`。

本文档只描述架构设计、模块职责、数据流和前后端边界，不重复完整生命周期，不描述 Codex 执行规则，不描述协作流程，不写具体部署教程。

## 1. 总体架构

AI Agent Workbench 是一个面向 AI 应用场景的前端工作台。

核心链路：

```text
用户输入
  -> Conversation / Message
  -> Agent Run
  -> Tool Calling
  -> Model Gateway
  -> Run Trace
  -> Report / RAG Source
  -> 持久化恢复
```

项目重点不是单纯聊天 UI，而是把 AI 任务的执行、观测、结果沉淀和状态恢复组织成完整应用链路。

## 2. 主运行链路

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
  -> SiliconFlow / Zhipu
  -> modelTrace / tokenUsage / latency / fallbackReason
```

当前模型选项：

```text
mock-agent
siliconflow-qwen-free
siliconflow-glm-free
zhipu-glm-flash-free
```

## 2.1 架构与生命周期关系

架构模块必须服务 `docs/agent-run-lifecycle.md` 中的 AI Agent Enterprise Lifecycle 主线：

- CloudBase Function 对应服务端安全边界、模型调用、工具调用、数据库访问和 Agent Run 编排。
- service 对应前端 API 请求，只负责调用后端能力和处理响应边界。
- store 对应业务状态，维护当前 conversation / message / run / artifact 等状态。
- mapper / reducer 对应 Raw -> Canonical，负责数据归一和状态合并。
- ViewModel 对应 UI 消费模型，负责把 Canonical 转成展示结构。
- component 只展示 ViewModel 和触发 action，不直接消费 raw payload，不拼接业务结论。
- conversation / message / run / report / source / usage / evaluation 的 ID 语义必须遵守 `docs/id-contract.md`。

## 3. 前端模块职责

### `src/components`

负责页面展示和用户交互：

- Layout
- Sidebar
- Chat
- Composer
- Model Selector
- Right Panel
- Run Trace
- Report UI
- Source / Inspector

组件只消费 ViewModel 和触发 action。  
组件层限制见 `AGENTS.md`。

### `src/services`

负责前端 API 请求：

- 调用 CloudBase HTTP Functions
- 组织请求参数
- 处理响应边界
- 暴露语义明确的请求函数

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

负责纯函数工具、数据转换、mapper、ViewModel builder。

### `src/types`

负责类型定义：

- API DTO
- domain model
- ViewModel
- run / message / report / source 相关类型

### `scripts`

负责本地工程化能力：

- CloudBase 函数打包
- 包结构检查
- 部署后 smoke test

## 4. 后端函数职责

### `auth-me`

负责当前用户识别和 profile 映射。

### `demo-tasks`

负责返回预置任务数据。

### `demo-conversations`

负责返回预置会话数据。

### `workbench-conversations`

负责私有 conversation 的创建、读取和更新。

### `workbench-messages`

负责 message 的写入和读取。

### `workbench-reports`

负责 report artifact 的生成状态、保存和读取。

### `workbench-demo-copy`

负责将预置内容复制到用户私有空间。

### `workbench-quota`

负责 quota / usage 状态读取。

### `workbench-runs`

负责读取 Agent Run、Run Events 和 Tool Invocations。

### `workbench-agent-run-stream`

负责 Agent Run SSE 主链路：

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

这是当前后端最高风险函数，涉及 Auth、MySQL、Model Gateway、工具链、RAG、报告和 SSE。

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

## 5. 核心数据关系

核心实体：

```text
Conversation
Message
Agent Run
Run Event
Tool Invocation
Report Artifact
Knowledge Document
Knowledge Chunk
Quota / Usage
```

关系：

```text
Conversation
  -> Messages
  -> Agent Runs
  -> Run Events
  -> Tool Invocations
  -> Report Artifacts
  -> RAG Sources
```

基本原则：

- message 应能关联 runId。
- run 属于 conversation。
- report 应能关联 conversation / run。
- Run Trace 基于 run events 和 tool invocations。
- RAG 来源基于 knowledge documents / chunks。
- quota / usage 与 Agent Run 执行相关。
- ID 契约详见 `docs/id-contract.md`，本文只描述对象关系和架构边界，不重复完整 ID 契约。

## 5.1 当前优先治理的架构风险

以下是当前优先关注的架构风险，不在本文档展开为项目计划：

- `runId` / `clientRunId` / `runtimeRunId` 三轨混用；迁移期字段必须逐步收敛，不能长期扩散到 component / ViewModel / 业务逻辑。
- 前后端 model catalog 双事实源。
- Tool Registry 前端展示与服务端白名单漂移。
- conclusion / report / evaluation formatter 分散。
- Source / Lineage 不完整。
- Report 前端生成与 artifact 归属需要收口。

## 6. Agent Run 链路

典型链路：

```text
用户输入
  -> conversation / message
  -> Agent Run
  -> intent / capability
  -> tool chain
  -> schema inspect
  -> aggregate / chart / knowledge_search
  -> modelGateway
  -> conclusion
  -> report_pending
  -> run_completed / run_failed
```

Agent Run 通过 SSE 返回执行过程。  
Run Trace 负责展示执行步骤、工具调用、模型状态和结果摘要。

## 7. Model Gateway 链路

模型调用链路：

```text
selectedModelId
  -> catalog lookup
  -> provider
  -> model
  -> apiKeyEnv
  -> timeout
  -> provider request
  -> model result
  -> tokenUsage
  -> latencyMs
  -> fallbackReason
  -> modelErrorType
```

前端只传 `selectedModelId`。  
provider / model / apiKeyEnv 由后端 catalog 决定。  
模型 Key 不进入前端。

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

raw payload 只应进入调试详情或可展开区域。

## 9. Report

Report 是 Agent Run 之后的结果沉淀。

建议关联：

```text
conversationId
runId
status
contentMarkdown
metadata
```

报告链路需要避免：

- conversation 级别和 run 级别状态分裂。
- 生成 / 跳过后确认卡重复出现。
- 刷新后重复弹出确认。
- Chat / Run Trace / Report 各自维护结论副本。

## 10. RAG

RAG 相关数据：

```text
knowledge_documents
knowledge_chunks
knowledge_search tool event
source score
citation / source marker
noSourceReason
```

RAG 展示原则：

- 来源必须可解释。
- 无来源时必须明确说明。
- fallback 来源不能伪装成真实来源。
- Chat 和 Source Panel 应消费统一来源数据。

## 11. 安全边界

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

## 12. 工程化脚本

当前本地工程脚本：

```text
cloudbase:package
cloudbase:check
cloudbase:smoke
```

用途：

- 生成 CloudBase 函数上传包。
- 检查包结构。
- 检查 `_shared` 是否正确复制。
- 检查 `scf_bootstrap`。
- 部署后验证接口、Auth、MySQL、Report、Agent SSE、Model Gateway。

本地推荐打包目录：

```text
.cloudbase-packages/
```

具体使用方式见：

```text
docs/cloudbase-functions-deploy.md
```
