# AGENTS.md

本文件只定义 Codex / AI Coding Agent 在本仓库执行代码任务时必须遵守的硬规则。

## 1. 必读事实源

改动前按任务范围读取对应文档：

- 生命周期归位：`docs/agent-run-lifecycle.md`
- 核心对象与 ID：`docs/id-contract.md`
- Source / RAG lineage：`docs/source-lineage.md`
- 工具治理：`docs/tool-governance.md`
- 架构分层与数据流：`docs/architecture.md`
- 协作、门禁与验收：`docs/workflow.md`
- CloudBase 函数部署：`docs/cloudbase-functions-deploy.md`

如果任务说明、聊天上下文或临时指令与仓库文档冲突，必须停止并报告冲突。需要改变长期契约时，先更新对应事实源文档，再改代码。

## 2. 默认执行原则

- 默认单轨实现，不新增兼容链。
- 不保留新旧链路并存。
- LangGraph 是长期 Agent Runtime / Graph 编排核心。
- LangChain 是长期 Model / Tool / RAG 能力层。
- LangSmith 是长期 Trace / Evaluation / Observability 标准平台。
- 当前 Agent Run 主链路已进入 LangGraph runtime；不得恢复自研 imperative runtime、basic / mock 主线或旧 runtime 旁路。
- 后续不得在旧 runtime 旁新增 LangChain 包装层或旁路执行链。
- 不做无关重构。
- 不新增无关依赖。
- 代码优先简洁、直接、易读，优先保证阅读路径连贯，不为拆而拆。
- 不做过度抽象。
- 不做过度封装。
- 不引入无意义 helper / manager / engine / factory / adapter / wrapper。
- 不用临时兜底遮盖主链路问题。
- 死代码、废弃代码、冗余代码、旧兼容代码默认删除。
- 当前主链路不需要的代码默认删除。
- 旧兼容逻辑确实暂时不能删除时，必须说明原因、影响范围和删除条件。

抽象边界：只有存在真实复用、职责边界更清楚、能减少重复、能隔离复杂逻辑、收敛复杂业务链路或明显提升可读性时，才抽取函数 / 模块。禁止为拆而拆，禁止把同一文件内连续清楚的逻辑拆成大量小函数、简单逻辑多层调用或频繁跳转，禁止为了显得架构化或未来可能用到提前设计 helper / manager / factory / adapter / wrapper / 扩展层。

处理顺序：

```text
先删除确定无用代码 -> 再合并重复逻辑 -> 再收敛职责边界 -> 最后调整目录结构
```

## 3. 生命周期门禁

任何功能变更前必须判断：

- 属于 `docs/agent-run-lifecycle.md` 的哪个生命周期节点。
- 绑定哪些核心对象。
- 是否涉及 conversation / message / run / report / source / usage / evaluation ID。
- 是否涉及 Source / RAG lineage。
- 是否涉及工具定义、工具参数、Tool Invocation、Run Trace 或前端工具展示。
- 是否会新增多轨实现、重复状态、重复字段、重复 formatter。

涉及 ID、Source 或 Tool 的细节不得在代码任务中临时决定，必须遵守对应契约文档。

## 4. 职责边界

- CloudBase Function：Auth、数据库访问、模型调用、工具调用、Agent Run 编排。
- service：前端 API 请求。
- store：业务状态。
- mapper / reducer：数据归一和状态合并。
- ViewModel：UI 展示模型。
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

component 只能消费 ViewModel，不得绕过 mapper / ViewModel 直接消费 raw payload。

## 5. 数据链路

业务展示数据分层以 `docs/architecture.md` 为准。

硬性要求：

- component 只能消费 ViewModel。
- raw 数据只能进入 debug / rawText / 日志 / 调试详情。
- UI 主视图不能直接消费 raw payload。
- 同源数据只能标准化一次。
- 不允许多个组件各自 formatter / parse / clean 同一份数据。

## 6. Model / Tool / RAG 终态

长期终态模型调用必须走：

```text
selectedModelId -> model catalog -> LangChain model layer -> provider client
```

当前状态：Agent Run 主链路已进入 LangGraph runtime；正式 Tool / Retriever 已进入 LangChain Tool / Retriever 边界；模型调用已进入 `_shared/langchainModelLayer.js`。

要求：

- 前端只传 `selectedModelId`。
- 前端不得出现模型 API Key、baseURL、provider 密钥配置。
- 后端通过 catalog 白名单解析 provider / model / apiKeyEnv。
- 模型调用、工具定义和 RAG 能力向 LangChain Model / Tool / Retriever 收敛。
- 旧模型网关调用链不得恢复或扩展成新的长期模型平台。

禁止：

- 恢复 Groq runtime。
- 恢复 `modelProvider: 'groq'`。
- 恢复前端 provider / model 透传链路。
- 绕过 catalog 或 LangChain model layer 直接调用模型。
- 恢复旧模型网关为 Agent Run 主模型调用边界或 fallback 旁路。
- 绕过 LangChain Tool / Retriever 边界新增旧工具链或旧 RAG 链。
- 在旧 runtime 旁边新增 LangChain wrapper / adapter 旁路。
- 为兼容旧代码保留 old/new 双轨字段或 fallback 链。

## 7. Mock / Real / Fallback

必须区分：

- Mock：模拟 / 预置验证路径。
- Real：真实 Provider 模型生成。
- Fallback：模型不可用、任务不支持或服务异常时的兜底。

要求：

- Fallback 不能伪装成真实模型结果。
- UI 必须能区分 `conclusionSource`。
- Run Trace 必须展示 `fallbackReason` / `modelErrorType`。
- Chat、Run Trace、Report 不得各自解释不同结论来源。

## 8. 状态一致性

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

## 9. 配置与部署

影响运行结果的配置必须有明确事实源，不能只存在于脚本硬编码或控制台记忆中。

包括：

- CloudBase envId
- HTTP 访问服务 domain / route
- CloudBase Function runtime / handler / HTTP path
- 函数环境变量名称
- Model Provider catalog
- 数据库 migration / seed
- smoke test base URL

要求：

- 部署脚本只能作为执行器，不能成为云端资源配置的唯一事实源。
- 路由、环境变量、函数清单、部署域名来自显式参数、配置文件或文档化清单。
- 不允许脚本静默猜测 envId、domain、route、runtime 或函数类型。
- 不允许把“函数代码上传成功”描述成“完整部署成功”。
- 敏感值不能写入仓库。
- SQL / migration / seed 必须保留仓库文件作为事实源。

## 10. 固定禁止项

禁止：

- 未按 Issue 或 prompt 授权自动 commit、push、创建 / 更新 PR；自动 merge；push main。
- 绕过 GitHub required review。
- 处理 stash。
- 全项目格式化。
- 新增无关依赖。
- 修改任务范围外文件。
- 恢复旧 Provider / Groq / Supabase / Vercel runtime。
- 新旧链路并存。
- UI 主视图消费 raw payload。
- 未经要求修改 README / docs / package.json / pnpm-lock.yaml。
- 未经确认把云端控制台配置写死到脚本里。
- 部署脚本静默猜测 envId、domain、HTTP route 或函数类型。
- 把代码上传成功等同于完整部署成功。
- 修改部署脚本却不提供 dry-run、真实验证或人工校验步骤。

合并 PR 前，Codex 必须确认 required reviews 和 required checks 已通过。若 GitHub required review 或 required checks 未通过，必须停止，不得 merge。

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
