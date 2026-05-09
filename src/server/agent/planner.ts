/// <reference types="node" />

import { ensureServerEnvLoaded } from '../datasources/connection';
import type { AgentPlan, AgentPlanGroupBy, AgentPlanIntent, AgentPlanMetric } from './types';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.1-8b-instant';

const CAPABILITY_KEYWORDS = [
  '你能做什么',
  '你可以做什么',
  '有什么功能',
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

const GROUP_BY_TREND_KEYWORDS = ['趋势', '月份', '对比', '上月', '环比'] as const;

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
  '3. unsupported',
  '用户问题与当前教育数据分析工作台无关，当前系统暂不支持。',
  '',
  '请只返回 JSON，不要输出 Markdown，不要解释。',
  '',
  'JSON 格式：',
  '{',
  '  "intent": "capability_intro | data_analysis | unsupported",',
  '  "shouldUseDataAnalysis": true | false,',
  '  "reason": "简短原因",',
  '  "metric": "avg_score | attendance_rate | homework_completion_rate | abnormal_count",',
  '  "groupBy": "subject | metric_month"',
  '}',
  '',
  '规则：',
  '- capability_intro 的 shouldUseDataAnalysis 必须是 false',
  '- unsupported 的 shouldUseDataAnalysis 必须是 false',
  '- data_analysis 的 shouldUseDataAnalysis 必须是 true',
  '- 如果是 data_analysis，但用户没有指定指标，默认 metric 使用 abnormal_count',
  '- 如果用户提到趋势、月份、环比、上月、对比，groupBy 使用 metric_month',
  '- 否则 groupBy 使用 subject',
  '',
  '注意：不要输出执行步骤，不要生成查询语句。',
].join('\n');

const PLAN_INTENT_WHITELIST: readonly AgentPlanIntent[] = [
  'capability_intro',
  'data_analysis',
  'unsupported',
] as const;
const PLAN_METRIC_WHITELIST: readonly AgentPlanMetric[] = [
  'avg_score',
  'attendance_rate',
  'homework_completion_rate',
  'abnormal_count',
] as const;
const PLAN_GROUP_BY_WHITELIST: readonly AgentPlanGroupBy[] = ['subject', 'metric_month'] as const;

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

function pickMetricFromPrompt(prompt: string): AgentPlanMetric {
  if (prompt.includes('出勤') || prompt.includes('出勤率')) {
    return 'attendance_rate';
  }

  if (prompt.includes('作业') || prompt.includes('完成率')) {
    return 'homework_completion_rate';
  }

  if (prompt.includes('平均分') || prompt.includes('成绩') || prompt.includes('分数')) {
    return 'avg_score';
  }

  if (prompt.includes('异常') || prompt.includes('指标')) {
    return 'abnormal_count';
  }

  return 'abnormal_count';
}

function pickGroupByFromPrompt(prompt: string): AgentPlanGroupBy {
  return includesAnyKeyword(prompt, GROUP_BY_TREND_KEYWORDS) ? 'metric_month' : 'subject';
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

  if (
    includesAnyKeyword(normalizedPrompt, DATA_ANALYSIS_KEYWORDS) ||
    includesAnyKeyword(lowerPrompt, DATA_ANALYSIS_KEYWORDS)
  ) {
    return {
      intent: 'data_analysis',
      shouldUseDataAnalysis: true,
      reason: '用户在请求教学质量相关的数据分析。',
      metric: pickMetricFromPrompt(normalizedPrompt),
      groupBy: pickGroupByFromPrompt(normalizedPrompt),
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

  return {
    intent,
    shouldUseDataAnalysis,
    reason,
    metric,
    groupBy,
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
      max_tokens: 240,
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
