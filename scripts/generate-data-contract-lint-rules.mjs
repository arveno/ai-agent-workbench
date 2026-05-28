import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const registryPath = path.join(rootDir, 'contracts/field-registry.yml');
const outputPath = path.join(rootDir, 'contracts/generated/data-contract-lint-rules.json');

function parseScalar(value) {
  const trimmed = value.trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed === 'null') return null;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  const quoted = trimmed.match(/^"(.*)"$/) || trimmed.match(/^'(.*)'$/);
  return quoted ? quoted[1] : trimmed;
}

function parseSimpleYaml(content) {
  const root = {};
  const stack = [{ indent: -1, value: root }];

  for (const rawLine of content.split(/\r?\n/)) {
    if (!rawLine.trim() || rawLine.trimStart().startsWith('#')) continue;

    const indent = rawLine.match(/^ */)[0].length;
    const line = rawLine.trim();
    const separatorIndex = line.indexOf(':');
    if (separatorIndex === -1) {
      throw new Error(`Invalid registry line: ${rawLine}`);
    }

    const key = line.slice(0, separatorIndex).trim().replace(/^["']|["']$/g, '');
    const rest = line.slice(separatorIndex + 1).trim();

    while (stack.length > 1 && indent <= stack.at(-1).indent) {
      stack.pop();
    }

    const parent = stack.at(-1).value;
    if (rest === '') {
      parent[key] = {};
      stack.push({ indent, value: parent[key] });
    } else {
      parent[key] = parseScalar(rest);
    }
  }

  return root;
}

function parseFallbackPattern(pattern) {
  const match = pattern.match(/^(.+?)\s*(\?\?|\|\|)\s*(.+)$/);
  if (!match) return null;

  return {
    left: match[1].trim(),
    operator: match[2],
    right: match[3].trim(),
  };
}

function classifyRule([id, field]) {
  const pattern = String(field.pattern ?? '').trim();
  const fallback = parseFallbackPattern(pattern);
  const enforcement = String(field.enforcement ?? 'globalLint').trim();

  if (fallback) {
    return {
      id,
      kind: 'fallbackExpression',
      label: pattern,
      enforcement,
      ...fallback,
      reason: field.reason ?? '',
    };
  }

  if (pattern.includes('.')) {
    const parts = pattern.split('.');
    return {
      id,
      kind: 'objectProperty',
      label: pattern,
      enforcement,
      objectName: parts.at(-2),
      propertyName: parts.at(-1),
      reason: field.reason ?? '',
    };
  }

  return {
    id,
    kind: 'identifier',
    label: pattern,
    enforcement,
    identifier: pattern,
    reason: field.reason ?? '',
  };
}

const registry = parseSimpleYaml(await readFile(registryPath, 'utf8'));
const rules = Object.entries(registry.forbiddenFields ?? {}).map(classifyRule);
const output = {
  generatedFrom: 'contracts/field-registry.yml',
  generatedBy: 'node scripts/generate-data-contract-lint-rules.mjs',
  rules,
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(`Generated ${path.relative(rootDir, outputPath)}`);
