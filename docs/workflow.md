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
- PR Template Check 是模板和自检门禁，不替代人工验收。
- main 分支必须通过 PR、CI、PR Template Check 和用户最终确认后才能合并。

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
  -> CI / PR Template Check
  -> 用户把 PR 地址发给 ChatGPT 做实质 Review
  -> 用户决定是否 merge 到 stage 分支
  -> 阶段完成
  -> 创建 / 更新阶段 PR 到 main
  -> CI / PR Template Check
  -> 用户把 PR 地址发给 ChatGPT 做实质 Review
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
- PR 创建或更新后，用户把 PR 地址发给 ChatGPT 做实质 Review。
- ChatGPT Review 通过后，用户决定是否 merge。
- 最终 merge 必须由用户决定。
- 任务 PR merge 后更新普通 Issue。
- 阶段 PR merge 后更新 Tracking Issue。
- 不混入无关文件。
- 工作区已有未提交代码时，只能显式 `git add` 本任务文件，不能 `git add .`。

## 4.1 端到端闭环流程

```text
需求提出
↓
ChatGPT 整理需求
↓
判断任务类型
↓
建立 Issue
↓
Issue Gate / Canonical Decision
↓
Codex 执行
↓
PR
↓
CI / Contract / Review
↓
Review comment 归因
↓
Release Gate
↓
Deploy / Smoke
↓
merge 后更新 Tracking Issue / 后置 Issue
```

固定门禁：

- 没有 Issue，不进代码。
- 没有明确目标、范围、明确不做和验收标准，不让 Codex 改。
- 长期规则变化，先改事实源文档。
- 字段语义变化，先确认 Contract Pack 和 canonical decision。
- Release PR 只做发布判断，不承载修复 commit。
- merge 后必须更新 Tracking Issue、当前 Issue 和仍需跟进的后置 Issue。
- PR #94 是 Canonical Decision Gate 落地前的一次性 bootstrap governance PR。
- PR #94 合并后，后续所有 Governance Task 都必须先使用 `.github/ISSUE_TEMPLATE/governance_task.yml` 建 Issue。
- 用户明确 prompt 不能作为长期绕过 Issue 的通用入口。

## 4.2 任务类型与 Issue 模板

任务进入 Codex 前必须先判断类型，并使用对应 Issue 模板：

- Phase Task：阶段内功能、体验或工程任务，使用 `.github/ISSUE_TEMPLATE/phase_task.yml`。
- Bug Fix：缺陷修复，必须先完成问题归因，使用 `.github/ISSUE_TEMPLATE/bug_fix.yml`。
- Architecture Change：架构、职责、主链路或迁移策略变更，使用 `.github/ISSUE_TEMPLATE/architecture_change.yml`。
- Contract Change：涉及 schema / generated contract / field-registry / mapper / ViewModel / DTO / seed / fixture / DB 字段 / canonical ID / runtime 输出，使用 `.github/ISSUE_TEMPLATE/contract_change.yml`。
- Governance Task：流程、模板、AGENTS、workflow、CI、GitHub ruleset 等治理任务，使用 `.github/ISSUE_TEMPLATE/governance_task.yml`。
- Release Gate：stage -> main、main -> deploy、deploy -> smoke，使用 `.github/ISSUE_TEMPLATE/release_gate.yml`。

## 4.3 Issue Gate / Canonical Decision

Issue Gate 必须在 Codex 改代码前完成：

- Issue 必须明确任务目标、允许修改范围、明确不做、验收标准和验证方式。
- 涉及 schema / mapper / ViewModel / seed / DB 字段 / runtime 输出时，必须先完成 Canonical Decision Packet。
- Canonical Decision Packet 必须明确 canonical 字段 / 对象、对象所属层级、旧字段 / UI 命名 / seed / 历史数据是否牵引当前设计、是否允许删除或重建数据库数据 / seed / fixture、后置 Issue 和验证方式。
- 如果任务不涉及字段契约或数据链路，Issue 必须明确写“不涉及”。
- 没有 Canonical Decision Packet 的 contract / schema / mapper / ViewModel / seed / DB 字段任务，不允许 Codex 改代码。
- 不允许为了历史数据、旧 seed、旧字段保留长期兼容 fallback；确实暂时不能删除时，必须在 Issue 中写明原因、影响范围和删除条件。

## 4.4 Review Comment 归因

Review comment 不是任务本身，只是症状。必须先归因，再修复。

每条 review comment 必须归入以下分类之一：

- A. 当前 Issue 范围内，已修。
- B. 后置到已有 Issue。
- C. 新建 Issue。
- D. 真正孤立单点。

规则：

- 孤立单点可以在当前 PR 内直接修，但必须仍在当前 Issue 范围内。
- 不是孤立单点的问题，必须归入当前 Issue 或新建 / 挂接后置 Issue。
- 涉及 contract / mapper / ViewModel / seed / DB 字段的问题，必须回到 Canonical Decision Gate，不允许直接按 review comment 写补丁。
- 如果 review comment 暴露当前 PR 方向错误，应停止并建议关闭重开，不继续堆补丁式 commit。

## 4.5 Release Gate

Release Gate 用于 stage -> main、main -> deploy、deploy -> smoke。

Release Gate 必须检查：

- 发布目标、base / head 和 release 范围。
- release 前检查、required checks、package / deploy / smoke 检查。
- open blocker、未完成后置 Issue、失败检查和未完成 Review。
- 用户最终 merge 决策。

固定规则：

- Release PR 只做发布判断，不承载修复 commit。
- 发现 blocker 时，新建 release-blocker Issue。
- blocker 修复必须用小 PR 回到对应 stage 分支，不在 release PR 上直接修。
- CI、PR Template Check、Contract Pack、Review Gate 和 smoke 通过后，仍必须由用户最终决定是否 merge。

## 5. 任务准入

- 代码任务没有可读取的关联 Issue，不进入 Codex 执行。
- 代码任务 Issue 读取失败时，Codex 必须停止，不允许修改文件。
- prompt 与仓库文档冲突时，停止执行并报告冲突。
- 需要超出 Issue 范围时，停止并说明原因。
- 没有 Issue，不进代码是常规规则；流程事实源纠偏不是长期绕过 Issue 的入口。
- 只有在修复流程事实源本身、治理门禁尚未落地或当前门禁阻止流程落地，且用户明确授权时，才允许临时 bootstrap / facts-source correction 例外。
- 临时例外只能修改被授权的文档、模板或工作流文件，仍必须走任务分支和 PR，并必须在 PR body 说明原因、范围和退出条件。
- PR #94 合并后，后续所有 Governance Task 必须先使用 `.github/ISSUE_TEMPLATE/governance_task.yml` 建 Issue。
- 没有范围，不让 Codex 改。
- 长期规则变化，先改文档。
- 字段语义变化，先确认 contract。

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
- ChatGPT Review / 用户 Review 是否完成。
- 用户是否明确验收完整任务闭环。

Merge 规则：

- PR 通过 CI 只是满足基础门禁，不代表可以合并。
- PR Template Check 通过只是满足模板门禁，不代表可以合并。
- ChatGPT Review 通过只是合并前条件之一，不代表可以自动合并。
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
