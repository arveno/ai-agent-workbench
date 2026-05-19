import { existsSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const manifests = [
  createManifest('auth-me', ['auth.js', 'mysql.js']),
  createManifest('demo-tasks', []),
  createManifest('demo-conversations', []),
  createManifest('workbench-conversations', ['auth.js', 'mysql.js']),
  createManifest('workbench-messages', ['auth.js', 'mysql.js']),
  createManifest('workbench-reports', ['auth.js', 'mysql.js']),
  createManifest('workbench-demo-copy', ['auth.js', 'mysql.js']),
  createManifest('workbench-quota', ['auth.js', 'mysql.js']),
  createManifest('workbench-runs', ['auth.js', 'mysql.js']),
  createManifest('workbench-agent-run-stream', ['auth.js', 'mysql.js', 'modelGateway.js']),
];

function createManifest(name, sharedFiles) {
  return {
    name,
    entry: 'index.js',
    packageJson: 'package.json',
    scfBootstrap: 'scf_bootstrap',
    sharedFiles,
  };
}

function printUsage() {
  console.log(`Usage:
  pnpm cloudbase:check -- --function <name> --dir <staging-dir>

Example:
  pnpm cloudbase:check -- --function workbench-agent-run-stream --dir ~/Desktop/cloudbase-workbench-agent-run-stream-package`);
}

function parseArgs(argv) {
  const options = {
    functionName: '',
    dir: '',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--function') {
      options.functionName = readOptionValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === '--dir') {
      options.dir = resolveUserPath(readOptionValue(argv, index, arg));
      index += 1;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!options.functionName) {
    throw new Error('Missing required argument: --function <name>');
  }

  if (!options.dir) {
    throw new Error('Missing required argument: --dir <path>');
  }

  return options;
}

function readOptionValue(argv, index, optionName) {
  const value = argv[index + 1];

  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${optionName}`);
  }

  return value;
}

function resolveUserPath(value) {
  if (!value || value === '~') {
    return os.homedir();
  }

  if (value.startsWith('~/') || value.startsWith('~\\')) {
    return path.join(os.homedir(), value.slice(2));
  }

  return path.resolve(process.cwd(), value);
}

function getManifest(functionName) {
  const manifest = manifests.find((item) => item.name === functionName);

  if (!manifest) {
    const knownNames = manifests.map((item) => item.name).join(', ');
    throw new Error(`Unknown function: ${functionName}. Known functions: ${knownNames}`);
  }

  return manifest;
}

function pushMissingFileError(errors, dir, fileName, label) {
  if (!existsSync(path.join(dir, fileName))) {
    errors.push(`Missing root ${label}: ${fileName}`);
  }
}

async function checkPackageJson(dir, manifest, warnings, errors) {
  const packageJsonPath = path.join(dir, manifest.packageJson);

  if (!existsSync(packageJsonPath)) {
    return;
  }

  try {
    const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));

    if (packageJson.main !== manifest.entry) {
      warnings.push(`package.json main is ${JSON.stringify(packageJson.main)}; expected ${manifest.entry}.`);
    }
  } catch (error) {
    errors.push(`package.json is not valid JSON: ${error.message}`);
  }
}

async function checkScfBootstrap(dir, manifest, errors) {
  const bootstrapPath = path.join(dir, manifest.scfBootstrap);

  if (!existsSync(bootstrapPath)) {
    return;
  }

  const content = await readFile(bootstrapPath, 'utf8');
  const firstLine = content.split(/\r?\n/, 1)[0] || '';

  if (!firstLine.startsWith('#!')) {
    errors.push('scf_bootstrap must start with a shebang.');
  }

  if (!/\bnode(?:\.exe)?\s+(?:\.\/)?index\.js\b/.test(content)) {
    errors.push('scf_bootstrap must start the function with node index.js.');
  }
}

function checkSharedFiles(dir, manifest, warnings, errors) {
  const sharedDir = path.join(dir, '_shared');

  if (manifest.sharedFiles.length === 0) {
    if (existsSync(sharedDir)) {
      warnings.push('Demo function package includes _shared, but this function does not need it.');
    }
    return;
  }

  if (!existsSync(sharedDir)) {
    errors.push('Missing root _shared directory.');
    return;
  }

  for (const sharedFile of manifest.sharedFiles) {
    if (!existsSync(path.join(sharedDir, sharedFile))) {
      errors.push(`Missing _shared/${sharedFile}.`);
    }
  }
}

function checkNestedFunctionDir(dir, manifest, errors) {
  const nestedEntry = path.join(dir, manifest.name, manifest.entry);

  if (existsSync(nestedEntry)) {
    errors.push(`Package appears to contain a nested function directory: ${manifest.name}/${manifest.entry}`);
  }
}

async function checkForbiddenContent(dir, errors) {
  async function walk(currentDir) {
    const entries = await readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = path.join(currentDir, entry.name);
      const relativePath = path.relative(dir, entryPath) || entry.name;

      if (entry.isDirectory()) {
        if (entry.name === 'node_modules') {
          errors.push(`Package must not include node_modules: ${relativePath}`);
          continue;
        }

        if (entry.name === 'dist') {
          errors.push(`Package must not include dist: ${relativePath}`);
          continue;
        }

        await walk(entryPath);
        continue;
      }

      if (entry.isFile() && entry.name.toLowerCase().endsWith('.zip')) {
        errors.push(`Package must not include temporary zip files: ${relativePath}`);
      }
    }
  }

  await walk(dir);
}

async function readRootEntries(dir) {
  return (await readdir(dir)).sort((a, b) => a.localeCompare(b));
}

async function checkPackage(options) {
  const manifest = getManifest(options.functionName);
  const warnings = [];
  const errors = [];

  if (!existsSync(options.dir)) {
    errors.push(`Staging directory does not exist: ${options.dir}`);
    return { manifest, warnings, errors, rootEntries: [] };
  }

  const dirStat = await stat(options.dir);
  if (!dirStat.isDirectory()) {
    errors.push(`Staging path is not a directory: ${options.dir}`);
    return { manifest, warnings, errors, rootEntries: [] };
  }

  pushMissingFileError(errors, options.dir, manifest.entry, 'entry file');
  pushMissingFileError(errors, options.dir, manifest.packageJson, 'package.json');
  pushMissingFileError(errors, options.dir, manifest.scfBootstrap, 'scf_bootstrap');

  await checkPackageJson(options.dir, manifest, warnings, errors);
  await checkScfBootstrap(options.dir, manifest, errors);
  checkSharedFiles(options.dir, manifest, warnings, errors);
  checkNestedFunctionDir(options.dir, manifest, errors);
  await checkForbiddenContent(options.dir, errors);

  return {
    manifest,
    warnings,
    errors,
    rootEntries: await readRootEntries(options.dir),
  };
}

function printResult(options, result) {
  for (const warning of result.warnings) {
    console.warn(`WARN ${warning}`);
  }

  for (const error of result.errors) {
    console.error(`ERROR ${error}`);
  }

  if (result.errors.length > 0) {
    return;
  }

  console.log(`OK ${result.manifest.name} package structure is valid.`);
  console.log(`   ${options.dir}`);
  console.log('Root contents:');
  for (const entry of result.rootEntries) {
    console.log(`- ${entry}`);
  }

  if (result.manifest.sharedFiles.length > 0) {
    console.log(`Required shared files: ${result.manifest.sharedFiles.map((file) => `_shared/${file}`).join(', ')}`);
  } else {
    console.log('Required shared files: none');
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = await checkPackage(options);
  printResult(options, result);

  if (result.errors.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`ERROR ${error.message}`);
  process.exitCode = 1;
});
