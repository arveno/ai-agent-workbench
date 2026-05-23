# CloudBase Functions 手动上传说明

本文档用于 CloudBase HTTP Functions 上传前的本地打包、结构检查和单函数自动部署。当前流程只覆盖本地 staging 目录生成、上传前检查、单函数代码上传和部署后人工核对清单，不包含 SQL 自动执行、migration / seed 自动化、HTTP route 自动修改、函数环境变量自动修改或完整 CI/CD。

## 当前 POC 主域名与路由规则

当前 POC smoke test 和前端 API 验证的主域名固定为：

```txt
https://ai-agent-workbench-poc-d6731923d-1317403720.ap-shanghai.app.tcloudbase.com
```

CloudBase CLI / 控制台可能输出 `service.tcloudbase.com` 函数访问链接，但本项目当前 POC 不以 `service.tcloudbase.com` 作为主验证域名。

主链路 API 不应配置到 `*` 通配路由下，必须挂在固定 `app.tcloudbase.com` 域名下的明确 path。CloudBase HTTP 访问服务中，以下主链路 API 需要开启身份认证：

- `/api/agent/run/stream`
- `/api/auth/me`
- `/api/workbench/conversations`
- `/api/workbench/messages`
- `/api/workbench/reports`
- `/api/workbench/runs`
- `/api/workbench/quota`
- `/api/workbench/evaluations`
- `/api/workbench/demo-copy`

公开 demo 读取类接口如果项目设计允许匿名，应单独登记和验证，不混入主链路认证规则。路径透传应关闭。

当前部署脚本默认只部署函数代码，不自动创建或更新 HTTP route，也不会自动修改或校验身份认证和路径透传；这些云端配置必须在 CloudBase 控制台中维护，并在部署后按检查清单人工确认。

## 前置要求

- 在 Git Bash 下执行命令。
- `pnpm` 可用。
- 当前目录为项目根目录。
- CloudBase 控制台中已按函数配置好云端环境变量。
- 本文档不猜测具体云端配置值；路由、路径透传、身份认证和环境变量以现有 CloudBase 配置为准。

## 单函数打包

```bash
pnpm cloudbase:package -- --function workbench-agent-run-stream --clean --check
```

常用参数：

- `--function <name|all>`：指定函数名，或打包全部函数。
- `--out <dir>`：指定输出根目录，默认是用户桌面。
- `--clean`：打包前清空目标 staging 目录。
- `--check`：打包后自动执行包结构检查。

## 全函数打包

```bash
pnpm cloudbase:package -- --function all --clean --check
```

默认输出目录格式：

```txt
~/Desktop/cloudbase-<function>-package
```

例如：

```txt
~/Desktop/cloudbase-workbench-agent-run-stream-package
```

## 推荐项目内输出目录

默认输出到桌面仍然保留，适合临时手动上传。后续 Windows / Mac 统一工作流推荐使用项目根目录下的本地临时目录：

```txt
./.cloudbase-packages/
```

推荐命令：

```bash
pnpm cloudbase:package -- --function all --out ./.cloudbase-packages --clean --check
```

`.cloudbase-packages/` 是本地打包产物目录，不提交 Git，已加入 `.gitignore`。使用该目录上传 CloudBase 时，仍然压缩具体函数 package 目录内的内容，不要压缩 `.cloudbase-packages/` 或 `cloudbase-<function>-package` 外层目录。

## 单函数自动部署

手动上传流程仍然保留。需要减少手动压缩 zip 和控制台上传时，可以使用 CloudBase CLI 自动部署单个函数代码包。推荐使用 profile 配置：

```bash
pnpm cloudbase:deploy:function -- --function workbench-agent-run-stream --profile poc --clean --check --dry-run
pnpm cloudbase:deploy:function -- --function workbench-reports --profile poc --clean --check --dry-run
```

确认 dry-run 输出的 package 和 code-only `tcb fn deploy` 命令无误后，再移除 `--dry-run` 执行真实部署：

```bash
pnpm cloudbase:deploy:function -- --function workbench-agent-run-stream --profile poc --clean --check
pnpm cloudbase:deploy:function -- --function workbench-reports --profile poc --clean --check
```

长期部署应优先使用 `tencent/cloudbase-functions.config.json` 中登记的 `httpPath` 作为人工核对和 smoke test 事实源。脚本默认不传 `--httpFn` / `--path`，避免 CloudBase CLI 自动创建或更新 HTTP route 并污染 `*` 通配路由。`--path` 只能与 `--allow-http-route-update` 一起用于临时排障或一次性验证，常规部署不应使用。

当前 `cloudbase:deploy:function` 的自动化范围是：

- package
- check
- function code deploy
- function timeout config update
- post-deploy checklist

当前不自动化：

- SQL
- migration
- seed
- HTTP route 修改
- HTTP route domain 绑定
- 身份认证开启
- 路径透传关闭
- function env var 修改
- CI/CD

脚本会把 profile 或命令行传入的 CloudBase 环境 ID 转发为 code-only `tcb fn deploy -e <envId> --yes`，不依赖交互式环境选择或确认。默认部署命令不包含 `--httpFn` / `--path`，不会主动维护 HTTP route。code-only 部署默认用于已存在的 HTTP 函数；首次创建 HTTP 函数和主 API route 绑定应在 CloudBase 控制台完成并人工确认。

CloudBase CLI 3.4.0 的 `tcb fn deploy` 不提供 `--timeout` 参数；函数超时时间由脚本在代码部署后通过 `tcb config update fn <name> --timeout <seconds>` 推送。dry-run 时必须确认 function runtime config command 中的 `--timeout` 数值正确。

`workbench-evaluations` 等依赖 CloudBase MySQL 的函数仍需人工确认函数环境变量中存在：

```txt
CLOUDBASE_ENV_ID=<env-id>
```

接口可用前还需要人工确认 HTTP 访问服务路由挂在正确 domain/group 下，例如 `path=/api/workbench/evaluations` 指向 `workbench-evaluations`。涉及 SQL、migration 或 seed 的变更继续使用 Navicat、DBeaver、DataGrip、TablePlus 这类成熟数据库客户端处理，不由部署脚本自动执行。部署后仍建议按环境运行 smoke 或 curl 验证：

```bash
pnpm cloudbase:smoke -- --base-url <cloudbase-api-base-url> --token <token>
```

部署后还需要确认：

- HTTP route 挂在固定 `app.tcloudbase.com` 主域名下。
- 主链路 API 身份认证已开启。
- 路径透传已关闭。
- 没有重复的 `*` 通配路由承载主 API。
- 真实 Agent Run 能完成。
- report 生成和刷新恢复正常。
- usage / quota 不报错。

### Report Source 自动化 Smoke

Report Source 自动化 smoke 是部署后验收脚本，用于验证 `run_sources -> POST /api/workbench/reports -> report_artifacts.metadata.sources/sourceCount/sourceLineage -> GET /api/workbench/reports` 闭环。

脚本会自动创建 smoke conversation，执行一个 RAG / `knowledge_search` Agent Run，解析 SSE 取得 DB `runId`，创建 report，并校验 `sources`、`sourceCount` 和 `sourceLineage=run_sources`。脚本不需要手动拼 `conversationId` / `runId`，也不自动登录；CloudBase token 由执行者传入。

推荐命令：

```bash
pnpm smoke:report-source -- --token "<cloudbase-token>"
```

可选覆盖：

```bash
pnpm smoke:report-source -- --base-url "<base-url>" --token "<cloudbase-token>" --timeout-ms 120000
```

成功输出 `Smoke PASS`，并打印 `conversationId`、`runId`、`usageId`、`assistantMessageId`、`reportId`、`sourceCount` 和前 3 条 source 摘要。失败输出 `Smoke FAIL`、`failedStep`、HTTP 状态、响应摘要和关键 debug ID。该脚本会真实写入 smoke conversation、Agent Run、usage、assistant message 和 report artifact，只应在部署后验收时使用。

### 函数运行配置

函数级运行配置维护在 `tencent/cloudbase-functions.config.json` 的 `functions.<name>` 下。当前 POC 推荐：

- `workbench-agent-run-stream.timeout = 120`
- `workbench-reports.timeout = 60`

`workbench-agent-run-stream` 是 SSE Agent Run 函数，不应使用 CloudBase 默认或历史残留的 15s timeout。Agent Run 需要完成 quota、run persistence、tool events、chart、conclusion 和 `run_completed`，当前 POC 使用 120s 避免 SSE 中途被平台截断。

`workbench-reports` 推荐 60s，避免报告写入、report state 更新或数据库抖动导致偶发超时，但不做过度放大。

如果 smoke test 中 `/api/agent/run/stream` 只能收到 `run_started` / step / tool / `chart_ready`，但没有收到 conclusion 或 `run_completed`，应优先检查 CloudBase 函数 final config 的 timeout 是否仍是 15s。

### HTTP route 维护边界

主 API 路由在 CloudBase 控制台的固定 `app.tcloudbase.com` 域名下维护，部署脚本不是 HTTP 路由 SSOT。当前 CloudBase CLI `tcb fn deploy --httpFn --path` 不提供固定 route domain、身份认证和路径透传的显式控制参数；如果用它更新 route，可能把 path 重新挂到 `*` 通配路由，或留下未开启身份认证的 route。

因此，常规部署必须使用默认 code-only 模式。只有临时排障或一次性验证时，才允许显式传入：

```bash
pnpm cloudbase:deploy:function -- --function workbench-reports --profile poc --allow-http-route-update --path /api/workbench/reports --clean --check --dry-run
```

执行任何带 `--allow-http-route-update` 的真实部署后，必须立刻在 CloudBase 控制台确认：

- route 挂在固定 `app.tcloudbase.com` 主域名下。
- route 不在 `*` 通配路由下。
- 身份认证已开启。
- 路径透传已关闭。

### 自动部署配置事实源

profile、函数 HTTP path、必需函数环境变量名称和说明维护在：

```txt
tencent/cloudbase-functions.config.json
```

该配置文件是 CloudBase 函数部署清单的 SSOT。新增 HTTP 函数必须先登记 `functions.<name>.httpPath`、`requiredEnvVars` 和 `description`，再执行 `cloudbase:deploy:function`。未登记函数部署失败是预期保护，用于避免继续依赖 `--path` 临时覆盖或控制台记忆。

配置文件分三层：

- `defaults`：本地脚本默认行为，例如 `outputRoot` 和 `runtime`。
- `functions`：函数级稳定配置，例如 `httpPath`、`timeout`、`requiredEnvVars` 和说明。
- `environments`：环境级 profile，例如 `envId`、`baseUrl` 和 `routeDomain`。

`envId`、`baseUrl` 和 `routeDomain` 可以提交，它们不是密钥。Secret、Key、Password、Token、数据库密码、Service Role、Private Key 等敏感值不得写入配置文件。部署脚本只读取该配置并执行 package / check / function code deploy / post-deploy checklist，不在脚本里长期硬编码业务路由或云端环境。

参数优先级为：显式命令行参数 > profile 配置 > defaults 配置 > 脚本内最低默认值。`--envId` / `--env-id` 可覆盖 profile 的 `envId`，`--base-url` 可覆盖 profile 的 `baseUrl`，`--expected-route-domain` 可覆盖 profile 的 `routeDomain`，`--out` 可覆盖 `defaults.outputRoot`，`--runtime` 可覆盖 `defaults.runtime`。`--path <httpPath>` 只允许与 `--allow-http-route-update` 一起作为临时 route update 覆盖，脚本会输出 warning；长期变更应回写 `tencent/cloudbase-functions.config.json`。已登记 `httpPath` 的函数，常规部署命令不应再传 `--path`。

不使用 profile 时，仍可显式传入环境参数执行：

```bash
pnpm cloudbase:deploy:function -- --function workbench-evaluations --envId <env-id> --base-url <cloudbase-http-functions-base-url> --out ./.cloudbase-packages --clean --check
```

函数环境变量和 HTTP route 仍需人工确认，或后续作为独立自动化能力补充；当前脚本默认不会自动修改这些云端配置。

当前 POC HTTP 函数清单：

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

主 API 路由仍以固定 `app.tcloudbase.com` 主域名为准。身份认证、路径透传关闭和无 `*` 通配路由承载主 API 仍需在 CloudBase 控制台人工确认。

## 正确包结构

每个 staging 根目录必须直接包含：

```txt
index.js
package.json
scf_bootstrap
_shared/   # 仅该函数需要共享 helper 时存在
README.md  # 源函数目录存在时会复制
```

上传前压缩 staging 根目录里的内容，不要压缩外层目录。

正确：

```txt
cloudbase-workbench-agent-run-stream-package/index.js
cloudbase-workbench-agent-run-stream-package/package.json
cloudbase-workbench-agent-run-stream-package/scf_bootstrap
cloudbase-workbench-agent-run-stream-package/_shared/auth.js
```

禁止多包一层函数目录：

```txt
cloudbase-workbench-agent-run-stream-package/workbench-agent-run-stream/index.js
```

## _shared 复制规则

- `demo-tasks`、`demo-conversations` 不需要 `_shared`。
- `auth-me`、`workbench-conversations`、`workbench-messages`、`workbench-reports`、`workbench-demo-copy`、`workbench-quota`、`workbench-runs` 需要：
  - `_shared/auth.js`
  - `_shared/mysql.js`
- `workbench-agent-run-stream` 需要：
  - `_shared/auth.js`
  - `_shared/mysql.js`
  - `_shared/modelGateway.js`

检查脚本会校验需要的 `_shared` 文件是否存在，也会提示 demo 函数误带 `_shared` 的情况。

## scf_bootstrap 检查

`scf_bootstrap` 必须：

- 位于 staging 根目录。
- 第一行有 shebang，例如 `#!/bin/bash`。
- 包含 `node index.js` 或等价启动命令。
- 尽量具备可执行权限。

打包脚本会在文件系统允许时尝试 `chmod +x` / `chmod 755`。如果 chmod 失败，脚本只输出 warning，不中断打包。

## CloudBase 控制台上传注意事项

- 上传时压缩 staging 根目录里的内容，而不是压缩 `cloudbase-<function>-package` 外层目录本身。
- 上传后按函数类型确认是否开启身份认证：
  - public demo 函数：`demo-tasks`、`demo-conversations` 通常不需要身份认证。
  - 私有函数和 Agent Run 函数需要按现有 CloudBase 配置开启身份认证。
- 路由需要挂在固定 `app.tcloudbase.com` 主域名的明确 path 下，不能依赖 `*` 通配路由承载主 API。
- 路径透传应关闭，环境变量需要按现有 CloudBase 配置确认。
- 不要把模型 Key、数据库连接串或 CloudBase 函数运行时变量配置到 EdgeOne 前端 `VITE_*` 变量中。

## 函数风险说明

- `workbench-agent-run-stream` 风险最高，依赖 `_shared/auth.js`、`_shared/mysql.js`、`_shared/modelGateway.js`、CloudBase MySQL、quota、RAG 表和模型环境变量。
- `workbench-reports` 曾出现上传形态问题，上传前重点确认根目录结构和 `_shared/auth.js`、`_shared/mysql.js` 是否在根目录 `_shared/` 下。
- `demo-tasks`、`demo-conversations` 当前存在硬编码 CloudBase env id 风险。本阶段只提示风险，不修改业务 runtime。
