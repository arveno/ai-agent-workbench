import type { AgentRunResult } from '@/types/workbench';
import type {
  RunChartData,
  RunDataSourceSnapshot,
  RunIntent,
  RunStartedEvent,
  RunSnapshot,
  RunStep,
  RunToolInvocation,
} from '@/types/run';

type AgentProvider = 'postgresql' | 'supabase';

function getAgentDataSource(provider: AgentProvider): RunDataSourceSnapshot {
  return {
    provider,
    name: provider === 'supabase' ? 'Supabase / Agent Run' : 'PostgreSQL / Agent Run',
    typeLabel: provider === 'supabase' ? 'Supabase 托管 PostgreSQL' : 'PostgreSQL',
    schema: 'public',
  };
}

function mapAgentIntent(agentRun: AgentRunResult): RunIntent {
  if (agentRun.plan?.intent) {
    return agentRun.plan.intent;
  }

  return agentRun.toolInvocations.length > 0 ? 'data_analysis' : 'unknown';
}

function mapAgentSteps(agentRun: AgentRunResult): RunStep[] {
  return agentRun.steps.map((step) => ({
    id: step.id,
    title: step.title,
    description: step.description,
    status: step.status,
    elapsedMs: step.elapsedMs,
  }));
}

function mapAgentTools(agentRun: AgentRunResult): RunToolInvocation[] {
  return agentRun.toolInvocations.map((invocation) => ({
    id: invocation.id,
    toolId: invocation.toolId,
    toolName: invocation.toolId,
    displayName: invocation.toolName,
    status: invocation.status,
    inputSummary: invocation.inputSummary,
    outputSummary: invocation.outputSummary,
    elapsedMs: invocation.elapsedMs,
  }));
}

function mapAgentChartData(agentRun: AgentRunResult): RunChartData | undefined {
  if (
    !agentRun.chartData ||
    agentRun.chartData.labels.length === 0 ||
    agentRun.chartData.values.length === 0
  ) {
    return undefined;
  }

  const chartType = agentRun.chartData.chartType === 'line' ? 'line' : 'bar';

  return {
    title: agentRun.chartData.title || '数据分析结果',
    chartType,
    labels: agentRun.chartData.labels,
    series: [
      {
        name: agentRun.chartData.title || '指标值',
        values: agentRun.chartData.values,
      },
    ],
    summary: agentRun.chartData.summary,
  };
}

export function createAgentPendingRunStartedEvent(params: {
  runId: string;
  prompt: string;
  provider: AgentProvider;
  sessionId?: string;
}): RunStartedEvent {
  const timestamp = new Date().toISOString();

  return {
    type: 'run_started',
    run: {
      id: params.runId,
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
      dataSource: getAgentDataSource(params.provider),
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
          title: '读取数据源 Schema',
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

export function mapAgentRunResultToRunSnapshot(agentRun: AgentRunResult): RunSnapshot {
  const intent = mapAgentIntent(agentRun);
  const isReportAvailable = intent === 'data_analysis' && agentRun.status === 'success' && Boolean(agentRun.conclusion.trim());
  const updatedAt = new Date().toISOString();

  return {
    id: agentRun.id,
    mode: 'agent',
    status: agentRun.status,
    intent,
    prompt: agentRun.prompt,
    plan: {
      intent,
      shouldUseDataAnalysis: agentRun.plan?.shouldUseDataAnalysis ?? intent === 'data_analysis',
      reason: agentRun.plan?.reason,
      metric: agentRun.plan?.metric,
      groupBy: agentRun.plan?.groupBy,
      timeRangeLabel: agentRun.plan?.timeRange?.label,
      comparison: agentRun.plan?.comparison,
    },
    dataSource: getAgentDataSource(agentRun.provider),
    steps: mapAgentSteps(agentRun),
    toolInvocations: mapAgentTools(agentRun),
    chartData: mapAgentChartData(agentRun),
    conclusion: agentRun.conclusion,
    conclusionSource: agentRun.conclusionSource,
    conclusionNotice: agentRun.conclusionNotice,
    reportState: isReportAvailable ? 'pending' : 'hidden',
    createdAt: agentRun.createdAt,
    updatedAt,
    completedAt: agentRun.status === 'success' || agentRun.status === 'error' ? updatedAt : undefined,
    elapsedMs: agentRun.elapsedMs,
  };
}
