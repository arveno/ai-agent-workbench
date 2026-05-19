# CloudBase Functions 手动上传说明

本文档用于手动上传 CloudBase HTTP Functions 前的本地打包和结构检查。当前流程只覆盖本地 staging 目录生成、上传前检查和人工上传注意事项，不包含自动上传、自动部署或 CI/CD。

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
- 路由、路径透传、环境变量需要按现有 CloudBase 配置确认。
- 不要把模型 Key、数据库连接串或 CloudBase 函数运行时变量配置到 EdgeOne 前端 `VITE_*` 变量中。

## 函数风险说明

- `workbench-agent-run-stream` 风险最高，依赖 `_shared/auth.js`、`_shared/mysql.js`、`_shared/modelGateway.js`、CloudBase MySQL、quota、RAG 表和模型环境变量。
- `workbench-reports` 曾出现上传形态问题，上传前重点确认根目录结构和 `_shared/auth.js`、`_shared/mysql.js` 是否在根目录 `_shared/` 下。
- `demo-tasks`、`demo-conversations` 当前存在硬编码 CloudBase env id 风险。本阶段只提示风险，不修改业务 runtime。

## Phase 2D

部署后 smoke test 会在 Phase 2D 单独补充。当前文档只覆盖本地打包、上传前检查和人工上传注意事项。
