# AI Agent Enterprise Lifecycle

本文档是 AI Agent Workbench 的 AI Agent Enterprise Lifecycle（AI Agent 企业级运行生命周期）SSOT。

后续历史功能治理、新功能接入、Codex 任务拆解、验收、README 表达和面试讲法，都以本文档为准。`docs/architecture.md` 负责架构和边界，`docs/workflow.md` 负责协作流程，`docs/source-lineage.md` 负责 Source / RAG Lineage 契约，`AGENTS.md` 负责 Codex 代码生成硬约束。

## 1. 项目定位

AI Agent Workbench 是 AI 应用前端工作台。

更完整定位是：围绕 AI Agent Enterprise Lifecycle（AI Agent 企业级运行生命周期）构建的前端工作台。

它不是单纯 AI Chat，也不是 RAG / Report / Evaluation 功能集合。Chat、RAG、Report、Evaluation 都只是 AI Agent 企业级运行生命周期中的局部能力，必须回到统一对象、统一执行链路和统一质量闭环中。

## 2. 生命周期总览

AI Agent Enterprise Lifecycle 包含 19 个节点：

```text
01 Access / Identity
02 Workspace / Session
03 Input
04 Context / Memory / Data
05 Model Gateway
06 Intent Router
07 Planner / Workflow
08 Guardrail / Approval
09 Tool Governance / Data Access
10 Execution / Streaming
11 Observability / Trace
12 Response
13 Artifact / Source / Report
14 Persistence / Lineage
15 Evaluation / Quality Gate
16 Bad Case / Dataset
17 Improvement / Versioning
18 Operation / Deployment
19 Audit / Governance / Cost
```

这些节点是功能归位、依赖判断和验收的主线。任何功能不能只按页面、组件或局部体验命名，必须先判断它处于生命周期哪一段。

## 3. 能力域

AI Agent Enterprise Lifecycle 归并为 8 个能力域：

| 能力域 | 覆盖节点 | 说明 |
| --- | --- | --- |
| A. 用户与工作区层 | Access / Identity, Workspace / Session | 用户身份、权限边界、工作区和会话归属。 |
| B. 会话与交互层 | Input, Response | 用户输入、消息展示、交互状态和响应消费。 |
| C. 模型与规划层 | Context / Memory / Data, Model Gateway, Intent Router, Planner / Workflow | 上下文、模型白名单、意图识别、规划和任务流。 |
| D. 安全与工具层 | Guardrail / Approval, Tool Governance / Data Access | 工具白名单、数据访问、审批、参数和权限控制。 |
| E. 执行与可观察层 | Execution / Streaming, Observability / Trace | Agent Run 执行、SSE、事件、工具调用和 Trace。 |
| F. 结果与资产层 | Artifact / Source / Report, Persistence / Lineage | 来源、报告、产物沉淀、可恢复和血缘关系。 |
| G. 质量与改进层 | Evaluation / Quality Gate, Bad Case / Dataset, Improvement / Versioning | 评测、坏例、数据集、版本和持续改进。 |
| H. 工程与治理层 | Operation / Deployment, Audit / Governance / Cost | 部署、运行、审计、成本和治理闭环。 |

## 4. 核心对象关系

核心对象必须围绕 Agent Run 建模：

```text
User
  -> Workspace
    -> Conversation
      -> Message
        -> Run
          -> Run Event
          -> Tool Invocation
          -> Source
          -> Report
          -> Evaluation
          -> Bad Case
          -> Usage
```

关键绑定关系：

```text
conversationId -> messages
messageId -> runId
runId -> events/tools/sources/report/evaluation/badCase/usage
reportId -> runId/conversationId
evaluationId -> runId/caseId/result
badCaseId -> evaluationId/runId/rootCause/improvementTarget
usageId -> runId/selectedModelId/token/cost/status
```

`runId` 是执行中心。Chat、Run Trace、Source Panel、Report、Evaluation、Bad Case、Usage 不应分别维护互相不一致的执行结果副本。Source / RAG lineage 的来源、检索和引用关系以 `docs/source-lineage.md` 为准。

## 5. AI Agent Enterprise Lifecycle 依赖顺序

能力建设必须按依赖推进：

- Evaluation 当前不应优先推进。
- Evaluation 依赖 Intent Router、Planner、Tool Governance、Execution、Trace、Artifact、Persistence。
- Bad Case 依赖 Evaluation。
- Improvement 依赖 Bad Case / Dataset。
- Operation / Audit 贯穿全程，但不要提前做重后台。

依赖判断的核心原则：

- 没有稳定 `runId`，不要扩展下游资产和质量能力。
- 没有统一 Trace，不要扩展 Evaluation。
- 没有持久化和 Lineage，不要扩展 Bad Case / Dataset。
- 没有 Bad Case / Dataset，不要扩展 Improvement / Versioning。
- 运维、审计、成本治理可以先保留事实源和校验点，不提前建设复杂后台。

## 6. 现有功能归位原则

历史功能按以下方式处理：

- 归位：能明确绑定生命周期节点和核心对象的功能，迁回主链路。
- 合并：重复 formatter、重复状态、重复入口、重复结果解释，合并为单一事实源。
- 删除：不服务当前主链路的死代码、旧兼容逻辑、废弃入口和多轨实现默认删除。
- 升级：有价值但对象绑定不完整的功能，升级为 `runId` 中心、服务端受控、可追踪、可持久化的实现。
- 后置：依赖未完成的下游能力先后置，不用局部功能抢跑替代主链路。

## 7. 新功能接入规则

每个新功能必须先回答：

- 属于 AI Agent Enterprise Lifecycle 哪一段？
- 绑定哪个核心对象？
- 是否进入 Run Trace？
- 是否需要持久化？
- 是否影响 Evaluation / Bad Case / Improvement？
- 是否需要服务端受控？
- 是否走 Raw -> Canonical -> ViewModel -> UI？
- 是否会产生重复入口或多轨实现？

不能回答清楚时，先停止实现并补充方案。具体实现如果与本文档冲突，优先回到 AI Agent Enterprise Lifecycle 主线判断。

## 8. 企业级验收标准

企业级不是代码规模，而是链路清晰、边界明确、结果可信。验收标准：

- 主线完整：功能能放回 19 个生命周期节点。
- 对象关系清楚：User / Workspace / Conversation / Message / Run / Artifact / Evaluation 等关系明确。
- `runId` 成为执行中心：执行、Trace、工具、来源、报告、评测、用量都能绑定到同一个 Run。
- 服务端受控工具链：模型调用、工具调用、数据访问、权限和白名单由后端控制。
- 可观察性完整：关键事件、工具调用、模型状态、错误、fallback、usage 能被 Trace 展示。
- 结果可沉淀：Response、Source、Report、Artifact、Lineage 能持久化并恢复。
- 质量闭环存在：Evaluation、Bad Case、Dataset、Improvement 有明确依赖和数据回流。
- Mock / Real / Fallback 清楚：兜底不能伪装成真实模型结果。
- 工程运维有闭环：部署、配置、smoke test、成本和审计有事实源。
- 代码职责边界清楚：service / store / mapper / ViewModel / component 分层不混。
- 历史功能不多轨：新旧链路不并存，重复入口和重复状态被收敛。
- 能被面试讲清：一句话讲清定位，一条链路讲清执行，一组对象讲清沉淀和质量闭环。

## 9. 推荐实施顺序

按依赖推进：

```text
Phase 0 文档主线冻结
Phase 1 现有功能归位清单
Phase 2 核心对象与 ID 契约
Phase 3 Access / Session / Input
Phase 4 Context / Model Gateway
Phase 5 Intent Router / Planner / Workflow
Phase 6 Guardrail / Tool Governance / Data Access
Phase 7 Execution / Streaming / Observability
Phase 8 Response / Artifact / Source / Report / Persistence
Phase 9 Evaluation / Quality Gate
Phase 10 Bad Case / Dataset
Phase 11 Improvement / Versioning
Phase 12 Operation / Audit / Governance / Cost
```

Phase 可以小步拆分，但不能跳过依赖直接建设下游能力。若某阶段发现历史功能已经抢跑，先归位、合并或后置，再继续推进。
