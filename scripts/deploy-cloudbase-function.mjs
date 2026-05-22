import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import {
  defaultDeployOutputRoot,
  getManifest,
  getPackageOutputDir,
  repoRoot,
  resolveUserPath,
} from './cloudbase-functions-manifest.mjs';

const fallbackRuntime = 'Nodejs20.19';
const cloudbaseFunctionsConfigPath = path.join(repoRoot, 'tencent', 'cloudbase-functions.config.json');
const sensitiveFieldNamePatterns = [
  /secret[_-]?id/i,
  /secret[_-]?key/i,
  /api[_-]?key/i,
  /token/i,
  /password/i,
  /db[_-]?password/i,
  /service[_-]?role/i,
  /private[_-]?key/i,
];

function printUsage() {
  console.log(`Usage:
  pnpm cloudbase:deploy:function -- --function <name> [--profile <profile>] [--envId <env-id>] [--out <dir>] [--clean] [--check] [--force] [--runtime <runtime>] [--base-url <url>] [--expected-route-domain <domain>] [--dry-run]

Recommended examples:
  pnpm cloudbase:deploy:function -- --function workbench-evaluations --profile poc --clean --check --dry-run
  pnpm cloudbase:deploy:function -- --function workbench-evaluations --profile poc --clean --check

Override example:
  pnpm cloudbase:deploy:function -- --function workbench-evaluations --envId <env-id> --base-url <cloudbase-http-functions-base-url> --out ./.cloudbase-packages --clean --check

HTTP route update override:
  pnpm cloudbase:deploy:function -- --function workbench-evaluations --profile poc --allow-http-route-update --path /api/workbench/evaluations --clean --check --dry-run`);
}

function parseArgs(argv) {
  const cli = {
    functionName: '',
    profile: '',
    envId: '',
    envIdProvided: false,
    outputRoot: '',
    outputRootProvided: false,
    clean: false,
    check: false,
    force: false,
    runtime: '',
    runtimeProvided: false,
    httpPath: '',
    httpPathOverride: false,
    baseUrl: '',
    baseUrlProvided: false,
    expectedRouteDomain: '',
    expectedRouteDomainProvided: false,
    allowHttpRouteUpdate: false,
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--') {
      continue;
    }

    if (arg === '--function') {
      cli.functionName = readOptionValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === '--profile') {
      cli.profile = readOptionValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === '--envId' || arg === '--env-id') {
      cli.envId = readOptionValue(argv, index, arg);
      cli.envIdProvided = true;
      index += 1;
      continue;
    }

    if (arg === '--out') {
      cli.outputRoot = readOptionValue(argv, index, arg);
      cli.outputRootProvided = true;
      index += 1;
      continue;
    }

    if (arg === '--clean') {
      cli.clean = true;
      continue;
    }

    if (arg === '--check') {
      cli.check = true;
      continue;
    }

    if (arg === '--force') {
      cli.force = true;
      continue;
    }

    if (arg === '--runtime') {
      cli.runtime = readOptionValue(argv, index, arg);
      cli.runtimeProvided = true;
      index += 1;
      continue;
    }

    if (arg === '--path') {
      cli.httpPath = readOptionValue(argv, index, arg);
      cli.httpPathOverride = true;
      index += 1;
      continue;
    }

    if (arg === '--allow-http-route-update') {
      cli.allowHttpRouteUpdate = true;
      continue;
    }

    if (arg === '--base-url') {
      cli.baseUrl = readOptionValue(argv, index, arg);
      cli.baseUrlProvided = true;
      index += 1;
      continue;
    }

    if (arg === '--expected-route-domain') {
      cli.expectedRouteDomain = readOptionValue(argv, index, arg);
      cli.expectedRouteDomainProvided = true;
      index += 1;
      continue;
    }

    if (arg === '--dry-run') {
      cli.dryRun = true;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!cli.functionName) {
    throw new Error('Missing required argument: --function <name>');
  }

  if (cli.functionName === 'all') {
    throw new Error('Deploying all functions is not supported. Deploy one CloudBase HTTP Function at a time.');
  }

  if (cli.httpPathOverride && !cli.allowHttpRouteUpdate) {
    throw new Error('--path is only allowed together with --allow-http-route-update. Default deploy is code-only and must not update CloudBase HTTP routes.');
  }

  const config = readCloudBaseFunctionsConfig();
  validateCloudBaseFunctionsConfig(config);
  const functionConfig = resolveFunctionConfig(config, cli);
  const profileConfig = resolveProfileConfig(config, cli.profile);

  getManifest(cli.functionName);

  return resolveDeployOptions(cli, config, functionConfig, profileConfig);
}

function readOptionValue(argv, index, optionName) {
  const value = argv[index + 1];

  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${optionName}`);
  }

  return value;
}

function readCloudBaseFunctionsConfig() {
  try {
    return JSON.parse(readFileSync(cloudbaseFunctionsConfigPath, 'utf8'));
  } catch (error) {
    throw new Error(`Failed to read CloudBase function deploy config: ${cloudbaseFunctionsConfigPath}. ${error.message}`);
  }
}

function validateCloudBaseFunctionsConfig(config) {
  if (!isRecord(config)) {
    throw new Error('CloudBase deploy config root must be an object.');
  }

  const sensitivePaths = findSensitiveFieldNamePaths(config);
  if (sensitivePaths.length > 0) {
    throw new Error(`CloudBase deploy config contains sensitive-looking field names: ${sensitivePaths.join(', ')}. Secrets, keys, passwords, tokens, service roles, and private keys must not be stored in this file.`);
  }

  if (!isRecord(config.defaults)) {
    throw new Error('CloudBase deploy config defaults must be an object.');
  }

  if (!isRecord(config.functions)) {
    throw new Error('CloudBase deploy config functions must be an object.');
  }

  if (!isRecord(config.environments)) {
    throw new Error('CloudBase deploy config environments must be an object.');
  }

  validateDefaultsConfig(config.defaults);
  validateFunctionsConfig(config.functions);
  validateEnvironmentsConfig(config.environments);
}

function validateDefaultsConfig(defaults) {
  if (defaults.outputRoot !== undefined && !isNonEmptyString(defaults.outputRoot)) {
    throw new Error('CloudBase deploy config defaults.outputRoot must be a non-empty string when present.');
  }

  if (defaults.runtime !== undefined && !isNonEmptyString(defaults.runtime)) {
    throw new Error('CloudBase deploy config defaults.runtime must be a non-empty string when present.');
  }
}

function validateFunctionsConfig(functionsConfig) {
  for (const [functionName, functionConfig] of Object.entries(functionsConfig)) {
    if (!isRecord(functionConfig)) {
      throw new Error(`${functionName}: CloudBase function config must be an object.`);
    }

    assertHttpPath(functionConfig.httpPath, `functions.${functionName}.httpPath`);

    if (!Array.isArray(functionConfig.requiredEnvVars)) {
      throw new Error(`functions.${functionName}.requiredEnvVars must be an array.`);
    }

    for (const envVarName of functionConfig.requiredEnvVars) {
      if (!isNonEmptyString(envVarName)) {
        throw new Error(`functions.${functionName}.requiredEnvVars must contain only non-empty strings.`);
      }
    }
  }
}

function validateEnvironmentsConfig(environmentsConfig) {
  for (const [profileName, profileConfig] of Object.entries(environmentsConfig)) {
    if (!isRecord(profileConfig)) {
      throw new Error(`environments.${profileName} must be an object.`);
    }

    if (profileConfig.envId !== undefined && !isNonEmptyString(profileConfig.envId)) {
      throw new Error(`environments.${profileName}.envId must be a non-empty string when present.`);
    }

    if (profileConfig.baseUrl !== undefined) {
      normalizeBaseUrl(profileConfig.baseUrl, `environments.${profileName}.baseUrl`);
    }

    if (profileConfig.routeDomain !== undefined) {
      normalizeRouteDomain(profileConfig.routeDomain, `environments.${profileName}.routeDomain`);
    }
  }
}

function resolveFunctionConfig(config, cli) {
  const functionConfig = config.functions[cli.functionName];

  if (functionConfig) {
    return functionConfig;
  }

  throw new Error(`${cli.functionName}: missing function config in ${cloudbaseFunctionsConfigPath}. Add this function to the config file before deployment.`);
}

function resolveProfileConfig(config, profileName) {
  if (!profileName) {
    return null;
  }

  if (!Object.hasOwn(config.environments, profileName)) {
    throw new Error(`CloudBase deploy profile not found: ${profileName}`);
  }

  const profileConfig = config.environments[profileName];
  if (!isNonEmptyString(profileConfig.envId)) {
    throw new Error(`CloudBase deploy profile ${profileName} is missing envId.`);
  }

  return profileConfig;
}

function resolveDeployOptions(cli, config, functionConfig, profileConfig) {
  const outputRootResolution = resolveOutputRoot(cli, config.defaults);
  const runtimeResolution = resolveRuntime(cli, config.defaults);
  const envIdResolution = resolveEnvId(cli, profileConfig);
  const baseUrlResolution = resolveBaseUrl(cli, profileConfig);
  const routeDomainResolution = resolveRouteDomain(cli, profileConfig, baseUrlResolution.value);
  const httpPath = resolveHttpPath(cli, functionConfig);

  return {
    functionName: cli.functionName,
    profile: cli.profile,
    envId: envIdResolution.value,
    outputRoot: outputRootResolution.value,
    clean: cli.clean,
    check: cli.check,
    force: cli.force,
    runtime: runtimeResolution.value,
    httpPath,
    httpPathOverride: cli.httpPathOverride,
    baseUrl: baseUrlResolution.value,
    routeDomain: routeDomainResolution.value,
    requiredEnvVars: functionConfig?.requiredEnvVars ?? [],
    allowHttpRouteUpdate: cli.allowHttpRouteUpdate,
    dryRun: cli.dryRun,
    sources: {
      envId: envIdResolution.source,
      baseUrl: baseUrlResolution.source,
      routeDomain: routeDomainResolution.source,
      outputRoot: outputRootResolution.source,
      runtime: runtimeResolution.source,
    },
  };
}

function resolveOutputRoot(cli, defaults) {
  if (cli.outputRootProvided) {
    return {
      value: resolveUserPath(cli.outputRoot, repoRoot),
      source: 'command',
    };
  }

  if (isNonEmptyString(defaults.outputRoot)) {
    return {
      value: resolveUserPath(defaults.outputRoot, repoRoot),
      source: 'defaults',
    };
  }

  return {
    value: defaultDeployOutputRoot,
    source: 'fallback',
  };
}

function resolveRuntime(cli, defaults) {
  if (cli.runtimeProvided) {
    return {
      value: cli.runtime,
      source: 'command',
    };
  }

  if (isNonEmptyString(defaults.runtime)) {
    return {
      value: defaults.runtime,
      source: 'defaults',
    };
  }

  return {
    value: fallbackRuntime,
    source: 'fallback',
  };
}

function resolveEnvId(cli, profileConfig) {
  if (cli.envIdProvided) {
    return {
      value: cli.envId,
      source: 'command',
    };
  }

  if (profileConfig?.envId) {
    return {
      value: profileConfig.envId,
      source: 'profile',
    };
  }

  throw new Error('Missing CloudBase envId. Pass --profile <profile> with environments.<profile>.envId, or pass --envId <env-id>.');
}

function resolveBaseUrl(cli, profileConfig) {
  if (cli.baseUrlProvided) {
    return {
      value: normalizeBaseUrl(cli.baseUrl, '--base-url'),
      source: 'command',
    };
  }

  if (profileConfig?.baseUrl) {
    return {
      value: normalizeBaseUrl(profileConfig.baseUrl, `environments.${cli.profile}.baseUrl`),
      source: 'profile',
    };
  }

  return {
    value: '',
    source: 'missing',
  };
}

function resolveRouteDomain(cli, profileConfig, baseUrl) {
  if (cli.expectedRouteDomainProvided) {
    return {
      value: normalizeRouteDomain(cli.expectedRouteDomain, '--expected-route-domain'),
      source: 'command',
    };
  }

  if (profileConfig?.routeDomain) {
    return {
      value: normalizeRouteDomain(profileConfig.routeDomain, `environments.${cli.profile}.routeDomain`),
      source: 'profile',
    };
  }

  if (baseUrl) {
    return {
      value: new URL(baseUrl).host,
      source: 'derived from baseUrl',
    };
  }

  return {
    value: '',
    source: 'missing',
  };
}

function resolveHttpPath(cli, functionConfig) {
  const httpPath = cli.httpPathOverride ? cli.httpPath : functionConfig?.httpPath;
  assertHttpPath(httpPath, cli.httpPathOverride ? '--path' : `functions.${cli.functionName}.httpPath`);
  return httpPath;
}

function normalizeBaseUrl(value, label) {
  if (!isNonEmptyString(value)) {
    throw new Error(`${label} must be a non-empty string.`);
  }

  try {
    const url = new URL(value);

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('must use http or https.');
    }

    return url.toString().replace(/\/$/, '');
  } catch (error) {
    throw new Error(`Invalid ${label}: ${error.message}`);
  }
}

function normalizeRouteDomain(value, label) {
  if (!isNonEmptyString(value)) {
    throw new Error(`${label} must be a non-empty string.`);
  }

  const routeDomain = value.trim();

  if (/^https?:\/\//i.test(routeDomain)) {
    throw new Error(`${label} must not include http:// or https://.`);
  }

  if (routeDomain.includes('/')) {
    throw new Error(`${label} must be a domain, not a URL path.`);
  }

  return routeDomain;
}

function assertHttpPath(value, label) {
  if (!isNonEmptyString(value) || !value.startsWith('/')) {
    throw new Error(`${label} must be a non-empty HTTP path starting with /.`);
  }
}

function findSensitiveFieldNamePaths(value, parentPath = '') {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => findSensitiveFieldNamePaths(item, `${parentPath}[${index}]`));
  }

  if (!isRecord(value)) {
    return [];
  }

  return Object.entries(value).flatMap(([key, childValue]) => {
    const keyPath = parentPath ? `${parentPath}.${key}` : key;
    const currentPath = sensitiveFieldNamePatterns.some((pattern) => pattern.test(key)) ? [keyPath] : [];
    return [...currentPath, ...findSensitiveFieldNamePaths(childValue, keyPath)];
  });
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
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
    '.',
    '--runtime',
    options.runtime,
    '-e',
    options.envId,
    '--yes',
  ];

  if (options.allowHttpRouteUpdate) {
    args.push('--httpFn', '--path', options.httpPath);
  }

  if (options.force) {
    args.push('--force');
  }

  return {
    command: getPnpmCommand(),
    args,
    cwd: stagingDir,
    options,
  };
}

function getPnpmCommand() {
  return process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
}

function runCommand(label, commandSpec, cwd = repoRoot) {
  const result = spawnSync(commandSpec.command, commandSpec.args, {
    cwd,
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`${label} failed.`);
  }
}

function runDeployCommand(commandSpec) {
  const result = spawnSync(commandSpec.command, commandSpec.args, {
    cwd: commandSpec.cwd,
    stdio: 'pipe',
    encoding: 'utf8',
  });

  const output = [result.stdout, result.stderr].filter(Boolean).join('');
  printCommandOutput(output);

  if (result.error) {
    throw result.error;
  }

  if (isCancelledOutput(output)) {
    throw new Error('CloudBase function deployment was cancelled.');
  }

  if (result.status !== 0) {
    throw new Error('CloudBase function deployment failed.');
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
  const { options } = deployCommand;

  console.log('Dry run configuration:');
  console.log(`- profile: ${options.profile || 'not provided'}`);
  console.log(`- envId source: ${options.sources.envId}`);
  console.log(`- baseUrl source: ${options.sources.baseUrl}`);
  console.log(`- routeDomain source: ${options.sources.routeDomain}`);
  console.log(`- outputRoot source: ${options.sources.outputRoot}`);
  console.log(`- runtime source: ${options.sources.runtime}`);
  console.log(`- deploy mode: ${options.allowHttpRouteUpdate ? 'function code + HTTP route update' : 'code-only, HTTP route unchanged'}`);
  console.log('');
  console.log('Package command:');
  console.log(formatCommand(packageCommand.command, packageCommand.args));
  console.log('');
  console.log('Deploy command:');
  console.log(`cd ${formatShellArg(deployCommand.cwd)}`);
  console.log(formatCommand(deployCommand.command, deployCommand.args));
  console.log('');
  console.log('Dry run finished. No package, tcb check, CloudBase deployment, SQL, HTTP route, or function env var changes were executed.');
  printPostDeployChecklist(options, { dryRun: true });
}

function printPostDeployChecklist(options, { dryRun = false } = {}) {
  console.log('');
  if (dryRun) {
    console.log('Post-deploy checklist preview:');
  } else {
    console.log('Function code deployed successfully.');
    console.log('Please verify HTTP route and function env vars before using the API.');
  }

  if (dryRun) {
    console.log('- 函数代码上传：dry-run 未执行，真实部署成功后应为已完成。');
  } else {
    console.log('- 函数代码上传：已完成。');
  }

  printRequiredEnvVarsChecklist(options);
  printHttpRouteChecklist(options);
  console.log(`- HTTP route path: ${options.httpPath}`);

  if (options.routeDomain) {
    console.log(`- HTTP route domain: ${options.routeDomain}`);
  } else {
    console.log('- HTTP route domain: missing. Verify the CloudBase HTTP access service domain manually.');
  }

  if (options.baseUrl) {
    console.log(`- curl 验证命令：curl ${formatShellArg(buildVerificationUrl(options.baseUrl, options.httpPath))}`);
  } else {
    console.log('- curl 验证命令：missing baseUrl. Use the CloudBase HTTP Functions Base URL manually.');
  }

  console.log('- This script did not modify SQL.');
  console.log('- This script did not modify function env vars.');
  if (options.allowHttpRouteUpdate) {
    console.log('- This script requested a CloudBase CLI HTTP route update. Manually verify fixed domain, identity auth, path passthrough, and wildcard routes in the CloudBase console.');
  } else {
    console.log('- This script did not modify HTTP routes.');
  }
}

function printPathOverrideWarning(options) {
  if (!options.allowHttpRouteUpdate) {
    return;
  }

  const pathOverrideDetail = options.httpPathOverride
    ? `--path ${options.httpPath} overrides ${cloudbaseFunctionsConfigPath}. `
    : '';
  console.warn(`WARN ${pathOverrideDetail}--allow-http-route-update lets CloudBase CLI create or update an HTTP route, but this script cannot set the fixed route domain, identity auth, or path passthrough. Manually verify the route is not under wildcard *.`);
}

function printHttpRouteChecklist(options) {
  if (options.allowHttpRouteUpdate) {
    console.log('- HTTP route deploy mode: route update explicitly enabled.');
    console.log('- HTTP route risk: CloudBase CLI --httpFn/--path does not expose fixed domain, identity auth, or path passthrough controls in this script.');
    console.log('- Manual route checks: fixed app.tcloudbase.com domain, identity auth enabled, path passthrough disabled, no wildcard * route for main APIs.');
    return;
  }

  console.log('- HTTP route deploy mode: code-only; route creation/update is intentionally skipped.');
  console.log('- Code-only deploy assumes the CloudBase function already exists as an HTTP function. Create the first HTTP function and main API route in the CloudBase console.');
  console.log('- Manual route checks: fixed app.tcloudbase.com domain, identity auth enabled, path passthrough disabled, no wildcard * route for main APIs.');
}

function printRequiredEnvVarsChecklist(options) {
  console.log('- 函数环境变量：');

  if (options.requiredEnvVars.length === 0) {
    console.log(`  - none configured in ${cloudbaseFunctionsConfigPath}`);
    return;
  }

  for (const envVarName of options.requiredEnvVars) {
    console.log(`  - ${formatRequiredEnvVarCheck(envVarName, options)}`);
  }
}

function formatRequiredEnvVarCheck(envVarName, options) {
  if (envVarName === 'CLOUDBASE_ENV_ID') {
    return `${envVarName}=${options.envId}`;
  }

  return `${envVarName}=<required>`;
}

function formatCommand(command, args) {
  return [command, ...args].map(formatShellArg).join(' ');
}

function buildVerificationUrl(baseUrl, httpPath) {
  return new URL(httpPath, `${baseUrl}/`).toString();
}

function printCommandOutput(output) {
  if (!output) {
    return;
  }

  process.stdout.write(output);

  if (!output.endsWith('\n')) {
    process.stdout.write('\n');
  }
}

function isCancelledOutput(output) {
  return /\b(?:deployment\s+cancelled|cancelled|canceled)\b/i.test(output);
}

function formatShellArg(value) {
  const text = String(value);

  if (/^[A-Za-z0-9_./:=@-]+$/.test(text)) {
    return text;
  }

  return JSON.stringify(text);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const stagingDir = getPackageOutputDir(options.outputRoot, options.functionName);
  const packageCommand = createPackageCommand(options);
  const deployCommand = createDeployCommand(options, stagingDir);
  printPathOverrideWarning(options);

  if (options.dryRun) {
    printDryRun(packageCommand, deployCommand);
    return;
  }

  runCommand('CloudBase package', packageCommand);

  if (!options.check) {
    assertStagingDirExists(stagingDir);
  }

  assertTcbAvailable();
  runDeployCommand(deployCommand);
  printPostDeployChecklist(options);
}

main().catch((error) => {
  console.error(`ERROR ${error.message}`);
  process.exitCode = 1;
});
