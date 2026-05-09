# Phase 2：真实 Agent 工作流架构文档

## 1. Phase 2 目标

当前项目已完成前端工作台主链路（Mock/Groq、多轮会话、模型配置、右侧运行信息展示）。  
Phase 2 的目标是将项目从“AI Agent Workbench 前端 Demo”升级为“支持真实数据源、真实工具库和真实 Agent Run 的小型 AI 分析工作台”。

本阶段强调“小而正规的闭环”，而不是做大而全平台：

用户输入  
→ 读取数据源 Schema  
→ 选择并执行工具  
→ 模型基于工具结果生成回复  
→ 展示 Run 过程  
→ 保存会话与 Run 结果

---

## 2. 不做什么（Phase 2 第一阶段边界）

为保证节奏和可交付性，第一阶段明确不做以下内容：

- 不做用户系统（注册/登录/组织/团队）
- 不做复杂权限系统（RBAC/细粒度行列权限）
- 不做任意 SQL 编辑器
- 不做多数据库同时接入和跨源联邦查询
- 不做生产级 BI 系统（完整报表中心、指标平台）
- 不做完整 RAG 平台（向量库管理、召回策略平台化）
- 不做复杂工作流编排器（拖拽编排、条件分支引擎）

---

## 3. 总体架构

```txt
React Workbench
  ↓
Vercel API
  ↓
Agent Orchestrator
  ↓
Tool Registry
  ↓
DataSource Connector
  ↓
PostgreSQL / Supabase
  ↓
Groq Streaming
```

架构职责简述：

- React Workbench：负责交互、Run 可视化、会话与消息呈现。
- Vercel API：统一服务端入口，封装工具执行与模型调用。
- Agent Orchestrator：固定编排步骤，串联工具与模型。
- Tool Registry：声明可用工具、输入校验、风险级别、执行函数。
- DataSource Connector：统一数据库连接和查询封装。
- PostgreSQL/Supabase：业务数据源（第一版单源）。
- Groq Streaming：最终回答流式生成。

---

## 4. 核心概念

- `DataSource`：数据源定义，描述连接方式、可访问范围和启用状态。
- `Schema`：数据库结构信息（schema、table、column、type）。
- `Tool`：受控工具定义（名称、输入结构、执行函数、风险等级）。
- `ToolInvocation`：一次工具调用记录（输入、输出摘要、耗时、状态）。
- `Run`：一次用户问题触发的 Agent 执行过程。
- `Message`：用户或 AI 的消息内容。
- `Session`：会话，包含多轮消息及关联 Run。

---

## 5. 数据源设计（第一版）

第一版支持：

- PostgreSQL
- Supabase（底层仍按 PostgreSQL 连接）

数据源配置字段：

- `name`
- `type`
- `connectionMode`
- `connectionString` 或 `envKey`
- `enabled`
- `allowedSchemas`
- `allowedTables`

实现约束：

- 前端不直接连接数据库。
- 数据库连接信息仅在服务端使用。
- 公开 Demo 场景优先使用 Vercel 环境变量（避免明文暴露连接串）。

第一版连接策略（优先级）：

- 优先使用服务端环境变量配置演示数据库连接：
  - `POSTGRES_CONNECTION_STRING`
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
- 页面中的数据源入口优先展示连接状态和 Schema 概览。
- 第一版不在前端长期保存数据库连接串。

---

## 6. 工具库设计（第一版）

第一版工具清单：

- `schema_inspect`
- `query_table`
- `aggregate_table`
- `chart_render`

后续预留：

- `knowledge_search`
- `report_generate`

每个工具统一结构：

- `name`
- `description`
- `inputSchema`
- `riskLevel`
- `enabled`
- `execute()`

说明：

- 所有工具均由服务端注册和执行。
- 模型只能通过“工具能力”间接访问数据，不能直接任意查库。

第一版编排强化约束：

- 第一版工具调用不是模型自由调用。
- 固定流程为：`prompt → schema_inspect → query_table / aggregate_table → chart_render → Groq final answer`。
- 模型仅负责问题理解与最终回复生成，不直接决定 SQL，也不直接执行工具。

---

## 7. 安全边界（必须执行）

必须遵守以下安全规则：

- 不允许模型直接执行任意 SQL。
- 服务端仅暴露受控工具接口。
- 仅允许 `SELECT` 查询。
- 必须限制表白名单。
- 必须限制字段白名单。
- 必须强制 `LIMIT`。
- 必须设置查询超时。
- 严禁 `INSERT / UPDATE / DELETE / DROP / ALTER`。
- API Key / 数据库连接串不进入 URL。
- API Key / 数据库连接串不进入前端代码仓库。

---

## 8. Agent Run 流程（第一版固定编排）

第一版使用固定编排，不做模型自由 tool calling。

流程：

1. 创建 Run
2. 读取当前数据源 Schema
3. 根据 prompt 做简单 intent 判断
4. 执行 `schema_inspect`
5. 执行 `query_table` 或 `aggregate_table`
6. 生成 chart data
7. 保存 tool invocations
8. 拼接 tool context
9. 调用 Groq 流式生成最终回复
10. 前端展示 Run 过程

设计原则：

- 可解释：每一步可回放、可展示。
- 可控：执行路径固定，便于调试与风控。
- 可扩展：后续再引入更复杂的策略层。

---

## 9. API 设计（Phase 2）

第一阶段规划 API：

- `POST /api/datasources/test`
- `POST /api/datasources/schema`
- `POST /api/agent/run`

可选后续：

- `GET /api/tools`
- `POST /api/tools/test`

职责边界：

- `/api/datasources/*`：数据源可用性与结构能力。
- `/api/agent/run`：Run 编排入口（工具执行 + 模型生成）。
- `/api/tools/*`：工具清单与工具级诊断能力（后续再开）。

---

## 10. 前端 UI 规划

顶部入口（已具备静态入口）：

- 数据源
- 工具库
- 工作流

右侧信息面板（已具备结构）：

1. 本轮执行步骤
2. 当前数据源
3. 本轮工具调用
4. 数据分析结果
5. 当前结论

下一步要求：

- 每条消息绑定对应 `Run`。
- 右侧内容由真实 `Run` 数据驱动，不再是纯静态 mock。

---

## 11. 分阶段开发步骤

- Step 37：数据源配置弹窗静态 UI
- Step 38：工具库配置弹窗静态 UI
- Step 39：工作流弹窗静态 UI
- Step 40：`/api/datasources/test`
- Step 41：`/api/datasources/schema`
- Step 42：Tool Registry
- Step 43：`/api/agent/run`
- Step 44：前端 Run 级展示

执行策略：

- 先 UI 入口与结构，再 API 与工具，再串联 Run 全链路。
- 每步保持可运行、可回归，不做跨步并行大改。

---

## 12. 验收标准

本文档完成后，需满足：

1. 不改业务代码。
2. 不影响现有功能。
3. 后续开发可按文档逐步执行。
4. 架构边界清晰。
5. 安全边界清晰。

---

## 13. 与现有能力的关系

Phase 2 不推翻现有 Mock / Groq / 会话能力。

现有能力继续保留：

- Mock 模式作为稳定演示兜底
- Groq 流式输出作为真实模型能力
- 本地会话和多轮消息继续保留
- 模型配置中心继续使用现有 BYOK 方案

Phase 2 的新增能力是：

- 数据源配置
- 工具库配置
- 真实工具执行
- Run 级工具调用展示

---

## 补充说明

- Phase 2 关注“真实可运行能力”而非“大平台化”。
- 在保持 Demo 稳定性的前提下，逐步替换静态块为真实数据流。
- 继续保持当前项目原则：可演示、可解释、可扩展。
