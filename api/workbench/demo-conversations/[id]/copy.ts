import { randomUUID } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabaseAdminClient } from '../../../../src/server/auth/supabaseAdmin';
import { verifySupabaseAccessToken } from '../../../../src/server/auth/verifySupabaseToken';
import type { ServerAuthDatabase } from '../../../../src/server/auth/types';
import type {
  ConversationMode,
  DemoConversationTemplateRecord,
  DemoSeedMessage,
  MessageKind,
  MessageRole,
  MessageStatus,
  WorkbenchPersistenceErrorCode,
} from '../../../../src/types/persistence';

type ConversationInsert = ServerAuthDatabase['public']['Tables']['conversations']['Insert'];
type MessageInsert = ServerAuthDatabase['public']['Tables']['messages']['Insert'];

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
      message: '请先登录后复制示例会话。',
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
          : '请先登录后复制示例会话。',
    };
  }

  return {
    ok: true,
    user: {
      userId: verified.user.userId,
    },
  };
}

function readTemplateId(req: VercelRequest): string | null {
  const rawId = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  const id = rawId?.trim();
  return id ? id : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

function normalizeSeedMessage(value: unknown): DemoSeedMessage | null {
  if (!isRecord(value) || !isMessageRole(value.role) || typeof value.content !== 'string') {
    return null;
  }

  const kind = value.kind === undefined ? 'text' : value.kind;
  const status = value.status === undefined ? 'completed' : value.status;

  if (!isMessageKind(kind) || !isMessageStatus(status)) {
    return null;
  }

  return {
    role: value.role,
    kind,
    content: value.content,
    status,
    metadata: isRecord(value.metadata) ? value.metadata : {},
  };
}

function normalizeSeedMessages(seedMessages: unknown): DemoSeedMessage[] {
  if (!Array.isArray(seedMessages)) {
    return [];
  }

  return seedMessages
    .map((message) => normalizeSeedMessage(message))
    .filter((message): message is DemoSeedMessage => message !== null);
}

function readConversationMode(template: DemoConversationTemplateRecord): ConversationMode {
  const mode = template.metadata.conversationMode;

  if (mode === 'mock' || mode === 'agent' || mode === 'mixed') {
    return mode;
  }

  return 'mock';
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    sendError(res, 405, 'method_not_allowed', 'Method not allowed');
    return;
  }

  const templateId = readTemplateId(req);

  if (!templateId) {
    sendError(res, 400, 'invalid_request', 'Missing demo conversation template id.');
    return;
  }

  const verified = await verifyRequestUser(req);

  if (!verified.ok) {
    sendError(res, verified.statusCode, verified.errorCode, verified.message);
    return;
  }

  const supabaseAdmin = getSupabaseAdminClient();

  if (!supabaseAdmin) {
    sendError(res, 503, 'auth_unavailable', 'Supabase Admin Client 未配置。');
    return;
  }

  const { data: template, error: templateError } = await supabaseAdmin
    .from('demo_conversation_templates')
    .select('*')
    .eq('id', templateId)
    .eq('is_enabled', true)
    .in('visibility', ['demo', 'system'])
    .maybeSingle();

  if (templateError) {
    sendError(res, 500, 'db_error', '读取示例会话模板失败。');
    return;
  }

  if (!template) {
    sendError(res, 404, 'not_found', '未找到示例会话模板。');
    return;
  }

  const conversationPayload: ConversationInsert = {
    user_id: verified.user.userId,
    title: template.title,
    summary: template.description,
    mode: readConversationMode(template),
    status: 'active',
    visibility: 'private',
    source_template_id: template.id,
    metadata: {
      copiedFromDemoTemplateId: template.id,
      copiedFromDemoTemplateTitle: template.title,
      templateCategory: template.category,
      templateVisibility: template.visibility,
    },
  };

  const { data: conversation, error: conversationError } = await supabaseAdmin
    .from('conversations')
    .insert(conversationPayload)
    .select('*')
    .single();

  if (conversationError || !conversation) {
    sendError(res, 500, 'db_error', '复制示例会话失败。');
    return;
  }

  const seedMessages = normalizeSeedMessages(template.seed_messages);
  const messagePayloads: MessageInsert[] = seedMessages.map((message, index) => ({
    conversation_id: conversation.id,
    user_id: verified.user.userId,
    role: message.role,
    kind: message.kind ?? 'text',
    content: message.content,
    status: message.status ?? 'completed',
    client_message_id: `demo_${template.id}_${index}_${randomUUID()}`,
    created_at: new Date(Date.now() + index).toISOString(),
    metadata: {
      ...message.metadata,
      copiedFromDemoTemplateId: template.id,
      templateMessageIndex: index,
    },
  }));

  if (messagePayloads.length === 0) {
    res.status(200).json({
      ok: true,
      data: {
        conversation,
        messages: [],
      },
    });
    return;
  }

  const { data: messages, error: messagesError } = await supabaseAdmin
    .from('messages')
    .insert(messagePayloads)
    .select('*')
    .order('created_at', { ascending: true });

  if (messagesError) {
    await supabaseAdmin.from('conversations').delete().eq('id', conversation.id).eq('user_id', verified.user.userId);
    sendError(res, 500, 'db_error', '复制示例消息失败，已回滚本次会话。');
    return;
  }

  res.status(200).json({
    ok: true,
    data: {
      conversation,
      messages: messages ?? [],
    },
  });
}
