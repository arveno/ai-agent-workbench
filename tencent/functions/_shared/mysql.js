const cloudbase = require('@cloudbase/node-sdk');

let cachedApp = null;
let cachedDb = null;

function getCloudBaseEnvId() {
  const envId = (process.env.CLOUDBASE_ENV_ID || process.env.TCB_ENV_ID || '').trim();

  if (!envId) {
    throw new Error(
      'Missing CloudBase function env var: set CLOUDBASE_ENV_ID or TCB_ENV_ID before using CloudBase MySQL.',
    );
  }

  return envId;
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

function extractMutationCount(result) {
  if (!result || typeof result !== 'object') {
    return null;
  }

  const candidates = [
    result.count,
    result.affectedRows,
    result.affected,
    result.rowCount,
    result.data && result.data.count,
    result.data && result.data.affectedRows,
    result.data && result.data.affected,
    result.data && result.data.rowCount,
  ];

  for (const candidate of candidates) {
    const count = Number(candidate);

    if (Number.isInteger(count) && count >= 0) {
      return count;
    }
  }

  return null;
}

module.exports = {
  assertNoQueryError,
  extractMutationCount,
  extractRows,
  getCloudBaseApp,
  getCloudBaseEnvId,
  getDb,
  parseJsonArray,
  parseJsonObject,
};
