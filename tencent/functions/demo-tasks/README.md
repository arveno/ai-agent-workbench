# demo-tasks

CloudBase HTTP Function for:

```txt
GET /api/workbench/demo-tasks
```

It reads enabled rows from `demo_task_templates` and returns the same response shape as the current Vercel API:

```json
{ "ok": true, "data": { "tasks": [] } }
```

This is a public read-only endpoint. It does not read tokens and does not write to MySQL.

## Package

上传源码包即可，不默认把 `node_modules` 打进 zip，也不提交或上传 `package-lock.json`。在 CloudBase 创建 HTTP 云函数时开启“自动安装依赖”。

```bash
chmod +x scf_bootstrap
zip -r demo-tasks.zip index.js package.json scf_bootstrap README.md
```

Upload `demo-tasks.zip` as a CloudBase HTTP Function and configure the route:

```txt
/api/workbench/demo-tasks -> demo-tasks
```

For local testing:

```bash
pnpm install --prod
pnpm start
```

If CloudBase automatic dependency installation fails, troubleshoot dependency installation separately; do not default to committing or uploading `node_modules`.
