# Data Contract Pack

本目录是 AI Agent Workbench 的字段契约包，归属于 `docs/agent-run-lifecycle.md` 的 `19 Audit / Governance / Cost` 节点，并服务 Run / Report / Usage / Evaluation 等核心对象的字段治理。

## 事实源

- `contracts/schemas/**/*.schema.json`：机器可读契约树，按 `objects/`、`events/` 和后续 `api/` 分层，用于 schema validation 和生成前端可引用类型。
- `contracts/field-registry.yml`：人读字段说明、历史字段总账和高风险字段备注；不作为机器校验主链路。
- `contracts/generated/workbench-contract.ts`：由 schema 生成的 TypeScript 类型。
- `contracts/generated/field-registry.md`：由字段总账生成的人读字段表。

## 使用规则

新增或修改业务字段时，必须先更新 `field-registry.yml` 和对应 schema，再更新后端输出、前端 type、mapper 和 ViewModel。组件层只能消费 ViewModel，不得绕过 mapper 读取 raw payload 或旧字段 fallback。

新增 schema 对象必须能在 `field-registry.yml` 的人读说明层面被发现；字段细节不得复制成第二事实源，必须以对应 `contracts/schemas/**/*.schema.json` 为准。

职责边界：

- `ModelTrace` 负责模型来源、usage、cost、fallback 和 model error。
- `AgentConclusion` 只负责结论文本、结构化段落、提示文案和可选 raw text。
- Report / Evaluation metadata 只能通过单一 `modelTrace` 继承模型状态，不能把模型字段展开到 metadata 顶层。

生成命令：

```bash
node scripts/validate-contract-schemas.mjs
node scripts/generate-field-registry-doc.mjs
node scripts/generate-contract-types.mjs
```

`Contract Pack Check` 会先校验 schema 可被 Ajv 2020-12 编译，再生成字段表和 TypeScript 类型，并检查 generated 文件与契约源文件一致。本基础设施包不承担 forbidden 字段静态扫描；不得在本链路中新增自研 AST Linter 或 forbidden field scanner。

## 文档边界

字段表只维护在 `contracts/` 中。`docs/architecture.md` 只描述架构分层、模块职责和数据流；`docs/agent-run-lifecycle.md` 只描述生命周期、状态流转和事件关系。
