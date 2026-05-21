# AGENTS.md

本文件是 AI Agent Workbench 项目的 Codex / AI Coding Agent 执行规则。  
只写代码生成硬约束，不写完整架构、不写协作流程、不写部署教程。

## 1. 项目上下文

本项目是 AI 应用前端工作台 / Agent Workbench。

当前主链路：

```text
EdgeOne / Vite -> CloudBase Auth -> CloudBase HTTP Functions -> CloudBase MySQL
```

当前模型链路：

```text
selectedModelId -> model catalog -> _shared/modelGateway.js -> SiliconFlow / Zhipu
```

### 必读文档

- `docs/agent-run-lifecycle.md`：AI Agent Enterprise Lifecycle（AI Agent 企业级运行生命周期）SSOT，功能归位和新功能接入的最高主线。
- `docs/id-contract.md`：核心对象与 ID 契约，约束 conversation / message / run / report / source / usage / evaluation 的 ID 语义。
- `docs/architecture.md`：架构、模块职责、数据流、前后端边界。
- `docs/workflow.md`：协作流程、只读审查、验收、提交规范。
- `docs/cloudbase-functions-deploy.md`：CloudBase 打包、上传、smoke test。

AI Agent Enterprise Lifecycle 约束：

- Codex 改功能前必须先判断生命周期位置和核心对象绑定。
- 涉及 conversation / message / run / report / source / usage / evaluation ID 的修改，必须先遵守 `docs/id-contract.md`。
- 新功能必须围绕 AI Agent Enterprise Lifecycle 接入，不允许只按局部页面或组件自由扩展。
- 如果具体实现和 AI Agent Enterprise Lifecycle 主线冲突，先停止并汇报，不允许直接写代码。

## 2. 代码生成原则

必须遵守：

- 企业级代码质量，但不是企业级规模。
- 简洁、易读、单链单轨、职责清晰。
- 不做无关重构。
- 不新增无关依赖。
- 不做过度抽象。
- 不保留多套实现。
- 不做只遮盖问题的临时修复。
- 不长期保留旧兼容逻辑。
- 死代码、废弃代码、冗余代码、旧兼容代码默认删除。

处理顺序：

```text
先删除确定无用代码 -> 再合并重复逻辑 -> 再收敛职责边界 -> 最后调整目录结构
```

## 3. 职责边界

- CloudBase Function：Auth、数据库访问、模型调用、工具调用、Agent Run 编排。
- service：前端 API 请求。
- store：业务状态。
- mapper / reducer：数据归一和状态合并。
- component：展示 ViewModel 和触发交互。
- utils：纯函数工具。
- scripts：本地工程化脚本。

组件层禁止：

- 直接请求后端。
- 解析 raw JSON。
- 清洗 markdown。
- 拼接业务结论。
- 判断复杂 provider / fallback / modelErrorType。
- 维护重复业务状态。

## 4. 数据链路

所有业务展示数据必须走：

```text
Raw -> Canonical -> ViewModel -> UI
```

要求：

- raw 数据只能进入 debug / rawText / 日志 / 调试详情。
- UI 主视图不能直接消费 raw payload。
- Chat、Run Trace、Report、Source Panel 应消费同一份标准化数据。
- 同源数据只能标准化一次。
- 不允许多个组件各自 formatter / parse / clean 同一份数据。

## 5. Model Gateway

模型调用必须走：

```text
selectedModelId -> model catalog -> _shared/modelGateway.js -> provider client
```

要求：

- 前端只传 `selectedModelId`。
- 前端不能出现模型 API Key、baseURL、provider 密钥配置。
- 后端通过 catalog 白名单解析 provider / model / apiKeyEnv。
- 真实模型调用统一走 `_shared/modelGateway.js`。

禁止：

- 恢复 Groq runtime。
- 恢复 `modelProvider: 'groq'`。
- 恢复前端 provider / model 透传链路。
- 绕过 modelGateway 直接调用模型。

## 6. Mock / Real / Fallback

必须区分：

- Mock：模拟 / 预置验证路径。
- Real：真实 Provider 模型生成。
- Fallback：模型不可用、任务不支持或服务异常时的兜底。

要求：

- Fallback 不能伪装成真实模型结果。
- UI 必须能区分 `conclusionSource`。
- Run Trace 必须展示 `fallbackReason` / `modelErrorType`。
- Chat、Run Trace、Report 不应各自解释不同结论来源。

## 7. 状态一致性

关键字段：

```text
conversationId
runId
clientMessageId
usageId
selectedModelId
```

禁止：

- 旧请求覆盖当前会话。
- 旧流写入当前页面。
- 重复写 assistant message。
- 重复扣 quota。
- 切换会话后旧响应落入新会话。

## 8. 配置与部署边界

凡是影响运行结果的配置，都必须有明确事实源，不能只存在于脚本硬编码或控制台记忆中。

包括但不限于：

- CloudBase envId
- HTTP 访问服务 domain / route
- CloudBase Function runtime / handler / HTTP path
- 函数环境变量名称
- Model Provider catalog
- 数据库 migration / seed
- smoke test base URL

要求：

- 部署脚本只能作为执行器，不能成为云端资源配置的唯一事实源。
- 路由、环境变量、函数清单、部署域名等配置必须来自显式参数、配置文件或文档化清单。
- 不允许脚本静默猜测 envId、domain、route、runtime 或函数类型。
- 不允许把“函数代码上传成功”描述成“完整部署成功”。
- 部署完成后必须区分：
  - 函数代码是否已上传
  - HTTP 路由是否已绑定到正确 domain
  - 函数环境变量是否已配置
  - 接口是否通过 curl / smoke test 验证
- 如果某项云端配置暂时不能自动化，必须在输出中明确列为人工操作项和验证步骤。
- 敏感值不能写入仓库；可以提交环境变量名称、配置模板和检查规则。
- SQL / migration / seed 必须保留仓库文件作为事实源，执行方式可以是数据库客户端或后续自动化脚本。

禁止：

- 在部署脚本中长期硬编码业务路由、域名或环境配置。
- 控制台手动配置后不记录、不提示、不校验。
- 多处维护同一份函数清单、路由清单或 shared 文件依赖。
- 依赖交互式选择环境完成部署。
- 部署脚本成功退出但实际接口不可访问。

## 9. 代码干净度

必须主动识别并清理：

- dead-code
- deprecated-code
- redundant-code
- legacy-compat
- temp-debug-code
- duplicate-logic
- misplaced-responsibility
- raw-data-leak
- unused-style
- unused-asset
- unused-dependency
- config-drift：本地配置、部署脚本、文档和云端实际状态不一致。
- deploy-drift：函数代码已更新，但路由、环境变量、runtime、HTTP 访问域名或 smoke test 未同步验证。
- doc-drift

处理原则：

- 当前主链路不需要的代码，默认删除。
- 重复逻辑默认合并。
- 组件内处理 raw 数据，默认收敛到 mapper / ViewModel。
- 新旧链路并存，默认删除旧链路。
- 旧兼容代码不能长期保留；如确实暂时不能删，必须说明原因、影响范围和删除条件。

## 10. 固定禁止项

禁止：

- 自动提交。
- 处理 stash。
- 全项目格式化。
- 新增无关依赖。
- 修改任务范围外文件。
- 恢复旧 Provider / Groq / Supabase / Vercel runtime。
- 新旧链路并存。
- UI 主视图消费 raw payload。
- 引入无意义 manager / engine / factory / adapter。
- 未经要求修改 README / docs / package.json / pnpm-lock.yaml。
- 未经确认把云端控制台配置写死到脚本里。
- 部署脚本静默猜测 envId、domain、HTTP route 或函数类型。
- 把代码上传成功等同于完整部署成功。
- 修改部署脚本却不提供 dry-run、真实验证或人工校验步骤。

## 11. 输出要求

每次执行后必须输出：

1. 修改文件列表
2. `git diff --stat`
3. `pnpm lint` 结果，如涉及代码
4. `pnpm build` 结果，如涉及代码
5. 是否新增依赖
6. 是否修改 runtime
7. 是否修改 `pnpm-lock.yaml`
8. 是否存在旧链路残留
9. 是否存在多轨实现
10. 手动验证步骤

如果涉及部署 / 云端配置 / 数据库变更，还必须输出：

11. 是否涉及 CloudBase 路由 / domain
12. 是否涉及函数环境变量
13. 是否涉及 migration / seed
14. 是否需要人工控制台操作
15. 部署后验证命令
16. 已自动化内容和仍需人工确认内容
