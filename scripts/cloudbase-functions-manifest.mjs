import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const scriptDir = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(scriptDir, '..');
export const functionsRoot = path.join(repoRoot, 'tencent', 'functions');
export const sharedRoot = path.join(functionsRoot, '_shared');
export const defaultPackageOutputRoot = path.join(os.homedir(), 'Desktop');
export const defaultDeployOutputRoot = path.join(repoRoot, '.cloudbase-packages');

const functionDefinitions = [
  ['auth-me', ['auth.js', 'mysql.js']],
  ['demo-tasks', []],
  ['demo-conversations', []],
  ['workbench-conversations', ['auth.js', 'mysql.js']],
  ['workbench-messages', ['auth.js', 'mysql.js']],
  ['workbench-reports', ['auth.js', 'mysql.js', 'agentRunModelMetadata.js']],
  ['workbench-demo-copy', ['auth.js', 'mysql.js']],
  ['workbench-quota', ['auth.js', 'mysql.js']],
  ['workbench-runs', ['auth.js', 'mysql.js']],
  ['workbench-evaluations', ['auth.js', 'mysql.js', 'langsmithObservability.js', 'agentRunModelMetadata.js']],
  ['workbench-agent-run-stream', ['auth.js', 'mysql.js', 'langchainModelLayer.js', 'langgraphRuntime.js', 'langsmithObservability.js']],
];

export const manifests = functionDefinitions.map(([name, sharedFiles]) => createManifest(name, sharedFiles));

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

export function getKnownFunctionNames() {
  return manifests.map((item) => item.name);
}

export function getManifest(functionName) {
  const manifest = manifests.find((item) => item.name === functionName);

  if (!manifest) {
    throw new Error(`Unknown function: ${functionName}. Known functions: ${getKnownFunctionNames().join(', ')}`);
  }

  return manifest;
}

export function getSelectedManifests(functionName) {
  if (functionName === 'all') {
    return manifests;
  }

  return [getManifest(functionName)];
}

export function getPackageOutputDir(outputRoot, functionName) {
  return path.join(outputRoot, `cloudbase-${functionName}-package`);
}

export function resolveUserPath(value, cwd = process.cwd()) {
  if (!value || value === '~') {
    return os.homedir();
  }

  if (value.startsWith('~/') || value.startsWith('~\\')) {
    return path.join(os.homedir(), value.slice(2));
  }

  return path.resolve(cwd, value);
}
