const { existsSync, readFileSync } = require('node:fs');
const Module = require('node:module');
const path = require('node:path');

function requireCommonJsFile(filePath) {
  const loadedModule = new Module(filePath, module);
  loadedModule.filename = filePath;
  loadedModule.paths = Module._nodeModulePaths(path.dirname(filePath));
  loadedModule._compile(readFileSync(filePath, 'utf8'), filePath);
  return loadedModule.exports;
}

function loadSharedModule(name) {
  const bundledSharedPath = path.join(__dirname, '_shared', `${name}.js`);

  if (existsSync(bundledSharedPath)) {
    return require(`./_shared/${name}`);
  }

  return requireCommonJsFile(path.join(__dirname, '..', '_shared', `${name}.js`));
}

const { createReportRequestMetadata } = loadSharedModule('agentRunModelMetadata');

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseJsonObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value;
  }

  if (typeof value !== 'string' || !value.trim()) {
    return {};
  }

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeNumber(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function normalizeDateTime(value) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'string') {
    return value;
  }

  return '';
}

function createReportMetadata(metadata, runModelMetadata = {}, options = {}) {
  const nextMetadata = createReportRequestMetadata(metadata);

  if (typeof options.runId === 'string' && options.runId.trim()) {
    nextMetadata.runId = options.runId.trim();
  }

  delete nextMetadata.sources;
  delete nextMetadata.sourceCount;
  delete nextMetadata.source_count;
  delete nextMetadata.sourceLineage;
  delete nextMetadata.source_lineage;
  delete nextMetadata.sourceNoSourceReason;
  delete nextMetadata.source_no_source_reason;

  return {
    ...nextMetadata,
    ...(isRecord(runModelMetadata) ? runModelMetadata : {}),
  };
}

function readPersistedReportMetadata(metadata) {
  const source = isRecord(metadata) ? metadata : {};
  const nextMetadata = {};

  if (typeof source.source === 'string' && source.source.trim()) {
    nextMetadata.source = source.source.trim();
  }

  if (typeof source.runId === 'string' && source.runId.trim()) {
    nextMetadata.runId = source.runId.trim();
  }

  if (typeof source.reportState === 'string' && source.reportState.trim()) {
    nextMetadata.reportState = source.reportState.trim();
  }

  if (Array.isArray(source.toolNames)) {
    const toolNames = source.toolNames
      .filter((toolName) => typeof toolName === 'string' && toolName.trim())
      .map((toolName) => toolName.trim());

    if (toolNames.length > 0) {
      nextMetadata.toolNames = toolNames;
    }
  }

  if (isRecord(source.modelTrace)) {
    nextMetadata.modelTrace = { ...source.modelTrace };
  } else if (source.modelTrace === null) {
    nextMetadata.modelTrace = null;
  }

  if (typeof source.langSmithTraceId === 'string' && source.langSmithTraceId.trim()) {
    nextMetadata.langSmithTraceId = source.langSmithTraceId.trim();
  } else if (source.langSmithTraceId === null) {
    nextMetadata.langSmithTraceId = null;
  }

  return nextMetadata;
}

function mapReport(row) {
  return {
    id: String(row.id ?? ''),
    conversation_id: String(row.conversation_id ?? ''),
    runId: String(row.run_id ?? ''),
    user_id: String(row.user_id ?? ''),
    title: String(row.title ?? '分析报告'),
    content_markdown: String(row.content_markdown ?? ''),
    status: String(row.status ?? 'generated'),
    version: normalizeNumber(row.version),
    created_at: normalizeDateTime(row.created_at),
    updated_at: normalizeDateTime(row.updated_at),
    metadata: readPersistedReportMetadata(parseJsonObject(row.metadata)),
    sources: [],
    sourceCount: 0,
    sourceLineage: 'run_sources',
    sourceNoSourceReason: null,
  };
}

module.exports = {
  createReportMetadata,
  createReportRequestMetadata,
  mapReport,
  readPersistedReportMetadata,
};
