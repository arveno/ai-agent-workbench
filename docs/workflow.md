# Workflow

本文档只定义 AI Agent Workbench 的协作流程、变更门禁和验收流程。架构见 `docs/architecture.md`，生命周期见 `docs/agent-run-lifecycle.md`，代码执行硬规则见 `AGENTS.md`。

## 1. 事实源

- 文档是长期事实源。
- Tracking Issue 是阶段 / 主线事实源。
- 普通 Issue 是当前工作单元事实源。
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
- 自动门禁：`.github/workflows/ci.yml` 和 main ruleset

## 2. 角色

### 用户

- 定义需求、范围、优先级和验收标准。
- 本地 review diff 后决定是否允许 commit。
- 决定何时 push、创建 PR 和 merge。

### ChatGPT

- 只作为可选辅助，用于判断、拆解、解释和复盘。
- 可以辅助整理 Issue、PR 风险和验收意见。
- 不作为任务准入、执行或合并的流程控制器。

### Codex

- 在 Issue 和事实源边界内执行。
- 修改文件、运行验证、输出 Review Packet。
- 本地 commit 前必须停下给用户 review diff。
- 不在未授权时 push、创建 PR 或 merge。

### Git / GitHub

- Git 记录本地过程。
- GitHub 承载 Issue、PR、CI、Review 和 main ruleset。
- CI 是基础质量门禁，不替代人工验收。
- main 分支必须通过 PR、CI 和 main ruleset 后才能合并。

## 3. 层级

```text
阶段 = Tracking Issue
Tracking Issue = 普通 Issue + checklist + 关联子 Issue
普通 Issue = 阶段下可独立验收的工作单元
Commit = 本地过程记录
PR = 阶段性发布 / 合并入口
```

规则：

- Tracking Issue 管理阶段目标、范围、子任务、完成标准和进度。
- 普通 Issue 不等于小步骤，也不应大到覆盖整个阶段。
- 普通 Issue 可以包含多个子任务和多次本地 commit。
- 普通 Issue 完成标准必须清楚、可验收。
- 不按单个小动作、单个文件修改或单个 commit 拆 Issue / PR。
- PR 不强制一个 Issue 一个 PR。
- 一个 PR 可以包含一个或多个相关 Issue。
- 只有范围明显变化时，才新建 Issue / PR。
- 只读审查类 Issue 可以不建分支、不建 PR，只在 Issue 评论沉淀结论。
- 长期事实源变更或代码变更最终必须通过 PR 进入 main。

## 4. Local-first 流程

```text
Tracking Issue 确认阶段主线
  -> 普通 Issue 定义可独立验收工作单元
  -> Codex 读取 Issue 和必要事实源
  -> Codex 在边界内自动执行和验证
  -> 本地 review checkpoint
  -> 用户确认后本地 commit
  -> 阶段稳定或用户明确要求后 push / 创建 PR
  -> PR 关联相关 Issue 并按 PR Template 自检
  -> CI / Review / main ruleset
  -> 用户决定是否 merge
```

核心规则：

```text
Codex 可以自动执行，但本地 commit 前必须给轻量 review checkpoint；push、PR、merge 只在阶段稳定或用户明确要求时执行。
```

本地 review checkpoint：

```text
git diff --stat
git diff
git status --short
```

要求：

- Codex 修改文件并完成验证后，先停在本地 diff review。
- 用户确认后，Codex 才能 commit 并继续后续已授权流程。
- 多个 Issue / 多个本地 commit 可以先在本地推进。
- 不要求每个 Issue 都 push / PR。
- push、创建 PR、更新 PR 或 merge 不是每步默认动作。
- 同一阶段后续需要补充时，继续在同一个分支 / 同一个 PR 上追加；只有范围明显变化时才新建 Issue / PR。
- 不混入无关文件。
- 工作区已有未提交代码时，只能显式 `git add` 本阶段文件，不能 `git add .`。

## 5. 任务准入

- 没有可读取的关联 Issue，不进入 Codex 执行。
- Issue 读取失败时，Codex 必须停止，不允许修改文件。
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
本地 commit 前 review 要求
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
- CI Lint and Build 是否通过。

Merge 规则：

- PR 通过 CI 只是满足基础门禁，不代表可以合并。
- Review 通过只是合并前条件之一。
- 只有相关 Issue 或 Tracking Issue 的完整任务闭环明确验收通过后，才可以合并。
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
