# Workflow

本文档只定义 AI Agent Workbench 的协作流程、变更门禁和验收流程。架构见 `docs/architecture.md`，生命周期见 `docs/agent-run-lifecycle.md`，代码执行硬规则见 `AGENTS.md`。

## 1. 事实源

- 文档是长期事实源。
- Tracking Issue 是阶段 / 主线事实源。
- 普通 Issue 是当前工作单元事实源。
- 任务 PR 和阶段 PR 是真实代码、CI、ChatGPT Review 和用户 Review 的入口。
- prompt 只能补充执行上下文，不能覆盖 Issue 或已冻结文档。
- 对话用于讨论、解释和复盘，不能成为流程稳定性的依赖。
- 需要改变长期规则时，先更新对应事实源文档，再执行代码任务。

事实源分工：

- 生命周期和功能归位：`docs/agent-run-lifecycle.md`
- 架构分层和数据流：`docs/architecture.md`
- ID 契约：`docs/id-contract.md`
- Source / RAG lineage：`docs/source-lineage.md`
- Tool Governance：`docs/tool-governance.md`
- CloudBase 部署：`docs/cloudbase-functions-deploy.md`
- Codex 执行规则：`AGENTS.md`
- PR 审核清单：`.github/pull_request_template.md`
- 自动门禁：`.github/workflows/ci.yml`、`.github/workflows/pr-template-check.yml`、`.github/workflows/review-gate.yml` 和 main ruleset

## 2. 角色

### 用户

- 定义需求、范围、优先级和验收标准。
- Review PR、CI、ChatGPT Review 和必要本地结果。
- 决定是否 merge。

### ChatGPT

- 只作为可选辅助，用于判断、拆解、解释和 Review。
- 可以辅助整理 Issue、PR 风险和验收意见。
- 不作为任务准入、执行或合并的流程控制器。

### Codex

- 在 Issue 和事实源边界内执行。
- 修改文件、运行验证、输出 Review Packet。
- 可以自动 commit、push 到任务分支，并创建 / 更新 PR。
- 不允许自动 merge。
- 不允许 push main。

### Git / GitHub

- Git 记录任务分支过程。
- GitHub 承载 Issue、PR、CI、Review 和 main ruleset。
- CI 是基础质量门禁，不替代人工验收。
- Review Gate 是实质 Review 门禁，不替代用户最终 merge 决策。
- main 分支必须通过 PR、CI、PR Template Check、Review Gate 和 main ruleset 后才能合并。

## 3. 层级

```text
Tracking Issue = 阶段主线
stage 分支 = 阶段代码集成分支
普通 Issue = 阶段内可独立验收的工作单元
任务分支 = 普通 Issue 的代码承载
任务 PR = 任务分支 -> stage 分支
阶段 PR = stage 分支 -> main
Merge = 用户最终决策
```

规则：

- 一个阶段一个 Tracking Issue。
- 一个阶段一个 stage 分支。
- 一个普通 Issue 默认一个任务分支。
- 一个普通 Issue 默认一个 PR。
- 普通 Issue 的 PR 合并到 stage 分支，不直接进 main。
- 阶段完成后，由 stage 分支创建最终 PR 到 main。
- 任务 PR 和阶段 PR 都可以多次 push 修正。
- 不按单个小动作、单个文件修改或单个 commit 拆 Issue / PR。
- 只有范围明显变化时，才新建 Issue / PR。
- 只读审查类 Issue 可以不建分支、不建 PR，只在 Issue 评论沉淀结论。
- 长期事实源变更或代码变更最终必须通过阶段 PR 进入 main。

## 4. 阶段分支工作流

```text
Tracking Issue
  -> stage 分支
  -> 普通 Issue
  -> 任务分支
  -> Codex 自动执行
  -> commit
  -> push 到任务分支
  -> 创建 / 更新任务 PR 到 stage 分支
  -> CI / PR Template Check / ChatGPT Review / 用户 Review
  -> 用户手动添加 review:approved label
  -> Review Gate
  -> 用户决定是否 merge 到 stage 分支
  -> 阶段完成
  -> 创建 / 更新阶段 PR 到 main
  -> CI / PR Template Check / ChatGPT Review / 用户 Review
  -> 用户手动添加 review:approved label
  -> Review Gate
  -> 用户决定是否 merge 到 main
  -> 更新 Tracking Issue
```

固定规则：

- Codex 必须先读取关联 Issue 和必要事实源。
- Codex 在 Issue 边界内自动执行和验证。
- Codex 可以自动 commit、push 到任务分支，并创建 / 更新任务 PR。
- Codex 不允许自动 merge。
- Codex 不允许 push main。
- 任务 PR 必须关联普通 Issue，base 必须是对应 stage 分支。
- 阶段 PR 必须关联 Tracking Issue，base 必须是 main。
- PR 必须按 PR Template 自检。
- CI 通过不等于可以 merge。
- PR Template Check 通过不等于可以 merge。
- ChatGPT Review 和 Codex Review 只是辅助审查，不替代用户验收。
- ChatGPT / 用户完成实质 Review 后，由用户手动添加 `review:approved` label。
- 不允许用 PR body 文本替代 `review:approved` label。
- Codex 不允许自动添加、移除或伪造 `review:approved` label。
- `review:approved` 最近添加时间必须晚于或等于 PR 最新 head commit 时间。
- Review Gate 通过后，才进入 merge 判断。
- 如果 PR 后续又 push 新 commit，用户必须重新完成 review，并重新添加 `review:approved` label。
- 最终 merge 必须由用户决定。
- 任务 PR merge 后更新普通 Issue。
- 阶段 PR merge 后更新 Tracking Issue。
- 不混入无关文件。
- 工作区已有未提交代码时，只能显式 `git add` 本任务文件，不能 `git add .`。

## 5. 任务准入

- 代码任务没有可读取的关联 Issue，不进入 Codex 执行。
- 代码任务 Issue 读取失败时，Codex 必须停止，不允许修改文件。
- 流程事实源纠偏可由用户明确 prompt 直接发起，仍必须走任务分支和 PR。
- prompt 与仓库文档冲突时，停止执行并报告冲突。
- 需要超出 Issue 范围时，停止并说明原因。

Codex 指令必须明确：

```text
任务目标
关联 Issue
允许修改范围
禁止修改范围
参考事实源
验证命令
输出格式
PR / merge 边界
stage 分支边界
```

## 6. 变更门禁

以下任务必须先只读审查，不直接改代码：

- 涉及架构、目录结构、主链路或数据模型。
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

## 7. 验收

Review / 辅助验收必须检查：

- 是否符合 Issue 目标、范围、明确不做和验收标准。
- 是否修改禁止文件。
- 是否违反事实源文档。
- 是否新增依赖、修改 runtime 或修改 `pnpm-lock.yaml`。
- 是否破坏 Raw -> Canonical -> ViewModel -> UI 分层。
- 是否新增多轨实现、旧字段 fallback、重复 formatter 或重复 parser。
- 是否让 component 消费 raw payload。
- 是否违背 LangGraph / LangChain / LangSmith 终态职责。
- 是否在旧 runtime 旁新增 LangChain wrapper / adapter 旁路。
- lint / build / smoke 是否按任务要求执行并通过。
- PR 是否关联相关 Issue 并按 PR Template 自检。
- 任务 PR base 是否为对应 stage 分支。
- 阶段 PR base 是否为 main。
- CI Lint and Build 是否通过。
- PR Template Check 是否通过。
- Review Gate 是否通过。
- 用户是否明确验收完整任务闭环。

Merge 规则：

- PR 通过 CI 只是满足基础门禁，不代表可以合并。
- PR Template Check 通过只是满足模板门禁，不代表可以合并。
- Review Gate 通过表示 `review:approved` label 存在且未早于 PR 最新 head commit，是合并前条件之一，不代表可以自动合并。
- 只有普通 Issue 或 Tracking Issue 的完整任务闭环明确验收通过后，才可以合并对应 PR。
- ChatGPT / Codex 可以给出是否建议合并的判断，但不能默认替用户合并。
- 用户可以自己在 GitHub 页面合并。

## 8. 提交信息

提交信息使用中文 Conventional Commits：

```text
feat:
fix:
refactor:
chore:
docs:
test:
```
