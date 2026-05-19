import type { AgentConclusionSection, AgentConclusionSource, RunConclusionSource, RunSnapshot } from '@/types/run';

export interface ConclusionSectionView {
  title: string;
  content: string;
}

export interface ConclusionViewModel {
  fullMarkdownText: string;
  plainText: string;
  compactSections: ConclusionSectionView[];
  compactMarkdownText: string;
  source: AgentConclusionSource;
}

const COMPACT_SECTION_TITLES = ['关键发现', '可能原因', '下一步建议'];
const COMPACT_MARKDOWN_MAX_LENGTH = 700;
const COMPACT_MARKDOWN_MAX_BLOCKS = 3;

function normalizeText(value: string | null | undefined): string {
  return typeof value === 'string' ? value.replace(/\\n/g, '\n').trim() : '';
}

function toConclusionSource(source: AgentConclusionSource | RunConclusionSource | undefined): AgentConclusionSource {
  return source === 'model' || source === 'fallback' || source === 'mock' ? source : 'fallback';
}

function normalizeSection(section: AgentConclusionSection): ConclusionSectionView | null {
  const title = normalizeText(section.title);
  const content = normalizeText(section.content);

  if (!title || !content) {
    return null;
  }

  return {
    title,
    content,
  };
}

function getCompactSections(sections: AgentConclusionSection[] | undefined): ConclusionSectionView[] {
  const normalizedSections = (sections ?? [])
    .map((section) => normalizeSection(section))
    .filter((section): section is ConclusionSectionView => section !== null);

  if (normalizedSections.length === 0) {
    return [];
  }

  const primarySections = COMPACT_SECTION_TITLES
    .map((title) => normalizedSections.find((section) => section.title === title))
    .filter((section): section is ConclusionSectionView => section !== undefined);

  return primarySections.length > 0 ? primarySections : normalizedSections.slice(0, COMPACT_MARKDOWN_MAX_BLOCKS);
}

function limitText(value: string): string {
  if (value.length <= COMPACT_MARKDOWN_MAX_LENGTH) {
    return value;
  }

  return `${value.slice(0, COMPACT_MARKDOWN_MAX_LENGTH).trimEnd()}...`;
}

function createCompactMarkdownText(markdownText: string, plainText: string): string {
  const sourceText = normalizeText(markdownText) || normalizeText(plainText);
  const blocks = sourceText
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
  const compactText = blocks.length > 0 ? blocks.slice(0, COMPACT_MARKDOWN_MAX_BLOCKS).join('\n\n') : sourceText;

  return limitText(compactText);
}

function createMarkdownFromSections(sections: ConclusionSectionView[]): string {
  return sections.map((section) => `**${section.title}**：${section.content}`).join('\n\n');
}

export function createConclusionViewModel(run: RunSnapshot): ConclusionViewModel {
  const conclusion = run.agentConclusion;
  const fullMarkdownText = normalizeText(conclusion?.markdownText) || normalizeText(run.conclusion);
  const plainText = normalizeText(conclusion?.plainText) || normalizeText(run.conclusion);
  const compactSections = getCompactSections(conclusion?.sections);

  return {
    fullMarkdownText,
    plainText,
    compactSections,
    compactMarkdownText:
      compactSections.length > 0 ? createMarkdownFromSections(compactSections) : createCompactMarkdownText(fullMarkdownText, plainText),
    source: toConclusionSource(conclusion?.source ?? run.conclusionSource),
  };
}
