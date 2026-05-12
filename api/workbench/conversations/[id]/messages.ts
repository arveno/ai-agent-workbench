import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabaseAdminClient } from '../../../../src/server/auth/supabaseAdmin';
import { verifySupabaseAccessToken } from '../../../../src/server/auth/verifySupabaseToken';
import type { ServerAuthDatabase } from '../../../../src/server/auth/types';
import type {
  MessageKind,
  MessageRecord,
  MessageRole,
  MessageStatus,
  WorkbenchPersistenceErrorCode,
} from '../../../../src/types/persistence';

type MessageInsert = ServerAuthDatabase['public']['Tables']['messages']['Insert'];

interface VerifiedRequestUser {
  userId: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
      message: '请先登录后使用 Workbench 消息持久化。',
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
          : '请先登录后使用 Workbench 消息持久化。',
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

function isMessageRole(value: unknown): value is MessageRole {
  return value === 'user' || value === 'assistant' || value === 'system';
}

function isMessageKind(value: unknown): value is MessageKind {
  return value === 'text' || value === 'tool_summary' || value === 'report' || value === 'error' || value === 'system_notice';
}

function isMessageStatus(value: unknown): value is MessageStatus {
  return value === 'pending' || value === 'streaming' || value === 'completed' || value === 'failed';
}

function toUuidOrNull(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalizedValue = value.trim();
  return UUID_PATTERN.test(normalizedValue) ? normalizedValue : null;
}

async function conversationBelongsToUser(conversationId: string, userId: string): Promise<boolean> {
  const supabaseAdmin = getSupabaseAdminClient();

  if (!supabaseAdmin) {
    return false;
  }

  const { data, error } = await supabaseAdmin
    .from('conversations')
    .select('id')
    .eq('id', conversationId)
    .eq('user_id', userId)
    .maybeSingle();

  return Boolean(data && !error);
}

async function handleGetMessages(
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

  if (!(await conversationBelongsToUser(conversationId, userId))) {
    sendError(res, 404, 'not_found', '未找到 Workbench 会话。');
    return;
  }

  const limit = readPositiveLimit(req.query.limit, 30, 100);
  const before = readQueryString(req.query.before);

  let query = supabaseAdmin
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit + 1);

  if (before) {
    query = query.lt('created_at', before);
  }

  const { data, error } = await query;

  if (error) {
    sendError(res, 500, 'db_error', '读取 Workbench 消息失败。');
    return;
  }

  const rows = data ?? [];
  const pageRows = rows.slice(0, limit).reverse();
  const nextCursor = rows.length > limit ? pageRows[0]?.created_at ?? null : null;

  res.status(200).json({
    ok: true,
    data: {
      messages: pageRows,
      nextCursor,
    },
  });
}

async function findExistingMessage(userId: string, clientMessageId: string): Promise<MessageRecord | null> {
  const supabaseAdmin = getSupabaseAdminClient();

  if (!supabaseAdmin) {
    return null;
  }

  const { data, error } = await supabaseAdmin
    .from('messages')
    .select('*')
    .eq('user_id', userId)
    .eq('client_message_id', clientMessageId)
    .maybeSingle();

  if (error) {
    return null;
  }

  return data ?? null;
}

async function handleCreateMessage(
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

  if (!(await conversationBelongsToUser(conversationId, userId))) {
    sendError(res, 404, 'not_found', '未找到 Workbench 会话。');
    return;
  }

  const body = parseRequestBody(req.body);

  if (!isMessageRole(body.role)) {
    sendError(res, 400, 'invalid_request', 'Invalid message role.');
    return;
  }

  const kind = body.kind === undefined ? 'text' : body.kind;

  if (!isMessageKind(kind)) {
    sendError(res, 400, 'invalid_request', 'Invalid message kind.');
    return;
  }

  const status = body.status === undefined ? 'completed' : body.status;

  if (!isMessageStatus(status)) {
    sendError(res, 400, 'invalid_request', 'Invalid message status.');
    return;
  }

  const content = typeof body.content === 'string' ? body.content : '';
  const clientMessageId =
    typeof body.clientMessageId === 'string' && body.clientMessageId.trim()
      ? body.clientMessageId.trim()
      : null;

  if (clientMessageId) {
    const existingMessage = await findExistingMessage(userId, clientMessageId);

    if (existingMessage) {
      res.status(200).json({
        ok: true,
        data: existingMessage,
      });
      return;
    }
  }

  const insertPayload: MessageInsert = {
    conversation_id: conversationId,
    user_id: userId,
    role: body.role,
    kind,
    content,
    status,
    run_id: toUuidOrNull(body.runId),
    client_message_id: clientMessageId,
    metadata: isRecord(body.metadata) ? body.metadata : {},
  };

  const { data, error } = await supabaseAdmin
    .from('messages')
    .insert(insertPayload)
    .select('*')
    .single();

  if (error || !data) {
    if (clientMessageId) {
      const existingMessage = await findExistingMessage(userId, clientMessageId);

      if (existingMessage) {
        res.status(200).json({
          ok: true,
          data: existingMessage,
        });
        return;
      }
    }

    sendError(res, 500, 'db_error', '创建 Workbench 消息失败。');
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
    await handleGetMessages(req, res, conversationId, verified.user.userId);
    return;
  }

  await handleCreateMessage(req, res, conversationId, verified.user.userId);
}
