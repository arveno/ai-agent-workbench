import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const schemaDir = path.join(rootDir, 'contracts/schemas');
const schemaFiles = (await readdir(schemaDir))
  .filter((file) => file.endsWith('.schema.json'))
  .sort();

const ajv = new Ajv2020({
  allErrors: true,
  allowUnionTypes: true,
  strict: true,
  validateSchema: true,
});

const schemas = [];

for (const file of schemaFiles) {
  const schemaPath = path.join(schemaDir, file);
  const schema = JSON.parse(await readFile(schemaPath, 'utf8'));

  for (const field of ['$schema', '$id', 'title', 'type', 'properties', 'required']) {
    if (schema[field] === undefined) {
      throw new Error(`${path.relative(rootDir, schemaPath)} is missing ${field}.`);
    }
  }

  if (schema.type !== 'object') {
    throw new Error(`${path.relative(rootDir, schemaPath)} must define a root object schema.`);
  }

  if (schema.additionalProperties !== false) {
    throw new Error(`${path.relative(rootDir, schemaPath)} must set additionalProperties: false.`);
  }

  schemas.push({ file, schema });
  ajv.addSchema(schema);
}

for (const { file, schema } of schemas) {
  ajv.compile(schema);
  console.log(`Validated contracts/schemas/${file}`);
}
