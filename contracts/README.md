# Data Contract Pack

本目录是 AI Agent Workbench 的字段契约包，归属于 `docs/agent-run-lifecycle.md` 的 `19 Audit / Governance / Cost` 节点，并服务 Run / Report / Usage / Evaluation 等核心对象的字段治理。

## 事实源

- `contracts/field-registry.yml`：字段总账，登记对象、字段、责任边界和禁止字段。
- `contracts/schemas/*.schema.json`：机器可读契约，用于生成前端可引用类型。
- `contracts/generated/workbench-contract.ts`：由 schema 生成的 TypeScript 类型。
- `contracts/generated/field-registry.md`：由字段总账生成的人读字段表。

## 使用规则

新增或修改业务字段时，必须先更新 `field-registry.yml` 和对应 schema，再更新后端输出、前端 type、mapper 和 ViewModel。组件层只能消费 ViewModel，不得绕过 mapper 读取 raw payload 或旧字段 fallback。

生成命令：

```bash
node scripts/generate-field-registry-doc.mjs
node scripts/generate-contract-types.mjs
node scripts/check-data-contract.mjs
```

`check-data-contract.mjs` 默认检查 PR 变更中的正式运行代码，避免本基础设施任务治理既有历史代码；需要全量扫描时运行：

```bash
node scripts/check-data-contract.mjs --all
```

## 文档边界

字段表只维护在 `contracts/` 中。`docs/architecture.md` 只描述架构分层、模块职责和数据流；`docs/agent-run-lifecycle.md` 只描述生命周期、状态流转和事件关系。
