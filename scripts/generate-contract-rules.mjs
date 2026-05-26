import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { readFieldRegistry, rootDir } from './contract-registry-utils.mjs';

const outputPath = path.join(rootDir, 'contracts/generated/forbidden-rules.json');
const identifierPattern = /^[$_A-Za-z][$_A-Za-z0-9]*$/;
const propertyPattern = /^([$_A-Za-z][$_A-Za-z0-9]*)\.([$_A-Za-z][$_A-Za-z0-9]*)$/;

function createRule(field) {
  const pattern = String(field.pattern ?? '');
  const base = {
    label: pattern,
    pattern,
    reason: field.reason ?? '',
  };

  if (pattern === 'usage ?? tokenUsage') {
    return {
      ...base,
      kind: 'binaryExpression',
      operator: '??',
      leftIdentifier: 'usage',
      rightIdentifier: 'tokenUsage',
    };
  }

  if (pattern === 'tokenUsage || usage') {
    return {
      ...base,
      kind: 'binaryExpression',
      operator: '||',
      leftIdentifier: 'tokenUsage',
      rightIdentifier: 'usage',
    };
  }

  if (pattern === "rawRun.conclusionSource ?? 'mock'") {
    return {
      ...base,
      kind: 'rawRunMockFallback',
      objectName: 'rawRun',
      propertyName: 'conclusionSource',
      fallbackValue: 'mock',
    };
  }

  const propertyMatch = propertyPattern.exec(pattern);
  if (propertyMatch) {
    return {
      ...base,
      kind: 'objectProperty',
      objectName: propertyMatch[1],
      propertyName: propertyMatch[2],
    };
  }

  if (identifierPattern.test(pattern)) {
    return {
      ...base,
      kind: 'identifier',
      identifier: pattern,
    };
  }

  throw new Error(`Unsupported forbidden field pattern: ${pattern}`);
}

const registry = await readFieldRegistry();
const rules = Object.values(registry.forbiddenFields ?? {}).map(createRule);
const output = {
  generatedFrom: 'contracts/field-registry.yml',
  generatedBy: 'node scripts/generate-contract-rules.mjs',
  rules,
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(`Generated ${path.relative(rootDir, outputPath)}`);
