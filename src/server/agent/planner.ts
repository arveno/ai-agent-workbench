/// <reference types="node" />

import { ensureServerEnvLoaded } from '../datasources/connection';
import type {
  AgentPlan,
  AgentPlanComparison,
  AgentPlanGroupBy,
  AgentPlanIntent,
  AgentPlanMetric,
  AgentPlanTimeRange,
} from './types';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.1-8b-instant';

const CAPABILITY_KEYWORDS = [
  '你能做什么',
  '你可以做什么',
  '你可以帮我做哪些分析',
  '有什么功能',
  '有什么能力',
  '工作台有什么能力',
  '怎么用',
  '介绍一下',
  '帮助',
  'help',
  'what can you do',
] as const;

const DATA_ANALYSIS_KEYWORDS = [
  '分析',
  '数据',
  '成绩',
  '平均分',
  '出勤',
  '出勤率',
  '作业',
  '完成率',
  '异常',
  '指标',
  '趋势',
  '对比',
  '上月',
  '本月',
  '教学质量',
] as const;

const DATA_ANALYSIS_PRIORITY_KEYWORDS = [
  '分析',
  '教学质量数据',
  '找出异常',
  '异常指标',
  '指标变化',
  '数据异常',
  '趋势',
  '对比',
  '本月',
  '上月',
  '环比',
  '最近 6 个月',
  '最近6个月',
  '班级',
  '平均分',
  '成绩',
] as const;

const KNOWLEDGE_QA_KEYWORDS = [
  '制度',
  '政策',
  '依据',
  '规则',
  '评价口径',
  '定义',
  '说明',
  '来源',
  '引用',
  '为什么要关注',
  '为什么需要',
  '教学评价',
  '学业预警',
  '学业预警规则',
  '数据异常处理',
  '数据源暂不可用',
] as const;

const KNOWLEDGE_REFERENCE_KEYWORDS = [
  '制度',
  '政策',
  '依据',
  '规则',
  '评价口径',
  '定义',
  '来源',
  '引用',
  '教学评价制度',
  '现有政策',
  '学业预警规则',
  '数据异常处理',
  '数据源暂不可用',
] as const;

const GROUP_BY_TREND_KEYWORDS = ['趋势', '月份', '对比', '上月', '环比'] as const;
const LATEST_MONTH_KEYWORDS = ['本月', '这个月', '当前月份'] as const;
const PREVIOUS_MONTH_KEYWORDS = ['上月', '环比', '对比上月', '较上月'] as const;

const PLANNER_SYSTEM_PROMPT = [
  '你是一个教育数据分析工作台的请求分类器。',
  '',
  '请判断用户输入属于哪种类型：',
  '',
  '1. capability_intro',
  '用户询问系统能力、怎么使用、能做什么，不需要进入数据分析流程。',
  '',
  '2. data_analysis',
  '用户要求分析教学质量、成绩、出勤率、作业完成率、异常指标、趋势或对比，需要进入数据分析流程。',
  '',
  '3. knowledge_qa',
  '用户询问教学评价制度、指标口径、规则依据、学业预警、课堂参与度、作业完成率、数据异常处理等知识依据，需要进入 RAG 检索流程。',
  '',
  '4. unsupported',
  '用户问题与当前教育数据分析工作台无关，当前系统暂不支持。',
  '',
  '请只返回 JSON，不要输出 Markdown，不要解释。',
  '',
  'JSON 格式：',
  '{',
  '  "intent": "capability_intro | data_analysis | knowledge_qa | unsupported",',
  '  "shouldUseDataAnalysis": true | false,',
  '  "reason": "简短原因",',
  '  "metric": "avg_score | attendance_rate | homework_completion_rate | abnormal_count",',
  '  "groupBy": "subject | metric_month",',
  '  "timeRange": {',
  '    "type": "month | latest_available_month | none",',
  '    "month": "YYYY-MM",',
  '    "label": "例如 2026 年 5 月"',
  '  },',
  '  "comparison": "none | previous_month"',
  '}',
  '',
  '规则：',
  '- capability_intro 的 shouldUseDataAnalysis 必须是 false',
  '- knowledge_qa 的 shouldUseDataAnalysis 必须是 false',
  '- unsupported 的 shouldUseDataAnalysis 必须是 false',
  '- data_analysis 的 shouldUseDataAnalysis 必须是 true',
  '- 如果用户明确要求分析教学质量数据、异常指标、趋势或对比，优先输出 data_analysis',
  '- 不要因为单独出现“为什么”就输出 knowledge_qa；只有询问制度、政策、依据、规则、评价口径、定义或引用来源时才输出 knowledge_qa',
  '- 如果用户询问制度、政策、依据、规则、评价口径、学业预警、课堂参与度、作业完成率为什么重要，优先输出 knowledge_qa',
  '- 如果用户明确提到某年某月，例如“2026 年 5 月”或“2026-05”，必须输出 timeRange.type = "month"，month = "YYYY-MM"',
  '- 如果用户说“本月”，输出 timeRange.type = "latest_available_month"',
  '- 如果用户说“上月 / 环比 / 对比上月”，comparison = "previous_month"',
  '- 如果用户没有提到时间范围，timeRange.type = "none"',
  '- 如果用户要求“异常指标 / 找出异常 / 异常情况”，metric 必须优先使用 abnormal_count',
  '- 如果用户明确说“平均分 / 成绩 / 分数”，metric 使用 avg_score',
  '- 如果用户明确说“出勤 / 出勤率”，metric 使用 attendance_rate',
  '- 如果用户明确说“作业 / 完成率”，metric 使用 homework_completion_rate',
  '- 如果是 data_analysis 但指标不明确，默认 metric 使用 abnormal_count',
  '- 如果用户提到趋势、月份、环比、上月、对比，groupBy 使用 metric_month',
  '- 否则 groupBy 使用 subject',
  '',
  '注意：不要输出执行步骤，不要生成查询语句。',
].join('\n');

const PLAN_INTENT_WHITELIST: readonly AgentPlanIntent[] = [
  'capability_intro',
  'data_analysis',
  'knowledge_qa',
  'unsupported',
] as const;
const PLAN_METRIC_WHITELIST: readonly AgentPlanMetric[] = [
  'avg_score',
  'attendance_rate',
  'homework_completion_rate',
  'abnormal_count',
] as const;
const PLAN_GROUP_BY_WHITELIST: readonly AgentPlanGroupBy[] = ['subject', 'metric_month'] as const;
const PLAN_TIME_RANGE_TYPE_WHITELIST: readonly AgentPlanTimeRange['type'][] = [
  'month',
  'latest_available_month',
  'none',
] as const;
const PLAN_COMPARISON_WHITELIST: readonly AgentPlanComparison[] = ['none', 'previous_month'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function includesAnyKeyword(text: string, keywords: readonly string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

function isPlanIntent(value: string): value is AgentPlanIntent {
  return (PLAN_INTENT_WHITELIST as readonly string[]).includes(value);
}

function isPlanMetric(value: string): value is AgentPlanMetric {
  return (PLAN_METRIC_WHITELIST as readonly string[]).includes(value);
}

function isPlanGroupBy(value: string): value is AgentPlanGroupBy {
  return (PLAN_GROUP_BY_WHITELIST as readonly string[]).includes(value);
}

function isPlanTimeRangeType(value: string): value is AgentPlanTimeRange['type'] {
  return (PLAN_TIME_RANGE_TYPE_WHITELIST as readonly string[]).includes(value);
}

function isPlanComparison(value: string): value is AgentPlanComparison {
  return (PLAN_COMPARISON_WHITELIST as readonly string[]).includes(value);
}

function pickMetricFromPrompt(prompt: string): AgentPlanMetric {
  if (prompt.includes('异常')) {
    return 'abnormal_count';
  }

  if (prompt.includes('出勤') || prompt.includes('出勤率')) {
    return 'attendance_rate';
  }

  if (prompt.includes('作业') || prompt.includes('完成率')) {
    return 'homework_completion_rate';
  }

  if (prompt.includes('平均分') || prompt.includes('成绩') || prompt.includes('分数')) {
    return 'avg_score';
  }

  return 'abnormal_count';
}

function pickGroupByFromPrompt(prompt: string): AgentPlanGroupBy {
  return includesAnyKeyword(prompt, GROUP_BY_TREND_KEYWORDS) ? 'metric_month' : 'subject';
}

function padMonth(month: number): string {
  return String(month).padStart(2, '0');
}

function createMonthLabel(month: string): string {
  const [year, monthValue] = month.split('-');
  return `${year} 年 ${Number(monthValue)} 月`;
}

export function extractExplicitMonth(prompt: string): string | null {
  const normalizedPrompt = prompt.trim();
  const cnMatch = normalizedPrompt.match(/(19\d{2}|20\d{2})\s*年\s*(1[0-2]|0?[1-9])\s*月/);
  const separatorMatch = normalizedPrompt.match(/(19\d{2}|20\d{2})[-/](1[0-2]|0?[1-9])/);
  const match = cnMatch ?? separatorMatch;

  if (!match) {
    return null;
  }

  const year = match[1];
  const month = Number.parseInt(match[2], 10);

  if (!year || Number.isNaN(month) || month < 1 || month > 12) {
    return null;
  }

  return `${year}-${padMonth(month)}`;
}

function pickTimeRangeFromPrompt(prompt: string): AgentPlanTimeRange {
  const explicitMonth = extractExplicitMonth(prompt);

  if (explicitMonth) {
    return {
      type: 'month',
      month: explicitMonth,
      label: createMonthLabel(explicitMonth),
    };
  }

  if (includesAnyKeyword(prompt, LATEST_MONTH_KEYWORDS)) {
    return {
      type: 'latest_available_month',
      label: '最新可用月份',
    };
  }

  return {
    type: 'none',
  };
}

function pickComparisonFromPrompt(prompt: string): AgentPlanComparison {
  return includesAnyKeyword(prompt, PREVIOUS_MONTH_KEYWORDS) ? 'previous_month' : 'none';
}

function hasRecentMonthWindow(prompt: string): boolean {
  return /最近\s*\d+\s*个月/.test(prompt);
}

function hasDataAnalysisPriority(prompt: string, lowerPrompt: string): boolean {
  return (
    includesAnyKeyword(prompt, DATA_ANALYSIS_PRIORITY_KEYWORDS) ||
    includesAnyKeyword(lowerPrompt, DATA_ANALYSIS_PRIORITY_KEYWORDS) ||
    Boolean(extractExplicitMonth(prompt)) ||
    hasRecentMonthWindow(prompt)
  );
}

function hasKnowledgeReference(prompt: string, lowerPrompt: string): boolean {
  return (
    includesAnyKeyword(prompt, KNOWLEDGE_REFERENCE_KEYWORDS) ||
    includesAnyKeyword(lowerPrompt, KNOWLEDGE_REFERENCE_KEYWORDS)
  );
}

function hasKnowledgeQaSignal(prompt: string, lowerPrompt: string): boolean {
  return (
    includesAnyKeyword(prompt, KNOWLEDGE_QA_KEYWORDS) ||
    includesAnyKeyword(lowerPrompt, KNOWLEDGE_QA_KEYWORDS)
  );
}

export function fallbackPlanAgentRun(prompt: string): AgentPlan {
  const normalizedPrompt = prompt.trim();
  const lowerPrompt = normalizedPrompt.toLowerCase();

  if (includesAnyKeyword(normalizedPrompt, CAPABILITY_KEYWORDS) || includesAnyKeyword(lowerPrompt, CAPABILITY_KEYWORDS)) {
    return {
      intent: 'capability_intro',
      shouldUseDataAnalysis: false,
      reason: '用户在询问系统能力，不需要访问数据源。',
    };
  }

  const shouldUseDataAnalysis = hasDataAnalysisPriority(normalizedPrompt, lowerPrompt);
  const shouldUseKnowledgeQa = hasKnowledgeQaSignal(normalizedPrompt, lowerPrompt);
  const hasExplicitKnowledgeReference = hasKnowledgeReference(normalizedPrompt, lowerPrompt);

  if (shouldUseDataAnalysis && !hasExplicitKnowledgeReference) {
    return {
      intent: 'data_analysis',
      shouldUseDataAnalysis: true,
      reason: '用户在请求教学质量相关的数据分析。',
      metric: pickMetricFromPrompt(normalizedPrompt),
      groupBy: pickGroupByFromPrompt(normalizedPrompt),
      timeRange: pickTimeRangeFromPrompt(normalizedPrompt),
      comparison: pickComparisonFromPrompt(normalizedPrompt),
    };
  }

  if (shouldUseKnowledgeQa) {
    return {
      intent: 'knowledge_qa',
      shouldUseDataAnalysis: false,
      reason: '用户在询问教学评价制度、规则依据或指标口径，需要检索知识库。',
    };
  }

  if (
    shouldUseDataAnalysis ||
    includesAnyKeyword(normalizedPrompt, DATA_ANALYSIS_KEYWORDS) ||
    includesAnyKeyword(lowerPrompt, DATA_ANALYSIS_KEYWORDS)
  ) {
    return {
      intent: 'data_analysis',
      shouldUseDataAnalysis: true,
      reason: '用户在请求教学质量相关的数据分析。',
      metric: pickMetricFromPrompt(normalizedPrompt),
      groupBy: pickGroupByFromPrompt(normalizedPrompt),
      timeRange: pickTimeRangeFromPrompt(normalizedPrompt),
      comparison: pickComparisonFromPrompt(normalizedPrompt),
    };
  }

  return {
    intent: 'unsupported',
    shouldUseDataAnalysis: false,
    reason: '当前问题不属于教育数据分析工作台支持范围。',
  };
}

function extractJsonFromContent(content: string): string {
  const fencedMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);

  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const firstBraceIndex = content.indexOf('{');
  const lastBraceIndex = content.lastIndexOf('}');

  if (firstBraceIndex !== -1 && lastBraceIndex !== -1 && lastBraceIndex > firstBraceIndex) {
    return content.slice(firstBraceIndex, lastBraceIndex + 1).trim();
  }

  return content.trim();
}

function isValidMonthValue(value: string): boolean {
  return /^(19\d{2}|20\d{2})-(0[1-9]|1[0-2])$/.test(value);
}

function normalizeTimeRange(raw: unknown, fallback: AgentPlanTimeRange | undefined): AgentPlanTimeRange {
  const fallbackTimeRange = fallback ?? { type: 'none' };

  if (!isRecord(raw)) {
    return fallbackTimeRange;
  }

  const rawType = toTrimmedString(raw.type);

  if (!isPlanTimeRangeType(rawType)) {
    return fallbackTimeRange;
  }

  if (rawType === 'month') {
    const month = toTrimmedString(raw.month);

    if (!isValidMonthValue(month)) {
      return fallbackTimeRange;
    }

    const label = toTrimmedString(raw.label) || createMonthLabel(month);

    return {
      type: 'month',
      month,
      label,
    };
  }

  if (rawType === 'latest_available_month') {
    return {
      type: 'latest_available_month',
      label: toTrimmedString(raw.label) || '最新可用月份',
    };
  }

  return {
    type: 'none',
    label: toTrimmedString(raw.label) || undefined,
  };
}

function normalizeAgentPlan(raw: unknown, fallback: AgentPlan): AgentPlan {
  if (!isRecord(raw)) {
    return fallback;
  }

  const rawIntent = toTrimmedString(raw.intent);
  const intent: AgentPlanIntent = isPlanIntent(rawIntent) ? rawIntent : fallback.intent;
  const shouldUseDataAnalysis = intent === 'data_analysis';

  const rawReason = toTrimmedString(raw.reason);
  const reason = rawReason || fallback.reason;

  if (intent !== 'data_analysis') {
    return {
      intent,
      shouldUseDataAnalysis,
      reason,
    };
  }

  const fallbackMetric = fallback.metric ?? 'abnormal_count';
  const fallbackGroupBy = fallback.groupBy ?? 'subject';

  const rawMetric = toTrimmedString(raw.metric);
  const metric: AgentPlanMetric = isPlanMetric(rawMetric) ? rawMetric : fallbackMetric;

  const rawGroupBy = toTrimmedString(raw.groupBy);
  const groupBy: AgentPlanGroupBy = isPlanGroupBy(rawGroupBy) ? rawGroupBy : fallbackGroupBy;
  const timeRange = normalizeTimeRange(raw.timeRange, fallback.timeRange);
  const rawComparison = toTrimmedString(raw.comparison);
  const comparison: AgentPlanComparison = isPlanComparison(rawComparison)
    ? rawComparison
    : fallback.comparison ?? 'none';

  return {
    intent,
    shouldUseDataAnalysis,
    reason,
    metric,
    groupBy,
    timeRange,
    comparison,
  };
}

async function callGroqPlanner(params: { apiKey: string; prompt: string }): Promise<unknown> {
  const response = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        {
          role: 'system',
          content: PLANNER_SYSTEM_PROMPT,
        },
        {
          role: 'user',
          content: params.prompt,
        },
      ],
      temperature: 0,
      max_tokens: 320,
      stream: false,
    }),
  });

  if (!response.ok) {
    throw new Error('Planner model request failed');
  }

  const data = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string;
      };
    }>;
  };

  const content = data.choices?.[0]?.message?.content?.trim();

  if (!content) {
    throw new Error('Planner model returned empty content');
  }

  const jsonText = extractJsonFromContent(content);

  try {
    return JSON.parse(jsonText) as unknown;
  } catch {
    throw new Error('Planner model returned invalid JSON');
  }
}

export async function planAgentRun(params: { prompt: string; apiKey?: string }): Promise<AgentPlan> {
  const fallback = fallbackPlanAgentRun(params.prompt);

  ensureServerEnvLoaded();
  const apiKey = params.apiKey?.trim() || process.env.GROQ_API_KEY?.trim() || '';

  if (!apiKey) {
    return fallback;
  }

  try {
    const rawPlan = await callGroqPlanner({
      apiKey,
      prompt: params.prompt,
    });

    return normalizeAgentPlan(rawPlan, fallback);
  } catch {
    return fallback;
  }
}
