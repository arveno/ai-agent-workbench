# AI Agent Workbench / AI 应用工作台

AI Agent Workbench 是一个面向 AI 应用场景的前端工作台，围绕会话、登录、模型调用、Agent Run、Run Trace、报告生成、RAG 来源和部署验证组织完整的应用链路。

当前版本聚焦 AI 应用前端工作台的核心链路、验证流程和工程边界。

---

## 项目定位

本项目覆盖：

- AI 应用前端与 Agent Workbench 信息架构。
- ChatGPT 式会话与 B 端数据分析工作流结合。
- Agent Run SSE、Run Trace、工具调用、模型观测和报告产物。
- CloudBase 单轨后端：Auth、HTTP Functions、MySQL、RAG 和 quota。
- Model Gateway：前端只提交 `selectedModelId`，服务端统一校验和调用国内模型 Provider。

当前主要业务场景是教学质量数据分析，例如 `warning_count` 指标解释、月度分析、异常指标说明、教学评价制度问答和报告生成。

---

## 当前主链路

```txt
EdgeOne / Vite 前端
  ↓
CloudBase Auth
  ↓
CloudBase HTTP Functions
  ↓
CloudBase MySQL
  ↓
CloudBase workbench-agent-run-stream
  ↓
_shared/modelGateway.js
  ↓
model catalog 白名单校验
  ↓
SiliconFlow / Zhipu OpenAI-compatible API
  ↓
modelTrace / tokenUsage / latency / fallbackReason
  ↓
Run Trace / Reports / RAG
```

Vercel、Supabase 和 Groq 只作为历史迁移来源保留在少量阶段记录中，不是当前运行主线。当前 runtime 不再使用 Groq，也没有 Groq 环境变量配置要求。

---

## 模型链路

前端只传 `selectedModelId`。服务端通过 model catalog 白名单解析 `provider`、`model`、`apiKeyEnv`，再统一进入 `_shared/modelGateway.js` 调用 OpenAI-compatible Provider。模型 Key 只放在 CloudBase 函数环境变量中，不进入浏览器。

当前模型选项：

- `mock-agent`
- `siliconflow-qwen-free`
- `siliconflow-glm-free`
- `zhipu-glm-flash-free`

服务端模型环境变量：

```env
SILICONFLOW_API_KEY=
ZHIPU_API_KEY=

# 可选覆盖
SILICONFLOW_BASE_URL=https://api.siliconflow.cn/v1
ZHIPU_BASE_URL=https://open.bigmodel.cn/api/paas/v4
SILICONFLOW_MODEL_QWEN=Qwen/Qwen2.5-7B-Instruct
SILICONFLOW_MODEL_GLM=THUDM/GLM-4-9B-0414
ZHIPU_MODEL_GLM_FLASH=glm-4-flash-250414
MODEL_GATEWAY_TIMEOUT_MS=30000
```

---

## Mock / Real / Fallback 边界

- Mock：模拟模式和稳定验证路径，不调用真实模型，不消耗模型 token。
- Real：登录后通过 CloudBase private API 触发真实 Agent Run，并由 SiliconFlow / Zhipu Provider 生成模型结论。
- Fallback：模型不可用、模型未配置、任务不支持或数据工具不可用时，服务端用明确 fallback 结果收口。

Fallback 不能伪装成真实模型结果。Run Trace 和 assistant message metadata 会记录并呈现 `conclusionSource`、`fallbackReason`、`modelErrorType`、`provider`、`model`、`tokenUsage` 和 `latencyMs` 等观测字段。

---

## 已完成能力

- ChatGPT 式会话主链路。
- 预置示例任务和示例会话。
- CloudBase 登录、会话恢复、消息恢复。
- 多模型选择与 `selectedModelId` 单链路提交。
- Agent Run SSE。
- Run Trace、事件恢复和工具调用记录。
- 模型 `provider` / `model` / `tokenUsage` / `latency` 观测。
- teaching_metrics 数据分析工具：`schema_inspect`、`aggregate_table`、`chart_render`。
- 报告生成、保存、读取和刷新恢复。
- RAG / `knowledge_search`，基于 CloudBase MySQL `knowledge_documents` / `knowledge_chunks`。
- Quota consume / finish 和 Agent Run 幂等保护。
- CloudBase 函数本地打包与包结构检查。
- CloudBase 手动上传说明。
- 部署后 smoke test 脚本。
- 已完成 `siliconflow-qwen-free` 线上 smoke test 验证。

---

## 技术栈

- React / TypeScript / Vite
- Zustand
- Tailwind CSS / shadcn/ui / Radix UI
- ECharts
- react-markdown / remark-gfm
- EdgeOne Pages
- CloudBase Auth
- CloudBase HTTP Functions
- CloudBase MySQL
- Model Gateway / OpenAI-compatible Provider

---

## 环境变量

本地前端 `.env.local` 示例：

```env
VITE_API_BASE_URL=
VITE_CLOUDBASE_ENV_ID=ai-agent-workbench-poc-d6731923d
VITE_CLOUDBASE_REGION=ap-shanghai
CLOUDBASE_PROXY_TARGET=https://ai-agent-workbench-poc-d6731923d-1317403720.ap-shanghai.app.tcloudbase.com
```

说明：

- `.env.local` 不提交。
- `VITE_` 变量会进入浏览器，只能放公开前端配置。
- `VITE_API_BASE_URL` 本地可留空，由 Vite dev server 代理 `/api`。
- `CLOUDBASE_PROXY_TARGET` 只供本地 Vite dev server 使用，不暴露给浏览器。
- 模型 Key、数据库连接串和 service role 不允许放到 `VITE_*`。

CloudBase 函数环境变量：

```env
CLOUDBASE_ENV_ID=ai-agent-workbench-poc-d6731923d
SILICONFLOW_API_KEY=
ZHIPU_API_KEY=
```

所有依赖 `tencent/functions/_shared/mysql.js` 的函数都需要 `CLOUDBASE_ENV_ID`。模型 Key 只需要配置到涉及模型调用的 CloudBase 函数环境中。

---

## 本地运行

安装依赖：

```bash
pnpm install
```

开发模式：

```bash
pnpm dev
```

本地构建：

```bash
pnpm build
```

当前可能出现 Vite chunk size warning，主要来自 ECharts、Markdown 和业务代码体积；不影响当前版本构建通过。

---

## CloudBase 函数打包

推荐使用项目内本地临时目录，便于 Windows / Mac 统一工作流：

```bash
pnpm cloudbase:package -- --function all --out ./.cloudbase-packages --clean --check
```

说明：

- `.cloudbase-packages/` 是本地打包产物，不提交 Git。
- 默认输出到桌面仍然保留，适合临时手动上传。
- 上传 CloudBase 时，压缩具体函数 package 目录内的内容，不要压缩外层目录。
- 当前仍以手动上传 CloudBase HTTP Functions 为主，自动上传和 CI/CD 后置。

详细说明见 `docs/cloudbase-functions-deploy.md`。

---

## 部署后 Smoke Test

无 token 可达性检查：

```bash
pnpm cloudbase:smoke -- --base-url <CloudBase_HTTP_Functions_Base_URL>
```

带 token 基础读写检查：

```bash
pnpm cloudbase:smoke -- --base-url <CloudBase_HTTP_Functions_Base_URL> --token <token>
```

带 Agent SSE 和真实模型检查：

```bash
pnpm cloudbase:smoke -- --base-url <CloudBase_HTTP_Functions_Base_URL> --token <token> --include-sse --model siliconflow-qwen-free --prompt "请分析本月教学质量数据，重点说明 warning_count 的含义，并给出一句结论。"
```

注意：

- smoke test 会创建 smoke conversation / message / report，当前不自动清理。
- `--include-sse` 会触发 Agent Run，消耗 quota。
- 真实模型测试会消耗 Provider token。
- SSE smoke 会解析 `data: <JSON>` 事件，并输出 `run_completed`、`run_failed`、`conclusion_completed`、`provider`、`model`、`tokenUsage`、`latencyMs` 等诊断信息。

---

## 推荐使用路径

```txt
1. 打开线上地址
2. 未登录查看预置示例
3. 登录 CloudBase 用户
4. 新建聊天
5. 选择 siliconflow-qwen-free
6. 提问：请分析本月教学质量数据，重点说明 warning_count 的含义，并给出一句结论。
7. 查看聊天结果
8. 查看右侧 Run Trace
9. 查看 provider / model / tokenUsage / latency
10. 生成报告
11. 刷新页面，确认会话、消息、Run Trace 和报告恢复
```

也可以验证 RAG 问答，例如询问教学评价制度或 `warning_count` 的业务含义，并查看 `knowledge_search` 来源。

---

## 数据持久化范围

当前 CloudBase MySQL 持久化范围：

```txt
conversations
messages
agent_runs
run_events
tool_invocations
report_artifacts
agent_run_usage
knowledge_documents
knowledge_chunks
```

这些表分别承担会话恢复、消息恢复、Run Trace 恢复、工具调用记录、报告 artifact、quota audit 和 RAG 知识来源。

---

## 已知限制

- 当前版本聚焦核心工作台链路，Admin UI、多租户 Workspace、监控告警和完整成本面板等能力后续补充。
- CloudBase 函数仍以手动上传为主。
- smoke test 会创建 smoke conversation / message / report，当前不自动清理。
- 真实模型测试会消耗 token / quota。
- 手机浏览器适配后续继续补。
- CI/CD、自动上传和 migration 自动化后置。
- RAG 仍是小规模 MySQL 关键词检索闭环，不是完整知识库后台。
- 暂无完整 Admin UI、多租户 Workspace、成本面板和监控告警。

---

## 后续规划

- 当前版本功能回归。
- 代码规范化与目录结构收口。
- Token Usage / Cost Analysis。
- Observability / Guardrail 标准化。
- Model Compare。
- Planner / Intent Router。
- Tool Calling Schema Validation。
- RAG Pipeline / Evaluation。
- 移动端浏览器适配。
