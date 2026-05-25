import type {
  RunDataSourceSnapshot,
  RunStartedEvent,
} from '@/types/run';

function createCloudBaseAgentDataSource(): RunDataSourceSnapshot {
  return {
    provider: 'cloudbase_mysql',
    name: '教学质量数据源',
    typeLabel: '服务端受控数据源',
  };
}

export function createAgentPendingRunStartedEvent(params: {
  runId: string;
  prompt: string;
  sessionId?: string;
}): RunStartedEvent {
  const timestamp = new Date().toISOString();

  return {
    type: 'run_started',
    run: {
      id: params.runId,
      clientRunId: params.runId,
      displayRunId: params.runId,
      sessionId: params.sessionId,
      mode: 'agent',
      status: 'running',
      intent: 'unknown',
      prompt: params.prompt,
      plan: {
        intent: 'unknown',
        shouldUseDataAnalysis: false,
        reason: '正在等待 Agent Planner 判断任务类型',
      },
      dataSource: createCloudBaseAgentDataSource(),
      steps: [
        {
          id: 'create_run',
          title: '创建 Run',
          description: '已接收用户问题，正在创建本轮 Agent Run。',
          status: 'success',
          startedAt: timestamp,
          completedAt: timestamp,
          elapsedMs: 0,
        },
        {
          id: 'understand_prompt',
          title: '理解用户问题',
          description: '正在判断用户意图、分析目标和是否需要访问数据源。',
          status: 'running',
          startedAt: timestamp,
        },
        {
          id: 'read_schema',
          title: '读取数据源结构',
          description: '等待 Planner 确认是否需要读取数据源结构。',
          status: 'pending',
        },
        {
          id: 'execute_tools',
          title: '执行受控工具',
          description: '等待工具选择结果。',
          status: 'pending',
        },
        {
          id: 'generate_chart',
          title: '生成图表数据',
          description: '等待工具结果生成图表结构。',
          status: 'pending',
        },
        {
          id: 'generate_conclusion',
          title: '生成最终回复',
          description: '等待模型或本地摘要生成结论。',
          status: 'pending',
        },
      ],
      toolInvocations: [],
      conclusion: '',
      conclusionSource: 'none',
      reportState: 'hidden',
      createdAt: timestamp,
      updatedAt: timestamp,
      startedAt: timestamp,
    },
  };
}
