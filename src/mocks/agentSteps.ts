import type { AgentStep } from '../types/workbench';

export const mockAgentSteps: AgentStep[] = [
  { id: 'understand', title: '理解用户问题', status: 'success' },
  { id: 'search', title: '检索知识库', status: 'success' },
  { id: 'query', title: '查询业务数据', status: 'success' },
  { id: 'chart', title: '生成分析图表', status: 'success' },
  { id: 'confirm', title: '等待用户确认', status: 'running' },
  { id: 'final', title: '生成最终结论', status: 'pending' },
];