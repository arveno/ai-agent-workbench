# Workflow

本文档说明 AI Agent Workbench 项目中用户、ChatGPT、Codex、Git / GitHub 的协作流程。

AI Agent Enterprise Lifecycle（AI Agent 企业级运行生命周期）SSOT 见 `docs/agent-run-lifecycle.md`。核心对象与 ID 契约见 `docs/id-contract.md`。

本文档只描述协作流程，不描述详细架构，不写代码生成硬规则，不写 CloudBase 部署教程。

## 1. 角色分工

### 用户

用户是项目负责人和最终决策者。

职责：

- 描述真实需求、问题和痛点。
- 判断阶段目标和优先级。
- 执行 Codex 指令。
- 贴回 Codex 输出、diff、截图、终端结果。
- 手动执行 git commit / push。
- 对最终方案做决策。

### ChatGPT

ChatGPT 负责方向判断和协作组织。

职责：

- 理解需求。
- 判断是否值得做。
- 判断当前是否该做。
- 拆解任务。
- 设计方案。
- 生成 Codex 指令。
- 验收 Codex 输出。
- 解释技术问题。
- 总结阶段结果。

### Codex

Codex 是代码执行者，不是项目决策者。

职责：

- 在明确边界内执行。
- 遵守 `AGENTS.md`。
- 不自由发挥。
- 不做无关重构。
- 不自动提交。
- 输出修改文件、diff、验证结果。

### Git / GitHub

Git 负责版本记录和回滚节点。  
GitHub 负责远程备份和阶段同步。

提交和 push 由用户手动执行。

## 2. 默认协作流程

默认流程：

```text
用户描述需求 / 问题
  -> ChatGPT 整理需求
  -> ChatGPT 判断优先级和价值
  -> 生命周期归位
  -> 对象关系判断
  -> 依赖顺序判断
  -> 必要时安排 Codex 只读审查
  -> ChatGPT 输出方案
  -> ChatGPT 拆小步骤
  -> ChatGPT 生成 Codex 指令
  -> Codex 小步执行
  -> 用户贴回结果
  -> ChatGPT 验收
  -> 必要时返工
  -> 用户手动提交
  -> 阶段总结和沉淀
```

原则：

- 不直接让 Codex 大改。
- 不跳过需求判断。
- 不跳过验收。
- 不混多个阶段。
- 不把不确定问题交给 Codex 自由决定。

## 2.1 生命周期门禁

后续所有任务必须先对齐 `docs/agent-run-lifecycle.md`：

- 生命周期归位：判断任务属于 Access / Identity 到 Audit / Governance / Cost 的哪一段。
- 对象关系判断：明确绑定 User / Workspace / Conversation / Message / Run / Artifact / Evaluation / Usage 等哪个核心对象。
- ID 契约对齐：涉及 conversation / message / run / report / source / usage / evaluation ID 的任务，必须先阅读 `docs/id-contract.md`，确认 canonical ID、幂等 ID、兼容 ID 的边界，再写代码。
- 依赖顺序判断：确认上游能力已经具备，不能跳过依赖直接推进下游能力。
- 执行顺序固定为：生命周期归位 -> 设计 -> 执行 -> 验收。
- 方案：说明实现边界、数据链路、服务端受控点和验收方式。
- Codex 小步执行：一次只做明确范围内的改动。
- 验收：检查生命周期位置、对象绑定、职责边界、diff 和验证结果。
- 提交：由用户手动提交，只提交本阶段文件。
- 沉淀：把阶段结论、残留问题和下一步写回对应文档或任务记录。

顺序约束：

- Evaluation 必须排在 Intent Router / Planner / Tool Governance / Trace / Artifact / Persistence 之后。
- Bad Case 必须排在 Evaluation 之后。
- Improvement 必须排在 Bad Case / Dataset 之后。
- Operation / Audit 贯穿全程，但不要提前建设重后台。

## 3. 什么时候必须只读审查

以下情况必须先只读审查，不直接改代码：

- 涉及架构调整。
- 涉及目录结构。
- 涉及主链路。
- 涉及数据模型。
- 涉及 Auth。
- 涉及 Model Gateway。
- 涉及 CloudBase Functions。
- 涉及数据库。
- 涉及 Agent Run。
- 涉及 Run Trace。
- 涉及删除大量代码。
- 涉及大范围重构。
- 涉及旧链路清理。
- 当前影响范围不明确。

只读审查要求：

- 不修改代码。
- 不创建文件。
- 不格式化文件。
- 不提交。
- 输出问题清单、影响范围、风险和建议阶段。

## 4. 什么时候可以直接执行

以下任务可以直接执行，但仍需明确范围：

- 明确小 bug。
- 明确文案调整。
- 明确 lint 死代码。
- 明确文档补充。
- 明确脚本补充。
- 明确文件删除。
- 小范围 UI 修正。
- 影响范围非常清楚的低风险改动。

即使可以直接执行，也必须给 Codex 明确：

- 允许修改范围。
- 禁止修改范围。
- 验收方式。
- 输出格式。
- 不自动提交。

## 5. Codex 指令格式

Codex 指令应包含：

```text
任务目标
项目路径
背景
允许修改范围
禁止修改范围
参考文档
验证命令
输出格式
不自动提交
```

根据任务类型指定参考文档：

- 涉及功能归位和新功能接入：参考 `docs/agent-run-lifecycle.md`
- 涉及核心对象 ID：参考 `docs/id-contract.md`
- 涉及代码规则：参考 `AGENTS.md`
- 涉及架构判断：参考 `docs/architecture.md`
- 涉及 CloudBase 打包 / 上传 / smoke test：参考 `docs/cloudbase-functions-deploy.md`

## 6. 用户需要贴回的内容

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

## 7. ChatGPT 验收标准

ChatGPT 验收时重点看：

- 是否符合任务目标。
- 是否超出允许范围。
- 是否修改了禁止修改的文件。
- 是否破坏主链路。
- 是否新增依赖。
- 是否修改 runtime。
- 是否修改 `pnpm-lock.yaml`。
- 是否存在旧链路残留。
- 是否出现多轨实现。
- 是否引入无意义抽象。
- 是否符合 `AGENTS.md`。
- lint / build / smoke 是否通过。
- 是否可以提交。

## 8. Git 提交规范

提交由用户手动执行。

提交信息使用中文 Conventional Commits：

```text
feat:
fix:
refactor:
chore:
docs:
test:
```

示例：

```text
chore: 清理废弃参数并修复 lint
docs: 补充 CloudBase 函数打包上传说明
refactor: 收敛结论 ViewModel 数据链路
fix: 修复报告状态恢复异常
```

提交原则：

- 一个阶段或一个小闭环对应一次提交。
- 不混入无关文件。
- 不用模糊提交信息。
- 不让 Codex 自动提交。
- 提交前先看 `git diff --stat`。
- 当前如果工作区已有未提交代码，文档提交时只能显式 `git add` 文档文件，不能 `git add .`。
- Git 提交始终由用户手动执行。
- 有风险的改动先经 ChatGPT 验收。

## 9. 阶段收口

每个阶段应明确：

- 当前目标。
- 当前不做什么。
- 允许修改范围。
- 禁止修改范围。
- 验收标准。
- 是否需要提交。
- 下一步是什么。

阶段结束后应沉淀：

- 做了什么。
- 解决了什么问题。
- 是否影响主链路。
- 如何验证。
- 还剩什么问题。
- 下一阶段建议。
