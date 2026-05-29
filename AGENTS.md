# AI Agent Workbench 强制规则 V1

本文件只定义 Codex / AI Coding Agent 在本仓库执行任务时必须遵守的硬规则。

## 0. 必读事实源

改动前按任务范围读取对应文档：

- 生命周期归位：`docs/agent-run-lifecycle.md`
- 核心对象与 ID：`docs/id-contract.md`
- Source / RAG lineage：`docs/source-lineage.md`
- 工具治理：`docs/tool-governance.md`
- 架构分层与数据流：`docs/architecture.md`
- 字段契约：`contracts/field-registry.yml`、`contracts/schemas/*.schema.json`
- 协作、门禁与验收：`docs/workflow.md`
- CloudBase 函数部署：`docs/cloudbase-functions-deploy.md`

如果任务说明、聊天上下文或临时指令与仓库文档冲突，必须停止并报告冲突。需要改变长期契约时，先更新对应事实源文档，再改代码。

## 1. Issue 定范围

没有 Issue，不改代码。
Codex 只能做当前 Issue 内的事，不允许顺手修、顺手优化、顺手重构。

## 2. PR 承载代码

一个普通 Issue 默认一个分支、一个 PR。
PR 是 CI / Review / 验收入口。Codex 不能 push main，不能 merge main。最终 merge 必须由用户决定。

## 3. 不换框架

当前不引入 MVC / MVVM / OpenAPI / AsyncAPI / Pact / Spectral / Schemathesis。
先用现有 React + Vite + JSON Schema + Ajv + generated contract + CI。

## 4. 数据只走一条链路

```text
Raw
↓
Schema / Ajv
↓
Canonical
↓
Mapper
↓
ViewModel
↓
UI
```

任何绕过这条链路的代码，不通过。

## 5. Schema 是字段事实源

字段含义、类型、枚举值以 schema 为准。
改 schema 必须同步 generated contract。
不允许 schema、runtime、generated 三套不一致。

## 6. 不自己写业务校验器

禁止自研 `validateXxx()` 业务校验器。
允许在 fixture / boundary test 中写结构一致性断言，例如 event-level id 与 payload id 一致。
但这些断言不能变成主链路业务校验器。校验规则主体必须来自 JSON Schema + Ajv。

## 7. Runtime 必须符合 Schema

后端 / SSE / Tool / Report / Evaluation 输出的数据，必须符合 schema。
不符合就报 contract violation，不能进 store / reducer / UI 主链路。

## 8. Mapper / Factory 只做边界转换

Mapper 只负责：

```text
Contract DTO / Canonical -> ViewModel
```

ViewModelFactory 只负责创建 UI-safe ViewModel，并补齐 UI 安全默认值。
UI-safe 默认值只能在明确的 ViewModelFactory / Mapper 边界处理，不能散落到 store / reducer / component。

禁止在 mapper / factory 里做旧字段兼容、兜底修补、summary 反解析。

## 9. Component 只展示 ViewModel

组件不能读 raw、metadata、payload、legacy 字段。
组件不能拼装 Run / Tool / Source / Report 模型。
组件不能补字段。

## 10. 禁止多字段兜底

看到下面这类写法，默认不通过：

```ts
runId ?? event.run?.id
sources ?? metadata.sources
content ?? markdown ?? summary
toolName ?? toolId ?? name
reportState ?? metadata.reportState
sessionId || conversationId
oldField || newField
```

## 11. Source / Report 只能有一个事实源

Source 以 canonical source / `run_sources` 为准。
Report state 以 canonical report record 为准。
不能从 metadata、message、artifact 反推正式状态。

## 12. RunSnapshot / RunViewModel 必须分开

`RunSnapshot` 表示 canonical runtime / persistence / API boundary。
`RunViewModel` 表示 UI 展示对象。
只能 `RunSnapshot -> RunViewModel` 单向转换，不能同名不同义。

禁止：

```ts
RunSnapshot = RunViewModel
RunViewModel as RunSnapshot
RunSnapshot as RunContractSnapshot
CanonicalRunSnapshot
RunViewModelStatus as RunStatus
```

## 13. CI 通过不等于可以 merge

PR 必须同时满足：

```text
CI 通过
Review 通过
没有超范围修改
没有字段兜底
没有 raw 泄漏到组件
没有 schema/runtime/generated 不一致
没有无意义 alias / wrapper / 空壳目录
用户最终确认
```

## 14. Release PR 只做发布判断

Release PR 不能承载修复 commit。
发现 blocker，单独开 release-blocker Issue，小 PR 修回 stage，再让 release PR 自动更新。

## 15. Codex 必须输出 Review Packet

每次执行后必须说明：

```text
改了哪些文件
是否超出 Issue 范围
是否影响 schema / generated / runtime / mapper / UI
跑了哪些检查
是否还有风险
后置项归属哪个 Issue
```

后置项不能只写“后续处理”，必须有明确 Issue 承接。

## 16. 同一职责一次性交付

同一个对象、同一个职责、同一类代码所有权迁移，必须作为一个完整交付包处理。

不能拆成：

```text
先建目录
后迁类型
再清 alias
再补 PR body
再补检查
```

只有职责不同、依赖不同、风险明显不同，才允许拆 Issue。

例如：

```text
类型与目录迁移 = 一个交付包
Factory 创建边界 = 一个交付包
EventBoundary = 一个交付包
Reducer 状态拆分 = 一个交付包
Presentation UIModel = 一个交付包
```

## 最终红线

```text
能跑不等于通过。
不符合 Issue / Contract / Mapper / ViewModel / CI / Review 规则，一律不通过。
```
