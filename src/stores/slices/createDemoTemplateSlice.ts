import type { StateCreator } from 'zustand';
import { isCloudBasePrivateApiEnabled } from '../../services/cloudbaseApiClient';
import { createConversation } from '../../services/conversationApi';
import {
  copyDemoConversationTemplate as copyDemoConversationTemplateApi,
  fetchDemoConversations,
  fetchDemoTasks,
} from '../../services/demoTemplateApi';
import type { DemoConversationTemplateRecord, DemoSeedMessage, DemoTaskTemplateRecord } from '../../types/persistence';
import type { DemoTemplateSlice, WorkbenchSession, WorkbenchStore } from '../../types/workbench';
import { conversationRecordToSession } from '../../utils/conversationMapper';
import {
  demoConversationCopyToSession,
  findConversationTemplateForTask,
  getDemoTemplateStringArrayMetadata,
  getDemoTemplateStringMetadata,
} from '../../utils/demoTemplateMapper';
import { useAuthStore } from '../authStore';
import {
  createEmptySession,
  getSessionLatestAssistantReply,
  getSessionLatestPrompt,
  getSessionLatestRun,
  persistWorkbenchSessions,
  sortSessionsByUpdatedAt,
} from './shared';

let demoTasksRequestId = 0;
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

function getPersistenceAccessToken(): string | null {
  if (isCloudBasePrivateApiEnabled()) {
    return getAccessToken();
  }

  return getAccessToken();
}

function getPersistenceUserId(): string | null {
  if (isCloudBasePrivateApiEnabled()) {
    return getAuthenticatedUserId();
  }

  return getAuthenticatedUserId();
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
  };
}

function upsertSession(sessions: WorkbenchSession[], session: WorkbenchSession): WorkbenchSession[] {
  return sortSessionsByUpdatedAt([session, ...sessions.filter((item) => item.id !== session.id)]);
}

function getWorkbenchMessageKind(kind: DemoSeedMessage['kind']) {
  if (kind === 'report') return 'report' as const;
  if (kind === 'error') return 'error' as const;
  return 'normal' as const;
}

function createAnonymousSessionFromTemplate(template: DemoConversationTemplateRecord): WorkbenchSession {
  const now = Date.now();
  const messages = template.seed_messages.map((message, index) => ({
    id: `demo_seed_${template.id}_${index + 1}`,
    role: message.role === 'user' ? ('user' as const) : ('assistant' as const),
    kind: getWorkbenchMessageKind(message.kind),
    content: message.content,
    createdAt: now + index,
  }));

  return {
    ...createEmptySession({
      title: template.title,
      taskId: template.id,
    }),
    updatedAt: now,
    messages,
    summary: template.description,
    mode: 'mock',
    status: 'active',
    messageCount: messages.length,
  };
}

function createDemoTaskConversationMetadata(task: DemoTaskTemplateRecord, executionMode: 'agent' | 'mock') {
  return {
    copiedFromDemoTaskId: task.id,
    copiedFromDemoTaskTitle: task.title,
    demoTaskCategory: task.category,
    recommendedMode: task.recommended_mode,
    executionMode,
    showcaseValue: getDemoTemplateStringMetadata(task.metadata, 'showcaseValue'),
    tags: getDemoTemplateStringArrayMetadata(task.metadata, 'tags'),
  };
}

function createAnonymousSessionFromTask(task: DemoTaskTemplateRecord): WorkbenchSession {
  return {
    ...createEmptySession({
      title: task.title,
      taskId: task.id,
    }),
    summary: task.description,
    mode: 'mock',
    status: 'active',
  };
}

function findDemoTask(tasks: DemoTaskTemplateRecord[], taskId: string): DemoTaskTemplateRecord | null {
  return tasks.find((item) => item.id === taskId) ?? null;
}

export const createDemoTemplateSlice: StateCreator<WorkbenchStore, [], [], DemoTemplateSlice> = (set, get) => ({
  demoTasks: [],
  demoConversations: [],
  isDemoTasksLoading: false,
  demoTasksError: null,
  isDemoConversationsLoading: false,
  demoConversationsError: null,
  isCopyingDemoTemplate: false,
  copyDemoTemplateError: null,
  pendingDemoTaskId: null,
  isDemoTaskChoiceOpen: false,
  demoTaskChoiceError: null,

  loadDemoTasks: async () => {
    if (get().isDemoTasksLoading) {
      return;
    }

    const requestId = demoTasksRequestId + 1;
    demoTasksRequestId = requestId;
    set({
      isDemoTasksLoading: true,
      demoTasksError: null,
    });

    const result = await fetchDemoTasks();

    if (requestId !== demoTasksRequestId) {
      return;
    }

    if (!result.ok) {
      set({
        isDemoTasksLoading: false,
        demoTasksError: result.message,
      });
      return;
    }

    set({
      demoTasks: result.data.tasks,
      isDemoTasksLoading: false,
      demoTasksError: null,
    });
  },

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

  retryLoadDemoTasks: async () => {
    await get().loadDemoTasks();
  },

  retryLoadDemoConversations: async () => {
    await get().loadDemoConversations();
  },

  startDemoTask: async (taskId) => {
    if (get().isCopyingDemoTemplate) {
      return null;
    }

    const task = findDemoTask(get().demoTasks, taskId);

    if (!task) {
      set({
        demoTaskChoiceError: '未找到示例任务。',
        copyDemoTemplateError: '未找到示例任务。',
      });
      return null;
    }

    if (task.recommended_mode === 'agent') {
      set({
        pendingDemoTaskId: task.id,
        isDemoTaskChoiceOpen: true,
        demoTaskChoiceError: null,
        copyDemoTemplateError: null,
      });
      return null;
    }

    const conversationTemplate = findConversationTemplateForTask(task, get().demoConversations);

    if (conversationTemplate) {
      return get().copyDemoConversationTemplate(conversationTemplate.id);
    }

    return get().runDemoTaskAsMock(task.id);
  },

  confirmRunDemoTaskWithAgent: async (taskId) => {
    if (get().isCopyingDemoTemplate) {
      return null;
    }

    const task = findDemoTask(get().demoTasks, taskId);

    if (!task) {
      set({
        demoTaskChoiceError: '未找到示例任务。',
        copyDemoTemplateError: '未找到示例任务。',
      });
      return null;
    }

    const accessToken = getPersistenceAccessToken();

    if (!accessToken) {
      set({
        demoTaskChoiceError: '请先登录后使用真实 Agent。',
      });
      return null;
    }

    set({
      isCopyingDemoTemplate: true,
      copyDemoTemplateError: null,
      demoTaskChoiceError: null,
    });

    const result = await createConversation(
      {
        title: task.title,
        mode: 'agent',
        summary: task.description,
        metadata: createDemoTaskConversationMetadata(task, 'agent'),
      },
      accessToken,
    );

    if (!result.ok) {
      set({
        isCopyingDemoTemplate: false,
        demoTaskChoiceError: result.message,
      });
      return null;
    }

    const session: WorkbenchSession = {
      ...conversationRecordToSession(result.data),
      taskId: task.id,
    };

    set((state) => ({
      sessions: upsertSession(state.sessions, session),
      currentSessionId: session.id,
      isPersistentMode: true,
      persistentUserId: getPersistenceUserId(),
      isCopyingDemoTemplate: false,
      isDemoTaskChoiceOpen: false,
      pendingDemoTaskId: null,
      demoTaskChoiceError: null,
      copyDemoTemplateError: null,
      ...createSessionUiState(session, state.currentTaskId),
    }));

    get().setCurrentModelProvider('groq');
    get().sendPrompt(task.prompt);

    return session.id;
  },

  runDemoTaskAsMock: async (taskId) => {
    if (get().isCopyingDemoTemplate) {
      return null;
    }

    const task = findDemoTask(get().demoTasks, taskId);

    if (!task) {
      set({
        demoTaskChoiceError: '未找到示例任务。',
      });
      return null;
    }

    const accessToken = getPersistenceAccessToken();

    set({
      isCopyingDemoTemplate: true,
      copyDemoTemplateError: null,
      demoTaskChoiceError: null,
    });

    if (accessToken) {
      const result = await createConversation(
        {
          title: task.title,
          mode: 'mock',
          summary: task.description,
          metadata: createDemoTaskConversationMetadata(task, 'mock'),
        },
        accessToken,
      );

      if (!result.ok) {
        set({
          isCopyingDemoTemplate: false,
          demoTaskChoiceError: result.message,
          copyDemoTemplateError: result.message,
        });
        return null;
      }

      const session: WorkbenchSession = {
        ...conversationRecordToSession(result.data),
        taskId: task.id,
      };

      set((state) => ({
        sessions: upsertSession(state.sessions, session),
        currentSessionId: session.id,
        isPersistentMode: true,
        persistentUserId: getPersistenceUserId(),
        isCopyingDemoTemplate: false,
        isDemoTaskChoiceOpen: false,
        pendingDemoTaskId: null,
        demoTaskChoiceError: null,
        copyDemoTemplateError: null,
        ...createSessionUiState(session, state.currentTaskId),
      }));

      get().setCurrentModelProvider('mock');
      get().sendPrompt(task.prompt);
      return session.id;
    }

    const session = createAnonymousSessionFromTask(task);

    set((state) => {
      const sessions = upsertSession(state.sessions, session);
      persistWorkbenchSessions(sessions, session.id);

      return {
        sessions,
        currentSessionId: session.id,
        isPersistentMode: false,
        persistentUserId: null,
        isCopyingDemoTemplate: false,
        isDemoTaskChoiceOpen: false,
        pendingDemoTaskId: null,
        demoTaskChoiceError: null,
        copyDemoTemplateError: null,
        ...createSessionUiState(session, state.currentTaskId),
      };
    });

    get().setCurrentModelProvider('mock');
    get().sendPrompt(task.prompt);
    return session.id;
  },

  cancelDemoTaskChoice: () => {
    set({
      pendingDemoTaskId: null,
      isDemoTaskChoiceOpen: false,
      demoTaskChoiceError: null,
    });
  },

  copyDemoConversationTemplate: async (templateId) => {
    if (get().isCopyingDemoTemplate) {
      return null;
    }

    const accessToken = getPersistenceAccessToken();

    if (!accessToken) {
      const template = get().demoConversations.find((item) => item.id === templateId);

      if (!template) {
        set({
          copyDemoTemplateError: '未找到示例会话。',
        });
        return null;
      }

      const session = createAnonymousSessionFromTemplate(template);

      set((state) => {
        const sessions = upsertSession(state.sessions, session);
        persistWorkbenchSessions(sessions, session.id);

        return {
          sessions,
          currentSessionId: session.id,
          isPersistentMode: false,
          persistentUserId: null,
          copyDemoTemplateError: null,
          ...createSessionUiState(session, state.currentTaskId),
        };
      });

      return session.id;
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
      sessions: upsertSession(state.sessions, session),
      currentSessionId: session.id,
      isPersistentMode: true,
      persistentUserId: getPersistenceUserId(),
      isCopyingDemoTemplate: false,
      copyDemoTemplateError: null,
      ...createSessionUiState(session, state.currentTaskId),
    }));

    return session.id;
  },
});
