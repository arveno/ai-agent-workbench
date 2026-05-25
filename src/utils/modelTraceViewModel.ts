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

function getSelectedModelLabel(modelTrace: RunModelTrace): string {
  if (modelTrace.selectedModelId === 'mock-agent' || modelTrace.conclusionSource === 'mock') {
    return '演示模型';
  }

  return modelTrace.selectedModelId ? '真实模型' : '-';
}

function getProviderBoundaryLabel(modelTrace: RunModelTrace): string {
  if (modelTrace.selectedModelId === 'mock-agent' || modelTrace.conclusionSource === 'mock') {
    return '本地模拟';
  }

  return modelTrace.selectedModelId ? '服务端受控' : '-';
}

function getModelPathLabel(modelTrace: RunModelTrace): string {
  if (modelTrace.selectedModelId === 'mock-agent' || modelTrace.conclusionSource === 'mock') {
    return '公开演示路径';
  }

  return modelTrace.selectedModelId ? 'Model Gateway 白名单模型' : '-';
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

  return '模型服务未返回';
}

export function createModelTraceViewModel(modelTrace: RunModelTrace | undefined): ModelTraceViewModel | null {
  if (!modelTrace) {
    return null;
  }

  return {
    selectedModelIdLabel: getSelectedModelLabel(modelTrace),
    providerLabel: getProviderBoundaryLabel(modelTrace),
    modelLabel: getModelPathLabel(modelTrace),
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
