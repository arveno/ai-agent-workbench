const cloudbase = require('@cloudbase/node-sdk');

const DEFAULT_ENV_ID = 'ai-agent-workbench-poc-d6731923d';

let cachedApp = null;
let cachedDb = null;

function getCloudBaseEnvId() {
  return (process.env.CLOUDBASE_ENV_ID || process.env.TCB_ENV_ID || DEFAULT_ENV_ID).trim();
}

function getCloudBaseApp() {
  if (!cachedApp) {
    cachedApp = cloudbase.init({
      env: getCloudBaseEnvId(),
    });
  }

  return cachedApp;
}

function getDb() {
  if (!cachedDb) {
    cachedDb = getCloudBaseApp().rdb();
  }

  return cachedDb;
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

function parseJsonArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value !== 'string' || !value.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function extractRows(result) {
  if (Array.isArray(result)) {
    return result;
  }

  if (!result || typeof result !== 'object') {
    return [];
  }

  const data = result.data;

  if (Array.isArray(data)) {
    return data;
  }

  if (!data || typeof data !== 'object') {
    return [];
  }

  if (Array.isArray(data.executeResultList)) {
    return data.executeResultList;
  }

  if (Array.isArray(data.records)) {
    return data.records;
  }

  if (Array.isArray(data.rows)) {
    return data.rows;
  }

  if (Array.isArray(data.list)) {
    return data.list;
  }

  return [];
}

function assertNoQueryError(result) {
  const error = result && result.error;

  if (!error) {
    return;
  }

  if (typeof error === 'string') {
    throw new Error(error);
  }

  if (error && typeof error === 'object') {
    throw new Error(error.message || error.errMsg || 'CloudBase MySQL query failed');
  }

  throw new Error('CloudBase MySQL query failed');
}

module.exports = {
  assertNoQueryError,
  extractRows,
  getCloudBaseApp,
  getCloudBaseEnvId,
  getDb,
  parseJsonArray,
  parseJsonObject,
};
