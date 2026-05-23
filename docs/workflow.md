# Workflow

本文档只定义 AI Agent Workbench 的协作流程、变更门禁和验收流程。架构见 `docs/architecture.md`，生命周期见 `docs/agent-run-lifecycle.md`，代码执行硬规则见 `AGENTS.md`。

## 1. 角色分工

### 用户

- 描述真实需求、问题和限制。
- 判断阶段目标和优先级。
- 执行需要人工完成的命令、验证和提交。
- 对最终方案做决策。

### ChatGPT

ChatGPT 负责判断、拆解和验收：

- 判断需求价值、当前阶段和依赖顺序。
- 按 `docs/agent-run-lifecycle.md` 做生命周期归位。
- 判断涉及的核心对象、ID、Source、Tool、部署或数据库边界。
- 拆解任务并生成 Codex 执行指令。
- 验收 Codex 输出、diff、验证结果和残留风险。

### Codex

Codex 负责执行：

- 在明确边界内修改文件。
- 遵守 `AGENTS.md` 和相关事实源文档。
- 不自动提交。
- 输出修改文件、diff、验证结果和残留问题。

### Git / GitHub

Git 负责版本记录，GitHub 负责远程同步。提交和 push 由用户手动执行。

## 2. 事实源与任务边界

- 文档是长期事实源。
- prompt 是当前任务边界。
- 对话用于讨论、拆解和验收，不能覆盖已冻结文档。
- Codex 只能在 prompt 允许范围内执行。

如果 prompt 与仓库文档冲突，停止执行并报告冲突。需要改变长期规则时，先更新对应事实源文档，再按新事实源执行代码任务。

事实源分工：

- 生命周期和功能归位：`docs/agent-run-lifecycle.md`
- 架构分层和数据流：`docs/architecture.md`
- ID 契约：`docs/id-contract.md`
- Source / RAG lineage：`docs/source-lineage.md`
- Tool Governance：`docs/tool-governance.md`
- CloudBase 部署：`docs/cloudbase-functions-deploy.md`
- Codex 执行规则：`AGENTS.md`

## 3. 默认协作流程

```text
用户描述需求 / 问题
  -> ChatGPT 判断阶段、价值和依赖
  -> ChatGPT 做生命周期归位和对象绑定判断
  -> 必要时安排 Codex 只读审查
  -> ChatGPT 明确任务边界、允许范围、禁止范围和验收方式
  -> Codex 小步执行
  -> Codex 输出 diff、验证结果和残留风险
  -> ChatGPT 验收
  -> 必要时返工
  -> 用户手动提交
```

原则：

- 不跳过需求判断。
- 不跳过生命周期归位。
- 不把不确定问题交给 Codex 自由决定。
- 不把多个阶段混进一次执行。
- 不用局部页面需求覆盖长期契约。

## 4. 变更门禁

以下任务必须先只读审查，不直接改代码：

- 涉及架构调整、目录结构、主链路或数据模型。
- 涉及 Auth、CloudBase Functions、数据库、Model Gateway 或 Agent Run。
- 涉及 Run Trace、Source / RAG lineage、Tool Governance 或 Evaluation。
- 涉及删除大量代码、大范围重构或旧链路清理。
- 当前影响范围不明确。

只读审查输出必须包含：

- 问题清单。
- 影响范围。
- 风险。
- 建议阶段。
- 是否需要先改事实源文档。

## 5. 可直接执行范围

以下任务可以在边界明确时直接执行：

- 明确小 bug。
- 明确文案调整。
- 明确 lint 死代码。
- 明确文档补充或收敛。
- 明确文件删除。
- 小范围 UI 修正。
- 影响范围清楚的低风险改动。

即使可以直接执行，也必须明确：

- 允许修改范围。
- 禁止修改范围。
- 验收方式。
- 输出格式。
- 不自动提交。

## 6. Codex 指令要求

Codex 指令应包含：

```text
任务目标
项目路径
允许修改范围
禁止修改范围
参考事实源
验证命令
输出格式
不自动提交
```

涉及长期契约的任务必须指定对应文档。未指定时，Codex 应根据任务内容主动读取相关事实源。

## 7. 阶段验收

ChatGPT 验收时必须检查：

- 是否符合任务目标和 prompt 边界。
- 是否修改了禁止修改的文件。
- 是否违反事实源文档。
- 是否新增依赖、修改 runtime 或修改 `pnpm-lock.yaml`。
- 是否破坏 `docs/architecture.md` 定义的数据分层。
- 是否新增多轨实现。
- 是否新增 fallback 或让 fallback 伪装成真实结果。
- 是否新增重复字段、重复状态、重复 formatter、重复 parser。
- 是否让 component 消费 raw payload。
- 是否保留旧链路残留。
- lint / build / smoke 是否按任务要求执行并通过。
- 是否可以进入用户手动提交。

## 8. 用户贴回内容

用户执行 Codex 后，应贴回：

- Codex 输出。
- 修改文件列表。
- `git diff --stat`。
- `git status --short`。
- `pnpm lint` 结果，如涉及代码。
- `pnpm build` 结果，如涉及代码。
- 页面截图，如涉及 UI。
- Console / Network 结果，如涉及线上问题。
- smoke test 输出，如涉及部署。
- 不确定的地方。

## 9. 提交规则

- 提交由用户手动执行。
- 一个阶段或一个小闭环对应一次提交。
- 不混入无关文件。
- 提交前先看 `git diff --stat` 和 `git status --short`。
- 工作区已有未提交代码时，只能显式 `git add` 本阶段文件，不能 `git add .`。

提交信息使用中文 Conventional Commits：

```text
feat:
fix:
refactor:
chore:
docs:
test:
```
