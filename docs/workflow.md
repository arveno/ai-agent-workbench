# Workflow

本文档只定义 AI Agent Workbench 的协作流程、变更门禁和验收流程。架构见 `docs/architecture.md`，生命周期见 `docs/agent-run-lifecycle.md`，代码执行硬规则见 `AGENTS.md`。

## 1. 角色分工

### 用户

- 描述真实需求、问题和限制。
- 判断阶段目标和优先级。
- 执行需要人工完成的命令、验证和提交。
- 对最终方案做决策。

### ChatGPT（可选辅助）

ChatGPT 可辅助判断、拆解、解释和复盘：

- 判断需求价值、当前阶段和依赖顺序。
- 按 `docs/agent-run-lifecycle.md` 做生命周期归位。
- 判断涉及的核心对象、ID、Source、Tool、部署或数据库边界。
- 辅助整理 Issue、Codex 指令、PR 风险和验收意见。

ChatGPT 不作为任务准入、执行和合并的必需控制器。流程控制由 Issue、PR、CI、main ruleset 和仓库事实源完成。

### Codex

Codex 负责执行：

- 在明确边界内修改文件。
- 遵守 `AGENTS.md` 和相关事实源文档。
- 执行前读取关联 Issue。
- 只能按 Issue 的目标、修改范围、明确不做和验收标准执行。
- 不自动提交。
- 输出修改文件、diff、验证结果和残留问题。

### Git / GitHub

Git 负责版本记录。GitHub 负责 Issue、PR、CI、Review 和 main ruleset 门禁。

- Issue 是任务事实源，Issue 模板、生命周期节点、目标、范围、明确不做和验收标准决定任务准入。
- PR 是变更容器和审查入口，按 PR Template、CI、main ruleset 和必要 Review 完成审查。
- Codex PR Review 只作为辅助审查建议来源，不替代 Issue、PR Template、CI 或 main ruleset。
- CI 的 Lint and Build 是基础质量门禁。
- main 分支受 ruleset 保护，必须通过 PR 且 CI 通过后才能合并，最终合并由用户决定。

## 2. 事实源与任务边界

- 文档是长期事实源。
- Issue 是当前任务事实源。
- prompt 只能补充执行上下文，不能覆盖 Issue 或已冻结文档。
- 对话用于讨论、解释和复盘，不能成为流程稳定性的依赖。
- Codex 执行边界由 Issue、`AGENTS.md` 和相关事实源约束，只能在 Issue 和 prompt 共同允许的范围内执行。

如果 prompt 与仓库文档冲突，停止执行并报告冲突。需要改变长期规则时，先更新对应事实源文档，再按新事实源执行代码任务。

没有 Issue，不进入 Codex 执行。Codex 无法读取关联 Issue 时，必须停止，不允许修改文件。需要超出 Issue 范围时，必须停止并说明原因。

事实源分工：

- 生命周期和功能归位：`docs/agent-run-lifecycle.md`
- 架构分层和数据流：`docs/architecture.md`
- ID 契约：`docs/id-contract.md`
- Source / RAG lineage：`docs/source-lineage.md`
- Tool Governance：`docs/tool-governance.md`
- CloudBase 部署：`docs/cloudbase-functions-deploy.md`
- LangGraph / LangChain / LangSmith 终态职责：`docs/architecture.md`
- Codex 执行规则：`AGENTS.md`
- PR 审核清单：`.github/pull_request_template.md`
- 自动门禁：`.github/workflows/ci.yml` 和 main ruleset

## 3. 默认 GitHub-native 流程

```text
生命周期文档 / 当前主线确认任务方向
  -> Issue 定义目标、范围、明确不做和验收标准
  -> Codex 读取关联 Issue 和必要事实源
  -> Codex 在 Issue 边界内小步执行
  -> PR 关联 Issue 并按 PR Template 自检
  -> CI 执行 Lint and Build
  -> Review 检查 diff、验证结果和风险，Codex PR Review 可作为辅助建议
  -> main ruleset 要求 PR + CI 通过后合并
```

原则：

- 不跳过 Issue。
- 不跳过生命周期归位。
- 不把不确定问题交给 Codex 自由决定。
- 不把多个阶段混进一次执行。
- 不用局部页面需求覆盖长期契约。
- 不绕过 Issue / PR 边界直接改 main。
- 涉及 Agent Runtime、Model、Tool、RAG、Trace 或 Evaluation 的任务必须遵守 LangGraph / LangChain / LangSmith 终态职责。
- 不在旧 runtime 旁新增 LangChain 旁路包装层，不保留 old/new 双轨执行。

### 3.1 Issue / PR 粒度

- 一个 Issue 代表一个完整任务闭环，不代表一个小步骤。
- 一个 Issue 可以包含多个子任务和多次 commit。
- 一个 PR 是该 Issue 的承载，不是每次 CI 通过就立刻合并。
- 只有当 Issue 的完整任务闭环被明确验收通过后，才合并 PR。
- Review 后发现需要补充时，继续在同一个分支 / 同一个 PR 上追加修改；只有范围变化时才新建 Issue。
- 不按单个小动作、单个文件修改或单个 commit 拆 Issue / PR。
- 只读审查类 Issue 可以不建分支、不建 PR，只在 Issue 评论沉淀结论。
- 长期事实源变更或代码变更必须通过任务分支和 PR。

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
关联 Issue
允许修改范围
禁止修改范围
参考事实源
验证命令
输出格式
不自动提交
```

正式执行必须有可读取的关联 Issue。Issue 读取失败时，Codex 必须停止，不允许修改文件。

涉及长期契约的任务必须指定对应文档。未指定时，Codex 应根据任务内容主动读取相关事实源。

## 7. 阶段验收

Review / 辅助验收时必须检查：

- 是否符合任务目标和 prompt 边界。
- 是否符合关联 Issue 的目标、范围、明确不做和验收标准。
- 是否修改了禁止修改的文件。
- 是否违反事实源文档。
- 是否新增依赖、修改 runtime 或修改 `pnpm-lock.yaml`。
- 是否破坏 `docs/architecture.md` 定义的数据分层。
- 是否新增多轨实现。
- 是否新增 fallback 或让 fallback 伪装成真实结果。
- 是否违背 LangGraph / LangChain / LangSmith 终态职责。
- 是否在旧 runtime 旁新增 LangChain wrapper / adapter 旁路。
- 是否新增重复字段、重复状态、重复 formatter、重复 parser。
- 是否让 component 消费 raw payload。
- 是否保留旧链路残留。
- lint / build / smoke 是否按任务要求执行并通过。
- PR 是否关联 Issue 并按 PR Template 自检。
- CI Lint and Build 是否通过。
- Codex PR Review 如触发，是否仅作为辅助建议处理。
- 是否可以进入 Review / Merge。

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

## 9. Commit / Push Gate

- 变更通过分支和 PR 承载，不直接改 main。
- PR 必须关联 Issue。
- Codex 默认不得自动 commit、push、创建 PR 或更新 PR。
- Codex 完成文件修改后，必须先停在本地 diff 阶段。
- Codex 必须先输出 Review Packet 和本地 review 命令。
- 用户通过本地命令检查改动后，明确确认“可以提交”“可以 push”“可以创建 PR”或“可以更新 PR”，Codex 才能继续对应动作。
- 默认本地 review 命令：

```text
git diff --stat
git diff
git status --short
```

- 已存在 PR 的任务追加改动后，也必须先停在本地 diff 阶段，不得自动 push 更新 PR。
- 该门禁目标是让用户先在本地 review，而不是被迫去 GitHub PR 页面看代码。
- 不混入无关文件。
- 提交前先看 `git diff --stat` 和 `git status --short`。
- 工作区已有未提交代码时，只能显式 `git add` 本阶段文件，不能 `git add .`。
- main ruleset 要求 PR 和 CI Lint and Build 通过后才能合并。

提交信息使用中文 Conventional Commits：

```text
feat:
fix:
refactor:
chore:
docs:
test:
```
