import type { ToolCall } from '../types/workbench';

export const mockToolCalls: ToolCall[] = [
  {
    id: 'tool_knowledge_search',
    title: '知识库检索',
    toolName: 'knowledge_search',
    params: 'keyword=教学质量, month=2026-05',
    result: '找到 3 条相关资料',
    status: 'success',
  },
  {
    id: 'tool_query_data',
    title: '数据查询',
    toolName: 'query_data',
    params: 'scope=全校, metric=平均分/出勤率',
    result: '返回 6 个年级统计结果',
    status: 'success',
  },
];