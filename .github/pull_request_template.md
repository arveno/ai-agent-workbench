# 关联 Issue

Closes #

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

# 验证结果

- [ ] `pnpm lint`
- [ ] `pnpm build`
- [ ] 其他验证：

# 风险点

-

# 后续建议

-
