import type { StateCreator } from 'zustand';
import { mockAgentSteps } from '../../mocks/agentSteps';
import { mockTasks } from '../../mocks/tasks';
import type { SessionSlice, WorkbenchStore } from '../../types/workbench';
import { createMessageId } from '../../utils/message';
import {
  createInitialAgentSteps,
  createSessionTitle,
  createSessionId,
  initialWorkbenchState,
  persistWorkbenchSessions,
  sortSessionsByUpdatedAt,
  updateCurrentSessionAssistantInSessions,
  DEFAULT_TASK_ID,
} from './shared';

export const createSessionSlice: StateCreator<WorkbenchStore, [], [], SessionSlice> = (set, get) => ({
  sessions: initialWorkbenchState.sessions,
  currentSessionId: initialWorkbenchState.currentSessionId,
  currentTaskId: initialWorkbenchState.currentTaskId,
  currentPrompt: initialWorkbenchState.currentPrompt,
  activeAssistantMessageId: initialWorkbenchState.activeAssistantMessageId,
  persistSessions: (sessions) => {
    persistWorkbenchSessions(sortSessionsByUpdatedAt(sessions));
  },
  createSession: () => {
    const sessionId = createSessionId();
    const now = Date.now();
    const newSession = {
      id: sessionId,
      title: '新会话',
      updatedAt: now,
      taskId: get().currentTaskId,
      messages: [],
    };

    set((state) => {
      const nextSessions = sortSessionsByUpdatedAt([newSession, ...state.sessions]);
      persistWorkbenchSessions(nextSessions);

      return {
        sessions: nextSessions,
        currentSessionId: sessionId,
        currentPrompt: '',
        assistantStream: {
          content: '',
          status: 'idle',
        },
        activeAssistantMessageId: '',
        generationStatus: 'idle',
        realModelNotice: '',
        errorMessage: undefined,
        visibleToolCallIds: [],
        showKnowledgeSources: false,
        showAnalyticsResult: false,
        confirmStatus: 'waiting',
        finalMessage: {
          content: '',
          status: 'hidden',
        },
        agentSteps: createInitialAgentSteps(),
      };
    });

    return sessionId;
  },
  switchSession: (sessionId) => {
    set((state) => {
      const nextSession = state.sessions.find((session) => session.id === sessionId);

      if (!nextSession) {
        return state;
      }

      const userMessage = [...nextSession.messages].reverse().find((message) => message.role === 'user');
      const assistantMessage = [...nextSession.messages].reverse().find((message) => message.role === 'assistant');
      const hasAssistantReply = Boolean(assistantMessage?.content?.trim());

      return {
        currentSessionId: nextSession.id,
        currentTaskId: nextSession.taskId ?? state.currentTaskId,
        currentPrompt: userMessage?.content ?? '',
        activeAssistantMessageId: assistantMessage?.id ?? '',
        assistantStream: {
          content: assistantMessage?.content ?? '',
          status: hasAssistantReply ? 'done' : 'idle',
        },
        generationStatus: hasAssistantReply ? 'done' : 'idle',
        realModelNotice: '',
        errorMessage: undefined,
        confirmStatus: 'waiting',
        finalMessage: {
          content: '',
          status: 'hidden',
        },
        visibleToolCallIds: hasAssistantReply ? ['tool_knowledge_search', 'tool_query_data'] : [],
        showKnowledgeSources: hasAssistantReply,
        showAnalyticsResult: hasAssistantReply,
        agentSteps: hasAssistantReply ? mockAgentSteps.map((step) => ({ ...step })) : createInitialAgentSteps(),
      };
    });
  },
  setCurrentSessionId: (sessionId) => {
    set({ currentSessionId: sessionId });
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
                updatedAt: now,
                taskId: state.currentTaskId,
              }
            : session
        )
      );

      persistWorkbenchSessions(nextSessions);

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
        content
      );

      persistWorkbenchSessions(nextSessions);

      return {
        sessions: nextSessions,
      };
    });
  },
  appendUserMessageToCurrentSession: (content) => {
    const normalizedContent = content.trim();

    if (!normalizedContent) {
      return;
    }

    set((state) => {
      const now = Date.now();
      const userMessage = {
        id: createMessageId('user'),
        role: 'user' as const,
        content: normalizedContent,
        createdAt: now,
      };

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
            messages: [...session.messages, userMessage],
          };
        })
      );

      persistWorkbenchSessions(nextSessions);

      return {
        sessions: nextSessions,
        currentPrompt: normalizedContent,
      };
    });
  },
  appendAssistantMessageToCurrentSession: (content) => {
    const normalizedContent = content.trim();

    if (!normalizedContent) {
      return;
    }

    set((state) => {
      const now = Date.now();
      const assistantMessage = {
        id: createMessageId('assistant'),
        role: 'assistant' as const,
        content: normalizedContent,
        createdAt: now,
      };

      const nextSessions = sortSessionsByUpdatedAt(
        state.sessions.map((session) =>
          session.id === state.currentSessionId
            ? {
                ...session,
                updatedAt: now,
                taskId: state.currentTaskId,
                messages: [...session.messages, assistantMessage],
              }
            : session
        )
      );

      persistWorkbenchSessions(nextSessions);

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
  },
  startTask: (taskId, prompt) => {
    set((state) => {
      const nextSessions = state.sessions.map((session) =>
        session.id === state.currentSessionId
          ? {
              ...session,
              taskId,
            }
          : session
      );

      persistWorkbenchSessions(nextSessions);

      return {
        sessions: nextSessions,
        currentTaskId: taskId,
      };
    });

    void get().runPromptWithCurrentModel(prompt);
  },
  hydrateFromUrl: (state) => {
    set((currentState) => {
      const fallbackSession = currentState.sessions[0];
      const nextSession = currentState.sessions.find((session) => session.id === state.sessionId) ?? fallbackSession;
      const nextTaskId = state.taskId ?? nextSession?.taskId ?? DEFAULT_TASK_ID;
      const matchedTask = mockTasks.find((task) => task.id === nextTaskId);
      const userMessage = [...(nextSession?.messages ?? [])].reverse().find((message) => message.role === 'user');
      const assistantMessage = [...(nextSession?.messages ?? [])]
        .reverse()
        .find((message) => message.role === 'assistant');
      const hasAssistantReply = Boolean(assistantMessage?.content?.trim());

      return {
        currentSessionId: nextSession?.id ?? currentState.currentSessionId,
        currentTaskId: matchedTask?.id ?? DEFAULT_TASK_ID,
        currentPrompt: userMessage?.content ?? '',
        activeAssistantMessageId: assistantMessage?.id ?? '',
        assistantStream: {
          content: assistantMessage?.content ?? '',
          status: hasAssistantReply ? 'done' : 'idle',
        },
        generationStatus: hasAssistantReply ? 'done' : 'idle',
        realModelNotice: '',
        errorMessage: undefined,
        confirmStatus: 'waiting',
        finalMessage: {
          content: '',
          status: 'hidden',
        },
        visibleToolCallIds: hasAssistantReply ? ['tool_knowledge_search', 'tool_query_data'] : [],
        showKnowledgeSources: hasAssistantReply,
        showAnalyticsResult: hasAssistantReply,
        agentSteps: hasAssistantReply ? mockAgentSteps.map((step) => ({ ...step })) : createInitialAgentSteps(),
      };
    });
  },
});
