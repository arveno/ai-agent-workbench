# AI Agent Enterprise Lifecycle

本文档是 AI Agent Workbench 的 AI Agent Enterprise Lifecycle 事实源，只定义生命周期节点、能力域和功能归位规则。架构见 `docs/architecture.md`，ID 见 `docs/id-contract.md`，Source / RAG lineage 见 `docs/source-lineage.md`，Tool Governance 见 `docs/tool-governance.md`。

## 1. 生命周期节点

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

任何功能不能只按页面、组件或局部体验命名，必须先归位到生命周期节点。

## 2. 能力域

| 能力域 | 覆盖节点 | 边界 |
| --- | --- | --- |
| A. 用户与工作区层 | Access / Identity, Workspace / Session | 身份、权限、工作区、会话归属。 |
| B. 会话与交互层 | Input, Response | 用户输入、消息展示、交互状态、响应消费。 |
| C. 模型与规划层 | Context / Memory / Data, Model Gateway, Intent Router, Planner / Workflow | 上下文、模型白名单、意图识别、规划和任务流。 |
| D. 安全与工具层 | Guardrail / Approval, Tool Governance / Data Access | 工具白名单、数据访问、审批、参数和权限控制。工具细则见 `docs/tool-governance.md`。 |
| E. 执行与可观察层 | Execution / Streaming, Observability / Trace | Agent Run、SSE、事件、工具调用和 Trace。 |
| F. 结果与资产层 | Artifact / Source / Report, Persistence / Lineage | 来源、报告、产物沉淀、可恢复和血缘关系。Source 细则见 `docs/source-lineage.md`。 |
| G. 质量与改进层 | Evaluation / Quality Gate, Bad Case / Dataset, Improvement / Versioning | 评测、坏例、数据集、版本和持续改进。 |
| H. 工程与治理层 | Operation / Deployment, Audit / Governance / Cost | 部署、运行、审计、成本和治理闭环。 |

## 3. 核心对象归位

功能必须绑定到明确对象：

```text
User
  -> Workspace
    -> Conversation
      -> Message
        -> Run
          -> Event
          -> Tool Invocation
          -> Source
          -> Report
          -> Evaluation
          -> Bad Case
          -> Usage
```

`Run` 是执行中心。字段定义、主关系和禁止写法以 `docs/id-contract.md` 为准，本文不定义具体 ID 字段。

## 4. 功能归位规则

新功能或历史功能治理前必须回答：

- 属于哪个生命周期节点和能力域。
- 绑定哪个核心对象。
- 是否进入 Agent Run。
- 是否进入 Run Trace。
- 是否需要持久化。
- 是否影响 Source / Report / Evaluation / Usage。
- 是否需要服务端受控。
- 是否涉及工具定义、工具参数、Tool Invocation 或工具展示。
- 是否遵守 `docs/architecture.md` 定义的数据分层。
- 是否会产生重复入口、多轨实现、重复字段或重复 formatter。

不能回答清楚时，停止实现并补充方案。

## 5. 依赖顺序

能力建设必须按依赖推进：

- 没有稳定 Run 主关系，不扩展下游资产和质量能力。
- 没有统一 Trace，不扩展 Evaluation。
- 没有持久化和 Lineage，不扩展 Bad Case / Dataset。
- 没有 Bad Case / Dataset，不扩展 Improvement / Versioning。
- Operation / Audit 贯穿全程，但不提前建设重后台。

固定顺序：

```text
Intent Router / Planner / Tool Governance / Trace / Artifact / Persistence
  -> Evaluation
  -> Bad Case / Dataset
  -> Improvement / Versioning
```

## 6. 历史功能处理规则

- 归位：能绑定生命周期节点和核心对象的功能，迁回主链路。
- 合并：重复 formatter、重复状态、重复入口、重复结果解释，合并为单一事实源。
- 删除：不服务当前主链路的死代码、旧兼容逻辑、废弃入口和多轨实现默认删除。
- 升级：有价值但对象绑定不完整的功能，升级为 Run 中心、服务端受控、可追踪、可持久化的实现。
- 后置：依赖未完成的下游能力先后置，不用局部功能抢跑替代主链路。

## 7. 验收标准

- 功能能归位到生命周期节点。
- 核心对象绑定清楚。
- Run 是执行中心。
- 模型调用、工具调用、数据访问和权限由后端控制。
- Trace 能展示关键事件、工具调用、模型状态、错误、fallback 和 usage。
- Response、Source、Report、Artifact、Lineage 能持久化并恢复。
- Mock / Real / Fallback 边界清楚。
- 架构数据分层未被破坏。
- 新旧链路不并存。
- 不新增重复入口、重复状态、重复字段或重复 formatter。
