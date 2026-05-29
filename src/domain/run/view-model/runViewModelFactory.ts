import type { AgentConclusion, ModelTrace } from '../../../../contracts/generated/workbench-contract';
import type { RunSource } from '../../../types/rag';
import {
  mapCanonicalRunChartData,
  mapCanonicalRunDataSource,
  mapCanonicalRunPlan,
} from './runViewModelFieldMappers';
import type {
  CanonicalRunViewModelInput,
  DemoSeedRunAdapterInput,
  MockRunInput,
  PendingAgentRunInput,
  RestoredRunAdapterInput,
  RunStartedViewModelInput,
  RunViewModelFactoryStatusInput,
} from './runViewModelFactoryInputs';
import type {
  RunViewModel,
  RunViewModelAgentConclusion,
  RunViewModelChartData,
  RunViewModelConclusionSource,
  RunViewModelDataSource,
  RunViewModelIntent,
  RunViewModelMode,
  RunViewModelPlan,
  RunViewModelReportState,
  RunViewModelStatus,
  RunViewModelStep,
  RunViewModelToolInvocation,
  RunViewModelTrace,
} from './types';

interface RunViewModelCreateInput {
  id: string;
  clientRunId: string | null;
  sessionId: string;
  displayRunId: string;
  mode: RunViewModelMode;
  status: RunViewModelStatus;
  intent: RunViewModelIntent;
  prompt: string;
  plan: RunViewModelPlan | null;
  dataSource: RunViewModelDataSource | null;
  steps: RunViewModelStep[];
  toolInvocations: RunViewModelToolInvocation[];
  sources: RunSource[];
  chartData: RunViewModelChartData | null;
  conclusion: string;
  conclusionSource: RunViewModelConclusionSource;
  agentConclusion: AgentConclusion | RunViewModelAgentConclusion | null;
  modelTrace: ModelTrace | RunViewModelTrace | null;
  reportState: RunViewModelReportState;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  elapsedMs: number | null;
  errorMessage: string | null;
}

function getTrimmedString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function requireString(value: string | null | undefined, fieldName: string): string {
  const normalizedValue = getTrimmedString(value);

  if (!normalizedValue) {
    throw new Error(`RunViewModelFactory requires ${fieldName}.`);
  }

  return normalizedValue;
}

function optionalString(value: string | null | undefined): string | undefined {
  return getTrimmedString(value) ?? undefined;
}

function mapRunStatus(status: RunViewModelFactoryStatusInput): RunViewModelStatus {
  if (status === 'completed' || status === 'success') {
    return 'success';
  }

  if (status === 'failed' || status === 'error') {
    return 'error';
  }

  return status;
}

function getElapsedMs(value: number | null | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function copyAgentConclusion(
  value: AgentConclusion | RunViewModelAgentConclusion | null | undefined,
): RunViewModelAgentConclusion | undefined {
  if (!value) {
    return undefined;
  }

  return {
    markdownText: value.markdownText,
    plainText: value.plainText,
    ...(value.sections ? { sections: value.sections.map((section) => ({ ...section })) } : {}),
    ...(value.notice ? { notice: value.notice } : {}),
    ...(value.rawText ? { rawText: value.rawText } : {}),
  };
}

function copyModelTrace(value: ModelTrace | RunViewModelTrace | null | undefined): RunViewModelTrace | undefined {
  if (!value) {
    return undefined;
  }

  return {
    selectedModelId: value.selectedModelId,
    provider: value.provider,
    model: value.model,
    latencyMs: value.latencyMs,
    usage: { ...value.usage },
    costEstimate: { ...value.costEstimate },
    fallbackReason: value.fallbackReason,
    modelErrorType: value.modelErrorType,
    modelHttpStatus: value.modelHttpStatus,
    modelErrorMessage: value.modelErrorMessage,
    conclusionSource: value.conclusionSource,
  };
}

function copyArray<T extends object>(value: T[]): T[] {
  return value.map((item) => ({ ...item }));
}

function createRunViewModel(input: RunViewModelCreateInput): RunViewModel {
  const modelTrace = copyModelTrace(input.modelTrace);
  const agentConclusion = copyAgentConclusion(input.agentConclusion);
  const elapsedMs = getElapsedMs(input.elapsedMs);

  return {
    id: input.id,
    ...(input.clientRunId ? { clientRunId: input.clientRunId } : {}),
    sessionId: input.sessionId,
    displayRunId: input.displayRunId,
    mode: input.mode,
    status: input.status,
    intent: input.intent,
    prompt: input.prompt,
    ...(input.plan ? { plan: input.plan } : {}),
    ...(input.dataSource ? { dataSource: input.dataSource } : {}),
    steps: copyArray(input.steps),
    toolInvocations: copyArray(input.toolInvocations),
    sources: copyArray(input.sources),
    ...(input.chartData ? { chartData: input.chartData } : {}),
    conclusion: input.conclusion,
    conclusionSource: input.conclusionSource,
    ...(agentConclusion ? { agentConclusion } : {}),
    ...(modelTrace ? { modelTrace } : {}),
    reportState: input.reportState,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    ...(input.startedAt ? { startedAt: input.startedAt } : {}),
    ...(input.completedAt ? { completedAt: input.completedAt } : {}),
    ...(elapsedMs !== undefined ? { elapsedMs } : {}),
    ...(input.errorMessage ? { errorMessage: input.errorMessage } : {}),
  };
}

function createCloudBaseAgentDataSource(): RunViewModelDataSource {
  return {
    provider: 'cloudbase_mysql',
    name: '教学质量数据源',
    typeLabel: '服务端受控数据源',
  };
}

function createPendingAgentSteps(timestamp: string): RunViewModelStep[] {
  return [
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
  ];
}

export const RunViewModelFactory = {
  fromCanonicalRun(input: CanonicalRunViewModelInput): RunViewModel {
    const run = input.run;
    const agentConclusion = input.agentConclusion ?? run.agentConclusion;
    const modelTrace = input.modelTrace ?? run.modelTrace;
    const id = requireString(run.id, 'id');
    const sessionId = requireString(input.sessionId, 'sessionId');
    const createdAt = optionalString(run.createdAt) ?? new Date().toISOString();
    const updatedAt = optionalString(run.updatedAt) ?? createdAt;

    return createRunViewModel({
      id,
      sessionId,
      clientRunId: optionalString(run.clientRunId) ?? null,
      displayRunId: optionalString(input.displayRunId) ?? id,
      mode: run.mode,
      status: mapRunStatus(run.status),
      intent: run.intent ?? 'unknown',
      prompt: run.prompt ?? '',
      plan: mapCanonicalRunPlan(run.plan) ?? null,
      dataSource: mapCanonicalRunDataSource(run.dataSource) ?? null,
      steps: input.steps ?? [],
      toolInvocations: input.toolInvocations ?? [],
      sources: input.sources ?? [],
      chartData: mapCanonicalRunChartData(run.chartData) ?? null,
      conclusion: getTrimmedString(input.conclusion) ?? agentConclusion?.plainText ?? '',
      conclusionSource: input.conclusionSource ?? modelTrace?.conclusionSource ?? 'none',
      agentConclusion: agentConclusion ?? null,
      modelTrace: modelTrace ?? null,
      reportState: run.reportState ?? 'hidden',
      createdAt,
      updatedAt,
      startedAt: optionalString(run.startedAt) ?? null,
      completedAt: optionalString(run.completedAt) ?? null,
      elapsedMs: run.elapsedMs ?? null,
      errorMessage: optionalString(run.errorMessage) ?? null,
    });
  },

  fromRunStartedInput(input: RunStartedViewModelInput): RunViewModel {
    const id = requireString(input.id, 'id');
    const sessionId = requireString(input.sessionId, 'sessionId');
    const createdAt = optionalString(input.createdAt) ?? optionalString(input.updatedAt) ?? new Date().toISOString();
    const updatedAt = optionalString(input.updatedAt) ?? createdAt;

    return createRunViewModel({
      id,
      sessionId,
      clientRunId: optionalString(input.clientRunId) ?? null,
      displayRunId: optionalString(input.displayRunId) ?? id,
      mode: input.mode,
      status: mapRunStatus(input.status),
      intent: input.intent ?? 'unknown',
      prompt: input.prompt ?? '',
      plan: input.plan ?? null,
      dataSource: input.dataSource ?? null,
      steps: input.steps ?? [],
      toolInvocations: input.toolInvocations ?? [],
      sources: input.sources ?? [],
      chartData: input.chartData ?? null,
      conclusion: getTrimmedString(input.conclusion) ?? input.agentConclusion?.plainText ?? '',
      conclusionSource: input.conclusionSource ?? input.modelTrace?.conclusionSource ?? 'none',
      agentConclusion: input.agentConclusion ?? null,
      modelTrace: input.modelTrace ?? null,
      reportState: input.reportState ?? 'hidden',
      createdAt,
      updatedAt,
      startedAt: optionalString(input.startedAt) ?? null,
      completedAt: optionalString(input.completedAt) ?? null,
      elapsedMs: input.elapsedMs ?? null,
      errorMessage: optionalString(input.errorMessage) ?? null,
    });
  },

  fromPendingAgentRun(input: PendingAgentRunInput): RunViewModel {
    const timestamp = input.timestamp ?? new Date().toISOString();
    const id = requireString(input.runId, 'runId');

    return createRunViewModel({
      id,
      clientRunId: id,
      sessionId: requireString(input.sessionId, 'sessionId'),
      displayRunId: id,
      mode: 'agent',
      status: 'running',
      intent: 'unknown',
      prompt: input.prompt,
      plan: {
        intent: 'unknown',
        shouldUseDataAnalysis: false,
        reason: '正在等待 Agent Planner 判断任务类型',
      },
      dataSource: createCloudBaseAgentDataSource(),
      steps: createPendingAgentSteps(timestamp),
      toolInvocations: [],
      sources: [],
      chartData: null,
      conclusion: '',
      conclusionSource: 'none',
      agentConclusion: null,
      modelTrace: null,
      reportState: 'hidden',
      createdAt: timestamp,
      updatedAt: timestamp,
      startedAt: timestamp,
      completedAt: null,
      elapsedMs: null,
      errorMessage: null,
    });
  },

  fromMockRun(input: MockRunInput): RunViewModel {
    const timestamp = input.timestamp ?? new Date().toISOString();
    const id = requireString(input.runId, 'runId');

    return createRunViewModel({
      id,
      clientRunId: null,
      sessionId: requireString(input.sessionId, 'sessionId'),
      displayRunId: id,
      mode: 'mock',
      status: 'running',
      intent: 'data_analysis',
      prompt: input.prompt,
      plan: input.plan,
      dataSource: input.dataSource,
      steps: input.steps,
      toolInvocations: [],
      sources: input.sources ?? [],
      chartData: null,
      conclusion: '',
      conclusionSource: 'mock',
      agentConclusion: null,
      modelTrace: input.modelTrace ?? null,
      reportState: 'hidden',
      createdAt: timestamp,
      updatedAt: timestamp,
      startedAt: timestamp,
      completedAt: null,
      elapsedMs: null,
      errorMessage: null,
    });
  },

  fromDemoSeedAdapter(input: DemoSeedRunAdapterInput): RunViewModel {
    const id = requireString(input.id, 'id');
    const createdAt = optionalString(input.createdAt) ?? input.fallbackCreatedAt;
    const updatedAt = optionalString(input.updatedAt) ?? input.fallbackUpdatedAt;

    return createRunViewModel({
      id,
      sessionId: requireString(input.sessionId, 'sessionId'),
      clientRunId: optionalString(input.clientRunId) ?? null,
      displayRunId: optionalString(input.displayRunId) ?? id,
      mode: input.mode ?? 'mock',
      status: mapRunStatus(input.status ?? 'success'),
      intent: input.intent ?? 'unknown',
      prompt: input.prompt ?? input.fallbackPrompt,
      plan: input.plan ?? null,
      dataSource: input.dataSource ?? null,
      steps: input.steps ?? [],
      toolInvocations: input.toolInvocations ?? [],
      sources: input.sources ?? [],
      chartData: input.chartData ?? null,
      conclusion: getTrimmedString(input.conclusion) ?? input.agentConclusion?.plainText ?? '',
      conclusionSource: input.conclusionSource ?? input.modelTrace?.conclusionSource ?? 'none',
      agentConclusion: input.agentConclusion ?? null,
      modelTrace: input.modelTrace ?? null,
      reportState: input.reportState ?? 'skipped',
      createdAt,
      updatedAt,
      startedAt: optionalString(input.startedAt) ?? null,
      completedAt: optionalString(input.completedAt) ?? null,
      elapsedMs: input.elapsedMs ?? null,
      errorMessage: optionalString(input.errorMessage) ?? null,
    });
  },

  fromRestoredRunAdapter(input: RestoredRunAdapterInput): RunViewModel {
    const id = requireString(input.id, 'id');

    return createRunViewModel({
      id,
      sessionId: requireString(input.sessionId, 'sessionId'),
      clientRunId: optionalString(input.clientRunId) ?? null,
      displayRunId: optionalString(input.displayRunId) ?? id,
      mode: input.mode,
      status: input.status,
      intent: input.intent,
      prompt: input.prompt,
      plan: input.plan ?? null,
      dataSource: input.dataSource ?? null,
      steps: input.steps ?? [],
      toolInvocations: input.toolInvocations ?? [],
      sources: input.sources ?? [],
      chartData: input.chartData ?? null,
      conclusion: input.conclusion,
      conclusionSource: input.conclusionSource,
      agentConclusion: input.agentConclusion ?? null,
      modelTrace: input.modelTrace ?? null,
      reportState: input.reportState,
      createdAt: input.createdAt,
      updatedAt: input.updatedAt,
      startedAt: optionalString(input.startedAt) ?? null,
      completedAt: optionalString(input.completedAt) ?? null,
      elapsedMs: input.elapsedMs ?? null,
      errorMessage: optionalString(input.errorMessage) ?? null,
    });
  },
};
