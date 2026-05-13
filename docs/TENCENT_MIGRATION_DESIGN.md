# 腾讯云全量迁移方案设计：AI Agent Workbench

生成日期：2026-05-13

本轮目标只生成迁移设计文档，不修改主项目代码、不生成 SQL、不生成 TS/TSX、不提交 Git。

## 1. 当前结论

本次迁移不是简单把静态前端从 Vercel 换到 EdgeOne Pages，而是一次完整云平台迁移。迁移范围覆盖：

```txt
前端部署
后端 API
SSE 流式输出
Auth
数据库
环境变量
SQL migration
用户体系
权限校验
quota
持久化数据
RAG
部署与回滚
```

目标架构从：

```txt
Vercel + Supabase Auth + Supabase PostgreSQL
```

迁到：

```txt
EdgeOne Pages / CloudBase Functions + CloudBase Authentication v2 + TencentDB for PostgreSQL
```

本轮判断：

1. 不建议直接迁移主项目。
2. 建议先做腾讯云 POC，尤其是 CloudBase Auth v2、SSE、TencentDB 连接池和函数超时。
3. 前端推荐 EdgeOne Pages。
4. SSE / Agent API 推荐优先用 CloudBase HTTP Cloud Functions 做 POC。
5. 普通 Workbench API 可在 CloudBase Functions 与 EdgeOne Pages Cloud Functions 之间继续评估。
6. TencentDB schema 不应覆盖 `supabase/migrations/`，应新增 `tencent/migrations/` 单独演进。

官方能力参考：

- CloudBase Authentication v2：支持匿名登录、邮箱登录、手机号登录、用户名密码登录等登录方式，并提供 access token / refresh token / uid 等登录态概念。
- CloudBase HTTP Cloud Functions：官方支持 SSE，并把 AI conversation streaming output 列为典型场景。
- TencentDB for PostgreSQL：托管 PostgreSQL，负责安装、存储管理、高可用、备份、监控等数据库运维能力。
- EdgeOne Pages Functions：适合全栈部署；其中 Cloud Functions 更适合 Node.js / TypeScript / npm、数据库访问、外部 API 和复杂后端逻辑。

## 2. 当前架构与依赖

### 2.1 当前架构

当前项目是 React + Vite + TypeScript 前端，API 使用 Vercel Serverless Functions，Auth 使用 Supabase Auth，数据库和 RLS 使用 Supabase PostgreSQL，模型调用在服务端通过 `GROQ_API_KEY` 完成。

当前关键路径：

```txt
Browser
↓
Vite React App
↓
Supabase Auth session/access_token
↓
Vercel API routes under api/*
↓
Supabase Admin Client / Supabase PostgreSQL
↓
Groq API / PostgreSQL datasource / Supabase datasource
```

### 2.2 Vercel 依赖

代码层依赖：

- `package.json`
  - `@vercel/node`
  - `vercel`
- `api/*`
  - Vercel file-system API route 形态。
  - handler 签名大量使用 `VercelRequest` / `VercelResponse`。
  - 路由由文件路径隐式映射，例如 `api/agent/run/stream.ts` 对应 `/api/agent/run/stream`。
- `src/server/workbench/apiAuth.ts`
  - 参数类型使用 `VercelRequest` / `VercelResponse`。

当前 API 文件：

```txt
api/health.ts
api/chat.ts
api/agent/run.ts
api/agent/run/stream.ts
api/auth/agent-access.ts
api/datasources/test.ts
api/datasources/schema.ts
api/workbench/conversations.ts
api/workbench/conversations/[id].ts
api/workbench/conversations/[id]/messages.ts
api/workbench/conversations/[id]/latest-run.ts
api/workbench/conversations/[id]/reports.ts
api/workbench/demo-tasks.ts
api/workbench/demo-conversations.ts
api/workbench/demo-conversations/[id]/copy.ts
api/workbench/recent-tools.ts
api/workbench/reports/[id].ts
api/workbench/runs/[id].ts
api/workbench/runs/[id]/events.ts
api/workbench/runs/[id]/tools.ts
api/workbench/runs/[id]/report.ts
api/workbench/runs/[id]/rag-retrievals.ts
```

SSE / stream 依赖：

- `api/agent/run/stream.ts`
  - 当前真实 Agent Run SSE 入口。
  - 使用 `res.write("data: ...\n\n")` 推送事件。
  - 设置：

```txt
Content-Type: text/event-stream; charset=utf-8
Cache-Control: no-cache, no-transform
Connection: keep-alive
```

- `api/chat.ts`
  - 旧 Chat / Groq stream 入口。
  - 当前是 `text/plain` chunk streaming，不是标准 SSE，但同样依赖 Vercel response streaming。

环境变量读取：

- 服务端使用 `process.env`。
- 本地服务端通过 `src/server/datasources/connection.ts` 在非生产环境加载 `.env.local` / `.env`。
- `api/health.ts` 读取 `VERCEL_ENV`、`NODE_ENV`、`GROQ_API_KEY`。

### 2.3 Supabase Auth 依赖

包依赖：

```txt
@supabase/supabase-js
```

前端公开变量：

```txt
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
```

服务端私密变量：

```txt
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```

主要文件：

```txt
src/lib/supabaseClient.ts
src/stores/authStore.ts
src/types/auth.ts
src/server/auth/types.ts
src/server/auth/supabaseAdmin.ts
src/server/auth/verifySupabaseToken.ts
src/server/workbench/apiAuth.ts
```

当前前端 Auth 行为：

- `src/lib/supabaseClient.ts`
  - 读取 `VITE_SUPABASE_URL`。
  - 读取 `VITE_SUPABASE_PUBLISHABLE_KEY`。
  - `createClient()` 初始化 Supabase client。
- `src/stores/authStore.ts`
  - `supabase.auth.getSession()`
  - `supabase.auth.onAuthStateChange()`
  - `supabase.auth.signInWithPassword()`
  - `supabase.auth.signOut()`
  - 从 `session.access_token` 取 access token。
- `src/App.tsx`
  - 使用 `useAuthStore((state) => state.session?.access_token ?? null)`。
- 多个 service 通过 `Authorization: Bearer ${accessToken}` 调用后端 API。

当前服务端 Auth 行为：

- `src/server/auth/supabaseAdmin.ts`
  - 使用 `SUPABASE_SERVICE_ROLE_KEY` 创建 Supabase Admin Client。
  - 服务端关闭 Supabase client 的自动 refresh 与 session persist。
- `src/server/auth/verifySupabaseToken.ts`
  - `verifySupabaseAccessToken(accessToken)`
  - 内部调用 `supabaseAdmin.auth.getUser(accessToken)`。
  - 返回 `userId = data.user.id`。
- `src/server/workbench/apiAuth.ts`
  - 从 `Authorization: Bearer ...` 提取 Supabase access token。
  - 调用 `verifySupabaseAccessToken()`。

需要替换的关键词：

```txt
@supabase/supabase-js
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
supabase.auth
getSession
onAuthStateChange
verifySupabaseAccessToken
Supabase access_token
```

### 2.4 Supabase PostgreSQL 依赖

服务端数据访问集中依赖 Supabase Admin Client：

```txt
src/server/auth/supabaseAdmin.ts
src/server/auth/agentAccess.ts
src/server/auth/agentQuota.ts
src/server/workbench/runPersistence.ts
src/server/tools/ragSearchTool.ts
api/workbench/*
api/auth/agent-access.ts
api/agent/run.ts
api/agent/run/stream.ts
```

当前使用的 Supabase 表 / 函数：

```txt
profiles
agent_run_quota
agent_run_usage
conversations
messages
demo_task_templates
demo_conversation_templates
agent_runs
run_events
tool_invocations
report_artifacts
knowledge_sources
knowledge_documents
knowledge_chunks
rag_retrieval_logs
consume_agent_run_quota()
finish_agent_run_usage()
```

当前数据源连接变量：

```txt
SUPABASE_DB_CONNECTION_STRING
POSTGRES_CONNECTION_STRING
```

其中 `src/server/datasources/connection.ts` 会按 provider 选择连接串：

- `provider === 'postgresql'` 使用 `POSTGRES_CONNECTION_STRING`。
- `provider === 'supabase'` 使用 `SUPABASE_DB_CONNECTION_STRING` 并启用 Supabase SSL 配置。

### 2.5 Supabase SQL 依赖审计

当前 migrations：

```txt
supabase/migrations/20260511_auth_quota.sql
supabase/migrations/20260511_agent_run_quota_rpc.sql
supabase/migrations/20260512_demo_templates.sql
supabase/migrations/20260512_workbench_conversations_messages.sql
supabase/migrations/20260512_workbench_run_artifacts.sql
supabase/migrations/20260512_rag_minimal.sql
```

可大体直接迁到普通 PostgreSQL 的部分：

- `create table` 的大部分业务字段。
- `check constraint`。
- 普通 `index`。
- `jsonb` 字段。
- `timestamptz`。
- `plpgsql` trigger function。
- `set_updated_at()`。
- `update_conversation_message_count()`。
- demo template seed 数据。
- RAG minimal 的 `tsvector`、`to_tsvector('simple', ...)`、GIN index 设计。

需要改造的部分：

| 类型 | 当前依赖 | 迁移要求 |
|---|---|---|
| Supabase Auth 用户表 | `auth.users` | 替换为 CloudBase 用户体系 + `app_profiles` |
| 用户 ID 外键 | `references auth.users(id)` | 替换为 `profile_id uuid references app_profiles(id)`，或 `cloudbase_uid text` |
| RLS 身份函数 | `auth.uid()` | 第一阶段由服务端 token 校验后注入 uid/profileId 并强制过滤 |
| Supabase service role | `service_role` | 替换为服务端函数密钥、TencentDB 管理连接或受限 DB role |
| 新用户 trigger | `after insert on auth.users` | 替换为 `POST /api/auth/sync-profile` 或服务端首次请求自动 upsert |
| backfill | `select ... from auth.users` | 迁移脚本中从导出的 Supabase 用户映射表导入 |
| RLS policy | `create policy ... using (auth.uid() = user_id)` | 第一阶段不复制；后续可用 PostgreSQL session variable + RLS |
| grants | `grant ... to anon, authenticated, service_role` | TencentDB 普通 role 体系下重做 |

依赖 `auth.users` 的 migrations：

- `20260511_auth_quota.sql`
  - `profiles.id references auth.users(id)`
  - `agent_run_quota.user_id references auth.users(id)`
  - `agent_run_usage.user_id references auth.users(id)`
  - trigger 挂在 `auth.users`
  - backfill 从 `auth.users` 读取。
- `20260512_workbench_conversations_messages.sql`
  - `conversations.user_id references auth.users(id)`
  - `messages.user_id references auth.users(id)`
- `20260512_workbench_run_artifacts.sql`
  - `agent_runs.user_id`
  - `run_events.user_id`
  - `tool_invocations.user_id`
  - `report_artifacts.user_id`
- `20260512_rag_minimal.sql`
  - `knowledge_sources.user_id`
  - `knowledge_documents.user_id`
  - `knowledge_chunks.user_id`
  - `rag_retrieval_logs.user_id`

依赖 `auth.uid()` 的 migrations：

- `20260511_auth_quota.sql`
  - `profiles_select_own`
  - `agent_run_quota_select_own`
  - `agent_run_usage_select_own`
- `20260512_workbench_conversations_messages.sql`
  - conversations select / insert / update / delete policy
  - messages select / insert / update / delete policy
- `20260512_workbench_run_artifacts.sql`
  - agent runs / run events / tool invocations / report artifacts select own policy
- `20260512_rag_minimal.sql`
  - knowledge visible policy 中的 private owner 判断
  - rag retrieval logs select own policy

依赖 `service_role` 的 migrations：

- `20260511_agent_run_quota_rpc.sql`
  - `grant execute on function public.consume_agent_run_quota(...) to service_role`
  - `grant execute on function public.finish_agent_run_usage(...) to service_role`

需要在 TencentDB PostgreSQL 确认支持的 extension / 能力：

- `pgcrypto`
  - 当前用于 `gen_random_uuid()`。
  - TencentDB 上需要确认 extension 创建权限和所在 schema。
- `plpgsql`
  - PostgreSQL 默认可用，但仍需确认受管实例权限。
- `tsvector` / GIN index
  - 属于 PostgreSQL 内置能力，仍需在目标版本做建表验证。
- 后续如 RAG 增强到向量检索，需要另行确认 `pgvector` 支持与版本。

## 3. 目标腾讯云架构

推荐目标架构：

```txt
Browser
↓
EdgeOne Pages 静态前端
↓
CloudBase Authentication v2 登录
↓
CloudBase HTTP Functions / EdgeOne Pages Cloud Functions
↓
TencentDB for PostgreSQL
↓
Groq / 后续模型服务
```

### 3.1 方案 1：CloudBase HTTP Cloud Functions

优点：

```txt
官方支持 SSE
适合 AI 流式输出
和 CloudBase Auth 协同更自然
适合数据库访问、外部服务和复杂后端逻辑
```

风险：

```txt
需要适配当前 Vercel API 路由
需要确认部署、环境变量、Node runtime、连接池方式
需要验证函数超时是否覆盖真实 Agent Run
需要验证 CloudBase token 在 HTTP Function 中的校验方式和 uid 获取方式
需要验证 TencentDB 内网 / 公网访问路径
```

适用范围：

- `/api/agent/run/stream`
- `/api/sse-test`
- quota 扣减
- run events 写入
- report artifact 写入
- RAG retrieval log 写入
- 需要强服务端权限的 Workbench API

### 3.2 方案 2：EdgeOne Pages Cloud Functions

优点：

```txt
前后端统一在 EdgeOne Pages 项目中
适合全栈部署
支持 Node.js / TypeScript / npm
适合数据库访问、外部 API、复杂后端逻辑
```

风险：

```txt
需要单独验证 SSE 是否满足当前真实 Agent 流式输出
需要确认函数超时、缓存、请求体限制、区域配置
需要确认 TencentDB 连接池与冷启动表现
需要确认是否方便与 CloudBase Auth v2 后端校验集成
需要避免边缘缓存或代理缓冲破坏 SSE 分块到达
```

适用范围：

- 普通 JSON API。
- health API。
- demo templates API。
- reports / recent tools / run query API。
- 不需要长连接或高稳定 SSE 的接口。

### 3.3 推荐

推荐路线：

```txt
前端用 EdgeOne Pages。
SSE / Agent API 优先用 CloudBase HTTP Cloud Functions 做 POC。
普通 API 可评估 CloudBase Functions 或 EdgeOne Cloud Functions。
```

暂不建议一开始强行统一到一个平台。理由：

1. 当前系统最关键风险是 SSE Agent Run，CloudBase HTTP Functions 对 SSE 的官方定位更直接。
2. EdgeOne Pages 更适合前端静态部署入口。
3. 普通 API 与 SSE API 可以先拆开验证，避免单点平台能力不确定导致整体迁移停滞。
4. POC 完成后，如果 EdgeOne Pages Cloud Functions 的 SSE、超时和连接池都满足要求，再评估统一到 EdgeOne。

## 4. Auth 迁移方案

### 4.1 迁移方向

Auth 不建议第一阶段完全自建 JWT/password。推荐：

```txt
Supabase Auth
→ CloudBase Authentication v2
```

CloudBase Auth v2 承担：

```txt
登录
退出
获取当前用户
刷新登录态
获取 uid
获取 access token
前端登录状态管理
后端 API 身份校验
```

前端 SDK 方向：

```txt
@cloudbase/js-sdk
cloudbase.init({ env, region/clientId 等公开配置 })
app.auth()
```

具体登录方式优先级：

1. 第一阶段保留当前产品体验：用户名密码或邮箱密码登录。
2. POC 同时验证匿名登录，便于公开演示模式和未登录 fallback。
3. 后续按需要扩展手机号、验证码、第三方登录。

### 4.2 映射关系

| Supabase 当前概念 | 腾讯云目标概念 |
|---|---|
| `Supabase user.id` | `CloudBase uid`，并同步到 `app_profiles.cloudbase_uid` |
| `auth.users` | CloudBase 用户体系 + 业务侧 `app_profiles` |
| `profiles.id references auth.users(id)` | `app_profiles.id uuid primary key` + `cloudbase_uid text unique not null` |
| `auth.uid()` | 后端函数校验 CloudBase token 后得到 uid，再查询/创建 `app_profiles` |
| `SUPABASE_SERVICE_ROLE_KEY` | 服务端函数私密配置 + TencentDB 管理连接 / 受限 DB role |
| Supabase RLS | 第一阶段由服务端 API 强制 `profile_id` / `cloudbase_uid` 过滤 |
| Supabase access token | CloudBase Auth v2 access token |
| Supabase refresh token | CloudBase Auth v2 refresh token / SDK 登录态刷新机制 |

### 4.3 业务用户表建议

建议新增业务用户表：

```txt
app_profiles
```

建议字段：

```sql
id uuid primary key
cloudbase_uid text unique not null
email text
display_name text
role text -- demo_user / admin
created_at timestamptz
updated_at timestamptz
metadata jsonb
```

设计原则：

- 不直接依赖 `auth.users`。
- CloudBase 用户体系只负责身份，业务用户信息由 `app_profiles` 承接。
- 后端 API 每次校验 token 后得到 `cloudbase_uid`，再映射到 `app_profiles.id`。

### 4.4 user_id 设计推荐

有两种可选方式：

| 方式 | 说明 | 优点 | 代价 |
|---|---|---|---|
| `cloudbase_uid text` | 所有业务表直接保存 CloudBase uid | 直观、少一层映射、API 查询简单 | 外部身份 ID 扩散到所有业务表，未来换 Auth 成本高 |
| `profile_id uuid` | 所有业务表保存 `app_profiles.id` | 关系模型清晰、外键稳定、未来可支持多身份绑定 | 服务端必须先把 uid 映射到 profileId |

推荐使用：

```txt
profile_id uuid references app_profiles(id)
```

如果为了减少第一阶段 SQL 差异，也可以保留列名 `user_id uuid`，但语义改成引用 `app_profiles(id)`，并在代码层逐步改名为 `profile_id`。

推荐理由：

1. 当前 Supabase 表大量使用 `user_id uuid`，保留内部 uuid owner 可以降低 schema 迁移冲击。
2. CloudBase uid 是外部身份标识，不建议扩散到 conversations、messages、runs、artifacts、RAG logs 等所有表。
3. `app_profiles` 可以承载 role、quota、metadata、邮箱和后续企业组织信息。
4. 后续如果增加手机号、微信、企业 SSO 或迁移 Auth Provider，只需调整 `app_profiles` 的身份绑定，不必重写所有业务表。

API Auth Context 建议同时保存：

```ts
{
  cloudbaseUid: string;
  profileId: string;
  email: string | null;
  role: 'demo_user' | 'admin';
}
```

## 5. 数据库迁移方案

### 5.1 不覆盖 Supabase migrations

不建议直接覆盖原 Supabase migrations。建议新增：

```txt
tencent/migrations/
```

保留：

```txt
supabase/migrations/
```

原因：

```txt
保留现有 Supabase 版本可回滚
TencentDB 版本单独演进
避免一边迁移一边破坏当前可演示版本
方便对比 Supabase SQL 与 TencentDB SQL 差异
```

### 5.2 TencentDB schema 改造类型

需要改造的 SQL 类型：

```txt
auth.users foreign key
auth.uid() RLS
service_role grant
profiles / quota
conversation / message user_id
run artifacts user_id
rag logs user_id
demo/system public read
```

建议 TencentDB 第一版表组：

```txt
app_profiles
agent_run_quota
agent_run_usage
conversations
messages
demo_task_templates
demo_conversation_templates
agent_runs
run_events
tool_invocations
report_artifacts
knowledge_sources
knowledge_documents
knowledge_chunks
rag_retrieval_logs
```

表级建议：

| 当前表 | TencentDB 建议 |
|---|---|
| `profiles` | 改为 `app_profiles`，不引用 `auth.users` |
| `agent_run_quota` | `profile_id uuid references app_profiles(id)` |
| `agent_run_usage` | `profile_id uuid references app_profiles(id)`；审计记录可保留，不随会话删除 |
| `conversations` | `profile_id uuid`；所有查询强制 owner filter |
| `messages` | `profile_id uuid` + `conversation_id` 双重校验 |
| `agent_runs` | `profile_id uuid` + `conversation_id` + `usage_id` |
| `run_events` | `profile_id uuid` + `run_id` + `seq` |
| `tool_invocations` | `profile_id uuid`； recent tools 从此统计 |
| `report_artifacts` | `profile_id uuid`；报告正文从 message 拆出 |
| `demo_*_templates` | 公共只读 seed；不绑定用户 |
| `knowledge_*` | `visibility in ('demo','system','private')`，private 必须有 `profile_id` |
| `rag_retrieval_logs` | `profile_id uuid`，由服务端写入 |

### 5.3 迁移数据策略

建议拆成三类：

1. seed 数据
   - `demo_task_templates`
   - `demo_conversation_templates`
   - demo `knowledge_sources/documents/chunks`
   - 可以用 TencentDB migration 重新 seed。

2. 用户与权限数据
   - 从 Supabase 导出 `auth.users`、`profiles`、`agent_run_quota`。
   - 建立 `supabase_user_id -> cloudbase_uid -> app_profiles.id` 映射。
   - 如果 CloudBase 无法导入原密码，则要求用户重置密码或以新登录方式激活。

3. 业务数据
   - `conversations`
   - `messages`
   - `agent_runs`
   - `run_events`
   - `tool_invocations`
   - `report_artifacts`
   - `rag_retrieval_logs`
   - 导入时把旧 `user_id` 映射为 `profile_id`。

### 5.4 连接池建议

TencentDB for PostgreSQL 不应被大量云函数实例直接无上限连接。

第一阶段建议：

- 每个函数实例使用小连接池。
- 复用模块级 `pg.Pool`。
- 设置 `max`、`connectionTimeoutMillis`、`idleTimeoutMillis`、`statement_timeout`。
- 评估是否需要腾讯云侧连接池能力或代理层。
- SSE Agent 函数避免在整个流式期间长期持有 DB 连接；事件写入采用短事务或异步批量策略。

## 6. API / SSE 迁移方案

### 6.1 API 分类

当前 API 可分为：

```txt
Auth
Agent Stream
Workbench Conversations
Messages
Demo Templates
Run Persistence
Reports
Recent Tools
RAG Retrievals
Health / Legacy Chat
Datasource Test / Schema
```

### 6.2 Auth API

当前：

```txt
GET /api/auth/agent-access
```

迁移后：

```txt
GET /api/auth/me
POST /api/auth/sync-profile
GET /api/auth/agent-access
```

职责：

- CloudBase Auth 前端 SDK 负责登录、退出、恢复登录态、刷新 token。
- 服务端 API 校验 CloudBase access token。
- 首次登录或资料变化时 upsert `app_profiles`。
- `agent-access` 从 `app_profiles` + `agent_run_quota` 计算权限和额度。

### 6.3 Agent Stream API

当前：

```txt
POST /api/agent/run/stream
```

迁移后：

```txt
CloudBase HTTP Function: /api/agent/run/stream
```

必须保留：

```txt
SSE
Authorization: Bearer <CloudBase access token>
conversation ownership 校验
quota 校验和扣减
Agent 执行
runs / events / tools / reports 持久化
最终 usage 状态回写
客户端断开处理
```

当前逻辑中的 Supabase 替换点：

| 当前逻辑 | TencentDB / CloudBase 替换 |
|---|---|
| `verifySupabaseAccessToken()` | `verifyCloudBaseAuth()` |
| Supabase user id | `profileId` + `cloudbaseUid` |
| `getAgentAccessViewByUserId()` | `getAgentAccessViewByProfileId()` |
| `conversationBelongsToUser()` | `conversationBelongsToProfile()` |
| Supabase RPC `consume_agent_run_quota` | TencentDB SQL function 或服务端事务 |
| Supabase RPC `finish_agent_run_usage` | TencentDB SQL function 或服务端更新 |
| Supabase Admin `.from(...)` | `pg` 查询或项目自建 repository |
| Vercel `res.write()` | CloudBase SSE response writer |

### 6.4 Workbench API

迁移范围：

```txt
conversations
messages
demo templates
run artifacts
recent tools
rag retrievals
```

要求：

```txt
全部改为 CloudBase token 校验
全部用 profile_id / cloudbase_uid 做 user 过滤
写入时强制 owner 来自后端 auth context
不信任前端传入的 user_id / profile_id
```

建议接口迁移：

| 当前接口 | 目标处理 |
|---|---|
| `GET/POST /api/workbench/conversations` | CloudBase/EdgeOne Function + TencentDB |
| `GET/PATCH /api/workbench/conversations/:id` | owner filter |
| `GET/POST /api/workbench/conversations/:id/messages` | conversation owner 校验 |
| `GET /api/workbench/conversations/:id/latest-run` | owner filter |
| `GET /api/workbench/conversations/:id/reports` | owner filter |
| `GET /api/workbench/runs/:id` | owner filter |
| `GET /api/workbench/runs/:id/events` | run owner 校验 |
| `GET /api/workbench/runs/:id/tools` | run owner 校验 |
| `POST /api/workbench/runs/:id/report` | run owner 校验 + report artifact 写入 |
| `GET /api/workbench/runs/:id/rag-retrievals` | run owner 校验 |
| `GET /api/workbench/reports/:id` | report owner 校验 |
| `GET /api/workbench/recent-tools` | profile scoped aggregation |
| `GET /api/workbench/demo-tasks` | public read |
| `GET /api/workbench/demo-conversations` | public read |
| `POST /api/workbench/demo-conversations/:id/copy` | token 校验后复制到私有 conversation |

### 6.5 Health / Legacy Chat / Datasource

| 当前接口 | 迁移建议 |
|---|---|
| `GET /api/health` | 改为检查 CloudBase env、TencentDB、Groq key、函数 runtime |
| `POST /api/chat` | 若仍保留，迁到普通 Cloud Function；明确它是 legacy chat stream |
| `POST /api/datasources/test` | 迁到服务端函数；连接串不得暴露给前端 |
| `POST /api/datasources/schema` | 迁到服务端函数；查询必须限制超时和返回字段 |

### 6.6 SSE 适配方案

必须先做 POC：

```txt
/api/sse-test
```

POC 行为：

```txt
每秒推送一个 event
连续推送 5-10 秒
浏览器能逐步收到
EdgeOne / CloudBase 不缓存 / 不缓冲
超时满足 Agent Run
前端 fetch stream 能正常读取
```

响应头建议：

```txt
Content-Type: text/event-stream; charset=utf-8
Cache-Control: no-cache, no-transform
Connection: keep-alive
X-Accel-Buffering: no
```

需要验证：

```txt
CloudBase HTTP Functions SSE
EdgeOne Cloud Functions SSE
函数超时
响应头
缓存
代理缓冲
本地调试方式
线上部署方式
浏览器 fetch stream 逐 chunk 到达
客户端断开后的函数清理
Agent Run 最长耗时是否落在平台限制内
```

只有 SSE POC 通过，才迁真实 Agent。

## 7. 环境变量映射

### 7.1 旧变量

旧 Supabase / Vercel：

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
GROQ_API_KEY=
SUPABASE_DB_CONNECTION_STRING=
POSTGRES_CONNECTION_STRING=
```

### 7.2 新变量

前端公开变量：

```env
VITE_TCB_ENV_ID=
VITE_TCB_REGION=
VITE_TCB_CLIENT_ID=
VITE_APP_API_BASE_URL=
```

说明：

- `VITE_TCB_ENV_ID`：CloudBase 环境 ID，前端初始化 SDK 使用。
- `VITE_TCB_REGION`：如 CloudBase Auth v2 / SDK 初始化需要 region，则公开配置。
- `VITE_TCB_CLIENT_ID`：如 CloudBase Auth v2 Web SDK 需要 clientId，则公开配置。
- `VITE_APP_API_BASE_URL`：腾讯云函数 API base URL；本地、POC、线上可切换。

服务端私密变量：

```env
TENCENT_POSTGRES_CONNECTION_STRING=
GROQ_API_KEY=
APP_ENV=
APP_COOKIE_SECRET=
TCB_ENV_ID=
TCB_REGION=
```

可选服务端私密变量：

```env
TENCENT_SECRET_ID=
TENCENT_SECRET_KEY=
```

说明：

- `TENCENT_POSTGRES_CONNECTION_STRING`：TencentDB for PostgreSQL 连接串，只能在服务端函数配置。
- `GROQ_API_KEY`：短期继续保留服务端模型 key。
- `APP_ENV`：`local` / `poc` / `staging` / `production`。
- `APP_COOKIE_SECRET`：如果后续引入服务端 session/cookie，需要私密配置。
- `TCB_ENV_ID` / `TCB_REGION`：后端校验 CloudBase token、调用 CloudBase 能力时使用。
- `TENCENT_SECRET_ID` / `TENCENT_SECRET_KEY`：只有在后端校验 token、部署脚本或云 API 调用确需腾讯云密钥时配置。

### 7.3 配置位置

| 变量类型 | EdgeOne Pages | CloudBase Functions | 本地 `.env.local` |
|---|---|---|---|
| `VITE_TCB_*` | 配置为构建期公开变量 | 通常不需要 | 需要 |
| `VITE_APP_API_BASE_URL` | 配置为构建期公开变量 | 通常不需要 | 需要 |
| `TENCENT_POSTGRES_CONNECTION_STRING` | 仅当 EdgeOne Cloud Functions 访问 DB 时配置 | 需要 | 需要 |
| `GROQ_API_KEY` | 仅当 EdgeOne Cloud Functions 调模型时配置 | 需要 | 需要 |
| `APP_ENV` | 可配置 | 需要 | 需要 |
| `APP_COOKIE_SECRET` | 仅服务端函数配置 | 需要 | 需要 |
| `TENCENT_SECRET_ID/KEY` | 不放前端构建变量 | 仅必要时配置 | 仅必要时配置 |

禁止事项：

- 不在前端变量里放 TencentDB 连接串。
- 不在前端变量里放腾讯云 Secret。
- 不在前端变量里放 Groq API Key。
- 不在文档、README、代码、截图里写真实值。

## 8. SQL / RLS 替代策略

### 8.1 第一阶段权限模型

第一版 TencentDB 不强求复制 Supabase RLS。

建议：

```txt
浏览器不直连数据库
所有 DB 访问走服务端 API
服务端校验 CloudBase token 得到 uid
服务端同步/读取 app_profiles 得到 profile_id
所有 SQL 强制 where profile_id = authContext.profileId
写入时强制 profile_id = authContext.profileId
```

文档明确：

```txt
这是第一阶段服务端权限模型，不是最终企业级 RLS。
后续如需增强，可在 PostgreSQL 侧加入自定义 session variable + RLS。
```

### 8.2 RLS 替代规则

当前 Supabase RLS：

```sql
using (auth.uid() = user_id)
with check (auth.uid() = user_id)
```

第一阶段替代：

```txt
服务端 token 校验
↓
authContext.profileId
↓
SQL where profile_id = $profileId
↓
insert/update payload 强制 profile_id = $profileId
```

对关联表增加双重校验：

- `messages` 写入前确认 `conversation_id` 属于当前 `profile_id`。
- `agent_runs` 写入前确认 `conversation_id` 属于当前 `profile_id`。
- `run_events/tool_invocations/report_artifacts/rag_retrieval_logs` 写入前确认 parent run/conversation 属于当前 `profile_id`。
- demo/system 数据只允许公开读，不允许浏览器直接写。

### 8.3 后续增强 RLS

后续企业级增强可考虑：

```sql
select set_config('app.current_profile_id', $profileId, true);
```

然后在 PostgreSQL RLS 中使用：

```sql
profile_id::text = current_setting('app.current_profile_id', true)
```

注意：

- 必须保证每个请求独立事务内设置 session variable。
- 连接池复用时必须避免 profileId 串号。
- 需要严格测试 transaction pooling / session pooling 行为。

## 9. 分阶段实施计划

### Tencent-01：迁移方案设计

当前步骤。

输出：

```txt
docs/TENCENT_MIGRATION_DESIGN.md
```

不改代码、不改 SQL、不提交 Git。

### Tencent-02：Supabase 依赖审计

输出更细的替换点清单：

```txt
Supabase Auth 替换点
Supabase Admin Client 替换点
Vercel API handler 替换点
Supabase migrations 替换点
RLS / service_role / auth.uid() 替换点
前端文案和 env 替换点
```

### Tencent-03：腾讯云最小 POC

内容：

```txt
EdgeOne Pages 静态部署
CloudBase Auth 登录 Demo
CloudBase HTTP Function 普通 API
SSE Test API
TencentDB PostgreSQL 连接测试
```

验收：

- 前端可在 EdgeOne Pages 打开。
- CloudBase Auth v2 可登录、退出、刷新状态、拿到 uid/token。
- 普通 HTTP Function 可读取 token 并返回 `/api/auth/me`。
- `/api/sse-test` 能逐秒到达浏览器。
- 云函数能连接 TencentDB 并执行 `select 1`。

### Tencent-04：TencentDB schema 设计

新增：

```txt
tencent/migrations/
```

设计：

```txt
app_profiles
quota
conversations
messages
run artifacts
demo templates
rag minimal
```

要求：

- 不覆盖 `supabase/migrations/`。
- 明确 `profile_id` / `cloudbase_uid` 方案。
- 明确 seed 数据与业务数据拆分。

### Tencent-05：Auth 替换

前端：

```txt
Supabase authStore
→ CloudBase Auth store
```

服务端：

```txt
verifySupabaseAccessToken
→ verifyCloudBaseAuth
```

新增或调整：

```txt
GET /api/auth/me
POST /api/auth/sync-profile
GET /api/auth/agent-access
```

### Tencent-06：Workbench API 迁移

迁移：

```txt
conversations
messages
demo templates
run artifacts
reports
recent tools
rag retrievals
```

要求：

- 所有私有数据接口校验 CloudBase token。
- 所有 SQL 强制 `profile_id` 过滤。
- demo/system 模板只开放只读。

### Tencent-07：Agent Stream 迁移

迁移：

```txt
/api/agent/run/stream
```

目标：

```txt
CloudBase HTTP Function
保留 SSE
校验 CloudBase token
校验 conversation ownership
校验 quota
扣减 quota
执行 Agent
写 runs / events / tools / reports
```

前置条件：

```txt
/api/sse-test POC 已通过
```

### Tencent-08：数据迁移

步骤：

1. 从 Supabase 导出 seed 数据和业务数据。
2. 从 Supabase Auth 导出用户标识、邮箱、profile、quota。
3. 在 CloudBase Auth v2 建立或激活用户。
4. 建立 `supabase_user_id -> cloudbase_uid -> app_profiles.id` 映射。
5. 导入 TencentDB。
6. 校验 conversations/messages/runs/reports/RAG logs 数量与 owner。

### Tencent-09：线上联调与灰度切换

步骤：

```txt
腾讯云技术分支部署
完整演示路径验证
灰度账号验证
性能与日志验证
保留 Vercel/Supabase 回滚分支
逐步切换 API base URL
正式切流
```

## 10. POC 验证清单

### 10.1 EdgeOne Pages 静态部署

- Vite build 产物可部署。
- 路由刷新不 404。
- 前端公开环境变量可读取。
- 静态资源路径正确。
- API base URL 可按环境切换。

### 10.2 CloudBase Auth v2

- SDK 初始化成功。
- 用户名密码 / 邮箱登录成功。
- 匿名登录可选验证。
- 退出登录成功。
- 页面刷新后登录态恢复。
- 可拿到 uid。
- 可拿到 access token。
- access token 过期后可刷新。
- 后端函数可校验 token 并得到 uid。
- 可 upsert `app_profiles`。

### 10.3 普通 Cloud Function

- `GET /api/auth/me` 返回当前用户。
- `GET /api/health` 返回环境状态。
- 能读取服务端私密变量。
- 能连接 TencentDB。
- 能调用 Groq 或明确返回缺少 key。

### 10.4 SSE Test

必须验证：

```txt
/api/sse-test 每秒推送 event
持续 5-10 秒
浏览器 Network 能看到分块到达
fetch reader 能逐 chunk 读取
CloudBase 不缓存 / 不缓冲
EdgeOne 代理不缓存 / 不缓冲
函数超时满足当前 Agent Run
客户端断开后函数释放资源
```

建议同时验证：

- CloudBase HTTP Functions SSE。
- EdgeOne Pages Cloud Functions SSE。
- 同一浏览器多开连接。
- 移动网络或弱网。
- 国内访问链路。

### 10.5 TencentDB PostgreSQL

- `select 1`。
- `pgcrypto` extension 验证。
- `gen_random_uuid()` 验证。
- `jsonb` 写入/读取。
- `tsvector` 和 GIN index 验证。
- 基础事务验证。
- 并发连接数和冷启动验证。
- 查询超时配置验证。

## 11. 风险清单

必须重点关注：

```txt
CloudBase Auth v2 和当前 Supabase Auth API 差异
SSE 在目标函数平台的稳定性
TencentDB 连接池 / 冷启动 / 并发连接
PostgreSQL RLS 替代策略
user_id 从 uuid 改为 CloudBase uid 或 profile_id 的影响
所有现有表外键要重构
migrations 双轨维护
环境变量重新配置
国内访问 Groq 可能仍有不稳定
Vercel API 路由迁移成本
CloudBase / EdgeOne 本地调试方式差异
```

补充风险：

- CloudBase Auth v2 的后端 token 校验方式需要 POC 确认，不能只按前端 SDK 推断。
- CloudBase uid 与 Supabase user id 不同，历史数据迁移必须有映射表。
- 如果 CloudBase 无法导入 Supabase 原密码，用户迁移需要重置密码或重新激活。
- EdgeOne Pages 与 CloudBase Functions 跨域、cookie、Authorization header 需要统一策略。
- SSE 长连接期间日志、错误、客户端断开处理要重做。
- Supabase Admin Client 的 `.from().select().insert().update().rpc()` 语法不能直接复用到 `pg`。
- SQL function 从 Supabase role/grant 体系迁到 TencentDB role 体系需要重审权限。
- demo/system public read 如果不再使用 RLS，必须由 API 层限制写权限。
- 当前 `POSTGRES_CONNECTION_STRING` / `SUPABASE_DB_CONNECTION_STRING` 的 provider 语义需要重新命名。
- Groq 仍是海外模型服务，国内访问稳定性不由腾讯云迁移自动解决。

## 12. 回滚方案

必须保留：

```txt
保留当前 Vercel + Supabase 分支
腾讯云迁移开新分支
新增 tencent/migrations，不破坏 supabase/migrations
前端保留抽象 Auth Provider 边界
API 迁移分模块进行
先 POC，后主链路
任何阶段失败可回到当前线上版本
```

建议回滚策略：

1. Tencent-03 POC 不影响主项目，可直接丢弃 POC。
2. Tencent-04 schema 只新增 `tencent/migrations/`，不影响 Supabase 版本。
3. Tencent-05 Auth 替换前先抽象 Auth Provider，保留 Supabase Provider。
4. Tencent-06 Workbench API 按模块切换，保留旧 API base URL 配置。
5. Tencent-07 Agent Stream 单独灰度，失败时回退 `/api/agent/run/stream` 到 Vercel。
6. Tencent-08 数据迁移先 dry run，再做正式导入；正式导入前备份 TencentDB 和 Supabase 导出文件。
7. Tencent-09 切换时保留环境变量开关，可快速切回 Vercel/Supabase。

## 13. 不建议直接迁主项目的原因

结论：

```txt
不建议直接迁主项目。
建议先做腾讯云 POC。
```

原因：

```txt
当前项目已进入可展示封版状态
直接迁移会影响演示稳定性
腾讯云 Auth/SSE/DB 需要先验证
迁移应作为单独技术分支推进
```

更具体地说：

1. 当前真实 Agent Run 已绑定 Supabase access token、quota RPC、conversation ownership、run persistence 和 SSE。
2. 任一环节迁移失败都会影响主演示路径。
3. SSE 是最高风险点，必须先验证云函数、代理、缓存和超时。
4. Auth 迁移涉及用户 ID、登录态、token 校验、profile/quota 初始化，不适合和 DB/API 同时切。
5. TencentDB schema 需要重构 `auth.users` 外键、RLS、service role grant，直接改原 migrations 会破坏现有 Supabase 回滚能力。
6. Groq 仍可能存在国内访问不稳定，腾讯云迁移无法自动解决模型链路问题。

## 14. 下一步建议

建议下一步做：

```txt
Tencent-02：Supabase / Vercel 依赖审计
```

产出：

- 文件级替换清单。
- API 迁移矩阵。
- SQL migration 差异矩阵。
- Auth store 替换点。
- 环境变量替换点。
- POC 最小代码范围建议。

如果希望更快验证腾讯云可行性，也可以直接进入：

```txt
Tencent-03：腾讯云最小 POC
```

建议 POC 顺序：

1. EdgeOne Pages 静态部署。
2. CloudBase Auth v2 登录 Demo。
3. CloudBase HTTP Function `GET /api/auth/me`。
4. CloudBase HTTP Function `/api/sse-test`。
5. TencentDB PostgreSQL `select 1` 和连接池验证。

决策门槛：

- 如果 SSE POC 不通过，不迁真实 Agent Stream。
- 如果 CloudBase Auth 后端 token 校验路径不清晰，不迁主 Auth。
- 如果 TencentDB 连接池/超时不稳定，不迁 Workbench persistence。
- POC 全部通过后，再开独立技术分支进入 Tencent-04 到 Tencent-07。
