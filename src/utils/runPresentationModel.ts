import type { RunEvent } from '@/domain/run/boundary';
import type {
  RunViewModel,
  RunViewModelReportState,
  RunViewModelStatus,
  RunViewModelStepStatus,
  RunViewModelToolStatus,
} from '@/domain/run/view-model';
import type { GenerationStatus, WorkbenchMessage, WorkbenchSession } from '@/types/workbench';
import { getChartPointCount, getChartValueExtent, isValidRunChartData } from './chartData';
import type { ModelTraceViewModel } from './modelTraceViewModel';
import { createModelTraceViewModel } from './modelTraceViewModel';
import {
  getReportStatusDescription,
  getReportStatusLabel,
  getReportStatusTone,
  getRunReuseNotice,
} from './observabilityLabels';
import { createRagSourcesView, type RagSourceView } from './ragSourcesViewModel';
import { shouldShowReportConfirm } from './run';
import {
  createRunDataSourceViewModel,
  formatRunElapsed,
  getConclusionSourceLabel,
  getLatestRunReusedEventForRun,
  getRunIntentLabel,
  getRunStatusLabel,
  getRunStatusTone,
  getRunTitle,
  getStepStatusLabel,
} from './runViewModel';
import { createConclusionViewModel, type ConclusionSectionView } from './runConclusionViewModel';
import { formatToolInvocationForInspector } from './toolInvocationFormat';
import {
  LONG_MESSAGE_CHARACTER_THRESHOLD,
  LONG_MESSAGE_LINE_THRESHOLD,
  LONG_MESSAGE_PREVIEW_LENGTH,
} from './messageTimelineViewModel';

export type RunPanelState = 'empty' | 'loading' | 'error' | 'ready';
export type RunStatusTone = ReturnType<typeof getRunStatusTone>;

export interface RunOverviewItem {
  label: string;
  value: string;
  wide?: boolean;
}

export interface RunOverviewPanelModel {
  state: RunPanelState;
  title: string;
  description: string;
  emptyTitle: string;
  emptyDescription: string;
  errorMessage: string | null;
  retryLabel: string;
  statusLabel: string;
  statusTone: RunStatusTone;
  items: RunOverviewItem[];
}

export interface RunStepPresentationItem {
  id: string;
  title: string;
  statusLabel: string;
  statusClass: string;
  markerStatusClass: string;
  icon: 'stepDone' | 'stepCurrent' | 'alert' | 'stepPending';
  isRunning: boolean;
  description: string;
  isLongDescription: boolean;
  elapsedText: string;
}

export interface RunStepsPanelModel {
  state: RunPanelState;
  title: string;
  description: string;
  emptyTitle: string;
  emptyDescription: string;
  errorTitle: string;
  errorMessage: string | null;
  loadingTitle: string;
  loadingDescription: string;
  retryLabel: string;
  steps: RunStepPresentationItem[];
}

export interface RunToolPresentationItem {
  id: string;
  displayName: string;
  categoryLabel: string;
  toolName: string;
  inputText: string;
  outputText: string;
  failureText: string;
  statusLabel: string;
  statusClass: string;
  elapsedText: string;
}

export interface RunToolsPanelModel {
  state: RunPanelState;
  title: string;
  description: string;
  countLabel: string | null;
  emptyTitle: string;
  emptyDescription: string;
  tools: RunToolPresentationItem[];
}

export interface RunSourcesPanelModel {
  state: RunPanelState;
  title: string;
  description: string;
  countLabel: string | null;
  emptyTitle: string;
  emptyDescription: string;
  loadingTitle: string;
  loadingDescription: string;
  errorTitle: string;
  errorMessage: string | null;
  retryLabel: string;
  canRetry: boolean;
  actionRunId: string | null;
  items: RagSourceView[];
}

export interface RunReportPanelModel {
  state: RunPanelState;
  title: string;
  description: string;
  emptyTitle: string;
  emptyDescription: string;
  badgeLabel: string;
  badgeClassName: string;
  statusDescription: string;
  canGenerateReport: boolean;
  runId: string | null;
  generateLabel: string;
  confirmGenerateLabel: string;
  skipLabel: string;
}

export interface RunConclusionPanelModel {
  state: RunPanelState;
  title: string;
  description: string;
  emptyTitle: string;
  emptyDescription: string;
  badges: Array<{
    label: string;
    className: string;
  }>;
  notice: string | null;
  text: string;
  previewText: string;
  shouldCollapseByDefault: boolean;
  compactSections: ConclusionSectionView[];
  shouldShowCompactSections: boolean;
  updatedText: string;
  contentKey: string;
}

export interface RunDataSourcePanelModel {
  state: RunPanelState;
  hasRun: boolean;
  title: string;
  description: string;
  emptyTitle: string;
  emptyDescription: string;
  statusLabel: string;
  statusTone: RunStatusTone;
  name: string;
  subtitle: string;
  metaItems: Array<{
    label: string;
    value: string;
  }>;
}

export interface RunAnalyticsPanelModel {
  state: RunPanelState;
  title: string;
  description: string;
  emptyTitle: string;
  emptyDescription: string;
  chartData: RunViewModel['chartData'];
  pointCount: number;
  maxValueText: string;
  minValueText: string;
  chartTypeLabel: string;
  seriesCountLabel: string;
  summary: string | null;
}

export interface WorkbenchHeaderRunModel {
  statusLabel: string;
  statusTone: RunStatusTone;
  summaryItems: string[];
}

export interface RunStreamingAssistantModel {
  content: string;
}

export interface RunErrorBlockModel {
  message: string;
}

export interface RunStoppedBlockModel {
  message: string;
}

export interface ChatInputRunModel {
  isGenerating: boolean;
}

function getRunPromptText(prompt: string): string {
  const normalizedPrompt = prompt.replace(/\s+/g, ' ').trim();
  return normalizedPrompt || '历史 Run 未记录本轮问题';
}

function getAssistantRunIds(messages: WorkbenchMessage[]): string[] {
  const runIds: string[] = [];

  for (const message of messages) {
    if (message.role !== 'assistant' || message.kind !== 'normal' || !message.runId) {
      continue;
    }

    if (!runIds.includes(message.runId)) {
      runIds.push(message.runId);
    }
  }

  return runIds;
}

function getRunRoundLabel(runId: string, messages: WorkbenchMessage[]): string {
  const runIds = getAssistantRunIds(messages);
  const runIndex = runIds.indexOf(runId);

  if (runIndex < 0) {
    return runIds.length > 0 ? `未匹配消息 / 共 ${runIds.length} 轮` : '未匹配消息';
  }

  return `第 ${runIndex + 1} 轮 / 共 ${runIds.length} 轮`;
}

function getVisibleRunModeLabel(mode: RunViewModel['mode']): string {
  return mode === 'mock' ? '模拟模式（Mock）' : '真实 Agent';
}

function getModelTraceItems(modelTraceView: ModelTraceViewModel | null): RunOverviewItem[] {
  if (!modelTraceView) {
    return [];
  }

  return [
    { label: 'selectedModelId', value: modelTraceView.selectedModelIdLabel },
    { label: 'Provider', value: modelTraceView.providerLabel },
    { label: 'Model', value: modelTraceView.modelLabel },
    { label: '模型耗时', value: modelTraceView.latencyLabel },
    { label: 'Token 可用性', value: modelTraceView.usageStatus, wide: modelTraceView.usageStatus.length > 14 },
    { label: 'Token 来源', value: modelTraceView.usageSourceLabel },
    { label: 'Prompt Tokens', value: modelTraceView.promptTokensLabel },
    { label: 'Completion Tokens', value: modelTraceView.completionTokensLabel },
    { label: 'Total Tokens', value: modelTraceView.totalTokensLabel },
    {
      label: 'Token 不可用原因',
      value: modelTraceView.usageUnavailableReasonLabel,
      wide: modelTraceView.usageUnavailableReasonLabel !== '-',
    },
    { label: 'Cost 状态', value: modelTraceView.costEstimateStatusLabel, wide: true },
    { label: 'Estimated Cost', value: modelTraceView.estimatedCostLabel },
    { label: 'Currency', value: modelTraceView.costCurrencyLabel },
    { label: 'Pricing Unit', value: modelTraceView.pricingUnitLabel },
    { label: 'Pricing Source', value: modelTraceView.pricingSourceLabel },
    {
      label: 'Cost 不可用原因',
      value: modelTraceView.costUnavailableReasonLabel,
      wide: modelTraceView.costUnavailableReasonLabel !== '-',
    },
    { label: 'Fallback', value: modelTraceView.fallbackReasonLabel },
    { label: '模型错误', value: modelTraceView.modelErrorTypeLabel },
  ];
}

function getStepClass(status: RunViewModelStepStatus): string {
  if (status === 'success') return 'done';
  if (status === 'running') return 'in-progress';
  if (status === 'error') return 'error';
  if (status === 'stopped') return 'stopped';
  return 'pending';
}

function getStepIcon(status: RunViewModelStepStatus): RunStepPresentationItem['icon'] {
  if (status === 'success') return 'stepDone';
  if (status === 'running') return 'stepCurrent';
  if (status === 'error') return 'alert';
  return 'stepPending';
}

function getToolStatusClass(status: RunViewModelToolStatus): string {
  if (status === 'success') return 'status-badge-success';
  if (status === 'running') return 'status-badge-active';
  if (status === 'error') return 'status-badge-error';
  if (status === 'stopped') return 'status-badge-stopped';
  return 'status-badge-muted';
}

function getReportStateClass(reportState: RunViewModelReportState): string {
  const tone = getReportStatusTone(reportState);

  if (tone === 'active') return 'report-status-badge report-status-badge-pending';
  if (tone === 'success') return 'report-status-badge report-status-badge-generated';
  if (reportState === 'skipped') return 'report-status-badge report-status-badge-skipped';
  if (tone === 'danger') return 'report-status-badge status-badge-error';
  return 'report-status-badge report-status-badge-hidden';
}

function isLongText(value: string): boolean {
  return value.length > LONG_MESSAGE_CHARACTER_THRESHOLD || value.split(/\r?\n/).length > LONG_MESSAGE_LINE_THRESHOLD;
}

function createTextPreview(value: string): string {
  if (value.length <= LONG_MESSAGE_PREVIEW_LENGTH) {
    return value;
  }

  return `${value.slice(0, LONG_MESSAGE_PREVIEW_LENGTH).trimEnd()}...`;
}

function getConclusionText(params: {
  status: RunViewModelStatus;
  compactMarkdownText: string;
  errorMessage?: string;
}): string {
  if (params.status === 'error') {
    return `执行失败：${params.errorMessage ?? '未知错误'}`;
  }

  const conclusionText = params.compactMarkdownText.trim();

  if (conclusionText) {
    return conclusionText;
  }

  if (params.status === 'running') {
    return '正在生成结论...';
  }

  if (params.status === 'stopped') {
    return '本轮已停止。';
  }

  return '暂无结论';
}

function formatMetricValue(value: number | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '-';
  }

  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function getAnalyticsEmptyTitle(status: RunViewModelStatus): string {
  if (status === 'running') return '等待数据分析结果';
  if (status === 'stopped') return '本轮已停止，未生成图表';
  if (status === 'error') return '本轮执行异常，未生成图表';
  return '暂无分析结果';
}

function getAnalyticsEmptyDescription(status: RunViewModelStatus, isDataAnalysisRun: boolean): string {
  if (status === 'running') return '等待数据分析结果...';
  if (status === 'stopped') return '当前 Run 已停止，未产出可展示的图表数据。';
  if (status === 'error') return '当前 Run 执行异常，未产出可展示的图表数据。';
  if (isDataAnalysisRun) return '当前运行未产出可展示的图表数据。';
  return '仅数据分析类请求会生成图表和指标摘要。';
}

function getGenerationLabel(status: GenerationStatus): string {
  if (status === 'streaming') return '任务进行中';
  if (status === 'done') return '已完成';
  if (status === 'stopped') return '已停止';
  if (status === 'error') return '执行失败';
  return '待开始';
}

function getGenerationStatusTone(status: GenerationStatus): RunStatusTone {
  if (status === 'streaming') return 'active';
  if (status === 'done') return 'success';
  if (status === 'stopped') return 'warning';
  if (status === 'error') return 'danger';
  return 'muted';
}

export function createRunOverviewPanelModel(params: {
  run: RunViewModel | null;
  runEventLog: RunEvent[];
  currentSession: WorkbenchSession | null;
  isLatestRunLoading: boolean;
  latestRunError: string | null;
}): RunOverviewPanelModel {
  const { run, currentSession } = params;

  if (!run) {
    const isDraftNewChat = !currentSession;
    const isDemoSession = currentSession?.visibility === 'demo';

    return {
      state: params.isLatestRunLoading ? 'loading' : params.latestRunError ? 'error' : 'empty',
      title: 'Run 概览',
      description: '本轮 Run 的基础信息',
      emptyTitle: isDraftNewChat ? '新聊天尚未运行' : isDemoSession ? '示例会话暂无 Run Trace' : '暂无 Run',
      emptyDescription: isDraftNewChat
        ? '发送第一条消息后，这里会展示当前 Run 的状态、步骤和证据。'
        : isDemoSession
          ? '该示例会话没有提供预置 Run 信息时，右侧保持只读空态。'
          : '完成一次 Agent Run 后，这里会展示执行过程。',
      errorMessage: params.latestRunError,
      retryLabel: '重试',
      statusLabel: '-',
      statusTone: 'muted',
      items: [],
    };
  }

  const modelTraceView = createModelTraceViewModel(run.modelTrace);
  const reuseNotice = getRunReuseNotice(getLatestRunReusedEventForRun(run, params.runEventLog));
  const conclusionSourceLabel = modelTraceView ? modelTraceView.conclusionSourceLabel : getConclusionSourceLabel(run.conclusionSource);

  return {
    state: 'ready',
    title: 'Run 概览',
    description: getRunTitle(run),
    emptyTitle: '',
    emptyDescription: '',
    errorMessage: null,
    retryLabel: '重试',
    statusLabel: getRunStatusLabel(run.status),
    statusTone: getRunStatusTone(run.status),
    items: [
      { label: '本轮问题', value: getRunPromptText(run.prompt), wide: true },
      { label: 'Run ID', value: run.id },
      ...(reuseNotice ? [{ label: '复用状态', value: reuseNotice, wide: true }] : []),
      { label: '轮次', value: getRunRoundLabel(run.id, currentSession?.messages ?? []) },
      { label: '模式', value: getVisibleRunModeLabel(run.mode) },
      { label: '任务类型', value: getRunIntentLabel(run.intent) },
      { label: '耗时', value: formatRunElapsed(run) },
      { label: '结论来源', value: conclusionSourceLabel },
      ...getModelTraceItems(modelTraceView),
    ],
  };
}

export function createRunStepsPanelModel(params: {
  run: RunViewModel | null;
  isLoading: boolean;
  errorMessage: string | null;
}): RunStepsPanelModel {
  const steps = params.run
    ? params.run.steps.map((step) => ({
        id: step.id,
        title: step.title,
        statusLabel: getStepStatusLabel(step.status),
        statusClass: getStepClass(step.status),
        markerStatusClass: step.status === 'skipped' ? 'pending' : step.status,
        icon: getStepIcon(step.status),
        isRunning: step.status === 'running',
        description: step.description?.trim() ?? '',
        isLongDescription: Boolean(step.description && step.description.length > 110),
        elapsedText: typeof step.elapsedMs === 'number' ? `${step.elapsedMs}ms` : '',
      }))
    : [];
  const state: RunPanelState = params.isLoading ? 'loading' : params.errorMessage ? 'error' : params.run && steps.length > 0 ? 'ready' : 'empty';

  return {
    state,
    title: '执行时间线',
    description: '本轮 Run 的步骤状态',
    emptyTitle: '暂无执行步骤',
    emptyDescription: '发送问题后，这里会展示本轮 Run 的执行时间线。',
    errorTitle: '执行时间线恢复失败',
    errorMessage: params.errorMessage,
    loadingTitle: '正在恢复执行时间线',
    loadingDescription: '正在读取 Run Events 和工具调用。',
    retryLabel: '重试',
    steps,
  };
}

export function createRunToolsPanelModel(run: RunViewModel | null): RunToolsPanelModel {
  const tools = run
    ? run.toolInvocations.map((tool) => {
        const formattedTool = formatToolInvocationForInspector(tool);

        return {
          id: tool.id,
          displayName: formattedTool.displayName,
          categoryLabel: formattedTool.categoryLabel,
          toolName: formattedTool.toolName,
          inputText: formattedTool.inputText,
          outputText: formattedTool.outputText,
          failureText: formattedTool.failureText,
          statusLabel: formattedTool.statusLabel,
          statusClass: getToolStatusClass(tool.status),
          elapsedText: formattedTool.elapsedText,
        };
      })
    : [];

  return {
    state: run ? tools.length > 0 ? 'ready' : 'empty' : 'empty',
    title: '工具调用',
    description: run ? '模型只选择工具意图，执行由服务端白名单控制' : '服务端白名单工具的本轮执行记录',
    countLabel: tools.length > 0 ? `${tools.length} 次调用` : null,
    emptyTitle: run ? '本次未调用工具' : '暂无工具调用',
    emptyDescription: run
      ? '当前请求未进入工具链，或服务端工具尚未开始执行。'
      : '发送数据分析或知识问答请求后，这里会展示受控工具调用记录。',
    tools,
  };
}

export function createRunSourcesPanelModel(params: {
  run: RunViewModel | null;
  isLoading: boolean;
  errorMessage: string | null;
}): RunSourcesPanelModel {
  const view = createRagSourcesView({
    run: params.run,
    isLoading: params.isLoading,
    errorMessage: params.errorMessage,
  });
  const isMockRun = params.run?.mode === 'mock';
  const state: RunPanelState = view.isLoading ? 'loading' : view.errorMessage ? 'error' : view.isEmpty ? 'empty' : 'ready';

  return {
    state,
    title: isMockRun ? '模拟来源' : view.title,
    description: isMockRun ? 'Mock RAG 来源，用于模拟模式验证。' : view.description,
    countLabel: view.sourceCount > 0 ? view.sourceCountLabel : null,
    emptyTitle: view.emptyTitle,
    emptyDescription: view.emptyDescription,
    loadingTitle: view.loadingMessage,
    loadingDescription: '正在恢复检索日志和来源片段。',
    errorTitle: 'RAG 来源加载失败',
    errorMessage: view.errorMessage,
    retryLabel: view.retryLabel,
    canRetry: view.canRetry,
    actionRunId: params.run?.id ?? null,
    items: isMockRun
      ? view.items.map((item) => ({
          ...item,
          sourceName: item.sourceName.replaceAll('公开演示', '模拟'),
        }))
      : view.items,
  };
}

export function createRunReportPanelModel(run: RunViewModel | null): RunReportPanelModel {
  if (!run) {
    return {
      state: 'empty',
      title: '报告',
      description: '当前 Run 的报告状态',
      emptyTitle: '暂无报告上下文',
      emptyDescription: '完成一次数据分析 Run 后，这里会显示报告是否可生成以及绑定的 Run。',
      badgeLabel: '-',
      badgeClassName: getReportStateClass('hidden'),
      statusDescription: '',
      canGenerateReport: false,
      runId: null,
      generateLabel: '生成当前 Run 报告',
      confirmGenerateLabel: '生成报告',
      skipLabel: '暂不生成',
    };
  }

  const canGenerateReport = shouldShowReportConfirm(run);

  return {
    state: 'ready',
    title: '报告',
    description: `绑定当前选中 Run：${run.id}`,
    emptyTitle: '',
    emptyDescription: '',
    badgeLabel: getReportStatusLabel(run.reportState),
    badgeClassName: getReportStateClass(run.reportState),
    statusDescription: getReportStatusDescription(run, canGenerateReport),
    canGenerateReport,
    runId: run.id,
    generateLabel: '生成当前 Run 报告',
    confirmGenerateLabel: '生成报告',
    skipLabel: '暂不生成',
  };
}

export function createRunConclusionPanelModel(run: RunViewModel | null): RunConclusionPanelModel {
  if (!run) {
    return {
      state: 'empty',
      title: '结论摘要',
      description: '选中 Run 的最终回复摘要',
      emptyTitle: '暂无结论',
      emptyDescription: 'Agent 完成本轮执行后，会在这里展示最终结论。',
      badges: [],
      notice: null,
      text: '',
      previewText: '',
      shouldCollapseByDefault: false,
      compactSections: [],
      shouldShowCompactSections: false,
      updatedText: '',
      contentKey: 'empty',
    };
  }

  const conclusionView = createConclusionViewModel(run);
  const text = getConclusionText({
    status: run.status,
    compactMarkdownText: conclusionView.compactMarkdownText,
    errorMessage: run.errorMessage,
  });
  const shouldCollapseByDefault = isLongText(text) && run.status !== 'running';
  const badges = [
    ...(run.status === 'running' ? [{ label: '生成中', className: 'conclusion-source-badge' }] : []),
    ...(run.status === 'stopped' ? [{ label: '本轮已停止', className: 'conclusion-source-badge conclusion-source-badge-stopped' }] : []),
    ...(run.status === 'error' ? [{ label: '执行失败', className: 'conclusion-source-badge conclusion-source-badge-danger' }] : []),
    ...(run.conclusionSource !== 'none'
      ? [{ label: getConclusionSourceLabel(run.conclusionSource), className: 'conclusion-source-badge' }]
      : []),
  ];

  return {
    state: 'ready',
    title: '结论摘要',
    description: '作为右侧证据链的结论备份，完整对话仍在聊天区',
    emptyTitle: '',
    emptyDescription: '',
    badges,
    notice: conclusionView.notice,
    text,
    previewText: createTextPreview(text),
    shouldCollapseByDefault,
    compactSections: conclusionView.compactSections,
    shouldShowCompactSections: run.status !== 'running' && run.status !== 'error' && conclusionView.compactSections.length > 0,
    updatedText: `更新时间：${new Date(run.updatedAt).toLocaleString('zh-CN', { hour12: false })}`,
    contentKey: `${run.id}:${run.status}:${shouldCollapseByDefault ? 'collapsed' : 'open'}`,
  };
}

export function createRunDataSourcePanelModel(run: RunViewModel | null): RunDataSourcePanelModel {
  if (!run) {
    return {
      state: 'empty',
      hasRun: false,
      title: '数据源使用',
      description: '当前 Run 是否访问受控数据上下文',
      emptyTitle: '尚未访问数据源',
      emptyDescription: '数据源是 Agent 可用的服务端上下文，不是聊天输入框；发送数据分析类请求后这里会展示使用情况。',
      statusLabel: '-',
      statusTone: 'muted',
      name: '',
      subtitle: '',
      metaItems: [],
    };
  }

  const hasDataSourceAccess = run.intent === 'data_analysis' || run.toolInvocations.length > 0;

  if (!hasDataSourceAccess) {
    return {
      state: 'empty',
      hasRun: true,
      title: '数据源使用',
      description: '本轮是否访问数据源',
      emptyTitle: run.status === 'running' ? '等待数据源决策' : '本次未访问数据源',
      emptyDescription: run.status === 'running' ? 'Planner 正在判断是否需要进入数据分析流程。' : '该请求没有使用服务端数据源上下文。',
      statusLabel: getRunStatusLabel(run.status),
      statusTone: getRunStatusTone(run.status),
      name: '',
      subtitle: '',
      metaItems: [],
    };
  }

  const dataSourceView = createRunDataSourceViewModel(run);

  return {
    state: 'ready',
    hasRun: true,
    title: '数据源使用',
    description: dataSourceView.description,
    emptyTitle: '',
    emptyDescription: '',
    statusLabel: getRunStatusLabel(run.status),
    statusTone: getRunStatusTone(run.status),
    name: dataSourceView.name,
    subtitle: dataSourceView.subtitle,
    metaItems: dataSourceView.metaItems,
  };
}

export function createRunAnalyticsPanelModel(run: RunViewModel | null): RunAnalyticsPanelModel {
  if (!run) {
    return {
      state: 'empty',
      title: '数据分析结果',
      description: '图表和指标摘要',
      emptyTitle: '暂无分析结果',
      emptyDescription: '发送数据分析类请求后，这里会展示图表和指标摘要。',
      chartData: undefined,
      pointCount: 0,
      maxValueText: '-',
      minValueText: '-',
      chartTypeLabel: '-',
      seriesCountLabel: '-',
      summary: null,
    };
  }

  const chartData = run.chartData;
  const isValidChartData = isValidRunChartData(chartData);
  const valueExtent = getChartValueExtent(chartData);

  return {
    state: isValidChartData ? 'ready' : 'empty',
    title: '数据分析结果',
    description: isValidChartData ? '当前 Run 的图表和指标摘要' : '等待可视化数据',
    emptyTitle: getAnalyticsEmptyTitle(run.status),
    emptyDescription: getAnalyticsEmptyDescription(run.status, run.intent === 'data_analysis'),
    chartData,
    pointCount: getChartPointCount(chartData),
    maxValueText: formatMetricValue(valueExtent?.max),
    minValueText: formatMetricValue(valueExtent?.min),
    chartTypeLabel: chartData?.chartType === 'bar' ? '柱状图' : '折线图',
    seriesCountLabel: chartData ? `${chartData.series.length} 组数据` : '-',
    summary: chartData?.summary ?? null,
  };
}

export function createWorkbenchHeaderRunModel(params: {
  run: RunViewModel | null;
  generationStatus: GenerationStatus;
}): WorkbenchHeaderRunModel {
  if (!params.run) {
    return {
      statusLabel: getGenerationLabel(params.generationStatus),
      statusTone: getGenerationStatusTone(params.generationStatus),
      summaryItems: ['尚未开始 Run'],
    };
  }

  const elapsedText = formatRunElapsed(params.run);
  const summaryItems = [
    `工具 ${params.run.toolInvocations.length}`,
    `图表 ${params.run.chartData ? 1 : 0}`,
    ...(elapsedText !== '-' ? [`耗时 ${elapsedText}`] : []),
  ];

  return {
    statusLabel: getRunStatusLabel(params.run.status),
    statusTone: getRunStatusTone(params.run.status),
    summaryItems,
  };
}

export function createRunStreamingAssistantModel(run: RunViewModel): RunStreamingAssistantModel {
  return {
    content: run.agentConclusion?.markdownText.trim() || run.conclusion.trim() || '正在分析问题并准备调用工具...',
  };
}

export function createRunErrorBlockModel(run: RunViewModel): RunErrorBlockModel {
  return {
    message: run.errorMessage || 'Agent Run 执行失败，请检查数据源或模型配置。',
  };
}

export function createRunStoppedBlockModel(run: RunViewModel): RunStoppedBlockModel {
  return {
    message: run.conclusion.trim() ? '已生成的部分内容已保留。' : '本轮未生成可保留的结论内容。',
  };
}

export function createChatInputRunModel(params: {
  run: RunViewModel | null;
  selectedModelId: string;
  generationStatus: GenerationStatus;
  agentRunStatus: 'idle' | 'running' | 'success' | 'error' | 'stopped';
}): ChatInputRunModel {
  const isMockGenerating = params.selectedModelId === 'mock-agent' && params.generationStatus === 'streaming';
  const isAgentRunning =
    params.selectedModelId !== 'mock-agent' &&
    (params.agentRunStatus === 'running' || (params.run?.mode === 'agent' && params.run.status === 'running'));

  return {
    isGenerating: isMockGenerating || isAgentRunning,
  };
}
