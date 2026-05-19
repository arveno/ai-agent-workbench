import type {
  AgentConclusion,
  AgentConclusionSource,
  AgentConclusionSection,
  RunConclusionSource,
  RunEvent,
  RunModelTrace,
  RunSnapshot,
  RunStep,
  RunToolInvocation,
} from '@/types/run';

function nowIso(): string {
  return new Date().toISOString();
}

function isRunIdMatched(currentRun: RunSnapshot | null, runId: string): currentRun is RunSnapshot {
  return Boolean(currentRun && currentRun.id === runId);
}

function withUpdatedAt(run: RunSnapshot, updatedAt = nowIso()): RunSnapshot {
  return {
    ...run,
    updatedAt,
  };
}

function withModelTrace(run: RunSnapshot, modelTrace?: RunModelTrace): RunSnapshot {
  if (!modelTrace) {
    return run;
  }

  return {
    ...run,
    modelTrace: {
      ...run.modelTrace,
      ...modelTrace,
    },
  };
}

const CONCLUSION_SECTION_FIELDS: Array<{ title: string; keys: string[] }> = [
  { title: '关键发现', keys: ['keyFindings', 'key_findings', 'findings'] },
  { title: '可能原因', keys: ['possibleCauses', 'possible_causes', 'causes'] },
  { title: '下一步建议', keys: ['nextSteps', 'next_steps', 'recommendations', 'suggestions'] },
  { title: '摘要', keys: ['summary'] },
  { title: '结论', keys: ['conclusion'] },
];

const CONCLUSION_SECTION_TITLES = CONCLUSION_SECTION_FIELDS.map((field) => field.title);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toAgentConclusionSource(source: RunConclusionSource): AgentConclusionSource {
  return source === 'model' || source === 'fallback' || source === 'mock' ? source : 'fallback';
}

function stripJsonFence(value: string): string {
  return value
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function normalizeDisplayText(value: string): string {
  return value
    .replace(/\\n/g, '\n')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/^```(?:\w+)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+[.)、]\s*/gm, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalizeMarkdownText(value: string): string {
  return value
    .replace(/\\n/g, '\n')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();
}

function createPlainTextFromMarkdown(value: string): string {
  return normalizeDisplayText(value);
}

function stringifyConclusionValue(value: unknown): string {
  if (typeof value === 'string') {
    return normalizeDisplayText(value);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => stringifyConclusionValue(item))
      .filter(Boolean)
      .join('；');
  }

  if (isRecord(value)) {
    return Object.values(value)
      .map((item) => stringifyConclusionValue(item))
      .filter(Boolean)
      .join('；');
  }

  return '';
}

function stringifyMarkdownValue(value: unknown): string {
  if (typeof value === 'string') {
    return normalizeMarkdownText(value);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => stringifyMarkdownValue(item))
      .filter(Boolean)
      .map((item) => (item.startsWith('- ') ? item : `- ${item}`))
      .join('\n');
  }

  if (isRecord(value)) {
    return Object.values(value)
      .map((item) => stringifyMarkdownValue(item))
      .filter(Boolean)
      .join('\n\n');
  }

  return '';
}

function getConclusionFieldValue(record: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) {
      return record[key];
    }
  }

  return undefined;
}

function parseConclusionJson(value: string): unknown | null {
  const candidate = stripJsonFence(value);
  const looksLikeJson =
    (candidate.startsWith('{') && candidate.endsWith('}')) ||
    (candidate.startsWith('[') && candidate.endsWith(']')) ||
    (candidate.startsWith('"') && candidate.endsWith('"'));

  if (!looksLikeJson) {
    return null;
  }

  try {
    return JSON.parse(candidate) as unknown;
  } catch {
    return null;
  }
}

function normalizeSections(sections: AgentConclusionSection[]): AgentConclusionSection[] | undefined {
  const normalizedSections = sections
    .map((section) => ({
      title: normalizeDisplayText(section.title),
      content: normalizeDisplayText(section.content),
    }))
    .filter((section) => section.title && section.content);

  return normalizedSections.length > 0 ? normalizedSections : undefined;
}

function createPlainTextFromSections(sections: AgentConclusionSection[] | undefined): string {
  return sections?.map((section) => `${section.title}：${section.content}`).join('\n\n') ?? '';
}

function createMarkdownTextFromSections(sections: AgentConclusionSection[] | undefined): string {
  return sections?.map((section) => `**${section.title}**：${section.content}`).join('\n\n') ?? '';
}

function extractSectionsFromMarkdown(value: string): AgentConclusionSection[] | undefined {
  const normalizedValue = normalizeMarkdownText(value);
  const sections: AgentConclusionSection[] = [];
  let currentSection: AgentConclusionSection | null = null;

  for (const line of normalizedValue.split('\n')) {
    const matchedSection = matchConclusionSectionLine(line);

    if (matchedSection) {
      if (currentSection?.content.trim()) {
        sections.push(currentSection);
      }

      currentSection = matchedSection;
      continue;
    }

    if (currentSection && line.trim()) {
      currentSection = {
        ...currentSection,
        content: [currentSection.content, normalizeDisplayText(line)].filter(Boolean).join(' '),
      };
    }
  }

  if (currentSection?.content.trim()) {
    sections.push(currentSection);
  }

  return normalizeSections(sections);
}

function normalizeParsedConclusion(value: unknown): Pick<AgentConclusion, 'markdownText' | 'plainText' | 'sections'> {
  if (typeof value === 'string') {
    return normalizeConclusionText(value);
  }

  if (Array.isArray(value)) {
    const markdownText = stringifyMarkdownValue(value);

    return {
      markdownText,
      plainText: createPlainTextFromMarkdown(markdownText),
    };
  }

  if (!isRecord(value)) {
    return {
      markdownText: '',
      plainText: '',
    };
  }

  const primaryValue = getConclusionFieldValue(value, ['content', 'markdownText', 'markdown', 'conclusion', 'summary']);

  if (primaryValue !== undefined) {
    const markdownText = stringifyMarkdownValue(primaryValue);

    return {
      markdownText,
      plainText: createPlainTextFromMarkdown(markdownText),
      sections: extractSectionsFromMarkdown(markdownText),
    };
  }

  const sections = normalizeSections(
    CONCLUSION_SECTION_FIELDS.map(({ title, keys }) => ({
      title,
      content: stringifyConclusionValue(getConclusionFieldValue(value, keys)),
    })),
  );

  if (sections) {
    const markdownText = createMarkdownTextFromSections(sections);

    return {
      sections,
      markdownText,
      plainText: createPlainTextFromSections(sections),
    };
  }

  return {
    markdownText: '',
    plainText: '',
  };
}

function matchConclusionSectionLine(line: string): { title: string; content: string } | null {
  const titleAlternatives = CONCLUSION_SECTION_TITLES.join('|');
  const labelPattern = new RegExp(
    `^\\s*(?:\\d+[.)、]\\s*)?(?:[-*+]\\s*)?(?:#{1,6}\\s*)?(?:\\*\\*)?\\s*(${titleAlternatives})\\s*(?:\\*\\*)?\\s*[：:]\\s*(.*)$`,
  );
  const headingPattern = new RegExp(
    `^\\s*(?:\\d+[.)、]\\s*)?(?:[-*+]\\s*)?(?:#{1,6}\\s*)?(?:\\*\\*)?\\s*(${titleAlternatives})\\s*(?:\\*\\*)?\\s*$`,
  );
  const labelMatch = line.match(labelPattern);

  if (labelMatch) {
    return {
      title: labelMatch[1],
      content: labelMatch[2] ?? '',
    };
  }

  const headingMatch = line.match(headingPattern);

  if (headingMatch) {
    return {
      title: headingMatch[1],
      content: '',
    };
  }

  return null;
}

function normalizeConclusionText(value: string): Pick<AgentConclusion, 'markdownText' | 'plainText' | 'sections'> {
  const markdownText = normalizeMarkdownText(value);
  const sections = extractSectionsFromMarkdown(markdownText);

  return {
    markdownText,
    plainText: sections ? createPlainTextFromSections(sections) : createPlainTextFromMarkdown(markdownText),
    ...(sections ? { sections } : {}),
  };
}

function coerceAgentConclusion(value: unknown, source: RunConclusionSource, fallbackText: string): AgentConclusion | null {
  if (!isRecord(value) || (typeof value.markdownText !== 'string' && typeof value.plainText !== 'string')) {
    return null;
  }

  const sections = Array.isArray(value.sections)
    ? normalizeSections(
        value.sections
          .filter(isRecord)
          .map((section) => ({
            title: typeof section.title === 'string' ? section.title : '',
            content: typeof section.content === 'string' ? section.content : '',
          })),
      )
    : undefined;
  const markdownText = normalizeMarkdownText(
    typeof value.markdownText === 'string' ? value.markdownText : typeof value.plainText === 'string' ? value.plainText : fallbackText,
  );
  const plainText =
    (typeof value.plainText === 'string' ? normalizeDisplayText(value.plainText) : '') ||
    createPlainTextFromSections(sections) ||
    createPlainTextFromMarkdown(markdownText);
  const rawText = typeof value.rawText === 'string' && value.rawText.trim() ? value.rawText.trim() : undefined;

  if (!markdownText && !plainText) {
    return null;
  }

  return {
    source: toAgentConclusionSource(source),
    markdownText: markdownText || plainText,
    plainText,
    ...(sections ? { sections } : {}),
    ...(rawText && rawText !== markdownText ? { rawText } : {}),
  };
}

export function normalizeAgentConclusion(
  source: RunConclusionSource,
  rawText: string,
  existingConclusion?: unknown,
): AgentConclusion {
  const hasExistingMarkdownText =
    isRecord(existingConclusion) && typeof existingConclusion.markdownText === 'string' && existingConclusion.markdownText.trim();
  const existing = hasExistingMarkdownText ? coerceAgentConclusion(existingConclusion, source, rawText) : null;

  if (existing) {
    return existing;
  }

  const normalizedSource = toAgentConclusionSource(source);
  const rawValue =
    isRecord(existingConclusion) && typeof existingConclusion.rawText === 'string' && existingConclusion.rawText.trim()
      ? existingConclusion.rawText.trim()
      : typeof rawText === 'string'
        ? rawText.trim()
        : '';
  const parsedJson = rawValue ? parseConclusionJson(rawValue) : null;
  const normalized = parsedJson === null ? normalizeConclusionText(rawValue) : normalizeParsedConclusion(parsedJson);
  const markdownText = normalized.markdownText || normalizeMarkdownText(rawValue);
  const plainText = normalized.plainText || createPlainTextFromMarkdown(markdownText);

  return {
    source: normalizedSource,
    markdownText,
    plainText,
    ...(normalized.sections ? { sections: normalized.sections } : {}),
    ...(rawValue && rawValue !== markdownText ? { rawText: rawValue } : {}),
  };
}

function updateStep(
  steps: RunStep[],
  stepId: string,
  updater: (step: RunStep) => RunStep,
): RunStep[] {
  return steps.map((step) => (step.id === stepId ? updater(step) : step));
}

function updateTool(
  toolInvocations: RunToolInvocation[],
  toolId: string,
  updater: (tool: RunToolInvocation) => RunToolInvocation,
): RunToolInvocation[] {
  return toolInvocations.map((tool) => (tool.id === toolId ? updater(tool) : tool));
}

export function applyRunEventToSnapshot(currentRun: RunSnapshot | null, event: RunEvent): RunSnapshot | null {
  if (event.type === 'run_started') {
    const updatedAt = event.run.updatedAt || nowIso();
    const agentConclusion = normalizeAgentConclusion(
      event.run.conclusionSource,
      event.run.conclusion,
      event.run.agentConclusion,
    );

    return {
      ...event.run,
      status: event.run.status === 'idle' ? 'pending' : event.run.status,
      conclusion: agentConclusion.plainText,
      agentConclusion: agentConclusion.plainText ? agentConclusion : undefined,
      updatedAt,
    };
  }

  if (!isRunIdMatched(currentRun, event.runId)) {
    return currentRun;
  }

  if (event.type === 'step_started') {
    const existingStep = currentRun.steps.find((step) => step.id === event.stepId);
    const nextStep: RunStep = {
      id: event.stepId,
      title: event.title,
      description: event.description,
      status: 'running',
      startedAt: event.startedAt,
    };
    const nextSteps = existingStep
      ? updateStep(currentRun.steps, event.stepId, (step) => ({
          ...step,
          title: event.title,
          description: event.description,
          status: 'running',
          startedAt: event.startedAt,
        }))
      : [...currentRun.steps, nextStep];

    return withUpdatedAt({
      ...currentRun,
      status: 'running',
      steps: nextSteps,
    });
  }

  if (event.type === 'step_completed') {
    return withUpdatedAt({
      ...currentRun,
      steps: updateStep(currentRun.steps, event.stepId, (step) => ({
        ...step,
        status: 'success',
        completedAt: event.completedAt,
        elapsedMs: event.elapsedMs,
      })),
    });
  }

  if (event.type === 'step_failed') {
    return withUpdatedAt({
      ...currentRun,
      steps: updateStep(currentRun.steps, event.stepId, (step) => ({
        ...step,
        status: 'error',
        description: event.errorMessage,
        completedAt: event.completedAt,
        elapsedMs: event.elapsedMs,
      })),
    });
  }

  if (event.type === 'tool_started') {
    const existingTool = currentRun.toolInvocations.find((tool) => tool.id === event.tool.id);
    const nextTools = existingTool
      ? updateTool(currentRun.toolInvocations, event.tool.id, () => ({ ...event.tool }))
      : [...currentRun.toolInvocations, { ...event.tool }];

    return withUpdatedAt({
      ...currentRun,
      status: 'running',
      toolInvocations: nextTools,
    });
  }

  if (event.type === 'tool_completed') {
    return withUpdatedAt({
      ...currentRun,
      toolInvocations: updateTool(currentRun.toolInvocations, event.toolId, (tool) => ({
        ...tool,
        status: 'success',
        outputSummary: event.outputSummary,
        completedAt: event.completedAt,
        elapsedMs: event.elapsedMs,
      })),
    });
  }

  if (event.type === 'tool_failed') {
    return withUpdatedAt({
      ...currentRun,
      toolInvocations: updateTool(currentRun.toolInvocations, event.toolId, (tool) => ({
        ...tool,
        status: 'error',
        outputSummary: event.errorMessage,
        completedAt: event.completedAt,
        elapsedMs: event.elapsedMs,
      })),
    });
  }

  if (event.type === 'chart_ready') {
    return withUpdatedAt({
      ...currentRun,
      chartData: event.chartData,
    });
  }

  if (event.type === 'conclusion_delta') {
    return withUpdatedAt({
      ...currentRun,
      conclusion: `${currentRun.conclusion || ''}${event.delta}`,
    });
  }

  if (event.type === 'conclusion_completed') {
    const agentConclusion = normalizeAgentConclusion(
      event.conclusionSource,
      event.conclusion,
      event.agentConclusion,
    );

    return withUpdatedAt(
      withModelTrace(
        {
          ...currentRun,
          conclusion: agentConclusion.plainText,
          conclusionSource: event.conclusionSource,
          agentConclusion,
          conclusionNotice: event.conclusionNotice,
        },
        event.modelTrace,
      ),
    );
  }

  if (event.type === 'rag_sources_ready') {
    return withUpdatedAt({
      ...currentRun,
      sources: event.sources,
    });
  }

  if (event.type === 'report_pending') {
    return withUpdatedAt({
      ...currentRun,
      reportState: 'pending',
    });
  }

  if (event.type === 'run_completed') {
    return withUpdatedAt(
      withModelTrace(
        {
          ...currentRun,
          status: 'success',
          completedAt: event.completedAt,
          elapsedMs: event.elapsedMs,
        },
        event.modelTrace,
      ),
      event.completedAt,
    );
  }

  if (event.type === 'run_failed') {
    return withUpdatedAt({
      ...currentRun,
      status: 'error',
      errorMessage: event.errorMessage,
    });
  }

  if (event.type === 'run_stopped') {
    const stoppedAt = nowIso();

    return withUpdatedAt(
      {
        ...currentRun,
        status: 'stopped',
        steps: currentRun.steps.map((step) =>
          step.status === 'running'
            ? {
                ...step,
                status: 'stopped',
                completedAt: stoppedAt,
              }
            : step,
        ),
        toolInvocations: currentRun.toolInvocations.map((tool) =>
          tool.status === 'running'
            ? {
                ...tool,
                status: 'stopped',
                completedAt: stoppedAt,
              }
            : tool,
        ),
      },
      stoppedAt,
    );
  }

  return currentRun;
}
