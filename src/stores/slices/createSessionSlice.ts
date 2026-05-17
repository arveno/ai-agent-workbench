import type { StateCreator } from 'zustand';
import { mockTasks } from '../../mocks/tasks';
import { isCloudBasePrivateApiEnabled } from '../../services/cloudbaseApiClient';
import { createConversation, fetchConversations, updateConversation } from '../../services/conversationApi';
import { createConversationMessage, fetchConversationMessages } from '../../services/messageApi';
import type { ConversationMode, ConversationRecord } from '../../types/persistence';
import type { SessionSlice, WorkbenchMessage, WorkbenchSession, WorkbenchStore } from '../../types/workbench';
import { conversationRecordToSession } from '../../utils/conversationMapper';
import { messageRecordToWorkbenchMessage, workbenchMessageToMessageCreateInput } from '../../utils/messageMapper';
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
  DEFAULT_TASK_ID,
} from './shared';

const DEFAULT_MESSAGE_PAGE_SIZE = 30;
let persistenceRequestId = 0;
let messageLoadRequestId = 0;
let olderMessageLoadRequestId = 0;

type PersistenceAuthSource = 'legacy' | 'cloudbase';

interface PersistenceAuthContext {
  accessToken: string;
  userId: string;
  source: PersistenceAuthSource;
}

interface PersistenceAuthOptions {
  allowCloudBasePersistence?: boolean;
}

function getCloudBaseAuthContext(): PersistenceAuthContext | null {
  if (!isCloudBasePrivateApiEnabled()) {
    return null;
  }

  const authState = useAuthStore.getState();
  const accessToken = authState.accessToken?.trim() || authState.session?.access_token?.trim();
  const userId = authState.currentUser?.userId ?? authState.user?.id ?? authState.session?.user.id ?? null;

  if (authState.status !== 'authenticated' || !accessToken || !userId) {
    return null;
  }

  return {
    accessToken,
    userId,
    source: 'cloudbase',
  };
}

function getLegacyPersistenceAuthContext(): PersistenceAuthContext | null {
  if (isCloudBasePrivateApiEnabled()) {
    return null;
  }

  const authState = useAuthStore.getState();

  if (authState.authProvider !== 'supabase') {
    return null;
  }

  const accessToken = authState.session?.access_token?.trim();
  const userId = authState.user?.id ?? authState.session?.user.id ?? null;

  if (authState.status !== 'authenticated' || !accessToken || !userId) {
    return null;
  }

  return {
    accessToken,
    userId,
    source: 'legacy',
  };
}

function getPersistenceAuthContext(options: PersistenceAuthOptions = {}): PersistenceAuthContext | null {
  if (options.allowCloudBasePersistence !== false) {
    const cloudBaseContext = getCloudBaseAuthContext();

    if (cloudBaseContext) {
      return cloudBaseContext;
    }
  }

  return getLegacyPersistenceAuthContext();
}

function isCloudBaseAuthContext(authContext: PersistenceAuthContext): boolean {
  return authContext.source === 'cloudbase';
}

function shouldUseCloudBaseForPersistentState(persistentUserId: string | null): boolean {
  const authState = useAuthStore.getState();
  const userId = authState.currentUser?.userId ?? authState.user?.id ?? authState.session?.user.id ?? null;
  return Boolean(userId && persistentUserId === userId);
}

function shouldAllowCloudBaseForProvider(provider: WorkbenchStore['currentModelProvider']): boolean {
  return isCloudBasePrivateApiEnabled() || provider !== 'groq';
}

function isPersistentStateCompatibleWithAuthContext(
  authContext: PersistenceAuthContext,
  persistentUserId: string | null,
): boolean {
  if (isCloudBaseAuthContext(authContext)) {
    return shouldUseCloudBaseForPersistentState(persistentUserId);
  }

  return persistentUserId === authContext.userId;
}

function shouldSkipCloudBaseAgentAssistantPersist(
  authContext: PersistenceAuthContext,
  message: WorkbenchMessage,
): boolean {
  return (
    isCloudBaseAuthContext(authContext) &&
    message.role === 'assistant' &&
    message.kind === 'normal' &&
    Boolean(message.runId?.startsWith('agent_run_'))
  );
}

function getConversationModeForProvider(provider: WorkbenchStore['currentModelProvider']): ConversationMode {
  return provider === 'groq' ? 'agent' : 'mock';
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

function conversationRecordToWorkbenchSession(
  record: ConversationRecord,
  messages: WorkbenchMessage[] = [],
): WorkbenchSession {
  const session = conversationRecordToSession(record, messages);
  const taskId = getConversationTaskId(record);

  return taskId
    ? {
        ...session,
        taskId,
      }
    : session;
}

function findTargetConversation(
  conversations: ConversationRecord[],
  preferredSessionId: string | null | undefined,
): ConversationRecord | null {
  const normalizedPreferredSessionId = preferredSessionId?.trim();

  if (!normalizedPreferredSessionId) {
    return conversations[0] ?? null;
  }

  return (
    conversations.find((conversation) => conversation.id === normalizedPreferredSessionId) ??
    conversations.find((conversation) => getConversationRuntimeSessionId(conversation) === normalizedPreferredSessionId) ??
    conversations[0] ??
    null
  );
}

function createConversationMetadataForSession(
  session: WorkbenchSession | undefined,
  fallbackTaskId: string,
): Record<string, unknown> {
  return {
    runtimeSessionId: session?.id ?? null,
    taskId: session?.taskId ?? fallbackTaskId,
  };
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

function createSessionUiState(session: WorkbenchSession | undefined, fallbackTaskId: string) {
  const userMessage = session ? getSessionLatestPrompt(session) : '';
  const assistantReply = session ? getSessionLatestAssistantReply(session) : '';
  const assistantMessage =
    [...(session?.messages ?? [])].reverse().find((message) => message.role === 'assistant') ?? null;
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
    currentRun: getSessionLatestRun(session),
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

function upsertSessionMessages(
  sessions: WorkbenchSession[],
  sessionId: string,
  messages: WorkbenchMessage[],
): WorkbenchSession[] {
  return sortSessionsByUpdatedAt(
    sessions.map((session) =>
      session.id === sessionId
        ? {
            ...session,
            messages,
            messageCount: Math.max(session.messageCount ?? messages.length, messages.length),
            updatedAt: Date.now(),
          }
        : session,
    ),
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

    persistWorkbenchSessions(sortSessionsByUpdatedAt(sessions), activeSessionId ?? get().currentSessionId);
  },
  createSession: async () => {
    get().activeAgentRunAbortController?.abort();

    const currentProvider = get().currentModelProvider;
    const authContext = getPersistenceAuthContext({
      allowCloudBasePersistence: shouldAllowCloudBaseForProvider(currentProvider),
    });

    if (authContext) {
      set({
        isCreatingConversation: true,
        conversationListError: null,
        persistenceError: null,
      });

      const result = await createConversation(
        {
          title: '新会话',
          mode: getConversationModeForProvider(get().currentModelProvider),
          metadata: {
            taskId: get().currentTaskId,
          },
        },
        authContext.accessToken,
      );

      if (result.ok) {
        const newSession = conversationRecordToWorkbenchSession(result.data);

        set((state) => {
          const nextSessions = sortSessionsByUpdatedAt([newSession, ...state.sessions]);

          return {
            sessions: nextSessions,
            currentSessionId: newSession.id,
            isCreatingConversation: false,
            isPersistentMode: true,
            persistentUserId: authContext.userId,
            conversationListError: null,
            isOlderMessagesLoading: false,
            olderMessagesError: null,
            hasMoreMessages: false,
            oldestMessageCursor: null,
            persistenceError: null,
            ...createEmptyUiState(),
          };
        });

        return newSession.id;
      }

      set({
        isCreatingConversation: false,
        conversationListError: result.message,
        persistenceError: result.message,
      });

      return get().currentSessionId;
    }

    const newSession = createEmptySession({
      taskId: get().currentTaskId,
    });

    set((state) => {
      const nextSessions = sortSessionsByUpdatedAt([newSession, ...state.sessions]);
      persistWorkbenchSessions(nextSessions, newSession.id);

      return {
        sessions: nextSessions,
        currentSessionId: newSession.id,
        ...createEmptyUiState(),
      };
    });

    return newSession.id;
  },
  switchSession: (sessionId) => {
    get().activeAgentRunAbortController?.abort();

    set((state) => {
      const nextSession = state.sessions.find((session) => session.id === sessionId);

      if (!nextSession) {
        return state;
      }

      if (!state.isPersistentMode) {
        persistWorkbenchSessions(state.sessions, nextSession.id);
      }

      return {
        currentSessionId: nextSession.id,
        isOlderMessagesLoading: false,
        olderMessagesError: null,
        hasMoreMessages: false,
        oldestMessageCursor: null,
        ...createSessionUiState(nextSession, state.currentTaskId),
      };
    });

    if (get().isPersistentMode) {
      void get().loadPersistentMessagesForSession(sessionId);
    }
  },
  setCurrentSessionId: (sessionId) => {
    const nextSession = get().sessions.find((session) => session.id === sessionId);

    if (!get().isPersistentMode) {
      persistWorkbenchSessions(get().sessions, sessionId);
    }

    set({
      currentSessionId: sessionId,
      currentRun: getSessionLatestRun(nextSession),
      runEventLog: [],
      isOlderMessagesLoading: false,
      olderMessagesError: null,
      hasMoreMessages: false,
      oldestMessageCursor: null,
    });
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
        state.sessions.map((session) =>
          session.id === state.currentSessionId
            ? {
                ...session,
                messages,
                messageCount: messages.length,
                updatedAt: now,
                taskId: state.currentTaskId,
              }
            : session,
        ),
      );

      if (!state.isPersistentMode) {
        persistWorkbenchSessions(nextSessions, state.currentSessionId);
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
        persistWorkbenchSessions(nextSessions, state.currentSessionId);
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
        persistWorkbenchSessions(nextSessions, state.currentSessionId);
      }

      return {
        sessions: nextSessions,
        currentPrompt: normalizedContent,
      };
    });

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
        persistWorkbenchSessions(nextSessions, state.currentSessionId);
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
      set({
        sessions: [],
        currentSessionId: '',
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
    const activeSession = sessions.find((session) => session.id === targetConversation.id) ?? sessions[0];

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
    const currentSession =
      anonymousState.sessions.find((session) => session.id === anonymousState.activeSessionId) ??
      anonymousState.sessions[0];

    set((state) => ({
      sessions: anonymousState.sessions,
      currentSessionId: currentSession?.id ?? anonymousState.activeSessionId,
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
      ...createSessionUiState(currentSession, state.currentTaskId),
    }));
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
      sessions: state.sessions.map((session) =>
        session.id === sessionId
          ? {
              ...session,
              messages: mergeSessionMessages(session.messages, olderMessages),
              messageCount: Math.max(
                session.messageCount ?? 0,
                session.messages.length + olderMessages.length,
              ),
            }
          : session,
      ),
      isOlderMessagesLoading: false,
      olderMessagesError: null,
      hasMoreMessages: Boolean(result.data.nextCursor),
      oldestMessageCursor: result.data.nextCursor,
      persistenceError: null,
    }));
  },
  ensureCurrentPersistentConversation: async () => {
    const currentState = get();
    const authContext = getPersistenceAuthContext({
      allowCloudBasePersistence: shouldAllowCloudBaseForProvider(currentState.currentModelProvider),
    });

    if (!authContext) {
      return get().currentSessionId;
    }

    const currentSession = currentState.sessions.find((session) => session.id === currentState.currentSessionId);
    const firstUserMessage = currentSession?.messages.find((message) => message.role === 'user')?.content ?? '';
    const conversationTitle =
      currentSession?.title && currentSession.title !== '新会话'
        ? currentSession.title
        : createSessionTitle(currentState.chatDraft || currentState.currentPrompt || firstUserMessage);

    if (
      currentState.isPersistentMode &&
      currentSession &&
      isPersistentStateCompatibleWithAuthContext(authContext, currentState.persistentUserId)
    ) {
      return currentSession.id;
    }

    const result = await createConversation(
      {
        title: conversationTitle,
        mode: getConversationModeForProvider(currentState.currentModelProvider),
        metadata: createConversationMetadataForSession(currentSession, currentState.currentTaskId),
      },
      authContext.accessToken,
    );

    if (!result.ok) {
      set({
        conversationListError: result.message,
        persistenceError: result.message,
      });
      return null;
    }

    const nextSession = conversationRecordToWorkbenchSession(result.data, currentSession?.messages ?? []);

    set((state) => ({
      sessions: sortSessionsByUpdatedAt([nextSession, ...state.sessions.filter((session) => session.id !== nextSession.id)]),
      currentSessionId: nextSession.id,
      isPersistentMode: true,
      persistentUserId: authContext.userId,
      conversationListError: null,
      persistenceError: null,
    }));

    return nextSession.id;
  },
  persistMessageToConversation: async (conversationId, message) => {
    const authContext = getPersistenceAuthContext({
      allowCloudBasePersistence: shouldUseCloudBaseForPersistentState(get().persistentUserId),
    });

    if (!authContext || !get().isPersistentMode) {
      return;
    }

    if (shouldSkipCloudBaseAgentAssistantPersist(authContext, message)) {
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

    if (message.role === 'user') {
      const currentSession = get().sessions.find((session) => session.id === conversationId);
      const shouldUpdateTitle =
        currentSession &&
        currentSession.title.trim() !== '新会话' &&
        currentSession.messages.filter((sessionMessage) => sessionMessage.role === 'user').length === 1;

      if (shouldUpdateTitle && !isCloudBaseAuthContext(authContext)) {
        void updateConversation(
          conversationId,
          {
            title: currentSession.title,
          },
          authContext.accessToken,
        );
      }
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
        persistWorkbenchSessions(nextSessions, state.currentSessionId);
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

      const fallbackSession = currentState.sessions[0];
      const nextSession = currentState.sessions.find((session) => session.id === state.sessionId) ?? fallbackSession;
      const nextTaskId = state.taskId ?? nextSession?.taskId ?? DEFAULT_TASK_ID;
      const matchedTask = mockTasks.find((task) => task.id === nextTaskId);

      if (nextSession) {
        persistWorkbenchSessions(currentState.sessions, nextSession.id);
      }

      return {
        currentSessionId: nextSession?.id ?? currentState.currentSessionId,
        ...createSessionUiState(nextSession, matchedTask?.id ?? DEFAULT_TASK_ID),
      };
    });
  },
});
