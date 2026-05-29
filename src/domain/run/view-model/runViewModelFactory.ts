import type { AgentConclusion, ModelTrace } from '../../../../contracts/generated/workbench-contract';
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
  RunViewModelCreateInput,
  RunViewModelFactoryStatusInput,
} from './runViewModelFactoryInputs';
import type {
  RunViewModel,
  RunViewModelAgentConclusion,
  RunViewModelDataSource,
  RunViewModelStatus,
  RunViewModelStep,
  RunViewModelTrace,
} from './types';

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

function copyArray<T extends object>(value: T[] | undefined): T[] {
  return value ? value.map((item) => ({ ...item })) : [];
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
  create(input: RunViewModelCreateInput): RunViewModel {
    const timestamp = new Date().toISOString();
    const id = requireString(input.id, 'id');
    const sessionId = requireString(input.sessionId, 'sessionId');
    const createdAt = optionalString(input.createdAt) ?? timestamp;
    const updatedAt = optionalString(input.updatedAt) ?? createdAt;
    const modelTrace = copyModelTrace(input.modelTrace);
    const agentConclusion = copyAgentConclusion(input.agentConclusion);
    const conclusion = getTrimmedString(input.conclusion) ?? agentConclusion?.plainText ?? '';
    const conclusionSource = input.conclusionSource ?? modelTrace?.conclusionSource ?? 'none';
    const elapsedMs = getElapsedMs(input.elapsedMs);

    return {
      id,
      ...(optionalString(input.clientRunId) ? { clientRunId: optionalString(input.clientRunId) } : {}),
      sessionId,
      displayRunId: optionalString(input.displayRunId) ?? id,
      mode: input.mode,
      status: mapRunStatus(input.status),
      intent: input.intent,
      prompt: input.prompt,
      ...(input.plan ? { plan: input.plan } : {}),
      ...(input.dataSource ? { dataSource: input.dataSource } : {}),
      steps: copyArray(input.steps),
      toolInvocations: copyArray(input.toolInvocations),
      sources: copyArray(input.sources),
      ...(input.chartData ? { chartData: input.chartData } : {}),
      conclusion,
      conclusionSource,
      ...(agentConclusion ? { agentConclusion } : {}),
      ...(modelTrace ? { modelTrace } : {}),
      reportState: input.reportState ?? 'hidden',
      createdAt,
      updatedAt,
      ...(optionalString(input.startedAt) ? { startedAt: optionalString(input.startedAt) } : {}),
      ...(optionalString(input.completedAt) ? { completedAt: optionalString(input.completedAt) } : {}),
      ...(elapsedMs !== undefined ? { elapsedMs } : {}),
      ...(optionalString(input.errorMessage) ? { errorMessage: optionalString(input.errorMessage) } : {}),
    };
  },

  fromCanonicalRun(input: CanonicalRunViewModelInput): RunViewModel {
    const run = input.run;
    const agentConclusion = input.agentConclusion ?? run.agentConclusion;
    const modelTrace = input.modelTrace ?? run.modelTrace;

    return this.create({
      id: run.id,
      sessionId: input.sessionId,
      clientRunId: run.clientRunId,
      displayRunId: input.displayRunId,
      mode: run.mode,
      status: run.status,
      intent: run.intent ?? 'unknown',
      prompt: run.prompt ?? '',
      plan: mapCanonicalRunPlan(run.plan),
      dataSource: mapCanonicalRunDataSource(run.dataSource),
      chartData: mapCanonicalRunChartData(run.chartData),
      conclusion: input.conclusion,
      conclusionSource: input.conclusionSource,
      agentConclusion,
      modelTrace,
      reportState: run.reportState,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      elapsedMs: run.elapsedMs,
      errorMessage: run.errorMessage,
      steps: input.steps,
      toolInvocations: input.toolInvocations,
      sources: input.sources,
    });
  },

  fromRunStartedInput(input: RunStartedViewModelInput): RunViewModel {
    return this.create({
      id: input.id,
      sessionId: input.sessionId,
      clientRunId: input.clientRunId,
      displayRunId: input.displayRunId,
      mode: input.mode,
      status: input.status,
      intent: input.intent ?? 'unknown',
      prompt: input.prompt ?? '',
      plan: input.plan,
      dataSource: input.dataSource,
      steps: input.steps,
      toolInvocations: input.toolInvocations,
      sources: input.sources,
      chartData: input.chartData,
      conclusion: input.conclusion,
      conclusionSource: input.conclusionSource,
      agentConclusion: input.agentConclusion,
      modelTrace: input.modelTrace,
      reportState: input.reportState,
      createdAt: input.createdAt,
      updatedAt: input.updatedAt,
      startedAt: input.startedAt,
      completedAt: input.completedAt,
      elapsedMs: input.elapsedMs,
      errorMessage: input.errorMessage,
    });
  },

  fromPendingAgentRun(input: PendingAgentRunInput): RunViewModel {
    const timestamp = input.timestamp ?? new Date().toISOString();

    return this.create({
      id: input.runId,
      clientRunId: input.runId,
      sessionId: input.sessionId,
      displayRunId: input.runId,
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
      conclusion: '',
      conclusionSource: 'none',
      reportState: 'hidden',
      createdAt: timestamp,
      updatedAt: timestamp,
      startedAt: timestamp,
    });
  },

  fromMockRun(input: MockRunInput): RunViewModel {
    const timestamp = input.timestamp ?? new Date().toISOString();

    return this.create({
      id: input.runId,
      sessionId: input.sessionId,
      displayRunId: input.runId,
      mode: 'mock',
      status: 'running',
      intent: 'data_analysis',
      prompt: input.prompt,
      plan: input.plan,
      dataSource: input.dataSource,
      steps: input.steps,
      sources: input.sources,
      conclusion: '',
      conclusionSource: 'mock',
      modelTrace: input.modelTrace,
      reportState: 'hidden',
      createdAt: timestamp,
      updatedAt: timestamp,
      startedAt: timestamp,
    });
  },

  fromDemoSeedAdapter(input: DemoSeedRunAdapterInput): RunViewModel {
    return this.create({
      id: input.id,
      sessionId: input.sessionId,
      clientRunId: input.clientRunId,
      displayRunId: input.displayRunId,
      mode: input.mode ?? 'mock',
      status: input.status ?? 'success',
      intent: input.intent ?? 'unknown',
      prompt: input.prompt ?? input.fallbackPrompt,
      plan: input.plan,
      dataSource: input.dataSource,
      steps: input.steps,
      toolInvocations: input.toolInvocations,
      sources: input.sources,
      chartData: input.chartData,
      conclusion: input.conclusion,
      conclusionSource: input.conclusionSource ?? input.modelTrace?.conclusionSource,
      agentConclusion: input.agentConclusion,
      modelTrace: input.modelTrace,
      reportState: input.reportState ?? 'skipped',
      createdAt: input.createdAt ?? input.fallbackCreatedAt,
      updatedAt: input.updatedAt ?? input.fallbackUpdatedAt,
      startedAt: input.startedAt,
      completedAt: input.completedAt,
      elapsedMs: input.elapsedMs,
      errorMessage: input.errorMessage,
    });
  },

  fromRestoredRunAdapter(input: RestoredRunAdapterInput): RunViewModel {
    return this.create(input);
  },
};
