const { randomUUID } = require('node:crypto');
const { assertNoQueryError, extractRows, getDb, parseJsonObject } = require('./mysql');

const PROFILE_COLUMNS = [
  'id',
  '_openid',
  'user_id',
  'email',
  'display_name',
  'role',
  'status',
  'metadata',
  'created_at',
  'updated_at',
].join(',');

const DEFAULT_PROFILE_METADATA = JSON.stringify({});

class AuthError extends Error {
  constructor(statusCode, errorCode, publicMessage) {
    super(publicMessage);
    this.name = 'AuthError';
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.publicMessage = publicMessage;
  }
}

function getHeaderValue(headers, name) {
  const value = headers[name.toLowerCase()] || headers[name];

  if (Array.isArray(value)) {
    return value[0] || '';
  }

  return typeof value === 'string' ? value : '';
}

function getBearerToken(req) {
  const authorization = getHeaderValue(req.headers || {}, 'authorization').trim();
  const match = authorization.match(/^Bearer\s+(.+)$/i);

  if (!match || !match[1].trim()) {
    throw new AuthError(401, 'auth_required', '缺少有效的 Authorization Bearer token。');
  }

  return match[1].trim();
}

function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const paddingLength = (4 - (normalized.length % 4)) % 4;
  return Buffer.from(normalized + '='.repeat(paddingLength), 'base64').toString('utf8');
}

function decodeBearerTokenPayload(token) {
  const parts = token.split('.');

  if (parts.length < 2 || !parts[1]) {
    throw new AuthError(401, 'auth_invalid', 'Authorization token 格式无效。');
  }

  try {
    const payload = JSON.parse(decodeBase64Url(parts[1]));
    return payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  } catch {
    throw new AuthError(401, 'auth_invalid', 'Authorization token payload 无法解析。');
  }
}

function normalizeIdentity(payload) {
  const openid = String(payload.user_id || payload.sub || '').trim();

  if (!openid) {
    throw new AuthError(401, 'auth_invalid', 'Authorization token 缺少用户身份。');
  }

  return {
    openid,
    userId: openid,
  };
}

function isDuplicateKeyError(error) {
  const message = String(error && error.message ? error.message : error).toLowerCase();
  return message.includes('duplicate') || message.includes('er_dup_entry');
}

function mapProfileToCurrentUser(profile, identity) {
  return {
    profileId: String(profile.id || ''),
    openid: String(profile._openid || identity.openid),
    userId: String(profile.user_id || identity.userId),
    role: String(profile.role || 'demo_user'),
    status: String(profile.status || 'active'),
    email: profile.email ? String(profile.email) : null,
    displayName: profile.display_name ? String(profile.display_name) : null,
    metadata: parseJsonObject(profile.metadata),
  };
}

async function findProfileByIdentity(db, identity) {
  const result = await db
    .from('app_profiles')
    .select(PROFILE_COLUMNS)
    .eq('_openid', identity.openid)
    .eq('user_id', identity.userId);
  assertNoQueryError(result);

  const rows = extractRows(result);
  return rows.length > 0 ? rows[0] : null;
}

async function createProfile(db, identity) {
  const profile = {
    id: randomUUID(),
    _openid: identity.openid,
    user_id: identity.userId,
    email: null,
    display_name: null,
    role: 'demo_user',
    status: 'active',
    metadata: DEFAULT_PROFILE_METADATA,
  };

  try {
    const result = await db.from('app_profiles').insert(profile);
    assertNoQueryError(result);
  } catch (error) {
    if (!isDuplicateKeyError(error)) {
      throw error;
    }
  }

  return (await findProfileByIdentity(db, identity)) || profile;
}

async function getOrCreateProfile(identity) {
  const db = getDb();
  const existingProfile = await findProfileByIdentity(db, identity);

  if (existingProfile) {
    return existingProfile;
  }

  return createProfile(db, identity);
}

function assertActiveProfile(currentUser) {
  if (currentUser.status !== 'active') {
    throw new AuthError(403, 'profile_disabled', '用户状态不可用。');
  }
}

async function authenticateRequest(req) {
  const token = getBearerToken(req);
  const payload = decodeBearerTokenPayload(token);
  const identity = normalizeIdentity(payload);
  const profile = await getOrCreateProfile(identity);
  const currentUser = mapProfileToCurrentUser(profile, identity);

  assertActiveProfile(currentUser);

  return currentUser;
}

module.exports = {
  AuthError,
  authenticateRequest,
  decodeBearerTokenPayload,
  getBearerToken,
  getOrCreateProfile,
  mapProfileToCurrentUser,
  normalizeIdentity,
};
