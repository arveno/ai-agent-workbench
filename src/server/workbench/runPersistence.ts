import { getSupabaseAdminClient } from '../auth/supabaseAdmin';
import type { ServerAuthDatabase } from '../auth/types';
import type { RunEvent, RunSnapshot, RunToolInvocation } from '../../types/run';

type AgentRunInsert = ServerAuthDatabase['public']['Tables']['agent_runs']['Insert'];
type AgentRunUpdate = ServerAuthDatabase['public']['Tables']['agent_runs']['Update'];
type RunEventInsert = ServerAuthDatabase['public']['Tables']['run_events']['Insert'];
type ToolInvocationInsert = ServerAuthDatabase['public']['Tables']['tool_invocations']['Insert'];
type ToolInvocationUpdate = ServerAuthDatabase['public']['Tables']['tool_invocations']['Update'];
type ReportArtifactInsert = ServerAuthDatabase['public']['Tables']['report_artifacts']['Insert'];

const MAX_STRING_LENGTH = 4000;
const MAX_ARRAY_LENGTH = 60;
const MAX_OBJECT_KEYS = 80;
const SENSITIVE_KEY_PATTERN = /(authorization|access_token|refresh_token|api[_-]?key|apikey|secret|password|connection|string|groq)/i;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;

export interface PersistedAgentRunContext {
  id: string;
  conversationId: string;
  userId: string;
  runtimeRunId: string;
}

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function toJsonRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function sanitizeForPersistence(value: unknown, depth = 0): unknown {
  if (value === null || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    return value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH)}...` : value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_LENGTH).map((item) => sanitizeForPersistence(item, depth + 1));
  }

  if (typeof value === 'object' && value !== null) {
    if (depth >= 5) {
      return '[Object truncated]';
    }

    const entries = Object.entries(value as Record<string, unknown>).slice(0, MAX_OBJECT_KEYS);
    const sanitizedEntries = entries.map(([key, entryValue]) => [
      key,
      SENSITIVE_KEY_PATTERN.test(key) ? '[REDACTED]' : sanitizeForPersistence(entryValue, depth + 1),
    ]);

    return Object.fromEntries(sanitizedEntries);
  }

  return null;
}

function sanitizeRecord(value: unknown): Record<string, unknown> {
  return toJsonRecord(sanitizeForPersistence(value));
}

function mapRunStatus(status: RunSnapshot['status']): AgentRunUpdate['status'] {
  if (status === 'success') return 'completed';
  if (status === 'error') return 'failed';
  if (status === 'stopped') return 'stopped';
  if (status === 'pending') return 'pending';
  return 'running';
}

function mapToolStatus(status: RunToolInvocation['status']): ToolInvocationUpdate['status'] {
  if (status === 'success') return 'completed';
  if (status === 'error') return 'failed';
  if (status === 'skipped' || status === 'stopped') return 'skipped';
  if (status === 'pending') return 'pending';
  return 'running';
}

export async function conversationBelongsToUser(params: {
  conversationId: string;
  userId: string;
}): Promise<boolean> {
  const supabaseAdmin = getSupabaseAdminClient();

  if (!supabaseAdmin) {
    return false;
  }

  const { data, error } = await supabaseAdmin
    .from('conversations')
    .select('id')
    .eq('id', params.conversationId)
    .eq('user_id', params.userId)
    .maybeSingle();

  return Boolean(data && !error);
}

export async function createAgentRunRecord(params: {
  conversationId: string;
  userId: string;
  usageId: string;
  runtimeRunId: string;
  prompt: string;
  provider: string;
}): Promise<PersistedAgentRunContext | null> {
  const supabaseAdmin = getSupabaseAdminClient();

  if (!supabaseAdmin) {
    return null;
  }

  const insertPayload: AgentRunInsert = {
    conversation_id: params.conversationId,
    user_id: params.userId,
    usage_id: params.usageId,
    runtime_run_id: params.runtimeRunId,
    mode: 'agent',
    status: 'running',
    prompt: params.prompt,
    metadata: sanitizeRecord({
      provider: params.provider,
      runtimeRunId: params.runtimeRunId,
    }),
  };

  const { data, error } = await supabaseAdmin
    .from('agent_runs')
    .insert(insertPayload)
    .select('id, conversation_id, user_id, runtime_run_id')
    .single();

  if (error || !data) {
    return null;
  }

  await supabaseAdmin
    .from('conversations')
    .update({
      latest_run_id: data.id,
      status: 'running',
    })
    .eq('id', params.conversationId)
    .eq('user_id', params.userId);

  return {
    id: data.id,
    conversationId: data.conversation_id,
    userId: data.user_id,
    runtimeRunId: data.runtime_run_id ?? params.runtimeRunId,
  };
}

export async function appendRunEventRecord(params: {
  run: PersistedAgentRunContext;
  seq: number;
  event: RunEvent;
}): Promise<void> {
  const supabaseAdmin = getSupabaseAdminClient();

  if (!supabaseAdmin) {
    return;
  }

  const insertPayload: RunEventInsert = {
    run_id: params.run.id,
    conversation_id: params.run.conversationId,
    user_id: params.run.userId,
    seq: params.seq,
    event_type: params.event.type,
    payload: sanitizeRecord(params.event),
  };

  await supabaseAdmin.from('run_events').insert(insertPayload);
}

async function updateAgentRunFromStartedEvent(run: PersistedAgentRunContext, snapshot: RunSnapshot): Promise<void> {
  const supabaseAdmin = getSupabaseAdminClient();

  if (!supabaseAdmin) {
    return;
  }

  const updatePayload: AgentRunUpdate = {
    status: mapRunStatus(snapshot.status),
    intent: snapshot.intent,
    plan: sanitizeRecord(snapshot.plan),
    data_source_snapshot: sanitizeRecord(snapshot.dataSource),
    chart_data: sanitizeRecord(snapshot.chartData),
    conclusion: snapshot.conclusion || null,
    conclusion_source: snapshot.conclusionSource,
    report_state: snapshot.reportState,
    started_at: snapshot.startedAt,
    metadata: sanitizeRecord({
      runtimeRunId: snapshot.id,
      sessionId: snapshot.sessionId,
    }),
  };

  await supabaseAdmin.from('agent_runs').update(updatePayload).eq('id', run.id).eq('user_id', run.userId);
}

async function updateAgentRunFromEvent(run: PersistedAgentRunContext, event: RunEvent): Promise<void> {
  const supabaseAdmin = getSupabaseAdminClient();

  if (!supabaseAdmin) {
    return;
  }

  if (event.type === 'run_started') {
    await updateAgentRunFromStartedEvent(run, event.run);
    return;
  }

  if (event.type === 'chart_ready') {
    await supabaseAdmin
      .from('agent_runs')
      .update({
        chart_data: sanitizeRecord(event.chartData),
      })
      .eq('id', run.id)
      .eq('user_id', run.userId);
    return;
  }

  if (event.type === 'conclusion_completed') {
    await supabaseAdmin
      .from('agent_runs')
      .update({
        conclusion: event.conclusion,
        conclusion_source: event.conclusionSource,
        metadata: sanitizeRecord({
          runtimeRunId: event.runId,
          conclusionNotice: event.conclusionNotice,
        }),
      })
      .eq('id', run.id)
      .eq('user_id', run.userId);
    return;
  }

  if (event.type === 'report_pending') {
    await supabaseAdmin
      .from('agent_runs')
      .update({
        report_state: 'pending',
      })
      .eq('id', run.id)
      .eq('user_id', run.userId);
    return;
  }

  if (event.type === 'run_completed') {
    await completeAgentRunRecord({
      run,
      completedAt: event.completedAt,
      elapsedMs: event.elapsedMs,
    });
    return;
  }

  if (event.type === 'run_failed') {
    await failAgentRunRecord({
      run,
      errorMessage: event.errorMessage,
    });
  }
}

async function findToolInvocationId(run: PersistedAgentRunContext, runtimeToolId: string): Promise<string | null> {
  const supabaseAdmin = getSupabaseAdminClient();

  if (!supabaseAdmin) {
    return null;
  }

  const { data, error } = await supabaseAdmin
    .from('tool_invocations')
    .select('id, metadata')
    .eq('run_id', run.id)
    .eq('user_id', run.userId);

  if (error || !data) {
    return null;
  }

  const matched = data.find((item) => toJsonRecord(item.metadata).runtimeToolId === runtimeToolId);
  return matched?.id ?? null;
}

export async function upsertToolInvocationFromEvent(params: {
  run: PersistedAgentRunContext;
  event: RunEvent;
}): Promise<void> {
  const supabaseAdmin = getSupabaseAdminClient();

  if (!supabaseAdmin) {
    return;
  }

  if (params.event.type === 'tool_started') {
    const tool = params.event.tool;
    const insertPayload: ToolInvocationInsert = {
      run_id: params.run.id,
      conversation_id: params.run.conversationId,
      user_id: params.run.userId,
      tool_name: tool.toolName || tool.toolId,
      display_name: tool.displayName || tool.toolName || tool.toolId,
      status: mapToolStatus(tool.status),
      input_summary: tool.inputSummary,
      output_summary: tool.outputSummary,
      started_at: tool.startedAt,
      elapsed_ms: tool.elapsedMs,
      metadata: sanitizeRecord({
        runtimeToolId: tool.id,
        toolId: tool.toolId,
      }),
    };

    await supabaseAdmin.from('tool_invocations').insert(insertPayload);
    return;
  }

  if (params.event.type === 'tool_completed') {
    const toolInvocationId = await findToolInvocationId(params.run, params.event.toolId);
    const updatePayload: ToolInvocationUpdate = {
      status: 'completed',
      output_summary: params.event.outputSummary,
      finished_at: params.event.completedAt,
      elapsed_ms: params.event.elapsedMs,
    };

    if (toolInvocationId) {
      await supabaseAdmin
        .from('tool_invocations')
        .update(updatePayload)
        .eq('id', toolInvocationId)
        .eq('user_id', params.run.userId);
    }
  }

  if (params.event.type === 'tool_failed') {
    const toolInvocationId = await findToolInvocationId(params.run, params.event.toolId);
    const updatePayload: ToolInvocationUpdate = {
      status: 'failed',
      output_summary: params.event.errorMessage,
      finished_at: params.event.completedAt,
      elapsed_ms: params.event.elapsedMs,
      error: params.event.errorMessage,
    };

    if (toolInvocationId) {
      await supabaseAdmin
        .from('tool_invocations')
        .update(updatePayload)
        .eq('id', toolInvocationId)
        .eq('user_id', params.run.userId);
    }
  }
}

export async function persistRunEventSideEffects(params: {
  run: PersistedAgentRunContext;
  event: RunEvent;
}): Promise<void> {
  await Promise.all([
    updateAgentRunFromEvent(params.run, params.event),
    upsertToolInvocationFromEvent(params),
  ]);
}

export async function completeAgentRunRecord(params: {
  run: PersistedAgentRunContext;
  completedAt?: string;
  elapsedMs?: number;
}): Promise<void> {
  const supabaseAdmin = getSupabaseAdminClient();

  if (!supabaseAdmin) {
    return;
  }

  await supabaseAdmin
    .from('agent_runs')
    .update({
      status: 'completed',
      completed_at: params.completedAt ?? new Date().toISOString(),
      elapsed_ms: params.elapsedMs,
    })
    .eq('id', params.run.id)
    .eq('user_id', params.run.userId);

  await supabaseAdmin
    .from('conversations')
    .update({
      status: 'completed',
      latest_run_id: params.run.id,
    })
    .eq('id', params.run.conversationId)
    .eq('user_id', params.run.userId);
}

export async function failAgentRunRecord(params: {
  run: PersistedAgentRunContext;
  errorMessage: string;
}): Promise<void> {
  const supabaseAdmin = getSupabaseAdminClient();

  if (!supabaseAdmin) {
    return;
  }

  await supabaseAdmin
    .from('agent_runs')
    .update({
      status: 'failed',
      completed_at: new Date().toISOString(),
      error_message: params.errorMessage,
    })
    .eq('id', params.run.id)
    .eq('user_id', params.run.userId);

  await supabaseAdmin
    .from('conversations')
    .update({
      status: 'failed',
      latest_run_id: params.run.id,
    })
    .eq('id', params.run.conversationId)
    .eq('user_id', params.run.userId);
}

export async function stopAgentRunRecord(params: {
  run: PersistedAgentRunContext;
}): Promise<void> {
  const supabaseAdmin = getSupabaseAdminClient();

  if (!supabaseAdmin) {
    return;
  }

  await supabaseAdmin
    .from('agent_runs')
    .update({
      status: 'stopped',
      completed_at: new Date().toISOString(),
    })
    .eq('id', params.run.id)
    .eq('user_id', params.run.userId);

  await supabaseAdmin
    .from('conversations')
    .update({
      status: 'active',
      latest_run_id: params.run.id,
    })
    .eq('id', params.run.conversationId)
    .eq('user_id', params.run.userId);
}

export async function createReportArtifactRecord(params: {
  conversationId: string;
  userId: string;
  runId: string | null;
  title: string;
  contentMarkdown: string;
  metadata?: Record<string, unknown>;
}): Promise<ServerAuthDatabase['public']['Tables']['report_artifacts']['Row'] | null> {
  const supabaseAdmin = getSupabaseAdminClient();

  if (!supabaseAdmin) {
    return null;
  }

  const insertPayload: ReportArtifactInsert = {
    conversation_id: params.conversationId,
    user_id: params.userId,
    run_id: params.runId,
    title: params.title,
    content_markdown: params.contentMarkdown,
    status: 'generated',
    metadata: sanitizeRecord(params.metadata ?? {}),
  };

  const { data, error } = await supabaseAdmin
    .from('report_artifacts')
    .insert(insertPayload)
    .select('*')
    .single();

  if (error || !data) {
    return null;
  }

  if (params.runId) {
    await supabaseAdmin
      .from('agent_runs')
      .update({
        report_state: 'generated',
      })
      .eq('id', params.runId)
      .eq('user_id', params.userId);
  }

  return data;
}
