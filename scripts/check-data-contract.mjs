import { readdir, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rulesPath = path.join(rootDir, 'contracts/generated/forbidden-rules.json');
const checkAll = process.argv.includes('--all');
const formalCodeRoots = ['src', 'tencent/functions'];
const codeExtensions = new Set(['.js', '.jsx', '.ts', '.tsx']);
const ignoredPathParts = new Set(['node_modules', 'dist', 'build', 'coverage']);
const isCi = process.env.GITHUB_ACTIONS === 'true' || process.env.CI === 'true';

function git(args) {
  return execFileSync('git', args, { cwd: rootDir, encoding: 'utf8' }).trim();
}

function normalizePath(filePath) {
  return filePath.split(path.sep).join('/');
}

function isFormalCodePath(filePath) {
  const normalized = normalizePath(filePath);
  if (!formalCodeRoots.some((root) => normalized === root || normalized.startsWith(`${root}/`))) {
    return false;
  }

  if ([...ignoredPathParts].some((part) => normalized.split('/').includes(part))) {
    return false;
  }

  if (/(^|\/)README\.md$/i.test(normalized) || /(^|\/)package\.json$/i.test(normalized)) {
    return false;
  }

  return codeExtensions.has(path.extname(normalized));
}

async function walk(dir) {
  const entries = await readdir(path.join(rootDir, dir), { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const relativePath = normalizePath(path.join(dir, entry.name));
    if (entry.isDirectory()) {
      if (!ignoredPathParts.has(entry.name)) {
        files.push(...(await walk(relativePath)));
      }
    } else if (isFormalCodePath(relativePath)) {
      files.push(relativePath);
    }
  }

  return files;
}

export function changedFilesFromGit() {
  const baseBranch = process.env.GITHUB_BASE_REF;
  const baseRef = baseBranch ? `origin/${baseBranch}` : 'origin/stage/w3-token-cost-usage';
  const files = new Set();
  let resolvedMergeBase = false;

  try {
    if (isCi && !baseBranch) {
      throw new Error('GITHUB_BASE_REF is not set for this CI run.');
    }
    git(['rev-parse', '--verify', `${baseRef}^{commit}`]);
    const mergeBase = git(['merge-base', 'HEAD', baseRef]);
    resolvedMergeBase = true;
    for (const file of git(['diff', '--name-only', '--diff-filter=ACMRT', `${mergeBase}...HEAD`]).split(/\r?\n/)) {
      if (file) files.add(file);
    }
  } catch (error) {
    if (isCi) {
      throw new Error(
        `Data Contract Check could not resolve base ref ${baseRef} or merge-base. ${error.message}`,
      );
    }

    console.warn(
      `Data Contract Check warning: could not resolve ${baseRef}; falling back to local unstaged/untracked diff.`,
    );
  }

  if (!resolvedMergeBase) {
    try {
      for (const file of git(['diff', '--name-only', '--diff-filter=ACMRT']).split(/\r?\n/)) {
        if (file) files.add(file);
      }
    } catch {
      // No-op outside git, handled by the empty set below.
    }

    try {
      for (const file of git(['ls-files', '--others', '--exclude-standard']).split(/\r?\n/)) {
        if (file) files.add(file);
      }
    } catch {
      // No-op outside git, handled by the empty set below.
    }
  }

  return [...files].filter(isFormalCodePath).sort();
}

function scriptKindForFile(file) {
  const extension = path.extname(file);
  if (extension === '.tsx') return ts.ScriptKind.TSX;
  if (extension === '.jsx') return ts.ScriptKind.JSX;
  if (extension === '.js') return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function readNameText(name) {
  if (!name) return null;
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return null;
}

function unwrapExpression(expression) {
  let current = expression;
  while (ts.isParenthesizedExpression(current) || ts.isNonNullExpression(current)) {
    current = current.expression;
  }
  return current;
}

function readIdentifierExpression(expression) {
  const current = unwrapExpression(expression);
  return ts.isIdentifier(current) ? current.text : null;
}

function readLiteralString(expression) {
  const current = unwrapExpression(expression);
  return ts.isStringLiteralLike(current) ? current.text : null;
}

function locationFor(sourceFile, node) {
  const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return line + 1;
}

function ruleKey(objectName, propertyName) {
  return `${objectName}.${propertyName}`;
}

export function buildRuleIndex(rules) {
  const identifierRules = new Map();
  const propertyRules = new Map();
  const binaryRules = [];
  const protectedObjects = new Set();
  let rawRunMockFallbackRule = null;

  for (const rule of rules) {
    if (rule.kind === 'identifier') {
      identifierRules.set(rule.identifier, rule);
    } else if (rule.kind === 'objectProperty') {
      propertyRules.set(ruleKey(rule.objectName, rule.propertyName), rule);
      protectedObjects.add(rule.objectName);
    } else if (rule.kind === 'binaryExpression') {
      binaryRules.push(rule);
    } else if (rule.kind === 'rawRunMockFallback') {
      rawRunMockFallbackRule = rule;
      protectedObjects.add(rule.objectName);
    }
  }

  return {
    binaryRules,
    identifierRules,
    propertyRules,
    protectedObjects,
    rawRunMockFallbackRule,
  };
}

function createReporter(file, sourceFile) {
  const matches = [];
  const seen = new Set();

  return {
    matches,
    report(node, label) {
      const line = locationFor(sourceFile, node);
      const key = `${line}:${label}`;
      if (seen.has(key)) return;
      seen.add(key);
      matches.push({ file, line, label });
    },
  };
}

function findPropertyRule(index, objectName, propertyName) {
  if (!objectName || !propertyName) return null;
  return index.propertyRules.get(ruleKey(objectName, propertyName)) ?? null;
}

function isPropertyAccessLike(node) {
  return ts.isPropertyAccessExpression(node) || ts.isPropertyAccessChain?.(node);
}

function isElementAccessLike(node) {
  return ts.isElementAccessExpression(node) || ts.isElementAccessChain?.(node);
}

function reportPropertyAccess(node, index, reporter) {
  const objectName = readIdentifierExpression(node.expression);
  const propertyName = node.name?.text;
  const rule = findPropertyRule(index, objectName, propertyName);
  if (rule) reporter.report(node, rule.label);
}

function reportElementAccess(node, index, reporter) {
  const objectName = readIdentifierExpression(node.expression);
  if (!objectName || !index.protectedObjects.has(objectName)) return;

  const propertyName = node.argumentExpression ? readLiteralString(node.argumentExpression) : null;
  if (propertyName) {
    const rule = findPropertyRule(index, objectName, propertyName);
    if (rule) reporter.report(node, rule.label);
    return;
  }

  reporter.report(node, `${objectName}[dynamic]`);
}

function reportIdentifier(node, index, reporter) {
  const rule = index.identifierRules.get(node.text);
  if (rule) reporter.report(node, rule.label);
}

function isIdentifierNamed(node, name) {
  return ts.isIdentifier(unwrapExpression(node)) && unwrapExpression(node).text === name;
}

function expressionMatchesRuleSide(node, identifier) {
  return isIdentifierNamed(node, identifier);
}

function operatorTextToKind(operator) {
  if (operator === '??') return ts.SyntaxKind.QuestionQuestionToken;
  if (operator === '||') return ts.SyntaxKind.BarBarToken;
  return null;
}

function isRawRunConclusionSourceAccess(node, rule) {
  const current = unwrapExpression(node);
  if (!rule) return false;

  if (isPropertyAccessLike(current)) {
    return readIdentifierExpression(current.expression) === rule.objectName && current.name?.text === rule.propertyName;
  }

  if (isElementAccessLike(current)) {
    return (
      readIdentifierExpression(current.expression) === rule.objectName &&
      current.argumentExpression &&
      readLiteralString(current.argumentExpression) === rule.propertyName
    );
  }

  return false;
}

function reportBinaryExpression(node, index, rawRunAliases, reporter) {
  for (const rule of index.binaryRules) {
    if (node.operatorToken.kind !== operatorTextToKind(rule.operator)) continue;
    if (
      expressionMatchesRuleSide(node.left, rule.leftIdentifier) &&
      expressionMatchesRuleSide(node.right, rule.rightIdentifier)
    ) {
      reporter.report(node, rule.label);
    }
  }

  const rawRule = index.rawRunMockFallbackRule;
  if (!rawRule || node.operatorToken.kind !== ts.SyntaxKind.QuestionQuestionToken) return;
  if (!ts.isStringLiteralLike(unwrapExpression(node.right)) || readLiteralString(node.right) !== rawRule.fallbackValue) {
    return;
  }

  if (isRawRunConclusionSourceAccess(node.left, rawRule)) {
    reporter.report(node, rawRule.label);
    return;
  }

  const left = unwrapExpression(node.left);
  if (ts.isIdentifier(left) && rawRunAliases.has(left.text)) {
    reporter.report(node, rawRule.label);
  }
}

function isProtectedObjectName(index, name) {
  return Boolean(name && index.protectedObjects.has(name));
}

function aliasFromBindingName(name) {
  if (ts.isIdentifier(name)) return name.text;
  return null;
}

function scanBindingPattern(pattern, objectName, index, reporter, rawRunAliases) {
  for (const element of pattern.elements) {
    if (ts.isOmittedExpression(element)) continue;

    const propertyName = readNameText(element.propertyName) ?? aliasFromBindingName(element.name);
    if (!propertyName) continue;

    if (objectName) {
      const rule = findPropertyRule(index, objectName, propertyName);
      if (rule) reporter.report(element, rule.label);

      const rawRule = index.rawRunMockFallbackRule;
      const alias = aliasFromBindingName(element.name);
      if (rawRule && objectName === rawRule.objectName && propertyName === rawRule.propertyName && alias) {
        rawRunAliases.add(alias);
      }
    }

    if (ts.isObjectBindingPattern(element.name)) {
      const nestedObjectName = isProtectedObjectName(index, propertyName) ? propertyName : null;
      scanBindingPattern(element.name, nestedObjectName, index, reporter, rawRunAliases);
    }
  }
}

function scanAssignmentPattern(pattern, objectName, index, reporter, rawRunAliases) {
  for (const property of pattern.properties) {
    if (ts.isSpreadAssignment(property)) continue;

    const propertyName = ts.isShorthandPropertyAssignment(property)
      ? property.name.text
      : readNameText(property.name);
    if (!propertyName) continue;

    if (objectName) {
      const rule = findPropertyRule(index, objectName, propertyName);
      if (rule) reporter.report(property, rule.label);

      const rawRule = index.rawRunMockFallbackRule;
      const alias = assignmentAlias(property);
      if (rawRule && objectName === rawRule.objectName && propertyName === rawRule.propertyName && alias) {
        rawRunAliases.add(alias);
      }
    }

    if (ts.isPropertyAssignment(property)) {
      const initializer = unwrapExpression(property.initializer);
      if (ts.isObjectLiteralExpression(initializer)) {
        const nestedObjectName = isProtectedObjectName(index, propertyName) ? propertyName : null;
        scanAssignmentPattern(initializer, nestedObjectName, index, reporter, rawRunAliases);
      }
    }
  }
}

function assignmentAlias(property) {
  if (ts.isShorthandPropertyAssignment(property)) return property.name.text;
  if (!ts.isPropertyAssignment(property)) return null;

  const initializer = unwrapExpression(property.initializer);
  if (ts.isIdentifier(initializer)) return initializer.text;
  if (
    ts.isBinaryExpression(initializer) &&
    initializer.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
    ts.isIdentifier(unwrapExpression(initializer.left))
  ) {
    return unwrapExpression(initializer.left).text;
  }
  return null;
}

function collectAliasesFromNode(node, index, reporter, rawRunAliases) {
  if (ts.isVariableDeclaration(node) && ts.isObjectBindingPattern(node.name)) {
    const objectName = node.initializer ? readIdentifierExpression(node.initializer) : null;
    scanBindingPattern(node.name, isProtectedObjectName(index, objectName) ? objectName : null, index, reporter, rawRunAliases);
  } else if (ts.isParameter(node) && ts.isObjectBindingPattern(node.name)) {
    scanBindingPattern(node.name, null, index, reporter, rawRunAliases);
  } else if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
    ts.isObjectLiteralExpression(unwrapExpression(node.left))
  ) {
    const objectName = readIdentifierExpression(node.right);
    scanAssignmentPattern(
      unwrapExpression(node.left),
      isProtectedObjectName(index, objectName) ? objectName : null,
      index,
      reporter,
      rawRunAliases,
    );
  }

  ts.forEachChild(node, (child) => collectAliasesFromNode(child, index, reporter, rawRunAliases));
}

export function findForbiddenMatchesInContent(file, content, rules) {
  const sourceFile = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, scriptKindForFile(file));
  const index = buildRuleIndex(rules);
  const reporter = createReporter(file, sourceFile);
  const rawRunAliases = new Set();

  collectAliasesFromNode(sourceFile, index, reporter, rawRunAliases);

  function visit(node) {
    if (isPropertyAccessLike(node)) {
      reportPropertyAccess(node, index, reporter);
    } else if (isElementAccessLike(node)) {
      reportElementAccess(node, index, reporter);
    } else if (ts.isIdentifier(node)) {
      reportIdentifier(node, index, reporter);
    } else if (ts.isBinaryExpression(node)) {
      reportBinaryExpression(node, index, rawRunAliases, reporter);
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return reporter.matches;
}

export async function readForbiddenRules() {
  const rulesDocument = JSON.parse(await readFile(rulesPath, 'utf8'));
  if (!Array.isArray(rulesDocument.rules)) {
    throw new Error('Invalid forbidden rules: contracts/generated/forbidden-rules.json must contain rules[].');
  }
  return rulesDocument.rules;
}

async function scanFile(file, rules) {
  const content = await readFile(path.join(rootDir, file), 'utf8');
  return findForbiddenMatchesInContent(file, content, rules);
}

async function main() {
  const rules = await readForbiddenRules();
  const files = checkAll
    ? (await Promise.all(formalCodeRoots.map(walk))).flat().sort()
    : changedFilesFromGit();

  const violations = (await Promise.all(files.map((file) => scanFile(file, rules)))).flat();

  if (violations.length > 0) {
    console.error('Data Contract Check failed. Forbidden fields or fallback patterns were found:');
    for (const violation of violations) {
      console.error(`- ${violation.file}:${violation.line} ${violation.label}`);
    }
    process.exit(1);
  }

  const scope = checkAll ? 'all formal runtime files' : 'changed formal runtime files';
  console.log(`Data Contract Check passed. Scanned ${files.length} ${scope}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
