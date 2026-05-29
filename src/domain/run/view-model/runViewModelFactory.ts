import type { AgentConclusion, ModelTrace, RunSnapshot } from '../../../../contracts/generated/workbench-contract';
import type { RunSource } from '../../../types/rag';
import type {
  RunViewModel,
  RunViewModelAgentConclusion,
  RunViewModelChartData,
  RunViewModelConclusionSource,
  RunViewModelDataSourceSnapshot,
  RunViewModelIntent,
  RunViewModelMode,
  RunViewModelPlanSnapshot,
  RunViewModelReportState,
  RunViewModelStatus,
  RunViewModelStep,
  RunViewModelToolInvocation,
  RunViewModelTrace,
} from './types';

type RunStatusInput = RunViewModelStatus | RunSnapshot['status'];

interface RunViewModelCreateInput {
  id: string;
  conversationId?: string | null;
  clientRunId?: string | null;
  sessionId?: string | null;
  displayRunId?: string | null;
  mode?: RunViewModelMode | null;
  status?: RunStatusInput | null;
  intent?: RunViewModelIntent | null;
  prompt?: string | null;
  plan?: RunViewModelPlanSnapshot;
  dataSource?: RunViewModelDataSourceSnapshot;
  steps?: RunViewModelStep[];
  toolInvocations?: RunViewModelToolInvocation[];
  sources?: RunSource[];
  chartData?: RunViewModelChartData;
  conclusion?: string | null;
  conclusionSource?: RunViewModelConclusionSource | null;
  agentConclusion?: AgentConclusion | RunViewModelAgentConclusion | null;
  modelTrace?: ModelTrace | RunViewModelTrace | null;
  reportState?: RunViewModelReportState | string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  elapsedMs?: number | null;
  errorMessage?: string | null;
}

interface CanonicalRunOptions {
  sessionId?: string | null;
  displayRunId?: string | null;
  steps?: RunViewModelStep[];
  toolInvocations?: RunViewModelToolInvocation[];
  sources?: RunSource[];
  conclusion?: string | null;
  conclusionSource?: RunViewModelConclusionSource | null;
  agentConclusion?: AgentConclusion | RunViewModelAgentConclusion | null;
  modelTrace?: ModelTrace | RunViewModelTrace | null;
}

interface RunStartedPayloadContext {
  runId?: string | null;
  clientRunId?: string | null;
  conversationId?: string | null;
  timestamp?: string | null;
}

interface PendingAgentRunInput {
  runId: string;
  prompt: string;
  sessionId: string;
  timestamp?: string;
}

interface MockRunInput {
  runId: string;
  prompt: string;
  sessionId: string;
  plan: RunViewModelPlanSnapshot;
  dataSource: RunViewModelDataSourceSnapshot;
  steps: RunViewModelStep[];
  sources?: RunSource[];
  modelTrace?: RunViewModelTrace;
  timestamp?: string;
}

interface DemoSeedRunInput {
  run: Partial<RunViewModel> & { id: string };
  sessionId: string;
  fallbackPrompt: string;
  createdAt: string;
  updatedAt: string;
}

interface PersistenceRestoreInput {
  run: Partial<RunViewModel> & { id: string };
  sessionId: string;
  clientRunId?: string | null;
  displayRunId?: string | null;
  toolInvocations?: RunViewModelToolInvocation[];
  sources?: RunSource[];
  conclusion?: string | null;
  conclusionSource?: RunViewModelConclusionSource | null;
  agentConclusion?: RunViewModelAgentConclusion | null;
  modelTrace?: ModelTrace | RunViewModelTrace | null;
  reportState?: RunViewModelReportState | null;
}

function getTrimmedString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function getRequiredString(value: string | null | undefined, fieldName: string): string {
  const normalizedValue = getTrimmedString(value);

  if (!normalizedValue) {
    throw new Error(`RunViewModelFactory requires ${fieldName}.`);
  }

  return normalizedValue;
}

function getSessionId(input: RunViewModelCreateInput): string {
  const explicitSessionId = getTrimmedString(input.sessionId);

  if (explicitSessionId) {
    return explicitSessionId;
  }

  const conversationId = getTrimmedString(input.conversationId);

  if (conversationId) {
    return conversationId;
  }

  throw new Error('RunViewModelFactory requires sessionId or conversationId.');
}

function getDisplayRunId(input: RunViewModelCreateInput): string {
  const displayRunId = getTrimmedString(input.displayRunId);

  if (displayRunId) {
    return displayRunId;
  }

  return input.id;
}

function getCreatedAt(input: RunViewModelCreateInput, timestamp: string): string {
  return getTrimmedString(input.createdAt) ?? timestamp;
}

function getUpdatedAt(input: RunViewModelCreateInput, createdAt: string): string {
  return getTrimmedString(input.updatedAt) ?? createdAt;
}

function mapRunStatus(status: RunStatusInput | null | undefined): RunViewModelStatus {
  if (status === 'completed' || status === 'success') {
    return 'success';
  }

  if (status === 'failed' || status === 'error') {
    return 'error';
  }

  if (status === 'stopped') {
    return 'stopped';
  }

  if (status === 'pending') {
    return 'pending';
  }

  if (status === 'idle') {
    return 'idle';
  }

  return 'running';
}

function normalizeMode(value: RunViewModelMode | null | undefined): RunViewModelMode {
  return value === 'mock' ? 'mock' : 'agent';
}

function normalizeIntent(value: RunViewModelIntent | null | undefined): RunViewModelIntent {
  if (
    value === 'capability_intro' ||
    value === 'data_analysis' ||
    value === 'knowledge_qa' ||
    value === 'unsupported' ||
    value === 'unknown'
  ) {
    return value;
  }

  return 'unknown';
}

function normalizeConclusionSource(
  value: RunViewModelConclusionSource | null | undefined,
): RunViewModelConclusionSource {
  if (value === 'model' || value === 'fallback' || value === 'mock' || value === 'none') {
    return value;
  }

  return 'none';
}

function normalizeReportState(value: RunViewModelReportState | string | null | undefined): RunViewModelReportState {
  if (value === 'not_applicable') {
    return 'hidden';
  }

  if (value === 'available') {
    return 'pending';
  }

  if (
    value === 'hidden' ||
    value === 'pending' ||
    value === 'generating' ||
    value === 'generated' ||
    value === 'skipped' ||
    value === 'failed'
  ) {
    return value;
  }

  return 'hidden';
}

function getElapsedMs(value: number | null | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function toRunViewModelAgentConclusion(
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

function toRunViewModelTrace(value: ModelTrace | RunViewModelTrace | null | undefined): RunViewModelTrace | undefined {
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

function cloneArray<T extends object>(value: T[] | undefined): T[] {
  return Array.isArray(value) ? value.map((item) => ({ ...item })) : [];
}

function createRunViewModel(input: RunViewModelCreateInput): RunViewModel {
  const timestamp = new Date().toISOString();
  const id = getRequiredString(input.id, 'id');
  const createdAt = getCreatedAt(input, timestamp);
  const modelTrace = toRunViewModelTrace(input.modelTrace);
  const agentConclusion = toRunViewModelAgentConclusion(input.agentConclusion);
  const conclusion = getTrimmedString(input.conclusion) ?? agentConclusion?.plainText ?? '';
  const conclusionSource = normalizeConclusionSource(input.conclusionSource ?? modelTrace?.conclusionSource);
  const clientRunId = getTrimmedString(input.clientRunId);
  const completedAt = getTrimmedString(input.completedAt);
  const errorMessage = getTrimmedString(input.errorMessage);

  return {
    id,
    ...(clientRunId ? { clientRunId } : {}),
    sessionId: getSessionId(input),
    displayRunId: getDisplayRunId({ ...input, id }),
    mode: normalizeMode(input.mode),
    status: mapRunStatus(input.status),
    intent: normalizeIntent(input.intent),
    prompt: input.prompt ?? '',
    ...(input.plan ? { plan: input.plan } : {}),
    ...(input.dataSource ? { dataSource: input.dataSource } : {}),
    steps: cloneArray(input.steps),
    toolInvocations: cloneArray(input.toolInvocations),
    sources: cloneArray(input.sources),
    ...(input.chartData ? { chartData: input.chartData } : {}),
    conclusion,
    conclusionSource,
    ...(agentConclusion ? { agentConclusion } : {}),
    ...(modelTrace ? { modelTrace } : {}),
    reportState: normalizeReportState(input.reportState),
    createdAt,
    updatedAt: getUpdatedAt(input, createdAt),
    ...(input.startedAt ? { startedAt: input.startedAt } : {}),
    ...(completedAt ? { completedAt } : {}),
    ...(getElapsedMs(input.elapsedMs) !== undefined ? { elapsedMs: getElapsedMs(input.elapsedMs) } : {}),
    ...(errorMessage ? { errorMessage } : {}),
  };
}

function createCloudBaseAgentDataSource(): RunViewModelDataSourceSnapshot {
  return {
    provider: 'cloudbase_mysql',
    name: '教学质量数据源',
    typeLabel: '服务端受控数据源',
  };
}

export const RunViewModelFactory = {
  fromCanonicalRun(run: RunSnapshot, options: CanonicalRunOptions = {}): RunViewModel {
    const agentConclusion = options.agentConclusion ?? run.agentConclusion;
    const modelTrace = options.modelTrace ?? run.modelTrace;

    return createRunViewModel({
      id: run.id,
      conversationId: run.conversationId,
      clientRunId: run.clientRunId,
      sessionId: options.sessionId,
      displayRunId: options.displayRunId,
      mode: run.mode,
      status: run.status,
      intent: run.intent,
      prompt: run.prompt,
      plan: run.plan as RunViewModelPlanSnapshot | undefined,
      dataSource: run.dataSource as RunViewModelDataSourceSnapshot | undefined,
      chartData: run.chartData as RunViewModelChartData | undefined,
      conclusion: options.conclusion,
      conclusionSource: options.conclusionSource,
      agentConclusion,
      modelTrace,
      reportState: run.reportState,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      elapsedMs: run.elapsedMs,
      errorMessage: run.errorMessage,
      steps: options.steps,
      toolInvocations: options.toolInvocations,
      sources: options.sources,
    });
  },

  fromRunStartedPayload(
    run: Partial<RunViewModel> & { id: string; conversationId?: string | null; status?: RunStatusInput | null },
    context: RunStartedPayloadContext = {},
  ): RunViewModel {
    const rawRun = run as Partial<RunViewModel> & {
      id: string;
      conversationId?: string | null;
      status?: RunStatusInput | null;
    };
    const runId = getTrimmedString(context.runId) ?? rawRun.id;

    return createRunViewModel({
      ...rawRun,
      id: runId,
      conversationId: context.conversationId ?? rawRun.conversationId,
      clientRunId: context.clientRunId ?? rawRun.clientRunId,
      updatedAt: rawRun.updatedAt ?? context.timestamp,
      createdAt: rawRun.createdAt ?? context.timestamp,
    });
  },

  fromPendingAgentRun(params: PendingAgentRunInput): RunViewModel {
    const timestamp = params.timestamp ?? new Date().toISOString();

    return createRunViewModel({
      id: params.runId,
      clientRunId: params.runId,
      sessionId: params.sessionId,
      displayRunId: params.runId,
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
      conclusion: '',
      conclusionSource: 'none',
      reportState: 'hidden',
      createdAt: timestamp,
      updatedAt: timestamp,
      startedAt: timestamp,
    });
  },

  fromMockRun(params: MockRunInput): RunViewModel {
    const timestamp = params.timestamp ?? new Date().toISOString();

    return createRunViewModel({
      id: params.runId,
      sessionId: params.sessionId,
      displayRunId: params.runId,
      mode: 'mock',
      status: 'running',
      intent: 'data_analysis',
      prompt: params.prompt,
      plan: params.plan,
      dataSource: params.dataSource,
      steps: params.steps,
      sources: params.sources,
      conclusion: '',
      conclusionSource: 'mock',
      modelTrace: params.modelTrace,
      reportState: 'hidden',
      createdAt: timestamp,
      updatedAt: timestamp,
      startedAt: timestamp,
    });
  },

  fromDemoSeed(params: DemoSeedRunInput): RunViewModel {
    const run = params.run;

    return createRunViewModel({
      ...run,
      id: run.id,
      sessionId: params.sessionId,
      mode: run.mode ?? 'mock',
      status: run.status ?? 'success',
      intent: run.intent ?? 'unknown',
      prompt: run.prompt ?? params.fallbackPrompt,
      conclusion: run.conclusion,
      conclusionSource: run.conclusionSource ?? run.modelTrace?.conclusionSource,
      reportState: run.reportState ?? 'skipped',
      createdAt: run.createdAt ?? params.createdAt,
      updatedAt: run.updatedAt ?? params.updatedAt,
    });
  },

  fromPersistenceRestore(params: PersistenceRestoreInput): RunViewModel {
    const run = params.run;

    return createRunViewModel({
      ...run,
      id: run.id,
      sessionId: params.sessionId,
      clientRunId: params.clientRunId ?? run.clientRunId,
      displayRunId: params.displayRunId ?? run.displayRunId,
      toolInvocations: params.toolInvocations ?? run.toolInvocations,
      sources: params.sources ?? run.sources,
      conclusion: params.conclusion ?? run.conclusion,
      conclusionSource: params.conclusionSource ?? run.conclusionSource,
      agentConclusion: params.agentConclusion ?? run.agentConclusion,
      modelTrace: params.modelTrace ?? run.modelTrace,
      reportState: params.reportState ?? run.reportState,
    });
  },
};
