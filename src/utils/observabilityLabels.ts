import type {
  RunConclusionSource,
  RunEvent,
  RunIntent,
  RunReportState,
  RunSnapshot,
  RunStatus,
  RunStepStatus,
  RunToolInvocation,
  RunToolStatus,
} from '@/types/run';

export type ObservabilityTone = 'muted' | 'active' | 'success' | 'warning' | 'danger';

const FALLBACK_REASON_LABELS: Record<string, string> = {
  auth_required: '需要登录后才能运行真实 Agent。',
  auth_unavailable: '鉴权服务暂不可用。',
  cloudbase_unavailable: 'CloudBase 服务暂不可用。',
  data_empty: '数据源未返回可用于生成结论的结果。',
  data_table_not_found: 'CloudBase MySQL 未找到教学指标表。',
  data_tool_query_failed: '数据工具查询失败。',
  db_error: '持久化服务或数据库访问异常。',
  invalid_model: '所选模型不在可用模型白名单内。',
  local_capability_intro: '能力说明由本地结构化内容生成。',
  local_unsupported: '当前任务类型暂不支持真实 Agent 编排。',
  model_disabled: '所选模型当前已禁用。',
  model_failed: '模型调用失败，已进入 fallback。',
  model_forbidden: '模型服务拒绝访问。',
  model_not_configured: '模型网关未完成配置。',
  model_timeout: '模型调用超时。',
  provider_bad_response: '模型服务返回异常响应。',
  provider_error: '模型服务调用异常。',
  quota_consume_failed: 'Agent Run 额度扣减失败。',
  quota_exceeded: '真实 Agent Run 额度已用完。',
  rag_empty: '知识库暂无可检索内容。',
  rag_no_match: '知识库未返回与问题相关的来源。',
  rag_query_failed: '知识检索查询失败。',
  rag_table_not_found: '知识库表不可用。',
  rate_limited: '模型服务限流。',
  report_failed: '报告生成失败。',
  run_failed: 'Agent Run 执行失败。',
  tool_failed: '受控工具执行失败。',
  unknown_tool_error: '受控工具出现未知错误。',
  validation_error: '请求参数校验失败。',
};

const MODEL_ERROR_LABELS: Record<string, string> = {
  invalid_model: '模型不可用',
  model_disabled: '模型已禁用',
  model_failed: '模型调用失败',
  model_forbidden: '模型访问被拒绝',
  model_not_configured: '模型未配置',
  model_timeout: '模型调用超时',
  provider_bad_response: 'Provider 响应异常',
  provider_error: 'Provider 调用异常',
  rate_limited: 'Provider 限流',
};

function normalizeCode(value: string | null | undefined): string {
  return value?.trim() ?? '';
}

function humanizeUnknownCode(code: string): string {
  return code.replace(/[_-]+/g, ' ');
}

function getKnownOrFallbackLabel(value: string | null | undefined, labels: Record<string, string>): string {
  const code = normalizeCode(value);

  if (!code) {
    return '-';
  }

  return labels[code] ?? `未分类：${humanizeUnknownCode(code)}`;
}

export function getFallbackReasonLabel(reason: string | null | undefined): string {
  return getKnownOrFallbackLabel(reason, FALLBACK_REASON_LABELS);
}

export function getModelErrorTypeLabel(errorType: string | null | undefined): string {
  return getKnownOrFallbackLabel(errorType, MODEL_ERROR_LABELS);
}

export function getRunStatusLabel(status: RunStatus): string {
  if (status === 'idle') return '未开始';
  if (status === 'pending') return '等待中';
  if (status === 'running') return '运行中';
  if (status === 'success') return '已完成';
  if (status === 'error') return '执行异常';
  return '已停止';
}

export function getRunStatusTone(status: RunStatus): ObservabilityTone {
  if (status === 'running' || status === 'pending') return 'active';
  if (status === 'success') return 'success';
  if (status === 'error') return 'danger';
  if (status === 'stopped') return 'warning';
  return 'muted';
}

export function getStepStatusLabel(status: RunStepStatus): string {
  if (status === 'pending') return '待执行';
  if (status === 'running') return '进行中';
  if (status === 'success') return '已完成';
  if (status === 'error') return '执行异常';
  if (status === 'skipped') return '已跳过';
  return '已停止';
}

export function getToolStatusLabel(status: RunToolStatus): string {
  if (status === 'pending') return '待执行';
  if (status === 'running') return '执行中';
  if (status === 'success') return '已完成';
  if (status === 'error') return '执行异常';
  if (status === 'skipped') return '已跳过';
  return '已停止';
}

export function getConclusionSourceLabel(source: RunConclusionSource): string {
  if (source === 'model') return '模型生成';
  if (source === 'fallback') return 'Fallback 结论';
  if (source === 'mock') return 'Mock 生成';
  return '未生成';
}

export function getReportStatusLabel(reportState: RunReportState): string {
  if (reportState === 'pending') return '可生成';
  if (reportState === 'generating') return '生成中';
  if (reportState === 'generated') return '已生成';
  if (reportState === 'skipped') return '已跳过';
  if (reportState === 'failed') return '生成失败';
  return '不适用';
}

export function getReportStatusTone(reportState: RunReportState): ObservabilityTone {
  if (reportState === 'pending' || reportState === 'generating') return 'active';
  if (reportState === 'generated') return 'success';
  if (reportState === 'skipped') return 'muted';
  if (reportState === 'failed') return 'danger';
  return 'muted';
}

export function getReportStatusDescription(run: RunSnapshot, canGenerateReport: boolean): string {
  if (run.reportState === 'generated') {
    return '当前选中 Run 已生成报告，可在聊天记录中查看和恢复。';
  }

  if (run.reportState === 'generating') {
    return '当前选中 Run 的报告正在生成。';
  }

  if (run.reportState === 'skipped') {
    return '当前选中 Run 已选择暂不生成报告。';
  }

  if (run.reportState === 'failed') {
    return getFallbackReasonLabel('report_failed');
  }

  if (canGenerateReport) {
    return '报告将基于当前选中 Run 的结论、工具调用、数据源和图表生成。';
  }

  if (run.intent !== 'data_analysis') {
    return '当前 Run 不是数据分析类任务，暂不提供报告生成。';
  }

  return '当前 Run 尚未满足报告生成条件。';
}

export interface RagEmptyStateLabel {
  title: string;
  description: string;
}

function getRunFallbackReason(run: RunSnapshot): string | null {
  return normalizeCode(run.modelTrace?.fallbackReason) || null;
}

function isRagIntent(intent: RunIntent): boolean {
  return intent === 'knowledge_qa';
}

export function getRagEmptyStateLabel(run: RunSnapshot | null): RagEmptyStateLabel {
  if (!run) {
    return {
      title: '暂无 RAG 来源',
      description: '发送涉及知识检索的问题后，这里会展示 retrievedChunkCount、来源片段和引用信息。',
    };
  }

  const fallbackReason = getRunFallbackReason(run);

  if (fallbackReason === 'rag_no_match') {
    return {
      title: '无可用来源',
      description: getFallbackReasonLabel(fallbackReason),
    };
  }

  if (fallbackReason === 'rag_empty' || fallbackReason === 'rag_table_not_found') {
    return {
      title: '知识库未返回来源',
      description: getFallbackReasonLabel(fallbackReason),
    };
  }

  if (fallbackReason === 'rag_query_failed') {
    return {
      title: '检索失败',
      description: getFallbackReasonLabel(fallbackReason),
    };
  }

  if (run.status === 'error') {
    return {
      title: 'Run 执行失败',
      description: run.errorMessage || '当前 Run 失败，未恢复到可展示的 RAG 来源。',
    };
  }

  if (!isRagIntent(run.intent)) {
    return {
      title: '本轮未使用 RAG',
      description: '当前 Run 未进入知识检索链路，因此没有 citation/source。',
    };
  }

  return {
    title: '知识库未返回来源',
    description: 'knowledge_search 未返回可用于引用的来源片段。',
  };
}

export function getRagSourcesDescription(run: RunSnapshot | null, usedSourceCount: number, sourceCount: number): string {
  if (!run) {
    return 'CloudBase knowledge_search 返回的来源、引用与证据链';
  }

  if (sourceCount > 0 && usedSourceCount === 0) {
    return '已返回来源，但当前回答未标记引用这些来源。';
  }

  if (sourceCount > 0) {
    return 'CloudBase knowledge_search 返回的来源、引用与证据链';
  }

  return getRagEmptyStateLabel(run).description;
}

function tryParseRecord(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value) as unknown;

    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function getRecordString(record: Record<string, unknown> | null, key: string): string {
  const value = record?.[key];

  return typeof value === 'string' ? value.trim() : '';
}

export function getToolFailureLabel(invocation: RunToolInvocation): string {
  if (invocation.status !== 'error') {
    return '';
  }

  const outputSummary = invocation.outputSummary.trim();
  const outputRecord = outputSummary ? tryParseRecord(outputSummary) : null;
  const fallbackReason = getRecordString(outputRecord, 'fallbackReason');
  const errorMessage = getRecordString(outputRecord, 'errorMessage') || getRecordString(outputRecord, 'message');

  if (fallbackReason) {
    return getFallbackReasonLabel(fallbackReason);
  }

  if (errorMessage) {
    return errorMessage;
  }

  return outputSummary || getFallbackReasonLabel('tool_failed');
}

function mapBackendRunStatus(status: string | null | undefined): RunStatus {
  if (status === 'completed' || status === 'success') return 'success';
  if (status === 'failed' || status === 'error') return 'error';
  if (status === 'stopped') return 'stopped';
  if (status === 'pending') return 'pending';
  return 'running';
}

export function getRunReuseNotice(event: Extract<RunEvent, { type: 'run_reused' }> | null): string | null {
  if (!event) {
    return null;
  }

  const statusLabel = getRunStatusLabel(mapBackendRunStatus(event.status));

  if (event.reason === 'duplicate_in_flight') {
    return `检测到重复请求，已复用进行中的 Run（${statusLabel}）。`;
  }

  if (event.reason === 'existing_run') {
    return `检测到重复请求，已复用已有 Run（${statusLabel}）。`;
  }

  return `检测到重复请求，已复用已有 Run（${statusLabel}）。`;
}
