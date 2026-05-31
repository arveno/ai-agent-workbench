# 关联 Issue

Closes #

# Issue Decision Snapshot

- 关联 Issue：
- Issue 是否完成 Canonical Decision：
- 本 PR 是否涉及 schema / mapper / ViewModel / seed / DB 字段：
- canonical 字段是什么：
- 是否存在 oldField/newField、legacy fallback、兼容读取：
- 是否按 Issue 决策执行：

# 本次目标

-

# 修改范围

-

# 明确不做

-

# 主要改动

-

# 架构自检清单

- [ ] 没有超出 Issue 范围
- [ ] 没有新增双轨实现
- [ ] 没有新增多链路数据加工
- [ ] 没有新增旧字段 fallback
- [ ] 没有出现 `id1 || id2` / `oldField || newField`
- [ ] 组件没有解析 raw / metadata / legacy 字段
- [ ] 数据链路符合 Raw -> Canonical -> ViewModel -> UI
- [ ] service / store / mapper / component 职责边界清楚
- [ ] 前后端字段契约一致
- [ ] 没有无关重构
- [ ] 没有过度抽象、过度封装或为拆而拆；同一文件内没有把连续清楚的逻辑拆成大量小函数，未引入无意义 helper / manager / adapter / wrapper / 多层调用跳转
- [ ] 没有无关依赖
- [ ] 没有死代码 / debug 代码
- [ ] 符合 LangGraph / LangChain / LangSmith 终态方向
- [ ] 没有修改未确认的数据库字段
- [ ] 已说明风险点和后续建议

# Data Contract 自检

- [ ] 已说明本 PR 是否涉及字段契约变更
- [ ] 如涉及字段契约变更，已更新 `contracts/field-registry.yml`、`contracts/schemas/**` 和 generated 文件；如不涉及，已在 PR 中说明不适用
- [ ] 如涉及运行字段，已确认后端输出、前端 type、mapper、ViewModel 同名同层级；如不涉及，已说明不适用
- [ ] 未绕过 Contract Pack；未新增未登记字段

# Review Comment 归因

先归因，再处理。分类：

- A. 当前 Issue 范围内，已修
- B. 后置到已有 Issue
- C. 新建 Issue
- D. 真正孤立单点

归因记录：

| Review comment | 分类 | 处理方式 / Issue |
| --- | --- | --- |
| - | - | - |

# 验证结果

- [ ] `pnpm lint`
- [ ] `pnpm build`
- [ ] 其他验证：

# 风险点

-

# 后续建议

-
