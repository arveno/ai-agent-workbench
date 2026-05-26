import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const checkAll = process.argv.includes('--all');
const formalCodeRoots = ['src', 'tencent/functions'];
const codeExtensions = new Set(['.js', '.jsx', '.ts', '.tsx']);
const ignoredPathParts = new Set(['node_modules', 'dist', 'build', 'coverage']);

const forbiddenPatterns = [
  { label: 'tokenUsage', regex: /\btokenUsage\b/ },
  { label: 'conclusionNotice', regex: /\bconclusionNotice\b/ },
  { label: 'agentConclusion.source', regex: /\bagentConclusion\s*\.\s*source\b/ },
  { label: 'metadata.clientRunId', regex: /\bmetadata\s*\.\s*clientRunId\b/ },
  { label: 'modelTrace.tokenUsage', regex: /\bmodelTrace\s*\.\s*tokenUsage\b/ },
  { label: 'usage ?? tokenUsage', regex: /\busage\s*\?\?\s*tokenUsage\b/ },
  { label: 'tokenUsage || usage', regex: /\btokenUsage\s*\|\|\s*usage\b/ },
  { label: "rawRun.conclusionSource ?? 'mock'", regex: /\brawRun\s*\.\s*conclusionSource\s*\?\?\s*['"]mock['"]/ },
  { label: 'metadata.provider', regex: /\bmetadata\s*\.\s*provider\b/ },
  { label: 'metadata.model', regex: /\bmetadata\s*\.\s*model\b/ },
  { label: 'metadata.usage', regex: /\bmetadata\s*\.\s*usage\b/ },
  { label: 'metadata.costEstimate', regex: /\bmetadata\s*\.\s*costEstimate\b/ },
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

function changedFilesFromGit() {
  const baseRef = process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : 'origin/stage/w3-token-cost-usage';
  const files = new Set();

  try {
    const mergeBase = git(['merge-base', 'HEAD', baseRef]);
    for (const file of git(['diff', '--name-only', '--diff-filter=ACMRT', `${mergeBase}...HEAD`]).split(/\r?\n/)) {
      if (file) files.add(file);
    }
  } catch {
    // Local fallback before the branch has a remote comparison target.
  }

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

  return [...files].filter(isFormalCodePath).sort();
}

function lineNumberAt(content, index) {
  return content.slice(0, index).split(/\r?\n/).length;
}

async function scanFile(file) {
  const content = await readFile(path.join(rootDir, file), 'utf8');
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

  return matches;
}

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
