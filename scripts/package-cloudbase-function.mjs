import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chmod, copyFile, mkdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const functionsRoot = path.join(repoRoot, 'tencent', 'functions');
const sharedRoot = path.join(functionsRoot, '_shared');
const defaultOutputRoot = path.join(os.homedir(), 'Desktop');

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
    sourceDir: path.join('tencent', 'functions', name),
    entry: 'index.js',
    packageJson: 'package.json',
    scfBootstrap: 'scf_bootstrap',
    sharedFiles,
  };
}

function printUsage() {
  console.log(`Usage:
  pnpm cloudbase:package -- --function <name|all> [--out <dir>] [--clean] [--check]

Examples:
  pnpm cloudbase:package -- --function workbench-agent-run-stream --clean --check
  pnpm cloudbase:package -- --function all --out ~/Desktop --clean`);
}

function parseArgs(argv) {
  const options = {
    functionName: '',
    outputRoot: defaultOutputRoot,
    clean: false,
    check: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--function') {
      options.functionName = readOptionValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === '--out') {
      options.outputRoot = resolveUserPath(readOptionValue(argv, index, arg));
      index += 1;
      continue;
    }

    if (arg === '--clean') {
      options.clean = true;
      continue;
    }

    if (arg === '--check') {
      options.check = true;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!options.functionName) {
    throw new Error('Missing required argument: --function <name|all>');
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

function getSelectedManifests(functionName) {
  if (functionName === 'all') {
    return manifests;
  }

  const manifest = manifests.find((item) => item.name === functionName);

  if (!manifest) {
    const knownNames = manifests.map((item) => item.name).join(', ');
    throw new Error(`Unknown function: ${functionName}. Known functions: ${knownNames}`);
  }

  return [manifest];
}

async function assertReadableFile(filePath, label) {
  if (!existsSync(filePath)) {
    throw new Error(`Missing ${label}: ${filePath}`);
  }
}

async function copyRequiredFile(sourceDir, outputDir, fileName, label) {
  const sourcePath = path.join(sourceDir, fileName);
  const targetPath = path.join(outputDir, fileName);
  await assertReadableFile(sourcePath, label);
  await copyFile(sourcePath, targetPath);
}

async function copyOptionalReadme(sourceDir, outputDir) {
  const sourcePath = path.join(sourceDir, 'README.md');

  if (existsSync(sourcePath)) {
    await copyFile(sourcePath, path.join(outputDir, 'README.md'));
  }
}

async function copySharedFiles(manifest, outputDir) {
  if (manifest.sharedFiles.length === 0) {
    return;
  }

  const outputSharedDir = path.join(outputDir, '_shared');
  await mkdir(outputSharedDir, { recursive: true });

  for (const sharedFile of manifest.sharedFiles) {
    const sourcePath = path.join(sharedRoot, sharedFile);
    await assertReadableFile(sourcePath, `_shared/${sharedFile}`);
    await copyFile(sourcePath, path.join(outputSharedDir, sharedFile));
  }
}

async function validateScfBootstrap(outputDir, manifest) {
  const bootstrapPath = path.join(outputDir, manifest.scfBootstrap);
  const content = await readFile(bootstrapPath, 'utf8');
  const firstLine = content.split(/\r?\n/, 1)[0] || '';

  if (!firstLine.startsWith('#!')) {
    throw new Error(`${manifest.name}: scf_bootstrap must start with a shebang.`);
  }

  if (!/\bnode(?:\.exe)?\s+(?:\.\/)?index\.js\b/.test(content)) {
    throw new Error(`${manifest.name}: scf_bootstrap must start the function with node index.js.`);
  }

  try {
    await chmod(bootstrapPath, 0o755);
  } catch (error) {
    console.warn(`WARN ${manifest.name}: chmod +x scf_bootstrap failed: ${error.message}`);
  }
}

function getOutputDir(outputRoot, functionName) {
  return path.join(outputRoot, `cloudbase-${functionName}-package`);
}

async function packageFunction(manifest, options) {
  const sourceDir = path.join(repoRoot, manifest.sourceDir);
  const outputDir = getOutputDir(options.outputRoot, manifest.name);

  await assertReadableFile(path.join(sourceDir, manifest.entry), `${manifest.name}/${manifest.entry}`);
  await assertReadableFile(path.join(sourceDir, manifest.packageJson), `${manifest.name}/${manifest.packageJson}`);
  await assertReadableFile(path.join(sourceDir, manifest.scfBootstrap), `${manifest.name}/${manifest.scfBootstrap}`);

  if (options.clean) {
    await rm(outputDir, { recursive: true, force: true });
  }

  await mkdir(outputDir, { recursive: true });
  await copyRequiredFile(sourceDir, outputDir, manifest.entry, `${manifest.name}/${manifest.entry}`);
  await copyRequiredFile(sourceDir, outputDir, manifest.packageJson, `${manifest.name}/${manifest.packageJson}`);
  await copyRequiredFile(sourceDir, outputDir, manifest.scfBootstrap, `${manifest.name}/${manifest.scfBootstrap}`);
  await copyOptionalReadme(sourceDir, outputDir);
  await copySharedFiles(manifest, outputDir);
  await validateScfBootstrap(outputDir, manifest);

  console.log(`OK packaged ${manifest.name}`);
  console.log(`   ${outputDir}`);

  if (options.check) {
    runCheck(manifest, outputDir);
  }

  return outputDir;
}

function runCheck(manifest, outputDir) {
  const checkScript = path.join(scriptDir, 'check-cloudbase-package.mjs');
  const result = spawnSync(process.execPath, [
    checkScript,
    '--function',
    manifest.name,
    '--dir',
    outputDir,
  ], {
    cwd: repoRoot,
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`${manifest.name}: package check failed.`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const selectedManifests = getSelectedManifests(options.functionName);

  await mkdir(options.outputRoot, { recursive: true });

  const outputDirs = [];

  for (const manifest of selectedManifests) {
    outputDirs.push(await packageFunction(manifest, options));
  }

  console.log('');
  console.log('CloudBase package output:');
  for (const outputDir of outputDirs) {
    console.log(`- ${outputDir}`);
  }
}

main().catch((error) => {
  console.error(`ERROR ${error.message}`);
  process.exitCode = 1;
});
