# Tencent Cloud Migration Status

生成日期：2026-05-13

## 当前阶段

当前迁移处于腾讯云 POC 能力验证完成、CloudBase MySQL 正式 schema 已落库、准备进入接口分批迁移的阶段。

本阶段不再把 Vercel / Supabase 作为后续主线维护方向。现有 Vercel / Supabase 代码和文档只作为历史参考、能力对照和必要时的回滚依据；腾讯云后续主线以 EdgeOne Pages、CloudBase HTTP Functions、CloudBase Auth v2 和 CloudBase MySQL 为准。

## 已验证通过的 POC 能力

以下能力已完成验证：

1. EdgeOne Pages 静态部署通过。
2. CloudBase `/api/health` 普通 HTTP API 通过。
3. CloudBase `/api/sse-test` SSE 流式输出通过。
4. CloudBase Auth v2 匿名登录通过。
5. CloudBase HTTP 路由身份认证通过。
6. CloudBase MySQL RunSql 建表、插入、查询通过。
7. CloudBase HTTP Function 读写 MySQL 通过。

这些 POC 说明静态部署、普通 HTTP Function、SSE、匿名登录、后端鉴权、RunSql 和函数内 MySQL 访问已经具备迁移基础。它们不等同于主业务接口已迁移完成，后续仍需按业务风险分批替换。

## CloudBase MySQL schema 状态

CloudBase MySQL 正式 schema 已分段执行落库。当前正式表包括：

```txt
app_profiles
agent_run_quota
agent_run_usage
conversations
agent_runs
messages
run_events
tool_invocations
report_artifacts
demo_task_templates
demo_conversation_templates
```

当前 schema 以 `tencent/migrations/001_cloudbase_mysql_schema.sql` 为准。后续表结构调整应继续在 `tencent/migrations/` 下演进，不覆盖 Supabase migration。

## run_events 索引状态

`run_events` 的冗余索引清理已经完成：

- `idx_run_events_run_id` 已从 CloudBase MySQL 数据库中删除。
- `idx_run_events_run_id` 已从 `tencent/migrations/001_cloudbase_mysql_schema.sql` 中删除。
- `uk_run_events_run_seq (run_id, seq)` 已保留，用于保证同一个 `run_id` 下事件序号唯一。

后续不要重新增加单列 `idx_run_events_run_id`，除非有新的查询计划和压测结果证明需要。按 `run_id` 查询事件时，`uk_run_events_run_seq (run_id, seq)` 可覆盖按 run 维度和事件顺序的主要访问路径。

## POC / 临时资源清理清单

以下资源仍属于 POC 或临时验证产物，后续在正式接口迁移前后需要清理。清理时应先确认没有正式路由、脚本或文档继续依赖它们。

| 类型 | 资源 | 清理建议 |
| --- | --- | --- |
| MySQL 测试表 | `agent_mysql_poc` | 确认无依赖后删除测试表。 |
| 测试数据 | `manual-test-user` | 确认不属于正式演示账号后删除。 |
| CloudBase 临时函数 | `scfhelloworld` | 删除函数及对应部署配置。 |
| CloudBase 临时函数 | `sse-test` | 正式 SSE 迁移完成后删除。 |
| CloudBase 临时函数 | `auth-me` | Auth helper 正式化后删除。 |
| CloudBase 临时函数 | `mysql-poc` | MySQL repository 正式化后删除。 |
| CloudBase 临时路由 | `/api/health` | 正式 health 接口迁移后替换或删除临时实现。 |
| CloudBase 临时路由 | `/api/sse-test` | Agent Run SSE 迁移完成后删除。 |
| CloudBase 临时路由 | `/api/auth-me` | 正式用户信息接口迁移后删除。 |
| CloudBase 临时路由 | `/api/mysql-poc` | 正式 MySQL 读写接口迁移后删除。 |
| 本地临时文件 | `cloudbase-auth-test.html` | 归档验证结论后删除。 |
| 本地临时目录 | `cloudbase-sse-test` | 归档验证结论后删除。 |
| 本地临时目录 | `cloudbase-auth-me` | 归档验证结论后删除。 |
| 本地临时目录 | `cloudbase-mysql-poc` | 归档验证结论后删除。 |

## 下一步迁移顺序

建议按风险从低到高推进：

1. 先迁低风险 `demo_task_templates`、`demo_conversation_templates` 和 `health` 类接口。
2. 再迁 CloudBase Auth helper 与 `app_profiles`，建立 `_openid -> user_id` 映射。
3. 再迁 `conversations`、`messages`、`report_artifacts` 等会话、消息和报告接口。
4. 再迁 quota transaction，使用 MySQL 事务和行锁验证并发扣减。
5. 最后迁 Agent Run SSE，包括鉴权、conversation 归属校验、quota、事件流写入和断线处理。

Agent Run SSE 放在最后，是因为它同时涉及流式输出、真实模型调用、quota、`agent_runs`、`run_events`、`tool_invocations`、报告生成和错误恢复，风险最高。

## 面试讲法

可以这样说明：

> 这个项目的腾讯云迁移不是只换一个静态托管平台，而是把前端部署、HTTP API、SSE、Auth 和数据库一起迁到腾讯云体系。现在 EdgeOne Pages、CloudBase HTTP Function、SSE、Auth v2 匿名登录、路由鉴权和 MySQL 读写 POC 都已经验证通过，正式 MySQL schema 也已经落库。后续不会继续沿 Vercel / Supabase 做主线扩展，而是按低风险接口、Auth 和用户表、会话消息报告、quota 事务、最后 Agent Run SSE 的顺序分批迁移。

这段表述只描述工程事实，不需要包装成已完成全量迁移。

## 安全约束

本文档不记录 token、密钥、数据库连接串或真实密码。后续迁移记录也应只写能力状态、资源名称和操作原则，敏感配置必须通过服务端环境变量或云平台密钥管理注入。
