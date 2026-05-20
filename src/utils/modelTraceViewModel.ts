import type { RunConclusionSource, RunModelTrace, RunModelTokenUsage } from '@/types/run';
import { getConclusionSourceLabel, getFallbackReasonLabel, getModelErrorTypeLabel } from './observabilityLabels';

export interface ModelTraceViewModel {
  selectedModelIdLabel: string;
  providerLabel: string;
  modelLabel: string;
  latencyLabel: string;
  promptTokensLabel: string;
  completionTokensLabel: string;
  totalTokensLabel: string;
  tokenUsageStatus: string;
  fallbackReasonLabel: string;
  modelErrorTypeLabel: string;
  conclusionSourceLabel: string;
}

function formatText(value: string | null | undefined): string {
  return value?.trim() || '-';
}

function formatNumber(value: number | null | undefined, suffix = ''): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${value}${suffix}` : '未返回';
}

function hasReturnedTokenUsage(tokenUsage: RunModelTokenUsage | null | undefined): boolean {
  return Boolean(
    tokenUsage &&
      (
        Number.isFinite(tokenUsage.promptTokens) ||
        Number.isFinite(tokenUsage.completionTokens) ||
        Number.isFinite(tokenUsage.totalTokens)
      ),
  );
}

function getTokenUsageStatus(
  tokenUsage: RunModelTokenUsage | null | undefined,
  conclusionSource: RunConclusionSource,
): string {
  if (hasReturnedTokenUsage(tokenUsage)) {
    return '已返回';
  }

  if (conclusionSource === 'fallback') {
    return 'Fallback 不适用';
  }

  return 'Provider 未返回';
}

export function createModelTraceViewModel(modelTrace: RunModelTrace | undefined): ModelTraceViewModel | null {
  if (!modelTrace) {
    return null;
  }

  return {
    selectedModelIdLabel: formatText(modelTrace.selectedModelId),
    providerLabel: formatText(modelTrace.provider),
    modelLabel: formatText(modelTrace.model),
    latencyLabel: formatNumber(modelTrace.latencyMs, 'ms'),
    promptTokensLabel: formatNumber(modelTrace.tokenUsage?.promptTokens),
    completionTokensLabel: formatNumber(modelTrace.tokenUsage?.completionTokens),
    totalTokensLabel: formatNumber(modelTrace.tokenUsage?.totalTokens),
    tokenUsageStatus: getTokenUsageStatus(modelTrace.tokenUsage, modelTrace.conclusionSource),
    fallbackReasonLabel: getFallbackReasonLabel(modelTrace.fallbackReason),
    modelErrorTypeLabel: getModelErrorTypeLabel(modelTrace.modelErrorType),
    conclusionSourceLabel: getConclusionSourceLabel(modelTrace.conclusionSource),
  };
}
