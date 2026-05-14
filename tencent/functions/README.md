# CloudBase HTTP Functions

本目录保存腾讯云迁移阶段的 CloudBase HTTP Function 草案。当前包含低风险 demo templates 只读接口，以及 Tencent-09A 的正式 CloudBase Auth helper 验证入口。Tencent-09A 仅表示 CloudBase Auth helper 与 `/api/auth/me` 验证完成；现阶段不替换前端 Auth store，不迁移复制会话接口。

## 函数

| 函数目录 | 建议 CloudBase 路由 | 身份认证 | 用途 |
| --- | --- | --- | --- |
| `demo-tasks` | `/api/workbench/demo-tasks` | 关闭 | 读取公开示例任务模板。 |
| `demo-conversations` | `/api/workbench/demo-conversations` | 关闭 | 读取公开示例会话模板。 |
| `auth-me` | `/api/auth/me` | 开启 | 校验 CloudBase 登录态，查询或创建 `app_profiles`，返回 `currentUser`。 |

## 共享 helper

| 目录 | 用途 |
| --- | --- |
| `_shared/mysql.js` | 初始化 `@cloudbase/node-sdk`、返回 `app.rdb()`，提供 MySQL 结果和 JSON 字段兜底处理。 |
| `_shared/auth.js` | 解析 CloudBase token / Bearer token payload，获取 `_openid` / `user_id`，查询或创建 `app_profiles`，并返回统一 `currentUser`。 |

后续私有 CloudBase HTTP Function 应复用已验证的 `_shared/auth.js` 获取 `currentUser`，再对私有表显式追加 `_openid` 与 `user_id` 过滤。当前不替换前端 `authStore`。

不迁移：

```txt
/api/workbench/demo-conversations/:id/copy
```

复制示例会话接口涉及 Auth、`conversations` 和 `messages` 写入，不属于 Tencent-08B 的低风险只读范围。

## 打包上传

每个函数目录独立打包。上传源码包即可，不默认把 `node_modules` 打进 zip，也不提交或上传 `package-lock.json`。在 CloudBase 创建 HTTP 云函数时开启“自动安装依赖”，由 CloudBase 根据函数目录内的 `package.json` 安装依赖。

公开 demo templates 函数不依赖 `_shared`，可直接在函数目录打包：

```bash
cd tencent/functions/demo-tasks
chmod +x scf_bootstrap
zip -r demo-tasks.zip index.js package.json scf_bootstrap README.md
```

```bash
cd tencent/functions/demo-conversations
chmod +x scf_bootstrap
zip -r demo-conversations.zip index.js package.json scf_bootstrap README.md
```

`auth-me` 依赖 `_shared`，打包时用临时目录把共享 helper 放进 zip 根目录，不在仓库里提交临时复制文件：

```bash
cd tencent/functions
rm -rf /tmp/ai-agent-workbench-auth-me
mkdir -p /tmp/ai-agent-workbench-auth-me/_shared
cp auth-me/index.js auth-me/package.json auth-me/scf_bootstrap auth-me/README.md /tmp/ai-agent-workbench-auth-me/
cp _shared/mysql.js _shared/auth.js /tmp/ai-agent-workbench-auth-me/_shared/
chmod +x /tmp/ai-agent-workbench-auth-me/scf_bootstrap
cd /tmp/ai-agent-workbench-auth-me
zip -r auth-me.zip index.js package.json scf_bootstrap README.md _shared
```

上传时选择 CloudBase HTTP 云函数，运行时建议 Node.js 18.x。压缩包应包含函数目录内的文件，不要把上级目录一起打进 zip。

如果 CloudBase 自动安装依赖失败，再单独排查依赖安装、运行时版本和网络环境；不要默认提交或上传 `node_modules`。

## 本地验证

本地如果已配置可访问 CloudBase 的环境，可在函数目录执行：

```bash
pnpm install --prod
pnpm start
```

然后请求：

```bash
curl -i http://127.0.0.1:9000/
```

成功响应格式应与现有 Vercel API 兼容：

```json
{ "ok": true, "data": { "tasks": [] } }
```

```json
{ "ok": true, "data": { "conversations": [] } }
```

线上验证建议：

```bash
curl -i https://<your-domain>/api/workbench/demo-tasks
curl -i https://<your-domain>/api/workbench/demo-conversations
```

预期 `demo-tasks` 返回 8 条，`demo-conversations` 返回 4 条。

`auth-me` 线上验证建议：

```bash
curl -i https://<your-domain>/api/auth/me
curl -i -H "Authorization: Bearer <cloudbase-token>" https://<your-domain>/api/auth/me
```

未带 token 时应由 CloudBase 网关返回 `401 MISSING_CREDENTIALS`。带 token 时应返回 `ok: true` 和 `currentUser`，并在 `app_profiles` 中出现或复用对应用户。当前验证用户为 `role = demo_user`、`status = active`，第一阶段 `_openid` 与 `user_id` 保持同值。手动把 `status` 改为 `disabled` 后，应返回 `403`。

## 安全说明

- `demo-tasks` 和 `demo-conversations` 是公开只读接口，不读取 token，不做身份认证。
- `auth-me` 必须开启 CloudBase HTTP 路由身份认证；它会读取 Bearer token payload，并可能创建 `app_profiles`。
- `auth-me` 是正式 Auth helper 验证入口，不是旧 POC 函数，当前暂不改前端 Auth store。
- 通过 CloudBase Node SDK 写入 MySQL `JSON` 字段前必须 `JSON.stringify(...)`；读取后再安全解析，失败时回退到 `{}` 或 `[]`。
- 日志不要输出 token、密钥、数据库连接串或完整内部堆栈。
- 当前 CORS 先允许 `Access-Control-Allow-Origin: *`，后续正式接入域名后可收紧。
