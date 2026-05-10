# AI Agent Workbench Demo 演示验收清单

本清单用于第一版 AI Agent Workbench 的演示前检查、回归验收和面试讲解。文档不包含任何 API Key、数据库连接串或其他 secret。

## 1. 演示前准备

- [ ] 依赖已安装：`pnpm install`
- [ ] TypeScript 检查通过：`pnpm exec tsc --noEmit`
- [ ] 构建通过：`pnpm build`
- [ ] 本地使用 `pnpm exec vercel dev` 启动
- [ ] `.env.local` 已按需配置，且不会提交到 Git
- [ ] 线上 Vercel 环境变量已配置
- [ ] Supabase 项目处于可用状态
- [ ] Supabase / PostgreSQL Demo 数据表存在
- [ ] 浏览器 `sessionStorage` 可正常使用
- [ ] 在线预览地址可打开

演示前不要在文档、截图、终端输出或提交记录中展示任何真实密钥、连接串或密码。

## 2. 本地环境检查

推荐本地检查命令：

```bash
pnpm install
pnpm exec tsc --noEmit
pnpm build
pnpm exec vercel dev
```

本地访问地址：

```txt
http://localhost:3000
```

本地验收项：

- [ ] 页面可以正常打开
- [ ] Workspace Header 中环境状态可见
- [ ] Mock 模式可发送并展示 Run Trace
- [ ] Agent 模式可发送并进入流式 Run
- [ ] 数据源弹窗可以打开
- [ ] 数据源连接测试可用
- [ ] Schema 读取可用
- [ ] 工具库弹窗可以打开
- [ ] 工作流弹窗和 Prompt 模板可打开

如果只使用 `pnpm dev`，可以查看前端页面和 Mock 演示；如果需要测试 API、数据源、Agent Run、SSE 和环境健康检查，应使用 `pnpm exec vercel dev`。

## 3. 线上环境检查

线上 Vercel 需要确认以下环境变量的配置状态：

```txt
GROQ_API_KEY
SUPABASE_DB_CONNECTION_STRING
POSTGRES_CONNECTION_STRING
```

注意：

- 不要把真实值写入文档
- 不要把真实值发到聊天记录
- 不要提交 `.env.local`
- 修改 Vercel 环境变量后需要重新部署

线上检查步骤：

1. 打开在线预览地址。
2. 查看 Workspace Header 中的环境状态 badge。
3. 如果显示“未完整配置”或“数据源连接异常”，进入 Vercel Project Settings -> Environment Variables 检查配置。
4. 重新部署后再次打开页面。
5. 使用数据源弹窗测试 Supabase / PostgreSQL 连接。
6. 使用 Agent 模式执行一次数据分析问题。

线上预期：

- [ ] 页面不崩溃
- [ ] 环境状态可以解释当前服务端配置情况
- [ ] 数据源已配置时显示可连接
- [ ] Groq 未配置时页面仍可通过 fallback 摘要运行
- [ ] Agent Run 不暴露 API Key 或数据库连接串

## 4. 推荐演示路径

建议固定使用以下演示顺序：

1. 打开在线预览。
2. 介绍整体布局：左侧 Sidebar + 右侧 Workspace。
3. 查看环境健康状态，说明线上配置是否完整。
4. 打开模型配置，说明 Mock 演示模式和 Groq / Agent 模式。
5. 打开数据源配置，说明当前 Demo 使用 Supabase 托管 PostgreSQL，同时保留通用 PostgreSQL 能力。
6. 打开工具库，说明服务端工具和前端模拟工具的区别。
7. 打开工作流，说明执行流程和 Prompt 模板配置。
8. 输入 `你能做什么`。
9. 展示 `capability_intro` 分支：不访问数据源、不调用工具、直接返回能力说明。
10. 输入 `分析 2026 年 5 月教学质量数据，找出异常指标`。
11. 展示 Agent Run SSE 流式过程。
12. 展示右侧 Run Trace：概览、步骤、数据源、工具调用、检索来源、图表、结论。
13. 展示图表和工具调用自然语言摘要。
14. 点击“生成报告”，展示 Markdown 简版报告。
15. 切换 Mock 模式，说明 Mock 和 Agent 共享同一套 Run 状态与展示结构。

## 5. Mock 模式验收

测试输入：

```txt
分析本月教学质量数据
```

预期结果：

- [ ] user 消息立即出现在聊天区
- [ ] 输入框立即清空
- [ ] 发送按钮变为停止按钮
- [ ] 聊天区显示 Mock 流式内容
- [ ] 右侧 Run 概览显示 Mock 演示 / 运行中
- [ ] 右侧执行步骤开始推进
- [ ] 右侧工具调用开始出现
- [ ] 工具调用展示自然语言摘要，不展示完整 JSON
- [ ] 右侧检索来源显示 Mock RAG sources
- [ ] 右侧图表正常显示
- [ ] 完成后 Run 状态为已完成
- [ ] 当前结论显示 Mock 生成
- [ ] 报告确认出现

## 6. Agent 模式验收

测试输入：

```txt
分析 2026 年 5 月教学质量数据，找出异常指标
```

预期结果：

- [ ] user 消息立即出现在聊天区
- [ ] 输入框立即清空
- [ ] 发送按钮变为停止按钮
- [ ] Agent Run SSE 开始输出事件
- [ ] 右侧 Run 概览显示真实 Agent / 运行中
- [ ] 右侧步骤逐步更新
- [ ] 工具调用逐步出现
- [ ] 工具调用展示自然语言摘要，不展示完整 JSON
- [ ] 结论在聊天区流式输出
- [ ] 完成后 assistant 最终消息写入当前会话
- [ ] 图表来自 `currentRun.chartData`
- [ ] 结论不引用非 2026 年 5 月数据
- [ ] 报告确认出现

如果服务端没有配置 Groq Key：

- [ ] Run 仍然可以成功
- [ ] 结论来源显示本地摘要或 fallback
- [ ] 聊天区明确提示当前结论由本地工具结果摘要生成

## 7. 三类问题测试用例

### 7.1 capability_intro

输入：

```txt
你能做什么
```

预期：

- [ ] 调用 Agent Run 流式接口
- [ ] Planner 判断为 `capability_intro`
- [ ] 不访问数据源
- [ ] 不调用工具
- [ ] 不生成图表
- [ ] 返回能力说明
- [ ] 右侧显示能力说明类 Run
- [ ] 数据源显示本次未访问数据源
- [ ] 工具调用显示本次未调用工具
- [ ] 数据分析结果显示本次未生成分析结果
- [ ] 不显示报告确认

### 7.2 data_analysis

输入：

```txt
分析 2026 年 5 月教学质量数据，找出异常指标
```

预期：

- [ ] Planner 判断为 `data_analysis`
- [ ] 进入数据分析流程
- [ ] 执行 `schema_inspect`
- [ ] 执行 `aggregate_table` 或受控查询工具
- [ ] 执行 `chart_render`
- [ ] 时间范围约束为 2026 年 5 月
- [ ] 指标优先选择异常指标相关约束
- [ ] 展示图表
- [ ] 生成结论
- [ ] 可生成报告

### 7.3 unsupported

输入：

```txt
帮我写一首诗
```

预期：

- [ ] Planner 判断为 `unsupported`
- [ ] 不访问数据源
- [ ] 不调用工具
- [ ] 不生成图表
- [ ] 返回暂不支持说明
- [ ] 右侧显示暂不支持类 Run
- [ ] 不显示报告确认

## 8. 停止 / 中断测试

### 8.1 Agent 运行中点击停止

操作：

```txt
Agent 流式运行中点击停止按钮
```

预期：

- [ ] 当前请求被 abort
- [ ] 发送按钮恢复为发送状态
- [ ] `currentRun.status` 变为 `stopped`
- [ ] 正在运行的 step 显示已停止
- [ ] 正在运行的 tool 显示已停止
- [ ] 不显示普通失败错误
- [ ] 不追加假的完整结论
- [ ] 如果已有部分结论，则保留并标记已停止

### 8.2 Agent 运行中切换会话

操作：

```txt
Agent 运行中切换会话或新建会话
```

预期：

- [ ] 旧 stream 被中断
- [ ] 旧事件不污染新会话
- [ ] 旧 Run 不覆盖新会话右侧面板
- [ ] 旧 assistant 消息不会追加到新会话
- [ ] 新会话聊天区为空
- [ ] 新会话右侧显示空态

### 8.3 Mock 运行中点击停止

操作：

```txt
Mock 生成中点击停止按钮
```

预期：

- [ ] Mock 流停止
- [ ] 发送按钮恢复
- [ ] `currentRun.status` 变为 `stopped`
- [ ] 右侧显示已停止
- [ ] 不再继续追加 Mock 内容

## 9. 报告生成测试

在 `data_analysis` Run 成功后，确认区应显示：

```txt
是否基于本次分析生成简版报告？
```

点击：

```txt
生成报告
```

预期：

- [ ] 聊天区追加 Markdown 报告
- [ ] 报告基于当前 `currentRun`
- [ ] 报告包含分析问题、数据源、调用工具、分析结论和后续建议
- [ ] 不使用假数据
- [ ] 确认区消失或显示已生成状态

点击：

```txt
暂不生成
```

预期：

- [ ] 不追加报告
- [ ] `currentRun.reportState` 变为 `skipped`
- [ ] 确认区消失

不应显示报告确认的场景：

- [ ] 新会话无 Run
- [ ] `capability_intro`
- [ ] `unsupported`
- [ ] Agent Run error
- [ ] Agent Run stopped
- [ ] Run 没有 conclusion

## 10. 配置弹窗测试

需要检查的入口：

```txt
模型
数据源
工具库
工作流
Prompt 模板
```

预期：

- [ ] 模型弹窗可打开和关闭
- [ ] 模型弹窗可以切换 Mock / Groq 配置
- [ ] 数据源弹窗可打开和关闭
- [ ] 数据源连接测试可用
- [ ] Schema 读取可用
- [ ] 工具库弹窗可打开和关闭
- [ ] 工具库展示已接入 / 前端模拟 / 规划中
- [ ] 工具库展示执行位置、风险等级和 Run Trace 标记
- [ ] 工作流弹窗可打开和关闭
- [ ] 工作流展示执行流程
- [ ] Prompt 模板 Tab 可打开
- [ ] Prompt 模板可编辑
- [ ] Prompt 模板可保存到 `sessionStorage`
- [ ] Prompt 模板可恢复默认
- [ ] 配置弹窗不影响当前 Run

## 11. 环境健康检查测试

检查入口：

```txt
Workspace Header 环境状态
```

预期：

- [ ] 页面加载后请求 `/api/health`
- [ ] 显示当前运行环境：development / preview / production
- [ ] 显示 Groq 配置状态
- [ ] 显示 Supabase 配置和连接状态
- [ ] 显示 PostgreSQL 配置和连接状态
- [ ] 未配置时展示可理解文案
- [ ] 连接失败时展示可理解文案
- [ ] 不影响 Mock 发送
- [ ] 不影响 Agent 发送
- [ ] 不暴露任何环境变量值
- [ ] 不暴露数据库连接串
- [ ] 不暴露 Groq API Key

## 12. 常见问题排查

### 12.1 数据源连接失败

可能原因：

- Vercel 未配置环境变量
- 本地 `.env.local` 未配置
- 数据库连接串密码错误
- Supabase 项目暂停
- Supabase 网络或权限限制

排查方式：

- 打开环境状态面板
- 访问 `/api/health`
- 检查 Vercel Project Settings -> Environment Variables
- 确认修改环境变量后已重新部署
- 本地用 `pnpm exec vercel dev` 复现 API 行为

### 12.2 Groq 不生成模型结论

可能原因：

- `GROQ_API_KEY` 未配置
- 页面 BYOK 未填写
- Groq 请求失败
- 模型服务限流或网络异常

处理方式：

- 使用页面 Key
- 配置服务端 Key
- 接受 fallback 本地摘要
- 通过 Run Trace 查看结论来源

### 12.3 图表不显示

检查点：

- `currentRun.chartData` 是否存在
- `labels` 是否为空
- `series` 是否为空
- `series.values` 是否与 `labels` 对齐
- 当前问题是否属于 `data_analysis`
- Run 是否在生成图表前被停止

### 12.4 结论月份不对

检查点：

- Planner 是否输出 `timeRange`
- `aggregate_table` 是否收到时间范围约束
- 工具结果是否为空
- 结论 prompt 是否包含用户指定时间范围
- 如果指定月份无数据，结论是否明确说明数据不足

### 12.5 报告确认不显示

检查点：

- `currentRun.intent` 是否为 `data_analysis`
- `currentRun.status` 是否为 `success`
- `currentRun.conclusion` 是否存在
- `currentRun.reportState` 是否为 `pending`
- 当前 Run 是否被停止或失败

### 12.6 旧 Run 残留

检查点：

- 新建会话是否调用清理逻辑
- 切换会话是否中断旧 stream
- `activeAgentRunRequestId` 是否被清理
- AbortController 是否被清理
- 旧 stream 是否还在写入事件

## 13. 面试讲解提示

这个项目不是普通 Chat UI，而是 AI Agent Workbench。

讲解重点：

- Agent Planner：先判断任务类型，再决定是否进入数据分析流程
- 真实数据源：Supabase 托管 PostgreSQL，前端不直接连接数据库
- 服务端受控工具：模型不能自由执行 SQL，工具调用走 Tool Registry
- Run Trace：右侧展示 Run 概览、步骤、工具、图表、结论和来源
- 流式输出：Agent Run 通过 SSE 输出标准 RunEvent
- 停止 / 中断：支持 ChatGPT 类停止体验，旧流不会污染页面
- 报告确认：数据分析成功后才允许基于当前 Run 生成报告
- 环境诊断：通过 `/api/health` 解释本地和线上配置状态
- Prompt 配置：提供 Prompt 模板管理 UI，当前保存在会话级存储中
- Model Gateway：服务端已抽象模型网关，当前 Groq 已实现，其他 provider 为 adapter stub
- RAG Source UI：已具备来源、引用、相关度和是否用于回答的前端结构

建议表达：

```txt
这个 Demo 的重点不是把聊天框做漂亮，而是把 AI 应用真实落地时需要的执行过程、工具边界、数据可信度、运行状态和可排错能力展示出来。
```

当前不要夸大的能力：

- 未接入用户登录
- 未接入完整 Workspace 多租户
- 未接入真实向量库
- 未实现后端 Run History 持久化
- 未实现任意 SQL 编辑器
- 未实现 Three.js 3D Agent Flow

