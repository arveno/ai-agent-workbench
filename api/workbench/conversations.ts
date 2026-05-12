import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabaseAdminClient } from '../../src/server/auth/supabaseAdmin';
import { verifySupabaseAccessToken } from '../../src/server/auth/verifySupabaseToken';
import type { ServerAuthDatabase } from '../../src/server/auth/types';
import type {
  ConversationMode,
  ConversationStatus,
  WorkbenchPersistenceErrorCode,
} from '../../src/types/persistence';

type ConversationInsert = ServerAuthDatabase['public']['Tables']['conversations']['Insert'];

interface VerifiedRequestUser {
  userId: string;
}

function getHeaderValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? '';
  }

  return value ?? '';
}

function getBearerToken(req: VercelRequest): string | null {
  const authorization = getHeaderValue(req.headers.authorization).trim();

  if (!authorization.toLowerCase().startsWith('bearer ')) {
    return null;
  }

  const token = authorization.slice('bearer '.length).trim();
  return token || null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseRequestBody(body: unknown): Record<string, unknown> {
  if (typeof body === 'string') {
    try {
      const parsed = JSON.parse(body) as unknown;
      return isRecord(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  return isRecord(body) ? body : {};
}

function sendError(
  res: VercelResponse,
  statusCode: number,
  errorCode: WorkbenchPersistenceErrorCode,
  message: string,
): void {
  res.status(statusCode).json({
    ok: false,
    errorCode,
    message,
  });
}

async function verifyRequestUser(
  req: VercelRequest,
): Promise<
  | { ok: true; user: VerifiedRequestUser }
  | { ok: false; statusCode: number; errorCode: WorkbenchPersistenceErrorCode; message: string }
> {
  const accessToken = getBearerToken(req);

  if (!accessToken) {
    return {
      ok: false,
      statusCode: 401,
      errorCode: 'auth_required',
      message: '请先登录后使用 Workbench 会话持久化。',
    };
  }

  const verified = await verifySupabaseAccessToken(accessToken);

  if (!verified.ok) {
    return {
      ok: false,
      statusCode: verified.errorCode === 'auth_unavailable' ? 503 : 401,
      errorCode: verified.errorCode === 'auth_unavailable' ? 'auth_unavailable' : 'auth_required',
      message:
        verified.errorCode === 'auth_unavailable'
          ? '服务端登录权限检查暂不可用。'
          : '请先登录后使用 Workbench 会话持久化。',
    };
  }

  return {
    ok: true,
    user: {
      userId: verified.user.userId,
    },
  };
}

function readPositiveLimit(value: string | string[] | undefined, fallback: number, max: number): number {
  const rawValue = Array.isArray(value) ? value[0] : value;
  const parsed = Number(rawValue);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(parsed, max);
}

function readQueryString(value: string | string[] | undefined): string | null {
  const rawValue = Array.isArray(value) ? value[0] : value;
  const normalizedValue = rawValue?.trim();
  return normalizedValue ? normalizedValue : null;
}

function isConversationMode(value: unknown): value is ConversationMode {
  return value === 'mock' || value === 'agent' || value === 'mixed';
}

function isConversationStatus(value: unknown): value is ConversationStatus {
  return value === 'active' || value === 'running' || value === 'completed' || value === 'failed' || value === 'archived';
}

function readMetadata(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

async function handleGetConversations(
  req: VercelRequest,
  res: VercelResponse,
  userId: string,
): Promise<void> {
  const supabaseAdmin = getSupabaseAdminClient();

  if (!supabaseAdmin) {
    sendError(res, 503, 'auth_unavailable', 'Supabase Admin Client 未配置。');
    return;
  }

  const limit = readPositiveLimit(req.query.limit, 20, 50);
  const cursor = readQueryString(req.query.cursor);
  const status = readQueryString(req.query.status);

  if (status !== null && !isConversationStatus(status)) {
    sendError(res, 400, 'invalid_request', 'Invalid conversation status.');
    return;
  }

  let query = supabaseAdmin
    .from('conversations')
    .select('*')
    .eq('user_id', userId)
    .eq('visibility', 'private')
    .order('updated_at', { ascending: false })
    .limit(limit + 1);

  if (status) {
    query = query.eq('status', status);
  }

  if (cursor) {
    query = query.lt('updated_at', cursor);
  }

  const { data, error } = await query;

  if (error) {
    sendError(res, 500, 'db_error', '读取 Workbench 会话失败。');
    return;
  }

  const rows = data ?? [];
  const conversations = rows.slice(0, limit);
  const nextCursor = rows.length > limit ? conversations[conversations.length - 1]?.updated_at ?? null : null;

  res.status(200).json({
    ok: true,
    data: {
      conversations,
      nextCursor,
    },
  });
}

async function handleCreateConversation(
  req: VercelRequest,
  res: VercelResponse,
  userId: string,
): Promise<void> {
  const supabaseAdmin = getSupabaseAdminClient();

  if (!supabaseAdmin) {
    sendError(res, 503, 'auth_unavailable', 'Supabase Admin Client 未配置。');
    return;
  }

  const body = parseRequestBody(req.body);
  const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim() : undefined;
  const summary = typeof body.summary === 'string' && body.summary.trim() ? body.summary.trim() : undefined;
  const mode = body.mode === undefined ? 'mock' : body.mode;

  if (!isConversationMode(mode)) {
    sendError(res, 400, 'invalid_request', 'Invalid conversation mode.');
    return;
  }

  const insertPayload: ConversationInsert = {
    user_id: userId,
    mode,
    visibility: 'private',
    status: 'active',
    metadata: readMetadata(body.metadata),
  };

  if (title) {
    insertPayload.title = title;
  }

  if (summary) {
    insertPayload.summary = summary;
  }

  const { data, error } = await supabaseAdmin
    .from('conversations')
    .insert(insertPayload)
    .select('*')
    .single();

  if (error || !data) {
    sendError(res, 500, 'db_error', '创建 Workbench 会话失败。');
    return;
  }

  res.status(200).json({
    ok: true,
    data,
  });
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (req.method !== 'GET' && req.method !== 'POST') {
    sendError(res, 405, 'method_not_allowed', 'Method not allowed');
    return;
  }

  const verified = await verifyRequestUser(req);

  if (!verified.ok) {
    sendError(res, verified.statusCode, verified.errorCode, verified.message);
    return;
  }

  if (req.method === 'GET') {
    await handleGetConversations(req, res, verified.user.userId);
    return;
  }

  await handleCreateConversation(req, res, verified.user.userId);
}
