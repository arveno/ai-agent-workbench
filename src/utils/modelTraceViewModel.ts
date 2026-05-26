import type {
  RunConclusionSource,
  RunModelCostEstimate,
  RunModelTrace,
  RunModelTokenUsage,
  RunModelUsage,
} from '@/types/run';
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
  tokenUsageSourceLabel: string;
  usageUnavailableReasonLabel: string;
  estimatedCostLabel: string;
  costCurrencyLabel: string;
  pricingUnitLabel: string;
  costEstimateStatusLabel: string;
  pricingSourceLabel: string;
  costUnavailableReasonLabel: string;
  fallbackReasonLabel: string;
  modelErrorTypeLabel: string;
  conclusionSourceLabel: string;
}

const USAGE_UNAVAILABLE_REASON_LABELS: Record<string, string> = {
  model_failed: '模型调用失败，未产生 token usage。',
  model_not_invoked: '模型未调用，因此没有 token usage。',
  provider_no_usage: '模型服务未返回 token usage。',
};

const COST_UNAVAILABLE_REASON_LABELS: Record<string, string> = {
  free_pricing: '免费模型定价，不显示真实账单。',
  model_failed: '模型调用失败，无法估算费用。',
  model_not_invoked: '模型未调用，无法估算费用。',
  provider_no_usage: '模型服务未返回 token usage，无法估算费用。',
  unknown_pricing: '模型价格未知，无法估算费用。',
  usage_unavailable: 'token usage 不可用，无法估算费用。',
};

function formatText(value: string | null | undefined): string {
  return value?.trim() || '-';
}

function formatNumber(value: number | null | undefined, suffix = ''): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${value}${suffix}` : '未返回';
}

function getSelectedModelLabel(modelTrace: RunModelTrace): string {
  if (modelTrace.selectedModelId === 'mock-agent' || modelTrace.conclusionSource === 'mock') {
    return modelTrace.selectedModelId || 'mock-agent';
  }

  return formatText(modelTrace.selectedModelId);
}

function getProviderLabel(modelTrace: RunModelTrace): string {
  if (modelTrace.selectedModelId === 'mock-agent' || modelTrace.conclusionSource === 'mock') {
    return modelTrace.provider || 'mock';
  }

  return formatText(modelTrace.provider);
}

function getModelLabel(modelTrace: RunModelTrace): string {
  if (modelTrace.selectedModelId === 'mock-agent' || modelTrace.conclusionSource === 'mock') {
    return modelTrace.model || '本地模拟';
  }

  return formatText(modelTrace.model);
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

function getDisplayTokenUsage(modelTrace: RunModelTrace): RunModelTokenUsage | RunModelUsage | null {
  return modelTrace.usage ?? modelTrace.tokenUsage ?? null;
}

function getReasonLabel(
  reason: string | null | undefined,
  labels: Record<string, string>,
): string {
  const normalizedReason = reason?.trim();

  if (!normalizedReason) {
    return '-';
  }

  return labels[normalizedReason] ?? getFallbackReasonLabel(normalizedReason);
}

function getUsageUnavailableReasonLabel(usage: RunModelUsage | null | undefined): string {
  if (!usage || usage.usageAvailable) {
    return '-';
  }

  return getReasonLabel(usage.usageUnavailableReason, USAGE_UNAVAILABLE_REASON_LABELS);
}

function getTokenUsageStatus(modelTrace: RunModelTrace): string {
  const usage = modelTrace.usage;

  if (usage) {
    if (usage.usageAvailable) {
      return '可用';
    }

    return getUsageUnavailableReasonLabel(usage);
  }

  if (hasReturnedTokenUsage(modelTrace.tokenUsage)) {
    return '已返回';
  }

  if (modelTrace.conclusionSource === 'fallback') {
    return 'Fallback 不适用';
  }

  return '模型服务未返回 token usage';
}

function getUsageSourceLabel(modelTrace: RunModelTrace): string {
  if (modelTrace.usage?.usageSource) {
    return modelTrace.usage.usageSource;
  }

  return hasReturnedTokenUsage(modelTrace.tokenUsage) ? 'provider' : '-';
}

function hasEstimatedCost(costEstimate: RunModelCostEstimate | null | undefined): boolean {
  return typeof costEstimate?.estimatedCost === 'number' && Number.isFinite(costEstimate.estimatedCost);
}

function formatEstimatedCost(costEstimate: RunModelCostEstimate | null | undefined): string {
  const estimatedCost = costEstimate?.estimatedCost;

  if (typeof estimatedCost !== 'number' || !Number.isFinite(estimatedCost)) {
    return '未返回';
  }

  return costEstimate?.currency ? `${costEstimate.currency} ${estimatedCost}` : `${estimatedCost}`;
}

function getCostUnavailableReasonLabel(costEstimate: RunModelCostEstimate | null | undefined): string {
  if (!costEstimate || hasEstimatedCost(costEstimate)) {
    return '-';
  }

  return getReasonLabel(costEstimate.costUnavailableReason, COST_UNAVAILABLE_REASON_LABELS);
}

function getCostEstimateStatus(costEstimate: RunModelCostEstimate | null | undefined): string {
  if (!costEstimate) {
    return '费用估算未返回';
  }

  if (hasEstimatedCost(costEstimate)) {
    return costEstimate.isEstimated ? 'isEstimated=true，估算值，非真实账单' : 'isEstimated=false，记录值，非真实账单';
  }

  const unavailableReason = getCostUnavailableReasonLabel(costEstimate);
  return unavailableReason === '-' ? 'isEstimated=false，费用估算不可用' : `isEstimated=false，${unavailableReason}`;
}

function getFallbackLabel(reason: string | null | undefined, conclusionSource: RunConclusionSource): string {
  if (conclusionSource !== 'fallback' && !reason) {
    return '-';
  }

  return getFallbackReasonLabel(reason);
}

export function createModelTraceViewModel(modelTrace: RunModelTrace | undefined): ModelTraceViewModel | null {
  if (!modelTrace) {
    return null;
  }

  const displayUsage = getDisplayTokenUsage(modelTrace);
  const costEstimate = modelTrace.costEstimate ?? null;

  return {
    selectedModelIdLabel: getSelectedModelLabel(modelTrace),
    providerLabel: getProviderLabel(modelTrace),
    modelLabel: getModelLabel(modelTrace),
    latencyLabel: formatNumber(modelTrace.latencyMs, 'ms'),
    promptTokensLabel: formatNumber(displayUsage?.promptTokens),
    completionTokensLabel: formatNumber(displayUsage?.completionTokens),
    totalTokensLabel: formatNumber(displayUsage?.totalTokens),
    tokenUsageStatus: getTokenUsageStatus(modelTrace),
    tokenUsageSourceLabel: getUsageSourceLabel(modelTrace),
    usageUnavailableReasonLabel: getUsageUnavailableReasonLabel(modelTrace.usage),
    estimatedCostLabel: formatEstimatedCost(costEstimate),
    costCurrencyLabel: formatText(costEstimate?.currency),
    pricingUnitLabel: formatText(costEstimate?.pricingUnit),
    costEstimateStatusLabel: getCostEstimateStatus(costEstimate),
    pricingSourceLabel: formatText(costEstimate?.pricingSource),
    costUnavailableReasonLabel: getCostUnavailableReasonLabel(costEstimate),
    fallbackReasonLabel: getFallbackLabel(modelTrace.fallbackReason, modelTrace.conclusionSource),
    modelErrorTypeLabel: getModelErrorTypeLabel(modelTrace.modelErrorType),
    conclusionSourceLabel: getConclusionSourceLabel(modelTrace.conclusionSource),
  };
}
