# CloudBase HTTP Functions

本目录保存腾讯云迁移阶段的 CloudBase HTTP Function 草案。当前只新增低风险 demo templates 只读接口，不接入前端，不迁移复制会话接口。

## 函数

| 函数目录 | 建议 CloudBase 路由 | 用途 |
| --- | --- | --- |
| `demo-tasks` | `/api/workbench/demo-tasks` | 读取公开示例任务模板。 |
| `demo-conversations` | `/api/workbench/demo-conversations` | 读取公开示例会话模板。 |

不迁移：

```txt
/api/workbench/demo-conversations/:id/copy
```

复制示例会话接口涉及 Auth、`conversations` 和 `messages` 写入，不属于 Tencent-08B 的低风险只读范围。

## 打包上传

每个函数目录独立打包。上传源码包即可，不默认把 `node_modules` 打进 zip，也不提交或上传 `package-lock.json`。在 CloudBase 创建 HTTP 云函数时开启“自动安装依赖”，由 CloudBase 根据函数目录内的 `package.json` 安装依赖。

示例：

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

## 安全说明

- 这两个函数是公开只读接口，不读取 token，不做身份认证。
- 函数只执行 `SELECT`，不写入数据库。
- 日志不要输出 token、密钥、数据库连接串或完整内部堆栈。
- 当前 CORS 先允许 `Access-Control-Allow-Origin: *`，后续正式接入域名后可收紧。
