import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabaseAdminClient } from '../../../src/server/auth/supabaseAdmin';
import { verifySupabaseAccessToken } from '../../../src/server/auth/verifySupabaseToken';
import type { ServerAuthDatabase } from '../../../src/server/auth/types';
import type {
  ConversationRecord,
  ConversationStatus,
  WorkbenchPersistenceErrorCode,
} from '../../../src/types/persistence';

type ConversationUpdate = ServerAuthDatabase['public']['Tables']['conversations']['Update'];

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

function readConversationId(req: VercelRequest): string | null {
  const rawId = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  const id = rawId?.trim();
  return id ? id : null;
}

function isConversationStatus(value: unknown): value is ConversationStatus {
  return value === 'active' || value === 'running' || value === 'completed' || value === 'failed' || value === 'archived';
}

async function readConversation(
  conversationId: string,
  userId: string,
): Promise<{ conversation: ConversationRecord | null; errorMessage: string | null }> {
  const supabaseAdmin = getSupabaseAdminClient();

  if (!supabaseAdmin) {
    return {
      conversation: null,
      errorMessage: 'Supabase Admin Client 未配置。',
    };
  }

  const { data, error } = await supabaseAdmin
    .from('conversations')
    .select('*')
    .eq('id', conversationId)
    .eq('user_id', userId)
    .single();

  if (error) {
    return {
      conversation: null,
      errorMessage: error.code === 'PGRST116' ? null : '读取 Workbench 会话失败。',
    };
  }

  return {
    conversation: data,
    errorMessage: null,
  };
}

async function handleGetConversation(
  res: VercelResponse,
  conversationId: string,
  userId: string,
): Promise<void> {
  const result = await readConversation(conversationId, userId);

  if (result.errorMessage) {
    sendError(res, 500, 'db_error', result.errorMessage);
    return;
  }

  if (!result.conversation) {
    sendError(res, 404, 'not_found', '未找到 Workbench 会话。');
    return;
  }

  res.status(200).json({
    ok: true,
    data: result.conversation,
  });
}

async function handleUpdateConversation(
  req: VercelRequest,
  res: VercelResponse,
  conversationId: string,
  userId: string,
): Promise<void> {
  const supabaseAdmin = getSupabaseAdminClient();

  if (!supabaseAdmin) {
    sendError(res, 503, 'auth_unavailable', 'Supabase Admin Client 未配置。');
    return;
  }

  const body = parseRequestBody(req.body);
  const updatePayload: ConversationUpdate = {};

  if (typeof body.title === 'string') {
    updatePayload.title = body.title.trim() || '新会话';
  }

  if (typeof body.summary === 'string') {
    updatePayload.summary = body.summary.trim() || null;
  }

  if (body.summary === null) {
    updatePayload.summary = null;
  }

  if (body.status !== undefined) {
    if (!isConversationStatus(body.status)) {
      sendError(res, 400, 'invalid_request', 'Invalid conversation status.');
      return;
    }

    updatePayload.status = body.status;
  }

  if (isRecord(body.metadata)) {
    updatePayload.metadata = body.metadata;
  }

  if (typeof body.archived_at === 'string' || body.archived_at === null) {
    updatePayload.archived_at = body.archived_at;
  }

  const { data, error } = await supabaseAdmin
    .from('conversations')
    .update(updatePayload)
    .eq('id', conversationId)
    .eq('user_id', userId)
    .select('*')
    .single();

  if (error || !data) {
    sendError(res, error?.code === 'PGRST116' ? 404 : 500, error?.code === 'PGRST116' ? 'not_found' : 'db_error', '更新 Workbench 会话失败。');
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
  if (req.method !== 'GET' && req.method !== 'PATCH') {
    sendError(res, 405, 'method_not_allowed', 'Method not allowed');
    return;
  }

  const conversationId = readConversationId(req);

  if (!conversationId) {
    sendError(res, 400, 'invalid_request', 'Missing conversation id.');
    return;
  }

  const verified = await verifyRequestUser(req);

  if (!verified.ok) {
    sendError(res, verified.statusCode, verified.errorCode, verified.message);
    return;
  }

  if (req.method === 'GET') {
    await handleGetConversation(res, conversationId, verified.user.userId);
    return;
  }

  await handleUpdateConversation(req, res, conversationId, verified.user.userId);
}
