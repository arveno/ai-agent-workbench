import type {
  RunChartData,
  RunChartReadyEvent,
  RunCompletedEvent,
  RunConclusionCompletedEvent,
  RunEvent,
  RunReportPendingEvent,
  RunStartedEvent,
  RunStepCompletedEvent,
  RunStepStartedEvent,
  RunStoppedEvent,
  RunToolCompletedEvent,
  RunToolInvocation,
  RunToolStartedEvent,
} from '@/types/run';
import { createMockRagSources } from './ragSources';

export const MOCK_RUN_STEP_IDS = {
  understandPrompt: 'understand_prompt',
  knowledgeSearch: 'knowledge_search',
  queryData: 'query_data',
  generateChart: 'generate_chart',
  waitConfirmation: 'wait_confirmation',
  generateConclusion: 'generate_conclusion',
} as const;

export const MOCK_RUN_TOOL_IDS = {
  knowledgeSearch: 'knowledge_search',
  queryData: 'query_data',
  chartRender: 'chart_render',
} as const;

const MOCK_RUN_STEPS = [
  { id: MOCK_RUN_STEP_IDS.understandPrompt, title: '理解用户问题' },
  { id: MOCK_RUN_STEP_IDS.knowledgeSearch, title: '检索知识资料' },
  { id: MOCK_RUN_STEP_IDS.queryData, title: '查询业务数据' },
  { id: MOCK_RUN_STEP_IDS.generateChart, title: '生成分析图表' },
  { id: MOCK_RUN_STEP_IDS.waitConfirmation, title: '等待用户确认' },
  { id: MOCK_RUN_STEP_IDS.generateConclusion, title: '生成最终结论' },
] as const;

export function createMockRunStartedEvent(params: {
  runId: string;
  prompt: string;
  sessionId?: string;
}): RunStartedEvent {
  const timestamp = new Date().toISOString();

  return {
    type: 'run_started',
    run: {
      id: params.runId,
      sessionId: params.sessionId,
      mode: 'mock',
      status: 'running',
      intent: 'data_analysis',
      prompt: params.prompt,
      plan: {
        intent: 'data_analysis',
        shouldUseDataAnalysis: true,
        reason: 'Mock 演示模式使用本地模拟数据生成分析流程',
        metric: 'avg_score',
        groupBy: 'grade',
      },
      dataSource: {
        provider: 'mock',
        name: 'Mock 教学数据源',
        typeLabel: '本地模拟数据',
        schema: 'public',
        tableCount: 3,
      },
      steps: MOCK_RUN_STEPS.map((step) => ({
        ...step,
        status: 'pending',
      })),
      toolInvocations: [],
      sources: createMockRagSources(),
      conclusion: '',
      conclusionSource: 'mock',
      reportState: 'hidden',
      createdAt: timestamp,
      updatedAt: timestamp,
      startedAt: timestamp,
    },
  };
}

export function createMockStepStartedEvent(runId: string, stepId: string, title: string): RunStepStartedEvent {
  return {
    type: 'step_started',
    runId,
    stepId,
    title,
    startedAt: new Date().toISOString(),
  };
}

export function createMockStepCompletedEvent(
  runId: string,
  stepId: string,
  elapsedMs?: number,
): RunStepCompletedEvent {
  return {
    type: 'step_completed',
    runId,
    stepId,
    completedAt: new Date().toISOString(),
    elapsedMs,
  };
}

export function createMockToolStartedEvent(
  runId: string,
  tool: RunToolInvocation,
): RunToolStartedEvent {
  return {
    type: 'tool_started',
    runId,
    tool,
  };
}

export function createMockToolCompletedEvent(
  runId: string,
  toolId: string,
  outputSummary: string,
  elapsedMs?: number,
): RunToolCompletedEvent {
  return {
    type: 'tool_completed',
    runId,
    toolId,
    outputSummary,
    completedAt: new Date().toISOString(),
    elapsedMs,
  };
}

export function createMockChartReadyEvent(runId: string): RunChartReadyEvent {
  return {
    type: 'chart_ready',
    runId,
    chartData: createMockChartData(),
  };
}

export function createMockConclusionCompletedEvent(
  runId: string,
  conclusion: string,
): RunConclusionCompletedEvent {
  return {
    type: 'conclusion_completed',
    runId,
    conclusion,
    conclusionSource: 'mock',
  };
}

export function createMockReportPendingEvent(runId: string): RunReportPendingEvent {
  return {
    type: 'report_pending',
    runId,
  };
}

export function createMockRunCompletedEvent(runId: string, elapsedMs?: number): RunCompletedEvent {
  return {
    type: 'run_completed',
    runId,
    completedAt: new Date().toISOString(),
    elapsedMs,
  };
}

export function createMockRunStoppedEvent(runId: string): RunStoppedEvent {
  return {
    type: 'run_stopped',
    runId,
  };
}

export function createMockToolInvocation(toolId: keyof typeof MOCK_RUN_TOOL_IDS): RunToolInvocation {
  const timestamp = new Date().toISOString();

  if (toolId === 'knowledgeSearch') {
    return {
      id: MOCK_RUN_TOOL_IDS.knowledgeSearch,
      toolId: MOCK_RUN_TOOL_IDS.knowledgeSearch,
      toolName: MOCK_RUN_TOOL_IDS.knowledgeSearch,
      displayName: '知识库检索',
      status: 'running',
      inputSummary: '检索教学质量相关指标口径与异常判断规则',
      outputSummary: '',
      startedAt: timestamp,
    };
  }

  if (toolId === 'queryData') {
    return {
      id: MOCK_RUN_TOOL_IDS.queryData,
      toolId: MOCK_RUN_TOOL_IDS.queryData,
      toolName: MOCK_RUN_TOOL_IDS.queryData,
      displayName: '数据查询',
      status: 'running',
      inputSummary: '查询本月各年级成绩与出勤统计数据',
      outputSummary: '',
      startedAt: timestamp,
    };
  }

  return {
    id: MOCK_RUN_TOOL_IDS.chartRender,
    toolId: MOCK_RUN_TOOL_IDS.chartRender,
    toolName: MOCK_RUN_TOOL_IDS.chartRender,
    displayName: '图表数据生成',
    status: 'running',
    inputSummary: '生成教学质量趋势图表数据',
    outputSummary: '',
    startedAt: timestamp,
  };
}

export function createMockChartData(): RunChartData {
  return {
    title: '各年级平均分对比',
    chartType: 'bar',
    labels: ['一', '二', '三', '四', '五', '六'],
    series: [
      {
        name: '平均分',
        values: [78, 82, 79, 76, 80, 74],
      },
    ],
    summary: '已生成各年级平均分对比图表',
  };
}

export function createMockRunEventListForCompletedRun(runId: string, conclusion: string): RunEvent[] {
  return [
    createMockChartReadyEvent(runId),
    createMockConclusionCompletedEvent(runId, conclusion),
    createMockReportPendingEvent(runId),
    createMockRunCompletedEvent(runId),
  ];
}
