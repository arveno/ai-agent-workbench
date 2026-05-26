import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const registryPath = path.join(rootDir, 'contracts/field-registry.yml');

function parseScalar(value) {
  const trimmed = value.trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed === 'null') return null;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  const quoted = trimmed.match(/^"(.*)"$/) || trimmed.match(/^'(.*)'$/);
  return quoted ? quoted[1] : trimmed;
}

export function parseSimpleYaml(content) {
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

export async function readFieldRegistry() {
  return parseSimpleYaml(await readFile(registryPath, 'utf8'));
}
