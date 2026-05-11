# Auth and Agent Quota Design

## 1. 当前问题

AI Agent Workbench 当前已经具备公开演示模式、真实 Agent SSE、Conversation Timeline、Run Trace、模型状态 ViewModel、工具注册表、数据源配置与环境健康检查。线上公开部署后，体验入口需要继续保持低门槛：

```txt
访问者打开线上地址
→ 不登录
→ 不填 Key
→ 不配置数据库
→ 直接体验公开演示模式
```

但真实 Agent 不能完全公开。真实 Agent 会消耗：

```txt
Groq token
服务端计算资源
演示数据库连接资源
SSE 长连接资源
```

如果只在前端隐藏按钮或禁用入口，仍然无法保护 `/api/agent/run/stream`。后续必须在服务端做登录、角色、额度和数据源边界校验。

本设计的核心约束：

```txt
公开演示模式默认可用
真实 Agent 登录后可用
真实 Agent 受角色和 quota 控制
API 保护必须在服务端完成
匿名会话和登录会话必须隔离
```

## 2. 产品目标

产品目标：

```txt
任何人打开线上地址，都能不登录、不填 Key、不配置数据库，直接体验公开演示模式。

真实 Agent 模式必须登录后才能使用，并受角色和额度限制，防止 Groq token 和数据库资源被无限消耗。
```

体验分层：

```txt
公开演示模式是默认体验
真实 Agent 是登录后的增强体验
BYOK 不再作为公开体验主路径
```

架构原则：

```txt
auth raw state
+ profile raw state
+ quota raw state
+ model status raw state
→ AgentAccessView / AuthSessionView / AgentQuotaView
→ Header / Model Modal / EnvironmentStatus / Chat action consume view models
```

组件不应各自判断“是否可用真实 Agent”。后续实现中，真实 Agent 权限、quota 文案、按钮状态和错误提示应来自统一 selector 或 ViewModel。

## 3. 用户分层

### 匿名用户

权限：

```txt
可以访问页面
可以使用公开演示模式
可以点击示例任务
可以体验 Conversation Timeline
可以看到 Mock Run Trace / 工具摘要 / 图表 / RAG 来源 / 报告确认
不能使用真实 Agent
不能消耗 Groq token
不能访问真实数据库
不能输入 API Key
```

页面提示：

```txt
当前为公开演示模式，可完整体验 Agent 工作台流程。
登录后可体验有限次数真实 Agent。
```

服务端规则：

```txt
匿名请求真实 Agent API 必须返回 auth_required
匿名状态下不允许访问真实演示数据源
匿名状态下不允许使用服务端 GROQ_API_KEY
```

### Demo 用户

权限：

```txt
可以登录
可以使用真实 Agent
有真实 Agent 次数限制，例如每天 3 次
只能访问演示数据源
不能看到 Groq API Key
不能看到数据库连接串
不能修改敏感配置
额度用完后仍可继续使用公开演示模式
```

页面显示：

```txt
Demo 用户
真实 Agent 剩余次数：3
```

额度用完：

```txt
今日真实 Agent 体验次数已用完，可继续使用公开演示模式。
```

服务端规则：

```txt
必须使用服务端 GROQ_API_KEY
必须使用只读演示数据源
必须通过 quota 检查并扣减后才启动 Agent SSE
```

### Admin 用户

权限：

```txt
真实 Agent 不限次数或高额度
可以看到更完整环境状态
后续可管理 Demo 账号
后续可进入更高级配置
```

第一版不做复杂后台管理页，只需要角色区分和更高 quota。

建议默认：

```txt
admin.agent_run_limit = null
或 admin.agent_run_limit = 999
```

如果使用 `null` 表示不限，需要在 quota ViewModel 和服务端校验中统一解释，不能让组件自行判断。

## 4. 模型使用规则

### 匿名用户

```txt
只能使用公开演示模式（Mock）
不能输入 API Key
不能启用真实 Agent
```

UI 行为：

```txt
Model Modal 显示公开演示模式可用
真实 Agent 显示登录后可用
BYOK 不显示或禁用
Header 模型入口默认显示公开演示模式
EnvironmentStatus 显示公开演示可用，登录后可体验真实 Agent
```

### Demo 用户

```txt
可以使用真实 Agent
使用服务端 GROQ_API_KEY
受 quota 限制
不需要输入 API Key
```

UI 行为：

```txt
真实 Agent 可启用
显示剩余次数 N
额度用完后真实 Agent 禁用或降级为公开演示模式
BYOK 不显示
```

### Admin 用户

```txt
可以使用真实 Agent
额度不限或较高
可以保留 BYOK 或高级配置入口
```

公开版本模型策略：

```txt
BYOK 不再作为公开体验主路径。
如果保留 BYOK，只作为 Admin / Dev 高级功能。
```

后续 `ModelProviderStatusView` 需要叠加 auth/quota 状态时，不建议把 auth 规则硬塞进模型 provider metadata。更合理的结构是：

```txt
ModelProviderStatusView: 描述模型配置与 provider 能力
AgentAccessView: 描述当前用户是否能使用真实 Agent
ModelConnectModal: 同时消费两个 ViewModel
```

## 5. 会话列表与示例任务

左侧 Sidebar 建议分区：

```txt
示例任务
我的会话
```

未登录：

```txt
示例任务可用
我的会话显示：登录后可保存真实 Agent 会话
匿名会话仅保存在 anonymous sessionStorage
```

登录后：

```txt
显示我的会话
后续可恢复用户历史
登录会话使用 user sessionStorage key，后续迁移到服务端持久化
```

默认示例任务：

| 序号 | 示例任务 | 覆盖能力 |
| --- | --- | --- |
| 1 | 你能做什么？ | capability_intro |
| 2 | 分析 2026 年 5 月教学质量数据，找出异常指标，并给出简短结论。 | 标准 data_analysis |
| 3 | 分析本月教学质量数据，找出异常指标。 | latest_available_month |
| 4 | 分析本月出勤率异常情况，找出异常学科或班级。 | attendance_rate |
| 5 | 分析最近 6 个月教学质量趋势，找出波动最大的指标。 | 趋势 |
| 6 | 对比 2026 年 5 月和上月教学质量指标变化，找出下降原因。 | comparison |
| 7 | 分析 2027 年 1 月教学质量数据。 | 无数据边界 |
| 8 | 异常指标是如何判定的？ | RAG 来源 |
| 9 | 分析全校近一年教学质量数据，汇总主要异常趋势。 | 大数据量模拟 |
| 10 | 基于本轮分析生成一份简版教学质量报告。 | 报告生成 |

示例任务必须在 Mock 和真实 Agent 中共用同一套 UI 结构。差异只来自数据来源和执行模式：

```txt
Mock: 生成稳定演示 RunEvent
Agent: 通过受保护 API 生成真实 RunEvent
```

## 6. 认证方案

第一版推荐：

```txt
Supabase Auth
邮箱 + 密码登录
```

理由：

```txt
项目已经使用 Supabase / PostgreSQL
可以较快接入邮箱密码登录
后续可扩展 Magic Link / OAuth
Supabase session 可在前端获取登录状态
服务端 API 可校验 access token
```

第一版不建议直接做复杂 OAuth。原因：

```txt
OAuth provider 配置和回调域名增加部署变量
账号绑定、回调失败、移动端兼容会扩大实现面
当前核心问题是保护真实 Agent 和 quota，不是账号体系复杂度
```

认证状态建议抽象：

```ts
type AuthStatus = 'anonymous' | 'loading' | 'authenticated' | 'error';

interface AuthSessionView {
  status: AuthStatus;
  userId: string | null;
  email: string | null;
  role: 'anonymous' | 'demo_user' | 'admin';
  displayName: string;
  canUseRealAgent: boolean;
}
```

这只是设计建议，实施时应放在明确的 auth 类型或 selector 中，避免 Header、Model Modal、Chat action 各自解释登录状态。

## 7. 数据表设计

第一版最小表：`profiles`

```txt
profiles
- id
- email
- role: admin | demo_user
- display_name
- agent_run_limit
- agent_run_used
- agent_run_reset_at
- created_at
- updated_at
```

字段说明：

| 字段 | 说明 |
| --- | --- |
| `id` | 对应 `auth.users.id` |
| `email` | 冗余邮箱，便于后台查看和显示 |
| `role` | 控制权限，第一版只需要 `admin` 和 `demo_user` |
| `display_name` | Header / 用户菜单展示名 |
| `agent_run_limit` | 当前周期真实 Agent 可用次数，Demo 默认 3 |
| `agent_run_used` | 当前周期已使用次数 |
| `agent_run_reset_at` | 每日重置时间 |
| `created_at` | 创建时间 |
| `updated_at` | 更新时间 |

建议约束：

```txt
role in ('admin', 'demo_user')
agent_run_used >= 0
agent_run_limit is null or agent_run_limit >= 0
```

可选扩展表：`usage_quotas`

```txt
usage_quotas
- id
- user_id
- quota_type
- limit_count
- used_count
- reset_at
- created_at
- updated_at
```

第一版建议只使用 `profiles`。当后续出现多种 quota，例如真实 Agent、报告生成、数据源刷新，再迁移到 `usage_quotas`。

RLS / 服务端访问建议：

```txt
用户只能读取自己的 profile
用户不能直接修改 role / agent_run_limit / agent_run_used
quota 扣减只允许服务端 API 使用 service role 或安全 RPC 完成
admin 管理能力后续再加
```

## 8. Quota 规则

第一版规则：

```txt
匿名用户：0 次真实 Agent
Demo 用户：每天 3 次真实 Agent
Admin 用户：不限或高额度
```

quota 展示建议：

```ts
type AgentQuotaState =
  | 'anonymous'
  | 'available'
  | 'exhausted'
  | 'unlimited'
  | 'loading'
  | 'error';

interface AgentQuotaView {
  state: AgentQuotaState;
  limit: number | null;
  used: number;
  remaining: number | null;
  resetAt: string | null;
  label: string;
  description: string;
}
```

扣减时机：

```txt
真实 Agent 请求通过权限校验并开始执行时扣减一次。
```

停止规则：

```txt
即使用户中途停止，也算一次，因为已经占用了模型和后端资源。
```

失败规则：

```txt
auth_required / quota_exceeded / forbidden 这类未启动执行的失败不扣减
服务端环境未配置导致未启动模型调用时不扣减
请求通过校验并开始执行后，后续 SSE 中断或用户停止仍计入一次
```

并发规则：

```txt
后续应使用服务端原子更新，避免多个标签同时调用导致额度透支。
第一版实施时应尽量用数据库 update 条件约束。
```

原子扣减建议：

```txt
update profiles
set agent_run_used = agent_run_used + 1
where id = :user_id
  and role = 'demo_user'
  and agent_run_used < agent_run_limit
returning agent_run_used, agent_run_limit, agent_run_reset_at
```

Admin 可以绕过扣减或写入审计日志但不减少额度。

每日重置策略：

```txt
读取 profile 时，如果 now >= agent_run_reset_at，则服务端重置 used 为 0 并设置下一次 reset_at
不要只在前端重置
```

## 9. Agent Stream API 鉴权

真实 Agent 入口：

```txt
POST /api/agent/run/stream
```

执行前必须服务端检查：

```txt
1. 是否登录
2. 用户角色是否允许真实 Agent
3. 用户额度是否足够
4. 是否只访问演示数据源
5. 是否允许使用服务端 Groq Key
```

通过后：

```txt
扣减额度
执行 Agent SSE
返回 RunEvent
```

不通过：

```txt
auth_required
quota_exceeded
forbidden
agent_unavailable
datasource_unavailable
```

服务端伪流程：

```txt
parse Authorization Bearer token
→ verify Supabase user
→ load profile
→ normalize role and quota
→ validate requested mode is real Agent
→ validate demo datasource only
→ check server GROQ_API_KEY and datasource env
→ atomically deduct quota if needed
→ start Agent SSE
```

注意：

```txt
不能只靠前端禁用按钮。
必须在服务端保护 API。
```

API 错误响应建议保持结构化，方便前端统一映射：

```ts
type AgentAccessErrorCode =
  | 'auth_required'
  | 'quota_exceeded'
  | 'forbidden'
  | 'agent_unavailable'
  | 'datasource_unavailable';

interface AgentAccessErrorResponse {
  ok: false;
  code: AgentAccessErrorCode;
  message: string;
}
```

## 10. 失败态设计

失败态必须不影响公开演示模式。真实 Agent 不可用时，用户仍能继续 Mock。

未登录尝试真实 Agent：

```txt
请登录后体验真实 Agent，或切换公开演示模式。
```

额度不足：

```txt
今日真实 Agent 体验次数已用完，可继续使用公开演示模式。
```

权限不足：

```txt
当前账号没有真实 Agent 使用权限。
```

服务端环境未配置：

```txt
真实 Agent 暂不可用，可继续使用公开演示模式。
```

数据源异常：

```txt
演示数据源暂不可用，可继续使用公开演示模式。
```

刷新和 session switch：

```txt
刷新页面后重新读取 auth session、profile 和 quota
session switch 不应复用上一会话的 active Run 权限状态
真实 Agent 请求中的 requestId 仍要防止旧 SSE 写入新会话
```

错误态展示建议：

```txt
Header / EnvironmentStatus: 展示当前可用模式和 quota 状态
ChatPanel: 对本次发送失败给出明确 assistant error message 或 Run error block
Model Modal: 禁用不可用入口，并展示来自 AgentAccessView 的原因
```

## 11. 匿名会话与登录会话隔离

必须遵守：

```txt
匿名 sessionStorage 会话不能直接混入登录用户会话。
```

风险：

```txt
匿名会话的 runs / messages 误写入登录用户空间
登录用户的真实 Agent 会话暴露给匿名状态
退出登录后仍看到登录用户真实 Agent 历史
```

第一版推荐策略：

```txt
匿名状态：使用 anonymous sessionStorage key
登录状态：使用 user sessionStorage key
退出登录：回到 anonymous session
```

key 设计：

```txt
workbench.sessions.anonymous
workbench.sessions.user.<user_id>
workbench.activeSession.anonymous
workbench.activeSession.user.<user_id>
```

更简单的第一版策略也可接受：

```txt
登录成功后清空当前匿名 currentRun，进入登录用户默认会话。
退出登录后清空登录态 currentRun，回到匿名默认会话。
```

但即使采用简单策略，也必须避免跨身份复用：

```txt
currentSessionId
currentRun
activeAssistantMessageId
activeAgentRunRequestId
activeAgentRunAbortController
confirmStatus
```

登录、退出和切换用户时，应停止正在运行的 Agent SSE，清理 active request，并重新载入对应身份的会话集合。

## 12. 服务端安全边界

必须明确：

```txt
Groq API Key 只在服务端环境变量
数据库连接串只在服务端环境变量
前端不展示 Key
前端不展示连接串
真实 Agent 只使用演示数据源
数据库工具只读
白名单表
白名单字段
limit 限制
无任意 SQL
```

数据源边界：

```txt
Demo 用户和匿名用户不能选择任意数据库
Demo 用户真实 Agent 只能访问内置演示数据源
Admin 高级数据源配置后续再设计
```

SQL / Tool 边界：

```txt
工具层不接受前端传入的任意 SQL
查询条件由 Agent plan 和白名单字段映射生成
所有查询必须设置 limit
只允许 select，不允许 insert/update/delete/drop/alter
服务端记录 tool invocation，不把连接细节返回前端
```

环境状态边界：

```txt
匿名用户只看到公开演示可用和真实 Agent 登录后可用
Demo 用户只看到真实 Agent 可用/不可用和剩余额度
Admin 可以看到更完整环境状态
```

## 13. 前端 UI 变化

### Header / 用户区

未登录：

```txt
未登录
公开演示模式
登录
```

登录 Demo：

```txt
Demo 用户
真实 Agent 剩余 3 次
退出登录
```

Admin：

```txt
Admin
真实 Agent 不限
退出登录
```

### Model Modal

匿名：

```txt
公开演示模式：可用
真实 Agent：登录后可用
BYOK：不显示或禁用
```

Demo 用户：

```txt
公开演示模式：可用
真实 Agent：可用，剩余次数 N
BYOK：不显示
```

Admin：

```txt
真实 Agent：可用
BYOK：可选高级入口
```

### EnvironmentStatus

匿名：

```txt
公开演示可用
登录后可体验真实 Agent
```

登录 Demo：

```txt
真实 Agent 可用 / 剩余次数 N
```

额度用完：

```txt
公开演示可用
真实 Agent 次数已用完
```

### Chat 输入区

匿名：

```txt
默认发送走 Mock
真实 Agent 入口不可用
提示登录后可体验有限次数真实 Agent
```

Demo：

```txt
可切换真实 Agent
发送前展示剩余次数
额度用完后自动建议公开演示模式
```

Admin：

```txt
真实 Agent 可用
显示不限或高额度
```

### Sidebar

未登录：

```txt
示例任务可用
我的会话：登录后可保存真实 Agent 会话
```

登录后：

```txt
示例任务可用
我的会话显示当前用户会话
```

## 14. 分步骤实施计划

### Step 47：接入 Supabase Auth

目标：

```txt
登录 / 退出
获取当前用户
区分匿名 / 登录状态
```

涉及文件：

```txt
新增 auth client / auth types / auth store slice 或独立 auth store
新增 LoginModal
Header 增加登录入口
```

风险：

```txt
auth loading 与现有 workbench 初始化顺序冲突
刷新后短暂误判匿名
```

验收标准：

```txt
未登录显示公开演示
登录后显示用户邮箱或名称
退出后回到匿名状态
不保护 Agent API
```

### Step 48：profiles 与角色 / quota

目标：

```txt
profiles 表
role
agent_run_limit
agent_run_used
agent_run_reset_at
前端展示剩余次数
```

涉及文件：

```txt
Supabase migration / profile service / quota selector
Header / EnvironmentStatus 消费 quota ViewModel
```

风险：

```txt
profile 未创建导致登录后无角色
quota reset 逻辑在前端和服务端重复解释
```

验收标准：

```txt
Demo 用户显示剩余次数
Admin 显示不限或高额度
profile 缺失时进入明确错误态
```

### Step 49：前端登录 UI 与用户区

目标：

```txt
登录弹窗
用户菜单
未登录 / Demo / Admin 状态展示
```

涉及文件：

```txt
Header
LoginModal
auth styles
AuthSessionView / AgentQuotaView
```

风险：

```txt
Header、EnvironmentStatus、Model Modal 重复解释登录状态
```

验收标准：

```txt
所有登录状态文案来自统一 ViewModel
登录失败有明确错误
退出登录清理 active request
```

### Step 50：真实 Agent 入口权限控制

目标：

```txt
匿名用户不能启用真实 Agent
Demo 用户显示剩余额度
BYOK 从公开路径下线
```

涉及文件：

```txt
Model Modal
Chat 输入区
EnvironmentStatus
ModelProviderStatusView + AgentAccessView 消费关系
```

风险：

```txt
把 auth 规则混进 model provider 配置状态
真实 Agent 按钮只前端禁用但服务端未保护
```

验收标准：

```txt
匿名只能 Mock
Demo 可启用真实 Agent
额度用完后回到 Mock 兜底
Admin 可使用真实 Agent
```

### Step 51：保护 /api/agent/run/stream

目标：

```txt
服务端鉴权
角色检查
quota 检查
quota 扣减
错误态返回
```

涉及文件：

```txt
api/agent/run/stream
server auth helper
quota service
Agent SSE error mapping
```

风险：

```txt
并发扣减额度透支
SSE 已开始后错误结构不统一
中途停止是否扣减解释不一致
```

验收标准：

```txt
匿名请求真实 Agent 返回 auth_required
Demo quota 不足返回 quota_exceeded
通过校验后扣减一次
停止后不返还额度
```

### Step 52：匿名 / 登录会话隔离

目标：

```txt
anonymous sessions 和 user sessions 分离
登录后不污染匿名会话
退出后回到公开演示
```

涉及文件：

```txt
session persistence key
session slice 初始化
login / logout side effects
active Run cleanup
```

风险：

```txt
匿名 currentRun 写入登录用户 session
退出后还能看到登录用户会话
旧 SSE 事件写入新身份会话
```

验收标准：

```txt
匿名和登录会话隔离
切换身份清理 active request
刷新后恢复正确身份空间
```

### Step 53：公开演示与真实 Agent 验收

目标：

```txt
匿名完整 Mock
Demo 用户有限真实 Agent
Admin 高额度
额度用完兜底 Mock
```

验收标准：

```txt
匿名可完整跑公开演示任务
Demo 每日 3 次真实 Agent
Admin 不受 Demo quota 限制
真实 Agent API 无 token 时不可绕过
额度用完不影响 Mock
```

## 15. 风险与验收标准

主要风险：

| 风险 | 影响 | 控制方式 |
| --- | --- | --- |
| 只做前端禁用，没有服务端鉴权 | 真实 Agent 可被绕过调用 | `/api/agent/run/stream` 必须校验 Supabase token |
| quota 在前端扣减 | 多标签或刷新导致额度不准 | 服务端原子扣减 |
| auth 状态多组件重复判断 | UI 状态不一致 | 建立 `AuthSessionView` / `AgentQuotaView` / `AgentAccessView` |
| 匿名和登录会话混用 | 数据泄漏或状态污染 | sessionStorage key 按身份隔离 |
| BYOK 继续作为公开主路径 | 用户误以为需要配置 Key | 匿名和 Demo 隐藏 BYOK，Admin 才显示高级入口 |
| Demo 用户访问真实数据库配置 | 安全风险 | 服务端固定演示数据源，只读白名单 |
| 环境异常影响公开演示 | 公开体验受损 | 真实 Agent 失败必须兜底 Mock |

最终验收标准：

```txt
匿名用户打开页面即可完整体验公开演示模式
匿名用户不能调用真实 Agent API
Demo 用户登录后可看到真实 Agent 剩余次数
Demo 用户真实 Agent 每日限额可控
Demo 用户额度用完后仍可使用公开演示模式
Admin 用户可使用更高额度或不限额度
Groq Key 和数据库连接串永不暴露到前端
真实 Agent API 服务端鉴权、角色检查、quota 检查、数据源边界全部生效
匿名会话和登录会话不会互相污染
```
