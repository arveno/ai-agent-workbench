import type { NormalizedRunEvent } from '@/domain/run/boundary';
import type {
  RunViewModel,
  RunViewModelAgentConclusion,
  RunViewModelConclusionSection,
  RunViewModelTrace,
} from '@/domain/run/view-model';

type RunConclusionEvent = Extract<
  NormalizedRunEvent,
  { type: 'conclusion_delta' | 'conclusion_completed' }
>;

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

function normalizeSections(sections: RunViewModelConclusionSection[]): RunViewModelConclusionSection[] | undefined {
  const normalizedSections = sections
    .map((section) => {
      const markdownText = normalizeMarkdownText(section.markdownText);
      const plainText = normalizeDisplayText(section.plainText) || createPlainTextFromMarkdown(markdownText);
      const title = typeof section.title === 'string' ? normalizeDisplayText(section.title) : '';

      return {
        ...(title ? { title } : {}),
        markdownText,
        plainText,
      };
    })
    .filter((section) => section.markdownText || section.plainText);

  return normalizedSections.length > 0 ? normalizedSections : undefined;
}

function normalizeNotice(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function createPlainTextFromSections(sections: RunViewModelConclusionSection[] | undefined): string {
  return sections?.map((section) => (section.title ? `${section.title}：${section.plainText}` : section.plainText)).join('\n\n') ?? '';
}

function createMarkdownTextFromSections(sections: RunViewModelConclusionSection[] | undefined): string {
  return sections?.map((section) => (section.title ? `**${section.title}**：${section.markdownText}` : section.markdownText)).join('\n\n') ?? '';
}

function extractSectionsFromMarkdown(value: string): RunViewModelConclusionSection[] | undefined {
  const normalizedValue = normalizeMarkdownText(value);
  const sections: RunViewModelConclusionSection[] = [];
  let currentSection: RunViewModelConclusionSection | null = null;

  for (const line of normalizedValue.split('\n')) {
    const matchedSection = matchConclusionSectionLine(line);

    if (matchedSection) {
      if (currentSection?.plainText.trim() || currentSection?.markdownText.trim()) {
        sections.push(currentSection);
      }

      currentSection = matchedSection;
      continue;
    }

    if (currentSection && line.trim()) {
      const markdownText = normalizeMarkdownText(line);
      const plainText = normalizeDisplayText(line);

      currentSection = {
        ...currentSection,
        markdownText: [currentSection.markdownText, markdownText].filter(Boolean).join('\n'),
        plainText: [currentSection.plainText, plainText].filter(Boolean).join(' '),
      };
    }
  }

  if (currentSection?.plainText.trim() || currentSection?.markdownText.trim()) {
    sections.push(currentSection);
  }

  return normalizeSections(sections);
}

function normalizeParsedConclusion(value: unknown): Pick<RunViewModelAgentConclusion, 'markdownText' | 'plainText' | 'sections'> {
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
    CONCLUSION_SECTION_FIELDS.map(({ title, keys }) => {
      const fieldValue = getConclusionFieldValue(value, keys);

      return {
        title,
        markdownText: stringifyMarkdownValue(fieldValue),
        plainText: stringifyConclusionValue(fieldValue),
      };
    }),
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

function matchConclusionSectionLine(line: string): RunViewModelConclusionSection | null {
  const titleAlternatives = CONCLUSION_SECTION_TITLES.join('|');
  const labelPattern = new RegExp(
    `^\\s*(?:\\d+[.)、]\\s*)?(?:[-*+]\\s*)?(?:#{1,6}\\s*)?(?:\\*\\*)?\\s*(${titleAlternatives})\\s*(?:\\*\\*)?\\s*[：:]\\s*(.*)$`,
  );
  const headingPattern = new RegExp(
    `^\\s*(?:\\d+[.)、]\\s*)?(?:[-*+]\\s*)?(?:#{1,6}\\s*)?(?:\\*\\*)?\\s*(${titleAlternatives})\\s*(?:\\*\\*)?\\s*$`,
  );
  const labelMatch = line.match(labelPattern);

  if (labelMatch) {
    const sectionText = labelMatch[2] ?? '';

    return {
      title: labelMatch[1],
      markdownText: normalizeMarkdownText(sectionText),
      plainText: normalizeDisplayText(sectionText),
    };
  }

  const headingMatch = line.match(headingPattern);

  if (headingMatch) {
    return {
      title: headingMatch[1],
      markdownText: '',
      plainText: '',
    };
  }

  return null;
}

function normalizeConclusionText(value: string): Pick<RunViewModelAgentConclusion, 'markdownText' | 'plainText' | 'sections'> {
  const markdownText = normalizeMarkdownText(value);
  const sections = extractSectionsFromMarkdown(markdownText);

  return {
    markdownText,
    plainText: sections ? createPlainTextFromSections(sections) : createPlainTextFromMarkdown(markdownText),
    ...(sections ? { sections } : {}),
  };
}

function coerceAgentConclusion(value: unknown, fallbackText: string): RunViewModelAgentConclusion | null {
  if (!isRecord(value) || (typeof value.markdownText !== 'string' && typeof value.plainText !== 'string')) {
    return null;
  }

  const sections = Array.isArray(value.sections)
    ? normalizeSections(
        value.sections
          .filter(isRecord)
          .map((section) => ({
            title: typeof section.title === 'string' ? section.title : null,
            markdownText: typeof section.markdownText === 'string' ? section.markdownText : '',
            plainText: typeof section.plainText === 'string' ? section.plainText : '',
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
  const notice = normalizeNotice(value.notice);

  if (!markdownText && !plainText) {
    return null;
  }

  return {
    markdownText: markdownText || plainText,
    plainText,
    ...(sections ? { sections } : {}),
    ...(notice ? { notice } : {}),
    ...(rawText && rawText !== markdownText ? { rawText } : {}),
  };
}

function withModelTrace(run: RunViewModel, modelTrace?: RunViewModelTrace): RunViewModel {
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

export function normalizeAgentConclusion(
  rawText: string,
  existingConclusion?: unknown,
): RunViewModelAgentConclusion {
  const hasExistingMarkdownText =
    isRecord(existingConclusion) && typeof existingConclusion.markdownText === 'string' && existingConclusion.markdownText.trim();
  const existing = hasExistingMarkdownText ? coerceAgentConclusion(existingConclusion, rawText) : null;

  if (existing) {
    return existing;
  }

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
  const notice = isRecord(existingConclusion) ? normalizeNotice(existingConclusion.notice) : null;

  return {
    markdownText,
    plainText,
    ...(normalized.sections ? { sections: normalized.sections } : {}),
    ...(notice ? { notice } : {}),
    ...(rawValue && rawValue !== markdownText ? { rawText: rawValue } : {}),
  };
}

export function reduceRunConclusionState(run: RunViewModel, event: RunConclusionEvent): RunViewModel {
  if (event.type === 'conclusion_delta') {
    return {
      ...run,
      conclusion: `${run.conclusion || ''}${event.delta}`,
    };
  }

  const conclusionSource = event.modelTrace?.conclusionSource ?? run.modelTrace?.conclusionSource ?? 'none';
  const agentConclusion = normalizeAgentConclusion(
    event.conclusion,
    event.agentConclusion,
  );

  return withModelTrace(
    {
      ...run,
      conclusion: agentConclusion.plainText,
      conclusionSource,
      agentConclusion,
    },
    event.modelTrace,
  );
}
