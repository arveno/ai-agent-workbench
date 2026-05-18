import type { StateCreator } from 'zustand';
import { copyDemoConversationTemplate as copyDemoConversationTemplateApi, fetchDemoConversations } from '../../services/demoTemplateApi';
import type { DemoConversationTemplateRecord, DemoSeedMessage } from '../../types/persistence';
import type { DemoTemplateSlice, RunSnapshot, WorkbenchMessage, WorkbenchSession, WorkbenchStore } from '../../types/workbench';
import { demoConversationCopyToSession } from '../../utils/demoTemplateMapper';
import { useAuthStore } from '../authStore';
import {
  createEmptySession,
  getSessionLatestAssistantReply,
  getSessionLatestPrompt,
  getSessionLatestRun,
  sortSessionsByUpdatedAt,
} from './shared';

let demoConversationsRequestId = 0;

function getAccessToken(): string | null {
  const authState = useAuthStore.getState();
  const accessToken = authState.accessToken?.trim() || authState.session?.access_token?.trim();
  return accessToken || null;
}

function getAuthenticatedUserId(): string | null {
  const authState = useAuthStore.getState();
  return authState.currentUser?.userId ?? authState.user?.id ?? authState.session?.user.id ?? null;
}

function createDemoSessionId(templateId: string): string {
  return `demo_${templateId}`;
}

function isReadonlyDemoSession(session: WorkbenchSession): boolean {
  return session.isReadOnly === true || session.visibility === 'demo';
}

function getUserSessions(sessions: WorkbenchSession[]): WorkbenchSession[] {
  return sessions.filter((session) => !isReadonlyDemoSession(session));
}

function createSessionUiState(session: WorkbenchSession | undefined, fallbackTaskId: string) {
  const userMessage = session ? getSessionLatestPrompt(session) : '';
  const assistantReply = session ? getSessionLatestAssistantReply(session) : '';
  const assistantMessage =
    [...(session?.messages ?? [])].reverse().find((message) => message.role === 'assistant') ?? null;
  const latestRun = getSessionLatestRun(session);
  const hasAssistantReply = Boolean(assistantReply.trim());

  return {
    currentTaskId: session?.taskId ?? fallbackTaskId,
    currentPrompt: userMessage,
    chatDraft: '',
    activeAssistantMessageId: assistantMessage?.id ?? '',
    assistantStream: {
      content: assistantReply,
      status: hasAssistantReply ? ('done' as const) : ('idle' as const),
    },
    generationStatus: hasAssistantReply ? ('done' as const) : ('idle' as const),
    realModelNotice: '',
    errorMessage: undefined,
    confirmStatus: 'waiting' as const,
    currentRun: latestRun,
    runEventLog: [],
    agentRunStatus: 'idle' as const,
    agentRunErrorMessage: null,
    activeAgentRunRequestId: null,
    activeAgentRunAbortController: null,
    currentReportRunId:
      latestRun && (latestRun.reportState === 'pending' || latestRun.reportState === 'generated') ? latestRun.id : null,
    reportActionState:
      latestRun?.reportState === 'generated' ? ('generated' as const) : latestRun?.reportState === 'pending' ? ('pending' as const) : ('skipped' as const),
    isLatestRunLoading: false,
    latestRunError: null,
    isRunEventsLoading: false,
    runEventsError: null,
    isReportArtifactsLoading: false,
    reportArtifactsError: null,
    isRagSourcesLoading: false,
    ragSourcesError: null,
  };
}

function upsertSession(sessions: WorkbenchSession[], session: WorkbenchSession): WorkbenchSession[] {
  return sortSessionsByUpdatedAt([session, ...sessions.filter((item) => item.id !== session.id)]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getWorkbenchMessageKind(kind: DemoSeedMessage['kind']) {
  if (kind === 'report') return 'report' as const;
  if (kind === 'error') return 'error' as const;
  return 'normal' as const;
}

function getSeedMessageRunId(message: DemoSeedMessage): string | undefined {
  const metadata = message.metadata;

  if (!isRecord(metadata)) {
    return undefined;
  }

  const runId = metadata.runId;
  return typeof runId === 'string' && runId.trim() ? runId : undefined;
}

function createDemoMessages(template: DemoConversationTemplateRecord, createdAt: number): WorkbenchMessage[] {
  return template.seed_messages
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .map((message, index) => ({
      id: `demo_seed_${template.id}_${index + 1}`,
      role: message.role === 'user' ? ('user' as const) : ('assistant' as const),
      kind: getWorkbenchMessageKind(message.kind),
      content: message.content,
      createdAt: createdAt + index,
      runId: getSeedMessageRunId(message),
    }));
}

function createDemoRun(template: DemoConversationTemplateRecord, sessionId: string): RunSnapshot | null {
  const rawRun = template.seed_runs[0] as Partial<RunSnapshot> | undefined;

  if (!rawRun?.id) {
    return null;
  }

  return {
    id: rawRun.id,
    sessionId,
    mode: rawRun.mode ?? 'mock',
    status: rawRun.status ?? 'success',
    intent: rawRun.intent ?? 'unknown',
    prompt: rawRun.prompt ?? template.title,
    plan: rawRun.plan,
    dataSource: rawRun.dataSource,
    steps: rawRun.steps ?? [],
    toolInvocations: rawRun.toolInvocations ?? [],
    sources: rawRun.sources,
    chartData: rawRun.chartData,
    conclusion: rawRun.conclusion ?? '',
    conclusionSource: rawRun.conclusionSource ?? 'mock',
    conclusionNotice: rawRun.conclusionNotice,
    reportState: rawRun.reportState ?? 'skipped',
    createdAt: rawRun.createdAt ?? template.created_at,
    updatedAt: rawRun.updatedAt ?? template.updated_at,
    startedAt: rawRun.startedAt,
    completedAt: rawRun.completedAt,
    elapsedMs: rawRun.elapsedMs,
    errorMessage: rawRun.errorMessage,
  };
}

function createReadonlyDemoSessionFromTemplate(template: DemoConversationTemplateRecord): WorkbenchSession {
  const createdAt = Date.parse(template.updated_at);
  const updatedAt = Number.isFinite(createdAt) ? createdAt : Date.now();
  const sessionId = createDemoSessionId(template.id);
  const messages = createDemoMessages(template, updatedAt);
  const run = createDemoRun(template, sessionId);
  const runsById = run ? { [run.id]: run } : {};

  return {
    ...createEmptySession({
      title: template.title,
      taskId: template.id,
    }),
    id: sessionId,
    updatedAt,
    messages,
    runsById,
    latestRunId: run?.id,
    summary: template.description,
    mode: run?.mode ?? 'mock',
    status: 'completed',
    visibility: 'demo',
    sourceTemplateId: template.id,
    isReadOnly: true,
    messageCount: messages.length,
  };
}

export const createDemoTemplateSlice: StateCreator<WorkbenchStore, [], [], DemoTemplateSlice> = (set, get) => ({
  demoConversations: [],
  isDemoConversationsLoading: false,
  demoConversationsError: null,
  isCopyingDemoTemplate: false,
  copyDemoTemplateError: null,

  loadDemoConversations: async () => {
    if (get().isDemoConversationsLoading) {
      return;
    }

    const requestId = demoConversationsRequestId + 1;
    demoConversationsRequestId = requestId;
    set({
      isDemoConversationsLoading: true,
      demoConversationsError: null,
    });

    const result = await fetchDemoConversations();

    if (requestId !== demoConversationsRequestId) {
      return;
    }

    if (!result.ok) {
      set({
        isDemoConversationsLoading: false,
        demoConversationsError: result.message,
      });
      return;
    }

    set({
      demoConversations: result.data.conversations,
      isDemoConversationsLoading: false,
      demoConversationsError: null,
    });
  },

  retryLoadDemoConversations: async () => {
    await get().loadDemoConversations();
  },

  openDemoConversationTemplate: (templateId) => {
    const template = get().demoConversations.find((item) => item.id === templateId);

    if (!template) {
      set({
        copyDemoTemplateError: '未找到示例会话。',
      });
      return null;
    }

    get().activeAgentRunAbortController?.abort();

    const session = createReadonlyDemoSessionFromTemplate(template);

    set((state) => ({
      sessions: upsertSession([...getUserSessions(state.sessions)], session),
      currentSessionId: session.id,
      isMessagesLoading: false,
      messagesError: null,
      isOlderMessagesLoading: false,
      olderMessagesError: null,
      hasMoreMessages: false,
      oldestMessageCursor: null,
      copyDemoTemplateError: null,
      ...createSessionUiState(session, ''),
    }));

    return session.id;
  },

  copyDemoConversationTemplate: async (templateId) => {
    if (get().isCopyingDemoTemplate) {
      return null;
    }

    const accessToken = getAccessToken();

    if (!accessToken) {
      set({
        copyDemoTemplateError: '请先登录后再复制示例会话到我的会话。',
      });
      return null;
    }

    set({
      isCopyingDemoTemplate: true,
      copyDemoTemplateError: null,
    });

    const result = await copyDemoConversationTemplateApi(templateId, accessToken);

    if (!result.ok) {
      set({
        isCopyingDemoTemplate: false,
        copyDemoTemplateError: result.message,
      });
      return null;
    }

    const session = demoConversationCopyToSession(result.data);

    set((state) => ({
      sessions: upsertSession(getUserSessions(state.sessions), session),
      currentSessionId: session.id,
      isPersistentMode: true,
      persistentUserId: getAuthenticatedUserId(),
      isCopyingDemoTemplate: false,
      copyDemoTemplateError: null,
      ...createSessionUiState(session, state.currentTaskId),
    }));

    return session.id;
  },
});
