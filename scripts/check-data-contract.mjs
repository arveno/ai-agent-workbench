import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const checkAll = process.argv.includes('--all');
const formalCodeRoots = ['src', 'tencent/functions'];
const codeExtensions = new Set(['.js', '.jsx', '.ts', '.tsx']);
const ignoredPathParts = new Set(['node_modules', 'dist', 'build', 'coverage']);
const isCi = process.env.GITHUB_ACTIONS === 'true' || process.env.CI === 'true';
const identifierPattern = '[$_A-Za-z][$_A-Za-z0-9]*';

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const propertyAccessPattern = (objectName, propertyName) => {
  const object = escapeRegExp(objectName);
  const property = escapeRegExp(propertyName);
  const quotedProperty = `['"]${property}['"]`;

  return `\\b${object}\\s*(?:\\??\\s*\\.\\s*${property}\\b|\\??\\s*\\.\\s*\\[\\s*${quotedProperty}\\s*\\]|\\[\\s*${quotedProperty}\\s*\\])`;
};

const propertyAccess = (objectName, propertyName) =>
  new RegExp(propertyAccessPattern(objectName, propertyName));

const destructuringForbiddenFields = [
  { label: 'agentConclusion.source', objectName: 'agentConclusion', propertyName: 'source' },
  { label: 'agentConclusion.conclusionSource', objectName: 'agentConclusion', propertyName: 'conclusionSource' },
  { label: 'agentConclusion.fallbackReason', objectName: 'agentConclusion', propertyName: 'fallbackReason' },
  { label: 'agentConclusion.modelErrorType', objectName: 'agentConclusion', propertyName: 'modelErrorType' },
  { label: 'agentConclusion.content', objectName: 'agentConclusion', propertyName: 'content' },
  { label: 'agentConclusion.summary', objectName: 'agentConclusion', propertyName: 'summary' },
  { label: 'metadata.clientRunId', objectName: 'metadata', propertyName: 'clientRunId' },
  { label: 'metadata.selectedModelId', objectName: 'metadata', propertyName: 'selectedModelId' },
  { label: 'metadata.provider', objectName: 'metadata', propertyName: 'provider' },
  { label: 'metadata.model', objectName: 'metadata', propertyName: 'model' },
  { label: 'metadata.conclusionSource', objectName: 'metadata', propertyName: 'conclusionSource' },
  { label: 'metadata.usage', objectName: 'metadata', propertyName: 'usage' },
  { label: 'metadata.costEstimate', objectName: 'metadata', propertyName: 'costEstimate' },
  { label: 'metadata.fallbackReason', objectName: 'metadata', propertyName: 'fallbackReason' },
  { label: 'metadata.modelErrorType', objectName: 'metadata', propertyName: 'modelErrorType' },
  { label: 'modelTrace.tokenUsage', objectName: 'modelTrace', propertyName: 'tokenUsage' },
];

export const forbiddenPatterns = [
  { label: 'tokenUsage', regex: /\btokenUsage\b/ },
  { label: 'conclusionNotice', regex: /\bconclusionNotice\b/ },
  { label: 'agentConclusion.source', regex: propertyAccess('agentConclusion', 'source') },
  { label: 'agentConclusion.conclusionSource', regex: propertyAccess('agentConclusion', 'conclusionSource') },
  { label: 'agentConclusion.fallbackReason', regex: propertyAccess('agentConclusion', 'fallbackReason') },
  { label: 'agentConclusion.modelErrorType', regex: propertyAccess('agentConclusion', 'modelErrorType') },
  { label: 'agentConclusion.content', regex: propertyAccess('agentConclusion', 'content') },
  { label: 'agentConclusion.summary', regex: propertyAccess('agentConclusion', 'summary') },
  { label: 'metadata.clientRunId', regex: propertyAccess('metadata', 'clientRunId') },
  { label: 'modelTrace.tokenUsage', regex: propertyAccess('modelTrace', 'tokenUsage') },
  { label: 'usage ?? tokenUsage', regex: /\busage\s*\?\?\s*tokenUsage\b/ },
  { label: 'tokenUsage || usage', regex: /\btokenUsage\s*\|\|\s*usage\b/ },
  {
    label: "rawRun.conclusionSource ?? 'mock'",
    regex: new RegExp(`${propertyAccessPattern('rawRun', 'conclusionSource')}\\s*\\?\\?\\s*['"]mock['"]`),
  },
  { label: 'metadata.selectedModelId', regex: propertyAccess('metadata', 'selectedModelId') },
  { label: 'metadata.provider', regex: propertyAccess('metadata', 'provider') },
  { label: 'metadata.model', regex: propertyAccess('metadata', 'model') },
  { label: 'metadata.conclusionSource', regex: propertyAccess('metadata', 'conclusionSource') },
  { label: 'metadata.usage', regex: propertyAccess('metadata', 'usage') },
  { label: 'metadata.costEstimate', regex: propertyAccess('metadata', 'costEstimate') },
  { label: 'metadata.fallbackReason', regex: propertyAccess('metadata', 'fallbackReason') },
  { label: 'metadata.modelErrorType', regex: propertyAccess('metadata', 'modelErrorType') },
];

function git(args) {
  return execFileSync('git', args, { cwd: rootDir, encoding: 'utf8' }).trim();
}

function isFormalCodePath(filePath) {
  const normalized = filePath.split(path.sep).join('/');
  if (!formalCodeRoots.some((root) => normalized === root || normalized.startsWith(`${root}/`))) {
    return false;
  }

  if ([...ignoredPathParts].some((part) => normalized.split('/').includes(part))) {
    return false;
  }

  if (/(^|\/)README\.md$/i.test(normalized) || /(^|\/)package\.json$/i.test(normalized)) {
    return false;
  }

  return codeExtensions.has(path.extname(normalized));
}

async function walk(dir) {
  const entries = await readdir(path.join(rootDir, dir), { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const relativePath = path.join(dir, entry.name);
    const normalized = relativePath.split(path.sep).join('/');
    if (entry.isDirectory()) {
      if (!ignoredPathParts.has(entry.name)) {
        files.push(...(await walk(normalized)));
      }
    } else if (isFormalCodePath(normalized)) {
      files.push(normalized);
    }
  }

  return files;
}

export function changedFilesFromGit() {
  const baseBranch = process.env.GITHUB_BASE_REF;
  const baseRef = baseBranch ? `origin/${baseBranch}` : 'origin/stage/w3-token-cost-usage';
  const files = new Set();
  let resolvedMergeBase = false;

  try {
    if (isCi && !baseBranch) {
      throw new Error('GITHUB_BASE_REF is not set for this CI run.');
    }
    git(['rev-parse', '--verify', `${baseRef}^{commit}`]);
    const mergeBase = git(['merge-base', 'HEAD', baseRef]);
    resolvedMergeBase = true;
    for (const file of git(['diff', '--name-only', '--diff-filter=ACMRT', `${mergeBase}...HEAD`]).split(/\r?\n/)) {
      if (file) files.add(file);
    }
  } catch (error) {
    if (isCi) {
      throw new Error(
        `Data Contract Check could not resolve base ref ${baseRef} or merge-base. ${error.message}`,
      );
    }

    console.warn(
      `Data Contract Check warning: could not resolve ${baseRef}; falling back to local unstaged/untracked diff.`,
    );
  }

  if (!resolvedMergeBase) {
    try {
      for (const file of git(['diff', '--name-only', '--diff-filter=ACMRT']).split(/\r?\n/)) {
        if (file) files.add(file);
      }
    } catch {
      // No-op outside git, handled by the empty set below.
    }

    try {
      for (const file of git(['ls-files', '--others', '--exclude-standard']).split(/\r?\n/)) {
        if (file) files.add(file);
      }
    } catch {
      // No-op outside git, handled by the empty set below.
    }
  }

  return [...files].filter(isFormalCodePath).sort();
}

function lineNumberAt(content, index) {
  return content.slice(0, index).split(/\r?\n/).length;
}

function findDestructuredBinding(body, propertyName) {
  const property = escapeRegExp(propertyName);
  const fieldRegex = new RegExp(
    `(?:^|,)\\s*${property}\\b\\s*(?::\\s*(${identifierPattern})\\s*)?(?:=\\s*[^,}]*)?\\s*(?=,|$)`,
  );
  const match = fieldRegex.exec(body);

  if (!match) return null;
  return match[1] || propertyName;
}

function findDestructuringMatchesInContent(file, content) {
  const matches = [];

  for (const field of destructuringForbiddenFields) {
    const object = escapeRegExp(field.objectName);
    const destructuringRegex = new RegExp(`\\b(?:const|let|var)\\s*\\{([^{}]*)\\}\\s*=\\s*${object}\\b`, 'g');
    let match;

    while ((match = destructuringRegex.exec(content)) !== null) {
      if (findDestructuredBinding(match[1], field.propertyName)) {
        matches.push({
          file,
          line: lineNumberAt(content, match.index),
          label: field.label,
        });
      }
    }
  }

  return matches;
}

function findRawRunDestructuredMockFallbackMatches(file, content) {
  const matches = [];
  const destructuringRegex = /\b(?:const|let|var)\s*\{([^{}]*)\}\s*=\s*rawRun\b/g;
  let match;

  while ((match = destructuringRegex.exec(content)) !== null) {
    const bindingName = findDestructuredBinding(match[1], 'conclusionSource');
    if (!bindingName) continue;

    const nearbyContent = content.slice(match.index, match.index + 300);
    const fallbackRegex = new RegExp(`\\b${escapeRegExp(bindingName)}\\s*\\?\\?\\s*['"]mock['"]`);
    if (fallbackRegex.test(nearbyContent)) {
      matches.push({
        file,
        line: lineNumberAt(content, match.index),
        label: "rawRun.conclusionSource ?? 'mock'",
      });
    }
  }

  return matches;
}

export function findForbiddenMatchesInContent(file, content) {
  const matches = [];

  for (const pattern of forbiddenPatterns) {
    pattern.regex.lastIndex = 0;
    const match = pattern.regex.exec(content);
    if (match) {
      matches.push({
        file,
        line: lineNumberAt(content, match.index),
        label: pattern.label,
      });
    }
  }

  matches.push(...findDestructuringMatchesInContent(file, content));
  matches.push(...findRawRunDestructuredMockFallbackMatches(file, content));

  return matches;
}

async function scanFile(file) {
  const content = await readFile(path.join(rootDir, file), 'utf8');
  return findForbiddenMatchesInContent(file, content);
}

async function main() {
  const files = checkAll
    ? (await Promise.all(formalCodeRoots.map(walk))).flat().sort()
    : changedFilesFromGit();

  const violations = (await Promise.all(files.map(scanFile))).flat();

  if (violations.length > 0) {
    console.error('Data Contract Check failed. Forbidden fields or fallback patterns were found:');
    for (const violation of violations) {
      console.error(`- ${violation.file}:${violation.line} ${violation.label}`);
    }
    process.exit(1);
  }

  const scope = checkAll ? 'all formal runtime files' : 'changed formal runtime files';
  console.log(`Data Contract Check passed. Scanned ${files.length} ${scope}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
