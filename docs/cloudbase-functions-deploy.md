# CloudBase Functions Deploy Contract

本文档只定义当前有效的 CloudBase HTTP Functions 打包、代码部署、云端配置核对和 smoke test 标准。部署脚本是执行器，`tencent/cloudbase-functions.config.json` 是函数清单、HTTP path、timeout、requiredEnvVars 和环境 profile 的事实源。

## 1. 当前主域名

当前 POC smoke test 和前端 API 验证主域名固定为：

```text
https://ai-agent-workbench-poc-d6731923d-1317403720.ap-shanghai.app.tcloudbase.com
```

主 API 必须挂在固定 `app.tcloudbase.com` 域名下的明确 path，不得依赖 `*` 通配路由承载主链路。

## 2. HTTP 路由契约

主链路 API 必须开启身份认证：

| Function | HTTP path | 身份认证 |
| --- | --- | --- |
| `workbench-agent-run-stream` | `/api/agent/run/stream` | 开启 |
| `auth-me` | `/api/auth/me` | 开启 |
| `workbench-conversations` | `/api/workbench/conversations` | 开启 |
| `workbench-messages` | `/api/workbench/messages` | 开启 |
| `workbench-reports` | `/api/workbench/reports` | 开启 |
| `workbench-runs` | `/api/workbench/runs` | 开启 |
| `workbench-quota` | `/api/workbench/quota` | 开启 |
| `workbench-evaluations` | `/api/workbench/evaluations` | 开启 |
| `workbench-demo-copy` | `/api/workbench/demo-copy` | 开启 |
| `demo-conversations` | `/api/workbench/demo-conversations` | 公开读取 |
| `demo-tasks` | `/api/workbench/demo-tasks` | 公开读取 |

要求：

- 路由挂在固定 `app.tcloudbase.com` 主域名下。
- 主链路 API 身份认证开启。
- 路径透传关闭。
- 主 API 不在 `*` 通配路由下。
- 公开 demo 读取类接口单独登记和验证。

当前部署脚本默认不创建、不更新 HTTP route，不修改身份认证，不修改路径透传。

## 3. 前置要求

- `pnpm` 可用。
- 当前目录为项目根目录。
- CloudBase CLI profile 或显式 `envId` 已配置。
- CloudBase 控制台中已配置函数环境变量。
- 路由、路径透传、身份认证和环境变量以 CloudBase 控制台实际配置为准，并在部署后核对。
- 敏感值不得写入仓库。

## 4. 打包

单函数打包：

```bash
pnpm cloudbase:package -- --function workbench-agent-run-stream --clean --check
```

全函数打包：

```bash
pnpm cloudbase:package -- --function all --clean --check
```

推荐项目内输出目录：

```bash
pnpm cloudbase:package -- --function all --out ./.cloudbase-packages --clean --check
```

`.cloudbase-packages/` 是本地打包产物目录，不提交 Git。上传时压缩具体函数 package 目录内的内容，不压缩外层目录。

## 5. code-only 部署

常规部署只上传函数代码，不维护 HTTP route：

```bash
pnpm cloudbase:deploy:function -- --function workbench-agent-run-stream --profile poc --clean --check --dry-run
pnpm cloudbase:deploy:function -- --function workbench-agent-run-stream --profile poc --clean --check
```

部署脚本自动化范围：

- package
- check
- function code deploy
- function timeout config update
- post-deploy checklist

部署脚本不自动化：

- SQL
- migration
- seed
- HTTP route 修改
- HTTP route domain 绑定
- 身份认证开启
- 路径透传关闭
- function env var 修改
- CI/CD

默认 `tcb fn deploy` 不传 `--httpFn` / `--path`，避免 CloudBase CLI 自动创建或更新 route 并污染 `*` 通配路由。`--path` 只能与 `--allow-http-route-update` 一起用于临时排障或一次性验证，常规部署禁止使用。

## 6. timeout 契约

函数级运行配置维护在 `tencent/cloudbase-functions.config.json`。

当前 POC 推荐：

- `workbench-agent-run-stream.timeout = 120`
- `workbench-reports.timeout = 60`

CloudBase CLI 3.4.0 的 `tcb fn deploy` 不提供 `--timeout` 参数；脚本在代码部署后通过 `tcb config update fn <name> --timeout <seconds>` 推送 timeout。

如果 `/api/agent/run/stream` 只能收到 `run_started` / step / tool / `chart_ready`，但没有收到 conclusion 或 `run_completed`，优先检查 CloudBase 函数 final config timeout 是否仍是 15s。

## 7. 环境变量

依赖 CloudBase MySQL 的函数必须人工确认函数环境变量存在：

```text
CLOUDBASE_ENV_ID=<env-id>
```

模型、数据库、密钥类敏感值只能配置在 CloudBase 函数环境变量或受控密钥系统中，不得写入仓库，不得进入 EdgeOne 前端 `VITE_*`。

## 8. 包结构

每个 staging 根目录必须直接包含：

```text
index.js
package.json
scf_bootstrap
_shared/   # 仅该函数需要共享 helper 时存在
README.md  # 源函数目录存在时会复制
```

上传前压缩 staging 根目录里的内容，不要压缩外层目录。

禁止多包一层函数目录：

```text
cloudbase-workbench-agent-run-stream-package/workbench-agent-run-stream/index.js
```

`scf_bootstrap` 必须：

- 位于 staging 根目录。
- 第一行有 shebang。
- 包含 `node index.js` 或等价启动命令。
- 尽量具备可执行权限。

## 9. `_shared` 复制规则

- `demo-tasks`、`demo-conversations` 不需要 `_shared`。
- `auth-me`、`workbench-conversations`、`workbench-messages`、`workbench-reports`、`workbench-demo-copy`、`workbench-quota`、`workbench-runs` 需要：
  - `_shared/auth.js`
  - `_shared/mysql.js`
- `workbench-agent-run-stream` 需要：
  - `_shared/auth.js`
  - `_shared/mysql.js`
  - `_shared/modelGateway.js`

检查脚本必须校验需要的 `_shared` 文件是否存在，并提示 demo 函数误带 `_shared`。

## 10. 部署后核对

部署完成后必须区分：

- 函数代码是否已上传。
- timeout 是否已推送。
- HTTP route 是否绑定到固定 `app.tcloudbase.com` 主域名。
- 主链路 API 身份认证是否开启。
- 路径透传是否关闭。
- 函数环境变量是否已配置。
- 接口是否通过 curl / smoke test 验证。

如果某项云端配置不能自动化，必须列为人工操作项和验证步骤。

## 11. smoke test

通用 smoke：

```bash
pnpm cloudbase:smoke -- --base-url <cloudbase-api-base-url> --token <token>
```

Report Source smoke：

```bash
pnpm smoke:report-source -- --token "<cloudbase-token>"
```

可选覆盖：

```bash
pnpm smoke:report-source -- --base-url "<base-url>" --token "<cloudbase-token>" --timeout-ms 120000
```

Report Source smoke 会真实写入 smoke conversation、Agent Run、usage、assistant message 和 report artifact，只应在部署后验收时使用。成功输出 `Smoke PASS`；失败输出 `Smoke FAIL`、失败步骤、HTTP 状态、响应摘要和关键 debug ID。

## 12. 数据库变更边界

涉及 SQL、migration 或 seed 的变更继续使用仓库 migration / seed 文件作为事实源。执行方式可以是数据库客户端或后续自动化脚本，但部署脚本当前不自动执行 SQL、migration 或 seed。

## 13. 禁止项

禁止：

- 把函数代码上传成功描述成完整部署成功。
- 依赖交互式选择环境完成部署。
- 脚本静默猜测 envId、domain、route、runtime 或函数类型。
- 在部署脚本中长期硬编码业务路由、域名或环境配置。
- 常规部署传 `--httpFn` / `--path` 修改 route。
- 主 API 挂在 `*` 通配路由下。
- 主链路 API 关闭身份认证。
- 路径透传开启。
- 敏感值写入仓库或前端 `VITE_*`。
