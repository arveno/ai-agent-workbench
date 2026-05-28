import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const rulesPath = path.join(rootDir, 'contracts/generated/data-contract-lint-rules.json');
const generatedRules = JSON.parse(readFileSync(rulesPath, 'utf8'));

const FORBIDDEN_PROPERTY_ALLOWLIST = new Map([
  [
    'tencent/functions/_shared/langchainModelLayer.js',
    new Set([
      'chunk.usage_metadata',
      'chunk.response_metadata.token_usage',
      'chunk.response_metadata.tokenUsage',
      'chunk.additional_kwargs.usage',
    ]),
  ],
]);

const DB_MAPPER_FILES = new Set([
  'src/utils/runPersistenceMapper.ts',
  'src/types/persistence.ts',
  'tencent/functions/workbench-reports/index.js',
  'tencent/functions/workbench-runs/index.js',
]);

const DB_MAPPER_PROPERTIES = new Set([
  'source_count',
  'source_lineage',
  'source_no_source_reason',
]);

const NON_CONTRACT_METADATA_KEYS = new Set([
  'langChainToolName',
  'retrieverProvider',
  'runLifecycle',
  'runtime',
  'runtimeToolId',
  'sourceName',
  'toolRuntime',
]);

const NON_CONTRACT_METADATA_CONTAINER_KEYS = new Set([
  'citationLabel',
  'pageContent',
  'sourceOrder',
  'sourceType',
  'tags',
]);

function normalizePathname(filename) {
  return filename.split(path.sep).join('/');
}

function unwrapChain(node) {
  return node?.type === 'ChainExpression' ? node.expression : node;
}

function getStaticPropertyName(node) {
  const property = unwrapChain(node)?.property;
  if (!property) return null;
  if (!node.computed && property.type === 'Identifier') return property.name;
  if (node.computed && property.type === 'Literal') return String(property.value);
  if (
    node.computed &&
    property.type === 'TemplateLiteral' &&
    property.expressions.length === 0 &&
    property.quasis.length === 1
  ) {
    return property.quasis[0].value.cooked;
  }
  return null;
}

function getStaticPropertyKeyName(property) {
  const key = property?.key;
  if (!key) return null;
  if (!property.computed && key.type === 'Identifier') return key.name;
  if (key.type === 'Literal') return String(key.value);
  if (
    key.type === 'TemplateLiteral' &&
    key.expressions.length === 0 &&
    key.quasis.length === 1
  ) {
    return key.quasis[0].value.cooked;
  }
  return null;
}

function getMemberPath(node) {
  const member = unwrapChain(node);
  if (!member || member.type !== 'MemberExpression') return null;

  const propertyName = getStaticPropertyName(member);
  if (!propertyName) return null;

  const object = unwrapChain(member.object);
  if (object?.type === 'Identifier') return `${object.name}.${propertyName}`;
  if (object?.type === 'MemberExpression') {
    const objectPath = getMemberPath(object);
    return objectPath ? `${objectPath}.${propertyName}` : null;
  }

  return null;
}

function getExpressionLabel(node) {
  const expression = unwrapChain(node);
  if (!expression) return null;
  if (expression.type === 'Identifier') return expression.name;
  if (expression.type === 'MemberExpression') return getMemberPath(expression);
  if (expression.type === 'Literal') {
    return typeof expression.value === 'string' ? JSON.stringify(expression.value).replace(/"/g, "'") : String(expression.value);
  }
  return null;
}

function isDeleteOperand(node) {
  return node.parent?.type === 'UnaryExpression' && node.parent.operator === 'delete';
}

function isAllowedProviderRawBoundary(filename, memberPath) {
  const normalizedFilename = normalizePathname(filename);
  for (const [allowedPath, allowedMembers] of FORBIDDEN_PROPERTY_ALLOWLIST.entries()) {
    if (normalizedFilename.endsWith(allowedPath) && allowedMembers.has(memberPath)) {
      return true;
    }
  }
  return false;
}

function isAllowedDbMapperBoundary(filename, memberPath, propertyName) {
  const normalizedFilename = normalizePathname(filename);
  const isDbMapperFile = [...DB_MAPPER_FILES].some((allowedPath) => normalizedFilename.endsWith(allowedPath));
  if (!isDbMapperFile || !DB_MAPPER_PROPERTIES.has(propertyName)) return false;

  return memberPath.startsWith('row.') || memberPath.startsWith('record.');
}

function isAllowedMemberAccess(context, node, memberPath, propertyName) {
  const filename = context.filename ?? context.getFilename?.() ?? '';
  if (isDeleteOperand(node)) return true;
  if (isAllowedProviderRawBoundary(filename, memberPath)) return true;
  if (isAllowedDbMapperBoundary(filename, memberPath, propertyName)) return true;
  return false;
}

function shouldSkipIdentifier(node) {
  const parent = node.parent;
  if (!parent) return false;

  if (
    parent.type === 'LogicalExpression' &&
    (parent.left === node || parent.right === node) &&
    findFallbackRule(parent)
  ) {
    return true;
  }
  if (parent.type === 'MemberExpression' && parent.property === node && !parent.computed) return true;
  if (parent.type === 'Property' && parent.parent?.type === 'ObjectPattern') return true;
  if (parent.type === 'Property' && parent.parent?.type === 'ObjectExpression' && parent.shorthand) return true;
  if (parent.type === 'Property' && parent.key === node) return true;
  if (parent.type === 'PropertyDefinition' && parent.key === node) return true;
  if (parent.type === 'MethodDefinition' && parent.key === node) return true;
  if (parent.type === 'ImportSpecifier' || parent.type === 'ImportDefaultSpecifier' || parent.type === 'ImportNamespaceSpecifier') return true;
  if (parent.type === 'ExportSpecifier') return true;
  if (parent.type === 'LabeledStatement' || parent.type === 'BreakStatement' || parent.type === 'ContinueStatement') return true;
  return false;
}

function matchesPath(ruleLabel, memberPath) {
  return memberPath === ruleLabel || memberPath.endsWith(`.${ruleLabel}`);
}

function getObjectExpressionKeyNames(expression) {
  const keys = new Set();
  if (expression?.type !== 'ObjectExpression') return keys;

  for (const property of expression.properties ?? []) {
    if (property.type !== 'Property') continue;

    const keyName = getStaticPropertyKeyName(property);
    if (keyName) keys.add(keyName);
  }

  return keys;
}

function hasAnyKey(keys, expectedKeys) {
  for (const key of expectedKeys) {
    if (keys.has(key)) return true;
  }
  return false;
}

function getContainingObjectExpression(expression) {
  if (
    expression?.parent?.type === 'Property' &&
    expression.parent.value === expression &&
    expression.parent.parent?.type === 'ObjectExpression'
  ) {
    return expression.parent.parent;
  }
  return null;
}

function isAllowedNonContractMetadataBoundary(expression, fullPath) {
  if (!fullPath.startsWith('metadata.')) return false;

  const metadataKeys = getObjectExpressionKeyNames(expression);
  if (hasAnyKey(metadataKeys, NON_CONTRACT_METADATA_KEYS)) return true;

  const containerKeys = getObjectExpressionKeyNames(getContainingObjectExpression(expression));
  return hasAnyKey(containerKeys, NON_CONTRACT_METADATA_CONTAINER_KEYS);
}

function buildRuleState() {
  const identifierRules = new Map();
  const objectPropertyRules = [];
  const fallbackRules = [];

  for (const rule of generatedRules.rules ?? []) {
    if (rule.kind === 'identifier') {
      identifierRules.set(rule.identifier, rule);
    } else if (rule.kind === 'objectProperty') {
      objectPropertyRules.push(rule);
    } else if (rule.kind === 'fallbackExpression') {
      fallbackRules.push(rule);
    }
  }

  return {
    identifierRules,
    objectPropertyRules,
    fallbackRules,
  };
}

const ruleState = buildRuleState();

function report(context, node, rule) {
  context.report({
    node,
    messageId: 'forbiddenField',
    data: {
      label: rule.label,
      reason: rule.reason,
    },
  });
}

function checkMemberExpression(context, node) {
  if (
    node.parent?.type === 'LogicalExpression' &&
    (node.parent.left === node || node.parent.right === node) &&
    findFallbackRule(node.parent)
  ) {
    return;
  }

  const memberPath = getMemberPath(node);
  const propertyName = getStaticPropertyName(node);
  if (!memberPath || !propertyName) return;
  if (isAllowedMemberAccess(context, node, memberPath, propertyName)) return;

  const identifierRule = ruleState.identifierRules.get(propertyName);
  if (identifierRule) {
    report(context, node.property ?? node, identifierRule);
    return;
  }

  const objectRule = ruleState.objectPropertyRules.find((rule) => matchesPath(rule.label, memberPath));
  if (objectRule) {
    report(context, node.property ?? node, objectRule);
  }
}

function checkObjectPattern(context, pattern, basePath = '') {
  for (const property of pattern.properties ?? []) {
    if (property.type !== 'Property') continue;

    const keyName = getStaticPropertyKeyName(property);
    if (!keyName) continue;

    const fullPath = basePath ? `${basePath}.${keyName}` : keyName;
    const identifierRule = ruleState.identifierRules.get(keyName);
    const objectRule = ruleState.objectPropertyRules.find((rule) => matchesPath(rule.label, fullPath));

    if (identifierRule) {
      report(context, property.key, identifierRule);
    } else if (objectRule) {
      report(context, property.key, objectRule);
    }

    const value = unwrapChain(property.value);
    if (value?.type === 'ObjectPattern') {
      checkObjectPattern(context, value, fullPath);
    }
  }
}

function checkObjectExpression(context, expression, basePath = '') {
  for (const property of expression.properties ?? []) {
    if (property.type !== 'Property') continue;

    const keyName = getStaticPropertyKeyName(property);
    if (!keyName) continue;

    const fullPath = basePath ? `${basePath}.${keyName}` : keyName;
    const objectRule = ruleState.objectPropertyRules.find((rule) => matchesPath(rule.label, fullPath));
    const identifierRule = ruleState.identifierRules.get(keyName);

    if (objectRule && !isAllowedNonContractMetadataBoundary(expression, fullPath)) {
      report(context, property.key, objectRule);
    } else if (identifierRule) {
      report(context, property.key, identifierRule);
    }

    const value = unwrapChain(property.value);
    if (value?.type === 'ObjectExpression') {
      checkObjectExpression(context, value, fullPath);
    }
  }
}

function isNestedObjectExpressionValue(node) {
  return node.parent?.type === 'Property' &&
    node.parent.value === node &&
    node.parent.parent?.type === 'ObjectExpression';
}

function checkFallbackExpression(context, node) {
  const rule = findFallbackRule(node);
  if (rule) report(context, node, rule);
}

function findFallbackRule(node) {
  const left = getExpressionLabel(node.left);
  const right = getExpressionLabel(node.right);
  if (!left || !right) return null;

  return ruleState.fallbackRules.find(
    (candidate) => candidate.operator === node.operator && candidate.left === left && candidate.right === right,
  ) ?? null;
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow fields and fallback chains forbidden by the Data Contract Pack.',
    },
    messages: {
      forbiddenField: 'Forbidden data contract field "{{label}}": {{reason}}',
    },
    schema: [],
  },
  create(context) {
    return {
      MemberExpression(node) {
        checkMemberExpression(context, node);
      },
      Identifier(node) {
        if (shouldSkipIdentifier(node)) return;

        const rule = ruleState.identifierRules.get(node.name);
        if (rule) report(context, node, rule);
      },
      ObjectExpression(node) {
        if (isNestedObjectExpressionValue(node)) return;
        checkObjectExpression(context, node);
      },
      VariableDeclarator(node) {
        if (node.id?.type === 'ObjectPattern') {
          checkObjectPattern(context, node.id, getExpressionLabel(node.init) ?? '');
        }
      },
      AssignmentExpression(node) {
        if (node.left?.type === 'ObjectPattern') {
          checkObjectPattern(context, node.left, getExpressionLabel(node.right) ?? '');
        }
      },
      FunctionDeclaration(node) {
        for (const param of node.params ?? []) {
          if (param.type === 'ObjectPattern') checkObjectPattern(context, param);
        }
      },
      FunctionExpression(node) {
        for (const param of node.params ?? []) {
          if (param.type === 'ObjectPattern') checkObjectPattern(context, param);
        }
      },
      ArrowFunctionExpression(node) {
        for (const param of node.params ?? []) {
          if (param.type === 'ObjectPattern') checkObjectPattern(context, param);
        }
      },
      LogicalExpression(node) {
        checkFallbackExpression(context, node);
      },
    };
  },
};
