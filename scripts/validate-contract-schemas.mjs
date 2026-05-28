import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const schemaDir = path.join(rootDir, 'contracts/schemas');

async function listSchemaFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return listSchemaFiles(entryPath);
      }

      return entry.name.endsWith('.schema.json') ? [entryPath] : [];
    }),
  );

  return files.flat();
}

function toSchemaRelativePath(filePath) {
  return path.relative(schemaDir, filePath).split(path.sep).join('/');
}

const schemaFiles = (await listSchemaFiles(schemaDir)).sort((a, b) =>
  toSchemaRelativePath(a).localeCompare(toSchemaRelativePath(b)),
);

const ajv = new Ajv2020({
  allErrors: true,
  allowUnionTypes: true,
  strict: true,
  validateSchema: true,
});

const schemas = [];

for (const file of schemaFiles) {
  const schema = JSON.parse(await readFile(file, 'utf8'));
  const schemaRelativePath = toSchemaRelativePath(file);

  for (const field of ['$schema', '$id', 'title', 'type', 'properties', 'required']) {
    if (schema[field] === undefined) {
      throw new Error(`${path.relative(rootDir, file)} is missing ${field}.`);
    }
  }

  if (schema.type !== 'object') {
    throw new Error(`${path.relative(rootDir, file)} must define a root object schema.`);
  }

  if (schema.additionalProperties !== false) {
    throw new Error(`${path.relative(rootDir, file)} must set additionalProperties: false.`);
  }

  schemas.push({ file: schemaRelativePath, schema });
  ajv.addSchema(schema);
}

for (const { file, schema } of schemas) {
  ajv.compile(schema);
  console.log(`Validated contracts/schemas/${file}`);
}
