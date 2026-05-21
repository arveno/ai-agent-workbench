import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

import {
  defaultDeployOutputRoot,
  getManifest,
  getPackageOutputDir,
  repoRoot,
  resolveUserPath,
} from './cloudbase-functions-manifest.mjs';

const defaultRuntime = 'Nodejs20.19';
const httpPathByFunction = new Map([
  ['workbench-evaluations', '/api/workbench/evaluations'],
]);

function printUsage() {
  console.log(`Usage:
  pnpm cloudbase:deploy:function -- --function <name> [--out <dir>] [--clean] [--check] [--force] [--runtime <runtime>] [--path <httpPath>] [--dry-run]

Examples:
  pnpm cloudbase:deploy:function -- --function workbench-evaluations --out ./.cloudbase-packages --clean --check --dry-run
  pnpm cloudbase:deploy:function -- --function workbench-evaluations --out ./.cloudbase-packages --clean --check --force`);
}

function parseArgs(argv) {
  const options = {
    functionName: '',
    outputRoot: defaultDeployOutputRoot,
    clean: false,
    check: false,
    force: false,
    runtime: defaultRuntime,
    httpPath: '',
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--') {
      continue;
    }

    if (arg === '--function') {
      options.functionName = readOptionValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === '--out') {
      options.outputRoot = resolveUserPath(readOptionValue(argv, index, arg), repoRoot);
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

    if (arg === '--force') {
      options.force = true;
      continue;
    }

    if (arg === '--runtime') {
      options.runtime = readOptionValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === '--path') {
      options.httpPath = readOptionValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === '--dry-run') {
      options.dryRun = true;
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

  if (options.functionName === 'all') {
    throw new Error('Deploying all functions is not supported. Deploy one CloudBase HTTP Function at a time.');
  }

  getManifest(options.functionName);
  options.httpPath = resolveHttpPath(options.functionName, options.httpPath);

  return options;
}

function readOptionValue(argv, index, optionName) {
  const value = argv[index + 1];

  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${optionName}`);
  }

  return value;
}

function resolveHttpPath(functionName, providedPath) {
  if (providedPath) {
    return providedPath;
  }

  const manifestPath = httpPathByFunction.get(functionName);

  if (!manifestPath) {
    throw new Error(`${functionName}: missing HTTP path manifest. Pass --path <httpPath> or add this function to the deploy script HTTP path manifest.`);
  }

  return manifestPath;
}

function createPackageCommand(options) {
  const args = [
    'cloudbase:package',
    '--',
    '--function',
    options.functionName,
    '--out',
    options.outputRoot,
  ];

  if (options.clean) {
    args.push('--clean');
  }

  if (options.check) {
    args.push('--check');
  }

  return {
    command: getPnpmCommand(),
    args,
  };
}

function createDeployCommand(options, stagingDir) {
  const args = [
    'exec',
    'tcb',
    'fn',
    'deploy',
    options.functionName,
    '--dir',
    stagingDir,
    '--httpFn',
    '--path',
    options.httpPath,
    '--runtime',
    options.runtime,
  ];

  if (options.force) {
    args.push('--force');
  }

  return {
    command: getPnpmCommand(),
    args,
  };
}

function getPnpmCommand() {
  return process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
}

function runCommand(label, commandSpec) {
  const result = spawnSync(commandSpec.command, commandSpec.args, {
    cwd: repoRoot,
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`${label} failed.`);
  }
}

function assertStagingDirExists(stagingDir) {
  if (!existsSync(stagingDir)) {
    throw new Error(`Staging directory does not exist: ${stagingDir}`);
  }
}

function assertTcbAvailable() {
  const result = spawnSync(getPnpmCommand(), ['exec', 'tcb', '-v'], {
    cwd: repoRoot,
    stdio: 'pipe',
    encoding: 'utf8',
  });

  if (!result.error && result.status === 0) {
    const version = (result.stdout || result.stderr).trim();
    console.log(`OK CloudBase CLI: ${version || 'tcb detected'}`);
    return;
  }

  const installHint = [
    'CloudBase CLI was not found or is not runnable.',
    'Install and login before running a real deployment:',
    '  pnpm add -g @cloudbase/cli',
    '  npm install -g @cloudbase/cli',
    '  tcb login',
  ].join('\n');

  if (result.error) {
    throw new Error(`${installHint}\nOriginal error: ${result.error.message}`);
  }

  const detail = [result.stderr, result.stdout].filter(Boolean).join('\n').trim();
  throw new Error(`${installHint}${detail ? `\n${detail}` : ''}`);
}

function printDryRun(packageCommand, deployCommand) {
  console.log('Dry run: commands that would run:');
  console.log(formatCommand(packageCommand.command, packageCommand.args));
  console.log(formatCommand(deployCommand.command, deployCommand.args));
  console.log('');
  console.log('Dry run finished. No package, tcb check, or CloudBase deployment was executed.');
}

function printSmokeHint() {
  console.log('');
  console.log('Deployment finished. Suggested verification:');
  console.log('pnpm cloudbase:smoke -- --base-url <cloudbase-api-base-url> --token <token>');
  console.log('curl <deployed-http-function-url>');
}

function formatCommand(command, args) {
  return [command, ...args].map(formatShellArg).join(' ');
}

function formatShellArg(value) {
  if (/^[A-Za-z0-9_./:=@-]+$/.test(value)) {
    return value;
  }

  return JSON.stringify(value);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const stagingDir = getPackageOutputDir(options.outputRoot, options.functionName);
  const packageCommand = createPackageCommand(options);
  const deployCommand = createDeployCommand(options, stagingDir);

  if (options.dryRun) {
    printDryRun(packageCommand, deployCommand);
    return;
  }

  runCommand('CloudBase package', packageCommand);

  if (!options.check) {
    assertStagingDirExists(stagingDir);
  }

  assertTcbAvailable();
  runCommand('CloudBase function deployment', deployCommand);
  printSmokeHint();
}

main().catch((error) => {
  console.error(`ERROR ${error.message}`);
  process.exitCode = 1;
});
