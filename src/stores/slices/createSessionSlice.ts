import type { StateCreator } from 'zustand';
import {
  MOCK_RUN_STEP_IDS,
  createMockChartData,
  createMockRunStartedEvent,
  createMockToolInvocation,
} from '../../utils/mockRun';
import { mockTasks } from '../../mocks/tasks';
import { createConversation, fetchConversations, updateConversation } from '../../services/conversationApi';
import { createConversationMessage, fetchConversationMessages } from '../../services/messageApi';
import type { ConversationMode, ConversationRecord } from '../../types/persistence';
import type { RunSnapshot, SessionSlice, WorkbenchMessage, WorkbenchSession, WorkbenchStore } from '../../types/workbench';
import { conversationRecordToSession } from '../../utils/conversationMapper';
import { messageRecordToWorkbenchMessage, workbenchMessageToMessageCreateInput } from '../../utils/messageMapper';
import { replaceWorkbenchUrl } from '../../utils/urlState';
import { useAuthStore } from '../authStore';
import {
  clearPersistedWorkbenchState,
  createEmptySession,
  createWorkbenchMessage,
  createSessionTitle,
  getInitialWorkbenchSessionState,
  getSessionLatestAssistantReply,
  getSessionLatestPrompt,
  getSessionLatestRun,
  initialWorkbenchState,
  persistWorkbenchSessions,
  sortSessionsByUpdatedAt,
  updateCurrentSessionAssistantInSessions,
} from './shared';

const DEFAULT_MESSAGE_PAGE_SIZE = 30;
let persistenceRequestId = 0;
let messageLoadRequestId = 0;
let olderMessageLoadRequestId = 0;

interface PersistenceAuthContext {
  accessToken: string;
  userId: string;
}

interface PersistenceAuthOptions {
  allowCloudBasePersistence?: boolean;
}

function getCloudBaseAuthContext(): PersistenceAuthContext | null {
  const authState = useAuthStore.getState();
  const accessToken = authState.accessToken?.trim() || authState.session?.access_token?.trim();
  const userId = authState.currentUser?.userId ?? authState.user?.id ?? authState.session?.user.id ?? null;

  if (authState.status !== 'authenticated' || !accessToken || !userId) {
    return null;
  }

  return {
    accessToken,
    userId,
  };
}

function getPersistenceAuthContext(options: PersistenceAuthOptions = {}): PersistenceAuthContext | null {
  if (options.allowCloudBasePersistence === false) {
    return null;
  }

  return getCloudBaseAuthContext();
}

function shouldUseCloudBaseForPersistentState(persistentUserId: string | null): boolean {
  const authState = useAuthStore.getState();
  const userId = authState.currentUser?.userId ?? authState.user?.id ?? authState.session?.user.id ?? null;
  return Boolean(userId && persistentUserId === userId);
}

function isPersistentStateCompatibleWithAuthContext(
  authContext: PersistenceAuthContext,
  persistentUserId: string | null,
): boolean {
  void authContext;
  return shouldUseCloudBaseForPersistentState(persistentUserId);
}

function shouldSkipCloudBaseAgentAssistantPersist(
  message: WorkbenchMessage,
): boolean {
  return (
    message.role === 'assistant' &&
    message.kind === 'normal' &&
    Boolean(message.runId?.startsWith('agent_run_'))
  );
}

function getConversationModeForSelectedModel(selectedModelId: WorkbenchStore['selectedModelId']): ConversationMode {
  return selectedModelId === 'mock-agent' ? 'mock' : 'agent';
}

function readConversationMetadataString(record: ConversationRecord, key: string): string | null {
  const value = record.metadata[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function getConversationTaskId(record: ConversationRecord): string | undefined {
  return (
    readConversationMetadataString(record, 'taskId') ??
    readConversationMetadataString(record, 'copiedFromDemoTaskId') ??
    undefined
  );
}

function getConversationRuntimeSessionId(record: ConversationRecord): string | null {
  return (
    readConversationMetadataString(record, 'runtimeSessionId') ??
    readConversationMetadataString(record, 'localSessionId')
  );
}

interface MockRunSeed {
  runId: string;
  prompt: string;
  conclusion: string;
  hasReport: boolean;
  createdAt: number;
  updatedAt: number;
}

function isMockRunId(runId: string | undefined): runId is string {
  return Boolean(runId?.startsWith('mock_run_'));
}

function toIso(timestamp: number): string {
  return new Date(timestamp).toISOString();
}

function summarizeMockPrompt(prompt: string, fallback = '历史 Mock 问题'): string {
  const normalizedPrompt = prompt.replace(/\s+/g, ' ').trim();

  if (!normalizedPrompt) {
    return fallback;
  }

  return normalizedPrompt.length > 72 ? `${normalizedPrompt.slice(0, 71)}...` : normalizedPrompt;
}

function getRecoveredMockStepDescription(stepId: string, promptSummary: string): string {
  if (stepId === MOCK_RUN_STEP_IDS.understandPrompt) {
    return `解析本轮问题：${promptSummary}`;
  }

  if (stepId === MOCK_RUN_STEP_IDS.knowledgeSearch) {
    return `围绕「${promptSummary}」检索教学质量指标口径和分析规则。`;
  }

  if (stepId === MOCK_RUN_STEP_IDS.queryData) {
    return '使用公开演示数据生成本轮分析所需的指标样本。';
  }

  if (stepId === MOCK_RUN_STEP_IDS.generateChart) {
    return '将演示指标整理为右侧可视化图表数据。';
  }

  if (stepId === MOCK_RUN_STEP_IDS.waitConfirmation) {
    return '本轮 Mock Run 已产出结论，可继续生成报告。';
  }

  return '恢复本轮 Mock Run 的最终回复。';
}

function createCompletedMockRun(seed: MockRunSeed, sessionId: string): RunSnapshot {
  const createdAt = toIso(seed.createdAt);
  const updatedAt = toIso(seed.updatedAt);
  const promptSummary = summarizeMockPrompt(seed.prompt || seed.conclusion);
  const conclusion =
    seed.conclusion || `历史 Mock Run 未记录完整助手回复，已根据本轮问题恢复执行轨迹：${promptSummary}`;
  const hasCompletedReply = Boolean(seed.conclusion || seed.hasReport);
  const startedRun = createMockRunStartedEvent({
    runId: seed.runId,
    prompt: seed.prompt || promptSummary,
    sessionId,
  }).run;
  const stepElapsedById: Partial<Record<keyof typeof MOCK_RUN_STEP_IDS, number>> = {
    understandPrompt: 160,
    knowledgeSearch: 260,
    queryData: 260,
    generateChart: 220,
    waitConfirmation: 0,
    generateConclusion: 0,
  };
  const toolOutputs = [
    {
      tool: createMockToolInvocation('knowledgeSearch'),
      inputSummary: `检索与「${promptSummary}」相关的教学质量知识条目`,
      outputSummary: `找到 3 条与「${promptSummary}」相关的知识资料`,
      elapsedMs: 260,
    },
    {
      tool: createMockToolInvocation('queryData'),
      inputSummary: `查询「${promptSummary}」所需的公开演示指标`,
      outputSummary: `返回用于回答「${promptSummary}」的 6 个年级统计结果`,
      elapsedMs: 260,
    },
    {
      tool: createMockToolInvocation('chartRender'),
      inputSummary: `为「${promptSummary}」整理图表数据`,
      outputSummary: `生成 1 个用于解释「${promptSummary}」的柱状图数据`,
      elapsedMs: 220,
    },
  ];
  const chartData = createMockChartData();

  return {
    ...startedRun,
    status: hasCompletedReply ? 'success' : 'stopped',
    plan: startedRun.plan
      ? {
          ...startedRun.plan,
          reason: `公开演示模式（Mock）根据本轮问题恢复执行轨迹：${promptSummary}`,
        }
      : startedRun.plan,
    steps: startedRun.steps.map((step) => ({
      ...step,
      status: 'success',
      description: getRecoveredMockStepDescription(step.id, promptSummary),
      startedAt: createdAt,
      completedAt: updatedAt,
      elapsedMs:
        step.id === MOCK_RUN_STEP_IDS.understandPrompt
          ? stepElapsedById.understandPrompt
          : step.id === MOCK_RUN_STEP_IDS.knowledgeSearch
            ? stepElapsedById.knowledgeSearch
            : step.id === MOCK_RUN_STEP_IDS.queryData
              ? stepElapsedById.queryData
              : step.id === MOCK_RUN_STEP_IDS.generateChart
                ? stepElapsedById.generateChart
                : 0,
    })),
    toolInvocations: toolOutputs.map(({ tool, inputSummary, outputSummary, elapsedMs }) => ({
      ...tool,
      status: 'success',
      inputSummary,
      outputSummary,
      startedAt: createdAt,
      completedAt: updatedAt,
      elapsedMs,
    })),
    chartData: {
      ...chartData,
      title: `Mock 分析结果：${promptSummary}`,
      summary: `围绕「${promptSummary}」恢复的公开演示图表摘要。`,
    },
    conclusion,
    conclusionSource: 'mock',
    reportState: seed.hasReport ? 'generated' : seed.conclusion ? 'pending' : 'hidden',
    createdAt,
    updatedAt,
    startedAt: createdAt,
    completedAt: hasCompletedReply ? updatedAt : undefined,
    elapsedMs: hasCompletedReply ? 1200 : undefined,
  };
}

function collectMockRunSeeds(messages: WorkbenchMessage[]): MockRunSeed[] {
  const seeds = new Map<string, MockRunSeed>();

  for (const message of messages) {
    if (!isMockRunId(message.runId)) {
      continue;
    }

    const currentSeed =
      seeds.get(message.runId) ??
      ({
        runId: message.runId,
        prompt: '',
        conclusion: '',
        hasReport: false,
        createdAt: message.createdAt,
        updatedAt: message.createdAt,
      } satisfies MockRunSeed);

    if (message.role === 'user' && !currentSeed.prompt) {
      currentSeed.prompt = message.content;
    }

    if (message.role === 'assistant' && message.kind === 'report') {
      currentSeed.hasReport = true;
    } else if (message.role === 'assistant' && message.kind === 'normal' && message.content.trim()) {
      currentSeed.conclusion = message.content;
    }

    currentSeed.createdAt = Math.min(currentSeed.createdAt, message.createdAt);
    currentSeed.updatedAt = Math.max(currentSeed.updatedAt, message.createdAt);
    seeds.set(message.runId, currentSeed);
  }

  return [...seeds.values()];
}

function getRunUpdatedAt(run: RunSnapshot | undefined): number {
  if (!run) {
    return 0;
  }

  const timestamp = Date.parse(run.updatedAt);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function getLatestRunId(runsById: Record<string, RunSnapshot>): string | undefined {
  return Object.values(runsById).reduce<string | undefined>((latestRunId, run) => {
    const latestRun = latestRunId ? runsById[latestRunId] : undefined;
    return getRunUpdatedAt(run) >= getRunUpdatedAt(latestRun) ? run.id : latestRunId;
  }, undefined);
}

function hydrateMockRunsForSession(session: WorkbenchSession): WorkbenchSession {
  const mockRunSeeds = collectMockRunSeeds(session.messages);

  if (mockRunSeeds.length === 0) {
    return session;
  }

  const runsById = { ...session.runsById };

  for (const seed of mockRunSeeds) {
    if (!runsById[seed.runId]) {
      runsById[seed.runId] = createCompletedMockRun(seed, session.id);
      continue;
    }

    if (seed.hasReport && runsById[seed.runId].reportState !== 'generated') {
      runsById[seed.runId] = {
        ...runsById[seed.runId],
        reportState: 'generated',
      };
    }
  }

  return {
    ...session,
    runsById,
    latestRunId: getLatestRunId(runsById),
  };
}

function conversationRecordToWorkbenchSession(
  record: ConversationRecord,
  messages: WorkbenchMessage[] = [],
): WorkbenchSession {
  const session = conversationRecordToSession(record, messages);
  const taskId = getConversationTaskId(record);

  const sessionWithTask = taskId
    ? {
        ...session,
        taskId,
      }
    : session;

  return hydrateMockRunsForSession(sessionWithTask);
}

function findTargetConversation(
  conversations: ConversationRecord[],
  preferredSessionId: string | null | undefined,
): ConversationRecord | null {
  const normalizedPreferredSessionId = preferredSessionId?.trim();

  if (!normalizedPreferredSessionId) {
    return null;
  }

  return (
    conversations.find((conversation) => conversation.id === normalizedPreferredSessionId) ??
    conversations.find((conversation) => getConversationRuntimeSessionId(conversation) === normalizedPreferredSessionId) ??
    null
  );
}

function createConversationMetadataForSession(
  session: WorkbenchSession | undefined,
  fallbackTaskId: string,
): Record<string, unknown> {
  return {
    runtimeSessionId: session?.id ?? null,
    taskId: (session?.taskId ?? fallbackTaskId) || null,
  };
}

function getDraftTitleFromState(state: WorkbenchStore, session?: WorkbenchSession): string {
  const firstUserMessage = session?.messages.find((message) => message.role === 'user')?.content ?? '';
  return createSessionTitle(state.chatDraft || state.currentPrompt || firstUserMessage);
}

function replaceUrlForActiveSession(sessionId: string, taskId: string | undefined, isPersistentMode: boolean): void {
  replaceWorkbenchUrl({
    sessionId,
    taskId: isPersistentMode ? undefined : taskId,
  });
}

function isReadonlySession(session: WorkbenchSession): boolean {
  return session.isReadOnly === true || session.visibility === 'demo';
}

function getPersistableSessions(sessions: WorkbenchSession[]): WorkbenchSession[] {
  return sessions.filter((session) => !isReadonlySession(session));
}

function createEmptyUiState() {
  return {
    currentPrompt: '',
    chatDraft: '',
    assistantStream: {
      content: '',
      status: 'idle' as const,
    },
    activeAssistantMessageId: '',
    generationStatus: 'idle' as const,
    realModelNotice: '',
    errorMessage: undefined,
    confirmStatus: 'waiting' as const,
    currentRun: null,
    selectedRunId: null,
    runEventLog: [],
    agentRunStatus: 'idle' as const,
    agentRunErrorMessage: null,
    activeAgentRunRequestId: null,
    activeAgentRunAbortController: null,
    currentReportRunId: null,
    reportActionState: 'skipped' as const,
    isRagSourcesLoading: false,
    ragSourcesError: null,
  };
}

function getReportActionStateFromRun(run: RunSnapshot | null | undefined): WorkbenchStore['reportActionState'] {
  if (
    run?.reportState === 'pending' ||
    run?.reportState === 'generating' ||
    run?.reportState === 'generated' ||
    run?.reportState === 'failed'
  ) {
    return run.reportState;
  }

  return 'skipped';
}

function createSessionUiState(session: WorkbenchSession | undefined, fallbackTaskId: string) {
  const hydratedSession = session ? hydrateMockRunsForSession(session) : undefined;
  const userMessage = hydratedSession ? getSessionLatestPrompt(hydratedSession) : '';
  const assistantReply = hydratedSession ? getSessionLatestAssistantReply(hydratedSession) : '';
  const assistantMessage =
    [...(hydratedSession?.messages ?? [])].reverse().find((message) => message.role === 'assistant') ?? null;
  const latestRun = getSessionLatestRun(hydratedSession);
  const hasAssistantReply = Boolean(assistantReply.trim());

  return {
    currentTaskId: hydratedSession?.taskId ?? fallbackTaskId,
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
    selectedRunId: latestRun?.id ?? null,
    runEventLog: [],
    agentRunStatus: 'idle' as const,
    agentRunErrorMessage: null,
    activeAgentRunRequestId: null,
    activeAgentRunAbortController: null,
    currentReportRunId: latestRun && latestRun.reportState !== 'hidden' ? latestRun.id : null,
    reportActionState: getReportActionStateFromRun(latestRun),
    isRagSourcesLoading: false,
    ragSourcesError: null,
  };
}

function upsertSessionMessages(
  sessions: WorkbenchSession[],
  sessionId: string,
  messages: WorkbenchMessage[],
): WorkbenchSession[] {
  return sortSessionsByUpdatedAt(
    sessions.map((session) => {
      if (session.id !== sessionId) {
        return session;
      }

      return hydrateMockRunsForSession({
        ...session,
        messages,
        messageCount: Math.max(session.messageCount ?? messages.length, messages.length),
        updatedAt: Date.now(),
      });
    }),
  );
}

function mergeSessionMessages(
  currentMessages: WorkbenchMessage[],
  incomingMessages: WorkbenchMessage[],
): WorkbenchMessage[] {
  const messageMap = new Map<string, WorkbenchMessage>();

  for (const message of [...currentMessages, ...incomingMessages]) {
    messageMap.set(message.id, message);
  }

  return [...messageMap.values()].sort((left, right) => left.createdAt - right.createdAt);
}

export const createSessionSlice: StateCreator<WorkbenchStore, [], [], SessionSlice> = (set, get) => ({
  sessions: initialWorkbenchState.sessions,
  currentSessionId: initialWorkbenchState.currentSessionId,
  currentTaskId: initialWorkbenchState.currentTaskId,
  currentPrompt: initialWorkbenchState.currentPrompt,
  activeAssistantMessageId: initialWorkbenchState.activeAssistantMessageId,
  isConversationListLoading: false,
  isCreatingConversation: false,
  conversationListError: null,
  isMessagesLoading: false,
  messagesError: null,
  isOlderMessagesLoading: false,
  olderMessagesError: null,
  hasMoreMessages: false,
  oldestMessageCursor: null,
  persistenceError: null,
  isPersistentMode: false,
  persistentUserId: null,
  lastRestoredConversationId: null,
  persistSessions: (sessions, activeSessionId) => {
    if (get().isPersistentMode) {
      return;
    }

    persistWorkbenchSessions(sortSessionsByUpdatedAt(getPersistableSessions(sessions)), activeSessionId ?? get().currentSessionId);
  },
  createSession: async () => {
    get().activeAgentRunAbortController?.abort();

    set((state) => {
      if (!state.isPersistentMode) {
        persistWorkbenchSessions(getPersistableSessions(state.sessions), '');
      }

      return {
        currentSessionId: '',
        currentTaskId: '',
        isCreatingConversation: false,
        isMessagesLoading: false,
        isOlderMessagesLoading: false,
        messagesError: null,
        olderMessagesError: null,
        hasMoreMessages: false,
        oldestMessageCursor: null,
        persistenceError: null,
        ...createEmptyUiState(),
      };
    });

    return '';
  },
  switchSession: (sessionId) => {
    get().activeAgentRunAbortController?.abort();

    set((state) => {
      const nextSession = state.sessions.find((session) => session.id === sessionId);

      if (!nextSession || isReadonlySession(nextSession)) {
        return state;
      }

      const hydratedNextSession = hydrateMockRunsForSession(nextSession);
      const nextSessions = state.sessions.map((session) =>
        session.id === hydratedNextSession.id ? hydratedNextSession : session,
      );

      if (!state.isPersistentMode) {
        persistWorkbenchSessions(getPersistableSessions(nextSessions), hydratedNextSession.id);
      }

      return {
        sessions: nextSessions,
        currentSessionId: hydratedNextSession.id,
        isOlderMessagesLoading: false,
        olderMessagesError: null,
        hasMoreMessages: false,
        oldestMessageCursor: null,
        ...createSessionUiState(hydratedNextSession, state.currentTaskId),
      };
    });

    const activeSession = get().sessions.find((session) => session.id === sessionId);

    if (get().isPersistentMode && activeSession && !isReadonlySession(activeSession)) {
      void get().loadPersistentMessagesForSession(sessionId);
    }
  },
  setCurrentSessionId: (sessionId) => {
    const nextSession = get().sessions.find((session) => session.id === sessionId);
    const hydratedNextSession = nextSession ? hydrateMockRunsForSession(nextSession) : undefined;

    if (!get().isPersistentMode) {
      persistWorkbenchSessions(getPersistableSessions(get().sessions), sessionId);
    }

    set((state) => ({
      sessions: hydratedNextSession
        ? state.sessions.map((session) => (session.id === hydratedNextSession.id ? hydratedNextSession : session))
        : state.sessions,
      currentSessionId: sessionId,
      currentRun: getSessionLatestRun(hydratedNextSession),
      selectedRunId: getSessionLatestRun(hydratedNextSession)?.id ?? null,
      runEventLog: [],
      isOlderMessagesLoading: false,
      olderMessagesError: null,
      hasMoreMessages: false,
      oldestMessageCursor: null,
    }));
  },
  setCurrentTaskId: (taskId) => {
    set({ currentTaskId: taskId });
  },
  setCurrentPrompt: (prompt) => {
    set({ currentPrompt: prompt });
  },
  upsertCurrentSessionMessages: (messages) => {
    set((state) => {
      const now = Date.now();
      const nextSessions = sortSessionsByUpdatedAt(
        state.sessions.map((session) => {
          if (session.id !== state.currentSessionId) {
            return session;
          }

          return hydrateMockRunsForSession({
            ...session,
            messages,
            messageCount: messages.length,
            updatedAt: now,
            taskId: state.currentTaskId,
          });
        }),
      );

      if (!state.isPersistentMode) {
        persistWorkbenchSessions(getPersistableSessions(nextSessions), state.currentSessionId);
      }

      return {
        sessions: nextSessions,
      };
    });
  },
  updateCurrentSessionAssistantMessage: (messageId, content) => {
    set((state) => {
      const nextSessions = updateCurrentSessionAssistantInSessions(
        state.sessions,
        state.currentSessionId,
        messageId,
        content,
      );

      if (!state.isPersistentMode) {
        persistWorkbenchSessions(getPersistableSessions(nextSessions), state.currentSessionId);
      }

      return {
        sessions: nextSessions,
      };
    });
  },
  appendUserMessageToCurrentSession: (content, options) => {
    const normalizedContent = content.trim();

    if (!normalizedContent) {
      return null;
    }

    const now = Date.now();
    const previousState = get();
    const previousSession = previousState.sessions.find((session) => session.id === previousState.currentSessionId);
    const shouldPersistTitleUpdate =
      previousState.isPersistentMode &&
      Boolean(previousSession) &&
      (previousSession?.title === '新会话' || previousSession?.messages.length === 0);
    const nextTitle = createSessionTitle(normalizedContent);
    const userMessage = createWorkbenchMessage({
      role: 'user' as const,
      kind: options?.kind ?? 'normal',
      content: normalizedContent,
      createdAt: now,
      runId: options?.runId,
    });

    set((state) => {
      const nextSessions = sortSessionsByUpdatedAt(
        state.sessions.map((session) => {
          if (session.id !== state.currentSessionId) {
            return session;
          }

          const shouldRenameSession = session.title === '新会话' || session.messages.length === 0;

          return {
            ...session,
            title: shouldRenameSession ? createSessionTitle(normalizedContent) : session.title,
            updatedAt: now,
            taskId: state.currentTaskId,
            messageCount: (session.messageCount ?? session.messages.length) + 1,
            messages: [...session.messages, userMessage],
          };
        }),
      );

      if (!state.isPersistentMode) {
        persistWorkbenchSessions(getPersistableSessions(nextSessions), state.currentSessionId);
      }

      return {
        sessions: nextSessions,
        currentPrompt: normalizedContent,
      };
    });

    if (shouldPersistTitleUpdate) {
      const authContext = getPersistenceAuthContext({
        allowCloudBasePersistence: shouldUseCloudBaseForPersistentState(previousState.persistentUserId),
      });

      if (authContext) {
        void updateConversation(previousState.currentSessionId, { title: nextTitle }, authContext.accessToken).then((result) => {
          if (!result.ok || get().currentSessionId !== previousState.currentSessionId) {
            return;
          }

          set((state) => ({
            sessions: state.sessions.map((session) => {
              if (session.id !== result.data.id) {
                return session;
              }

              const updatedSession = conversationRecordToWorkbenchSession(result.data, session.messages);

              return {
                ...updatedSession,
                runsById: session.runsById,
                latestRunId: session.latestRunId ?? updatedSession.latestRunId,
              };
            }),
            persistenceError: null,
          }));
        });
      }
    }

    return userMessage;
  },
  appendAssistantMessageToCurrentSession: (content, options) => {
    const normalizedContent = content.trim();

    if (!normalizedContent) {
      return null;
    }

    const now = Date.now();
    const assistantMessage = createWorkbenchMessage({
      role: 'assistant' as const,
      kind: options?.kind ?? 'normal',
      content: normalizedContent,
      createdAt: now,
      runId: options?.runId,
    });

    set((state) => {
      const nextSessions = sortSessionsByUpdatedAt(
        state.sessions.map((session) =>
          session.id === state.currentSessionId
            ? {
                ...session,
                updatedAt: now,
                taskId: state.currentTaskId,
                messageCount: (session.messageCount ?? session.messages.length) + 1,
                messages: [...session.messages, assistantMessage],
              }
            : session,
        ),
      );

      if (!state.isPersistentMode) {
        persistWorkbenchSessions(getPersistableSessions(nextSessions), state.currentSessionId);
      }

      return {
        sessions: nextSessions,
        activeAssistantMessageId: assistantMessage.id,
        assistantStream: {
          content: normalizedContent,
          status: 'done',
        },
        generationStatus: 'done',
      };
    });

    return assistantMessage;
  },
  hydratePersistentWorkbench: async (params) => {
    const authContext = getPersistenceAuthContext();

    if (!authContext) {
      return null;
    }

    const requestId = persistenceRequestId + 1;
    persistenceRequestId = requestId;
    messageLoadRequestId += 1;
    olderMessageLoadRequestId += 1;

    set({
      isConversationListLoading: true,
      isMessagesLoading: true,
      isOlderMessagesLoading: false,
      conversationListError: null,
      messagesError: null,
      olderMessagesError: null,
      hasMoreMessages: false,
      oldestMessageCursor: null,
      persistenceError: null,
    });

    const conversationResult = await fetchConversations(
      {
        limit: 20,
      },
      authContext.accessToken,
    );

    if (requestId !== persistenceRequestId) {
      return null;
    }

    if (!conversationResult.ok) {
      set({
        isConversationListLoading: false,
        isMessagesLoading: false,
        isOlderMessagesLoading: false,
        conversationListError: conversationResult.message,
        messagesError: null,
        olderMessagesError: null,
        hasMoreMessages: false,
        oldestMessageCursor: null,
        persistenceError: conversationResult.message,
      });
      return null;
    }

    const conversations = conversationResult.data.conversations;
    const targetConversation = findTargetConversation(conversations, params?.preferredSessionId);

    if (!targetConversation) {
      const sessions = sortSessionsByUpdatedAt(
        conversations.map((conversation) => conversationRecordToWorkbenchSession(conversation)),
      );

      set({
        sessions,
        currentSessionId: '',
        currentTaskId: '',
        isConversationListLoading: false,
        isMessagesLoading: false,
        isOlderMessagesLoading: false,
        conversationListError: null,
        messagesError: null,
        olderMessagesError: null,
        hasMoreMessages: false,
        oldestMessageCursor: null,
        persistenceError: null,
        isPersistentMode: true,
        persistentUserId: authContext.userId,
        lastRestoredConversationId: null,
        ...createEmptyUiState(),
      });
      return null;
    }

    const messageResult = await fetchConversationMessages(
      targetConversation.id,
      {
        limit: DEFAULT_MESSAGE_PAGE_SIZE,
      },
      authContext.accessToken,
    );

    if (requestId !== persistenceRequestId) {
      return null;
    }

    if (!messageResult.ok) {
      set({
        isConversationListLoading: false,
        isMessagesLoading: false,
        isOlderMessagesLoading: false,
        conversationListError: null,
        messagesError: messageResult.message,
        olderMessagesError: null,
        hasMoreMessages: false,
        oldestMessageCursor: null,
        persistenceError: messageResult.message,
      });
      return null;
    }

    const restoredMessages = messageResult.data.messages.map((message) => messageRecordToWorkbenchMessage(message));
    const sessions = sortSessionsByUpdatedAt(
      conversations.map((conversation) =>
        conversationRecordToWorkbenchSession(conversation, conversation.id === targetConversation.id ? restoredMessages : []),
      ),
    );
    const activeSession = sessions.find((session) => session.id === targetConversation.id);

    set((state) => ({
      sessions,
      currentSessionId: activeSession?.id ?? state.currentSessionId,
      isConversationListLoading: false,
      isMessagesLoading: false,
      isOlderMessagesLoading: false,
      conversationListError: null,
      messagesError: null,
      olderMessagesError: null,
      hasMoreMessages: Boolean(messageResult.data.nextCursor),
      oldestMessageCursor: messageResult.data.nextCursor,
      persistenceError: null,
      isPersistentMode: true,
      persistentUserId: authContext.userId,
      lastRestoredConversationId: activeSession?.id ?? null,
      ...createSessionUiState(activeSession, state.currentTaskId),
    }));

    if (activeSession?.id) {
      void get().loadLatestRunForConversation(activeSession.id);
      void get().loadReportArtifacts(activeSession.id);
    }

    return activeSession?.id ?? null;
  },
  resetPersistentWorkbench: () => {
    if (!get().isPersistentMode && !get().persistentUserId) {
      return;
    }

    persistenceRequestId += 1;
    messageLoadRequestId += 1;
    olderMessageLoadRequestId += 1;
    clearPersistedWorkbenchState();

    const anonymousState = getInitialWorkbenchSessionState();
    const anonymousSessions = anonymousState.sessions.map((session) => hydrateMockRunsForSession(session));
    const currentSession = anonymousState.activeSessionId
      ? anonymousSessions.find((session) => session.id === anonymousState.activeSessionId)
      : undefined;

    set({
      sessions: anonymousSessions,
      currentSessionId: currentSession?.id ?? '',
      isConversationListLoading: false,
      isCreatingConversation: false,
      isMessagesLoading: false,
      isOlderMessagesLoading: false,
      conversationListError: null,
      messagesError: null,
      olderMessagesError: null,
      hasMoreMessages: false,
      oldestMessageCursor: null,
      persistenceError: null,
      isPersistentMode: false,
      persistentUserId: null,
      lastRestoredConversationId: null,
      ...createSessionUiState(currentSession, ''),
    });
  },
  loadPersistentMessagesForSession: async (sessionId) => {
    const authContext = getPersistenceAuthContext({
      allowCloudBasePersistence: shouldUseCloudBaseForPersistentState(get().persistentUserId),
    });

    if (!authContext || !get().isPersistentMode) {
      return;
    }

    const requestId = messageLoadRequestId + 1;
    messageLoadRequestId = requestId;
    olderMessageLoadRequestId += 1;

    set({
      isMessagesLoading: true,
      isOlderMessagesLoading: false,
      messagesError: null,
      olderMessagesError: null,
      hasMoreMessages: false,
      oldestMessageCursor: null,
      persistenceError: null,
    });

    const result = await fetchConversationMessages(
      sessionId,
      {
        limit: DEFAULT_MESSAGE_PAGE_SIZE,
      },
      authContext.accessToken,
    );

    if (requestId !== messageLoadRequestId || get().currentSessionId !== sessionId) {
      return;
    }

    if (!result.ok) {
      set({
        isMessagesLoading: false,
        isOlderMessagesLoading: false,
        messagesError: result.message,
        olderMessagesError: null,
        hasMoreMessages: false,
        oldestMessageCursor: null,
        persistenceError: result.message,
      });
      return;
    }

    const messages = result.data.messages.map((message) => messageRecordToWorkbenchMessage(message));

    set((state) => {
      const nextSessions = upsertSessionMessages(state.sessions, sessionId, messages);
      const activeSession = nextSessions.find((session) => session.id === sessionId);
      const shouldRestoreUi = state.currentSessionId === sessionId;

      return {
        sessions: nextSessions,
        isMessagesLoading: false,
        messagesError: null,
        olderMessagesError: null,
        hasMoreMessages: Boolean(result.data.nextCursor),
        oldestMessageCursor: result.data.nextCursor,
        persistenceError: null,
        ...(shouldRestoreUi ? createSessionUiState(activeSession, state.currentTaskId) : {}),
      };
    });

    if (get().currentSessionId === sessionId) {
      void get().loadLatestRunForConversation(sessionId);
      void get().loadReportArtifacts(sessionId);
    }
  },
  loadOlderMessagesForCurrentSession: async () => {
    const currentState = get();
    const authContext = getPersistenceAuthContext({
      allowCloudBasePersistence: shouldUseCloudBaseForPersistentState(currentState.persistentUserId),
    });
    const sessionId = currentState.currentSessionId;
    const before = currentState.oldestMessageCursor;

    if (!authContext || !currentState.isPersistentMode || !sessionId || !before || currentState.isOlderMessagesLoading) {
      return;
    }

    const requestId = olderMessageLoadRequestId + 1;
    olderMessageLoadRequestId = requestId;

    set({
      isOlderMessagesLoading: true,
      olderMessagesError: null,
      persistenceError: null,
    });

    const result = await fetchConversationMessages(
      sessionId,
      {
        limit: DEFAULT_MESSAGE_PAGE_SIZE,
        before,
      },
      authContext.accessToken,
    );

    if (requestId !== olderMessageLoadRequestId || get().currentSessionId !== sessionId) {
      return;
    }

    if (!result.ok) {
      set({
        isOlderMessagesLoading: false,
        olderMessagesError: result.message,
        persistenceError: result.message,
      });
      return;
    }

    const olderMessages = result.data.messages.map((message) => messageRecordToWorkbenchMessage(message));

    set((state) => ({
      sessions: state.sessions.map((session) => {
        if (session.id !== sessionId) {
          return session;
        }

        return hydrateMockRunsForSession({
          ...session,
          messages: mergeSessionMessages(session.messages, olderMessages),
          messageCount: Math.max(
            session.messageCount ?? 0,
            session.messages.length + olderMessages.length,
          ),
        });
      }),
      isOlderMessagesLoading: false,
      olderMessagesError: null,
      hasMoreMessages: Boolean(result.data.nextCursor),
      oldestMessageCursor: result.data.nextCursor,
      persistenceError: null,
    }));
  },
  ensureCurrentPersistentConversation: async () => {
    const currentState = get();
    const authContext = getPersistenceAuthContext();
    const currentSession = currentState.sessions.find((session) => session.id === currentState.currentSessionId);
    const writableCurrentSession = currentSession && !isReadonlySession(currentSession) ? currentSession : undefined;
    const conversationTitle =
      writableCurrentSession?.title && writableCurrentSession.title !== '新会话'
        ? writableCurrentSession.title
        : getDraftTitleFromState(currentState, writableCurrentSession);

    if (!authContext) {
      if (writableCurrentSession && currentState.currentSessionId) {
        return writableCurrentSession.id;
      }

      const newSession = createEmptySession({
        title: conversationTitle,
        taskId: currentState.currentTaskId || undefined,
      });

      set((state) => {
        const nextSessions = sortSessionsByUpdatedAt([newSession, ...getPersistableSessions(state.sessions)]);

        persistWorkbenchSessions(nextSessions, newSession.id);

        return {
          sessions: nextSessions,
          currentSessionId: newSession.id,
          isPersistentMode: false,
          persistentUserId: null,
          conversationListError: null,
          persistenceError: null,
        };
      });
      replaceUrlForActiveSession(newSession.id, newSession.taskId, false);

      return newSession.id;
    }

    if (
      currentState.isPersistentMode &&
      writableCurrentSession &&
      isPersistentStateCompatibleWithAuthContext(authContext, currentState.persistentUserId)
    ) {
      if (writableCurrentSession.title === '新会话' && conversationTitle !== '新会话') {
        void updateConversation(writableCurrentSession.id, { title: conversationTitle }, authContext.accessToken).then((result) => {
          if (!result.ok || get().currentSessionId !== writableCurrentSession.id) {
            return;
          }

          set((state) => ({
            sessions: state.sessions.map((session) => {
              if (session.id !== result.data.id) {
                return session;
              }

              const updatedSession = conversationRecordToWorkbenchSession(result.data, session.messages);

              return {
                ...updatedSession,
                runsById: session.runsById,
                latestRunId: session.latestRunId ?? updatedSession.latestRunId,
              };
            }),
            persistenceError: null,
          }));
        });
      }

      return writableCurrentSession.id;
    }

    set({
      isCreatingConversation: true,
      conversationListError: null,
      persistenceError: null,
    });

    const result = await createConversation(
      {
        title: conversationTitle,
        mode: getConversationModeForSelectedModel(currentState.selectedModelId),
        metadata: createConversationMetadataForSession(writableCurrentSession, currentState.currentTaskId),
      },
      authContext.accessToken,
    );

    if (!result.ok) {
      set({
        isCreatingConversation: false,
        conversationListError: result.message,
        persistenceError: result.message,
      });
      return null;
    }

    const nextSession = conversationRecordToWorkbenchSession(result.data, writableCurrentSession?.messages ?? []);

    set((state) => ({
      sessions: sortSessionsByUpdatedAt([
        nextSession,
        ...getPersistableSessions(state.sessions).filter((session) => session.id !== nextSession.id),
      ]),
      currentSessionId: nextSession.id,
      isPersistentMode: true,
      persistentUserId: authContext.userId,
      isCreatingConversation: false,
      conversationListError: null,
      persistenceError: null,
    }));
    replaceUrlForActiveSession(nextSession.id, undefined, true);

    return nextSession.id;
  },
  persistMessageToConversation: async (conversationId, message) => {
    const authContext = getPersistenceAuthContext({
      allowCloudBasePersistence: shouldUseCloudBaseForPersistentState(get().persistentUserId),
    });

    if (!authContext || !get().isPersistentMode) {
      return;
    }

    if (shouldSkipCloudBaseAgentAssistantPersist(message)) {
      set({
        messagesError: null,
        persistenceError: null,
      });
      return;
    }

    const result = await createConversationMessage(
      conversationId,
      workbenchMessageToMessageCreateInput(message),
      authContext.accessToken,
    );

    if (!result.ok) {
      set({
        messagesError: result.message,
        persistenceError: result.message,
      });
      return;
    }

    set({
      messagesError: null,
      persistenceError: null,
    });
  },
  startTask: (taskId, prompt) => {
    set((state) => {
      const nextSessions = state.sessions.map((session) =>
        session.id === state.currentSessionId
          ? {
              ...session,
              taskId,
            }
          : session,
      );

      if (!state.isPersistentMode) {
        persistWorkbenchSessions(getPersistableSessions(nextSessions), state.currentSessionId);
      }

      return {
        sessions: nextSessions,
        currentTaskId: taskId,
      };
    });

    void get().runMockPrompt(prompt);
  },
  hydrateFromUrl: (state) => {
    get().activeAgentRunAbortController?.abort();

    set((currentState) => {
      if (currentState.isPersistentMode) {
        return currentState;
      }

      const nextSession = state.sessionId
        ? currentState.sessions.find((session) => session.id === state.sessionId && !isReadonlySession(session))
        : undefined;
      const hydratedNextSession = nextSession ? hydrateMockRunsForSession(nextSession) : undefined;
      const nextSessions = hydratedNextSession
        ? currentState.sessions.map((session) => (session.id === hydratedNextSession.id ? hydratedNextSession : session))
        : currentState.sessions;
      const nextTaskId = state.taskId ?? hydratedNextSession?.taskId ?? '';
      const matchedTask = mockTasks.find((task) => task.id === nextTaskId);

      if (hydratedNextSession) {
        persistWorkbenchSessions(getPersistableSessions(nextSessions), hydratedNextSession.id);
      } else {
        persistWorkbenchSessions(getPersistableSessions(nextSessions), '');
      }

      return {
        sessions: nextSessions,
        currentSessionId: hydratedNextSession?.id ?? '',
        ...createSessionUiState(hydratedNextSession, matchedTask?.id ?? nextTaskId),
      };
    });
  },
});
