import type { PromptTemplate, PromptTemplateId } from '@/types/prompt';

const PROMPT_TEMPLATE_STORAGE_KEY = 'ai_agent_workbench_prompt_templates';

type StoredPromptTemplate = {
  content: string;
  updatedAt: string;
};

type StoredPromptTemplateMap = Partial<Record<PromptTemplateId, StoredPromptTemplate>>;

export const DEFAULT_PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    id: 'planner',
    name: 'Planner Prompt',
    description: '用于判断用户问题类型，并输出结构化执行计划。',
    variables: ['{{user_input}}', '{{available_tools}}', '{{datasource_schema}}'],
    defaultContent: `你是一个教育数据分析工作台的任务规划器。

你需要判断用户输入属于哪种类型：

1. capability_intro
用户询问系统能力、怎么使用、能做什么，不需要进入数据分析流程。

2. data_analysis
用户要求分析教学质量、成绩、出勤率、作业完成率、异常指标、趋势或对比，需要进入数据分析流程。

3. unsupported
用户问题与当前教育数据分析工作台无关，当前系统暂不支持。

请只返回结构化 JSON，不要输出 Markdown。`,
    currentContent: `你是一个教育数据分析工作台的任务规划器。

你需要判断用户输入属于哪种类型：

1. capability_intro
用户询问系统能力、怎么使用、能做什么，不需要进入数据分析流程。

2. data_analysis
用户要求分析教学质量、成绩、出勤率、作业完成率、异常指标、趋势或对比，需要进入数据分析流程。

3. unsupported
用户问题与当前教育数据分析工作台无关，当前系统暂不支持。

请只返回结构化 JSON，不要输出 Markdown。`,
  },
  {
    id: 'analysis',
    name: 'Analysis Prompt',
    description: '用于基于工具结果生成数据分析结论。',
    variables: ['{{user_input}}', '{{tool_results}}', '{{chart_summary}}', '{{time_range}}'],
    defaultContent: `你是一个教育数据分析助手。

请基于工具返回的数据生成简洁、可信的分析结论。

要求：
- 只基于工具结果回答，不编造数据。
- 如果数据不足，请明确说明。
- 如果用户指定了时间范围，只分析该时间范围内的数据。
- 输出包含关键发现、可能原因和下一步建议。`,
    currentContent: `你是一个教育数据分析助手。

请基于工具返回的数据生成简洁、可信的分析结论。

要求：
- 只基于工具结果回答，不编造数据。
- 如果数据不足，请明确说明。
- 如果用户指定了时间范围，只分析该时间范围内的数据。
- 输出包含关键发现、可能原因和下一步建议。`,
  },
  {
    id: 'report',
    name: 'Report Prompt',
    description: '用于生成简版 Markdown 分析报告。',
    variables: ['{{run_prompt}}', '{{tool_invocations}}', '{{chart_data}}', '{{conclusion}}'],
    defaultContent: `请根据本次 Agent Run 的结果生成一份简版 Markdown 报告。

报告需要包含：
1. 分析问题
2. 使用数据源
3. 调用工具
4. 关键发现
5. 分析结论
6. 后续建议

要求：
- 不使用工具结果之外的数据。
- 不编造未出现的结论。
- 内容简洁，适合业务人员阅读。`,
    currentContent: `请根据本次 Agent Run 的结果生成一份简版 Markdown 报告。

报告需要包含：
1. 分析问题
2. 使用数据源
3. 调用工具
4. 关键发现
5. 分析结论
6. 后续建议

要求：
- 不使用工具结果之外的数据。
- 不编造未出现的结论。
- 内容简洁，适合业务人员阅读。`,
  },
  {
    id: 'fallback',
    name: 'Fallback Summary Prompt',
    description: '用于模型不可用时，根据工具结果生成本地摘要。',
    variables: ['{{tool_results}}', '{{chart_summary}}', '{{reason}}'],
    defaultContent: `当模型不可用时，请根据当前工具结果生成本地摘要。

要求：
- 明确提示当前结论由本地工具摘要生成。
- 不伪装成模型生成。
- 不展示原始 JSON。
- 只总结工具结果中明确存在的信息。`,
    currentContent: `当模型不可用时，请根据当前工具结果生成本地摘要。

要求：
- 明确提示当前结论由本地工具摘要生成。
- 不伪装成模型生成。
- 不展示原始 JSON。
- 只总结工具结果中明确存在的信息。`,
  },
];

function cloneDefaultTemplates(): PromptTemplate[] {
  return DEFAULT_PROMPT_TEMPLATES.map((template) => ({ ...template }));
}

function canUseSessionStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined';
}

function isPromptTemplateId(value: string): value is PromptTemplateId {
  return value === 'planner' || value === 'analysis' || value === 'report' || value === 'fallback';
}

function isStoredPromptTemplate(value: unknown): value is StoredPromptTemplate {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as { content?: unknown; updatedAt?: unknown };
  return typeof candidate.content === 'string' && typeof candidate.updatedAt === 'string';
}

function readStoredTemplateMap(): StoredPromptTemplateMap {
  if (!canUseSessionStorage()) {
    return {};
  }

  try {
    const raw = window.sessionStorage.getItem(PROMPT_TEMPLATE_STORAGE_KEY);

    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as unknown;

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    return Object.entries(parsed).reduce<StoredPromptTemplateMap>((result, [key, value]) => {
      if (isPromptTemplateId(key) && isStoredPromptTemplate(value)) {
        result[key] = value;
      }

      return result;
    }, {});
  } catch {
    return {};
  }
}

function writeStoredTemplateMap(templateMap: StoredPromptTemplateMap): void {
  if (!canUseSessionStorage()) {
    return;
  }

  try {
    const nonEmptyEntries = Object.entries(templateMap).filter(([, value]) => Boolean(value));

    if (nonEmptyEntries.length === 0) {
      window.sessionStorage.removeItem(PROMPT_TEMPLATE_STORAGE_KEY);
      return;
    }

    window.sessionStorage.setItem(PROMPT_TEMPLATE_STORAGE_KEY, JSON.stringify(Object.fromEntries(nonEmptyEntries)));
  } catch {
    // Session storage can be unavailable in restricted browser contexts.
  }
}

function mergeTemplatesWithStored(templateMap: StoredPromptTemplateMap): PromptTemplate[] {
  return cloneDefaultTemplates().map((template) => {
    const storedTemplate = templateMap[template.id];

    if (!storedTemplate) {
      return template;
    }

    return {
      ...template,
      currentContent: storedTemplate.content,
      updatedAt: storedTemplate.updatedAt,
    };
  });
}

export function readPromptTemplates(): PromptTemplate[] {
  return mergeTemplatesWithStored(readStoredTemplateMap());
}

export function savePromptTemplate(templateId: PromptTemplateId, content: string): PromptTemplate[] {
  const trimmedContent = content.trim();
  const templateMap = readStoredTemplateMap();
  const defaultTemplate = DEFAULT_PROMPT_TEMPLATES.find((template) => template.id === templateId);

  if (!defaultTemplate) {
    return readPromptTemplates();
  }

  if (trimmedContent === defaultTemplate.defaultContent.trim()) {
    delete templateMap[templateId];
  } else {
    templateMap[templateId] = {
      content,
      updatedAt: new Date().toISOString(),
    };
  }

  writeStoredTemplateMap(templateMap);
  return mergeTemplatesWithStored(templateMap);
}

export function resetPromptTemplate(templateId: PromptTemplateId): PromptTemplate[] {
  const templateMap = readStoredTemplateMap();
  delete templateMap[templateId];
  writeStoredTemplateMap(templateMap);
  return mergeTemplatesWithStored(templateMap);
}

export function resetAllPromptTemplates(): PromptTemplate[] {
  writeStoredTemplateMap({});
  return cloneDefaultTemplates();
}
