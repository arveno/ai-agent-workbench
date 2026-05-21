import { spawnSync } from 'node:child_process';
import path from 'node:path';

import {
  defaultDeployOutputRoot,
  getPackageOutputDir,
  getSelectedManifests,
  repoRoot,
  resolveUserPath,
  scriptDir,
} from './cloudbase-functions-manifest.mjs';

function printUsage() {
  console.log(`Usage:
  pnpm cloudbase:deploy -- --function <name|all> --envId <env-id> [--out <dir>] [--clean] [--check] [--dry-run] [--deployMode <mode>]

Examples:
  pnpm cloudbase:deploy -- --function workbench-agent-run-stream --envId <env-id> --out ./.cloudbase-packages --clean --check --dry-run
  pnpm cloudbase:deploy -- --function all --env-id <env-id> --out ./.cloudbase-packages --clean`);
}

function parseArgs(argv) {
  const options = {
    functionName: '',
    envId: '',
    outputRoot: defaultDeployOutputRoot,
    clean: false,
    check: true,
    dryRun: false,
    deployMode: 'cos',
    yes: true,
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

    if (arg === '--envId' || arg === '--env-id') {
      options.envId = readOptionValue(argv, index, arg);
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

    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }

    if (arg === '--deployMode') {
      options.deployMode = readOptionValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === '--yes') {
      options.yes = true;
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

  if (!options.envId) {
    throw new Error('Missing required argument: --envId <env-id>');
  }

  if (!options.check) {
    throw new Error('CloudBase package structure check is required before deployment.');
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

function runNodeScript(scriptName, args) {
  const result = spawnSync(process.execPath, [path.join(scriptDir, scriptName), ...args], {
    cwd: repoRoot,
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`${scriptName} failed.`);
  }
}

function runPackage(options) {
  const args = [
    '--function',
    options.functionName,
    '--out',
    options.outputRoot,
  ];

  if (options.clean) {
    args.push('--clean');
  }

  runNodeScript('package-cloudbase-function.mjs', args);
}

function runChecks(manifests, options) {
  for (const manifest of manifests) {
    runNodeScript('check-cloudbase-package.mjs', [
      '--function',
      manifest.name,
      '--dir',
      getPackageOutputDir(options.outputRoot, manifest.name),
    ]);
  }
}

function getTcbCommand() {
  return process.platform === 'win32' ? 'tcb.cmd' : 'tcb';
}

function assertTcbAvailable(tcbCommand) {
  const result = spawnSync(tcbCommand, ['--version'], {
    cwd: repoRoot,
    stdio: 'ignore',
  });

  if (!result.error && result.status === 0) {
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

  throw new Error(`${installHint}\nCommand failed: ${tcbCommand} --version`);
}

function createDeployCommand(manifest, options) {
  const args = [
    'fn',
    'deploy',
    manifest.name,
    '--httpFn',
    '--dir',
    getPackageOutputDir(options.outputRoot, manifest.name),
    '-e',
    options.envId,
    '--deployMode',
    options.deployMode,
  ];

  if (options.yes) {
    args.push('--yes');
  }

  return {
    command: getTcbCommand(),
    args,
  };
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

function printDeployCommands(manifests, options) {
  console.log('');
  console.log(options.dryRun ? 'Dry run: CloudBase deploy commands that would run:' : 'CloudBase deploy commands:');

  for (const manifest of manifests) {
    const deployCommand = createDeployCommand(manifest, options);
    console.log(`- ${formatCommand(deployCommand.command, deployCommand.args)}`);
  }
}

function deployFunctions(manifests, options) {
  const tcbCommand = getTcbCommand();
  assertTcbAvailable(tcbCommand);

  for (const manifest of manifests) {
    const deployCommand = createDeployCommand(manifest, options);

    console.log('');
    console.log(`Deploying CloudBase HTTP Function: ${manifest.name}`);
    console.log(formatCommand(deployCommand.command, deployCommand.args));

    const result = spawnSync(deployCommand.command, deployCommand.args, {
      cwd: repoRoot,
      stdio: 'inherit',
    });

    if (result.error) {
      throw result.error;
    }

    if (result.status !== 0) {
      throw new Error(`${manifest.name}: CloudBase deployment failed.`);
    }
  }
}

function printSmokeHint() {
  console.log('');
  console.log('Deployment finished. Suggested smoke test command:');
  console.log('pnpm cloudbase:smoke -- --base-url <cloudbase-api-base-url> --token <token>');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const selectedManifests = getSelectedManifests(options.functionName);

  runPackage(options);
  runChecks(selectedManifests, options);

  if (options.dryRun) {
    printDeployCommands(selectedManifests, options);
    console.log('');
    console.log('Dry run finished. No CloudBase deployment was executed.');
    return;
  }

  deployFunctions(selectedManifests, options);
  printSmokeHint();
}

main().catch((error) => {
  console.error(`ERROR ${error.message}`);
  process.exitCode = 1;
});
