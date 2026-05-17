import type { StateCreator } from 'zustand';
import { streamAgentRunAnalysis } from '../../services/agentRunStreamApi';
import type { RunConclusionSource, UiSlice, WorkbenchStore } from '../../types/workbench';
import { createAgentPendingRunStartedEvent } from '../../utils/agentRunMapping';
import { createRunId } from '../../utils/run';
import { useAuthStore } from '../authStore';

function buildAgentConclusionMessage(conclusion: string, notice?: string): string {
  const normalizedConclusion = conclusion.trim();

  if (!normalizedConclusion) {
    return '';
  }

  const normalizedNotice = notice?.trim();

  return [
    '### 真实 Agent 分析结果',
    '',
    normalizedConclusion,
    '',
    normalizedNotice
      ? `> 提示：${normalizedNotice}`
      : '本次分析已通过数据源、工具调用和模型总结完成，右侧可查看执行步骤与工具结果。',
  ].join('\n');
}

function createAgentRunRequestId(): string {
  return `agent_request_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return true;
  }

  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name?: unknown }).name === 'AbortError'
  );
}

const AGENT_UNAVAILABLE_HINT = '真实 Agent 需要登录或有效额度，可切换公开演示模式继续体验完整流程。';

let agentRunStartInFlight = false;

function isAgentRunInProgress(state: WorkbenchStore): boolean {
  return (
    state.agentRunStatus === 'running' ||
    Boolean(state.activeAgentRunRequestId) ||
    (state.currentRun?.mode === 'agent' && state.currentRun.status === 'running')
  );
}

function withDemoFallbackHint(message: string): string {
  const normalizedMessage = message.trim();

  if (!normalizedMessage) {
    return AGENT_UNAVAILABLE_HINT;
  }

  if (normalizedMessage.includes(AGENT_UNAVAILABLE_HINT)) {
    return normalizedMessage;
  }

  return `${normalizedMessage}\n\n${AGENT_UNAVAILABLE_HINT}`;
}

function getAgentRunErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  return 'Agent Run 流式请求失败，请检查数据源连接或服务端状态。';
}

export const createUiSlice: StateCreator<WorkbenchStore, [], [], UiSlice> = (set, get) => ({
  isDataSourceModalOpen: false,
  isToolLibraryModalOpen: false,
  isWorkflowModalOpen: false,
  chatDraft: '',
  agentRunStatus: 'idle',
  agentRunErrorMessage: null,
  activeAgentRunRequestId: null,
  activeAgentRunAbortController: null,
  currentReportRunId: null,
  reportActionState: 'skipped',
  openDataSourceModal: () => {
    set({ isDataSourceModalOpen: true });
  },
  closeDataSourceModal: () => {
    set({ isDataSourceModalOpen: false });
  },
  openToolLibraryModal: () => {
    set({ isToolLibraryModalOpen: true });
  },
  closeToolLibraryModal: () => {
    set({ isToolLibraryModalOpen: false });
  },
  openWorkflowModal: () => {
    set({ isWorkflowModalOpen: true });
  },
  closeWorkflowModal: () => {
    set({ isWorkflowModalOpen: false });
  },
  setChatDraft: (value) => {
    set({ chatDraft: value });
  },
  clearChatDraft: () => {
    set({ chatDraft: '' });
  },
  runCurrentAgentAnalysis: async (promptOverride) => {
    const initialState = get();
    const prompt = (promptOverride ?? initialState.chatDraft).trim();

    if (!prompt) {
      set({
        agentRunStatus: 'error',
        agentRunErrorMessage: '请输入要分析的问题后再发送。',
      });
      return;
    }

    if (agentRunStartInFlight || isAgentRunInProgress(initialState)) {
      return;
    }

    agentRunStartInFlight = true;

    const ensuredConversationId = await get().ensureCurrentPersistentConversation().catch(() => null);

    if (ensuredConversationId === null) {
      agentRunStartInFlight = false;
      set({
        agentRunStatus: 'error',
        agentRunErrorMessage: '创建真实会话失败，请稍后重试。',
      });
      return;
    }

    const state = get();
    const requestId = createAgentRunRequestId();
    const sessionId = state.currentSessionId;
    const runId = createRunId('agent_run');
    const abortController = new AbortController();
    const previousAbortController = state.activeAgentRunAbortController;
    const pendingRunEvent = createAgentPendingRunStartedEvent({
      runId,
      prompt,
      provider: 'supabase',
      sessionId,
    });
    let finalConclusion = '';
    let finalConclusionSource: RunConclusionSource = 'fallback';
    let finalConclusionNotice: string | undefined;
    let hasFailed = false;
    let hasAppendedFinalMessage = false;

    if (state.currentRun?.mode === 'agent' && state.currentRun.status === 'running') {
      get().applyRunEvent({
        type: 'run_stopped',
        runId: state.currentRun.id,
      });
    }

    try {
      previousAbortController?.abort();

      const userMessage = get().appendUserMessageToCurrentSession(prompt, {
        runId,
        kind: 'normal',
      });

      if (userMessage && get().isPersistentMode) {
        void get().persistMessageToConversation(sessionId, userMessage);
      }

      get().applyRunEvent(pendingRunEvent);
      get().clearChatDraft();

      set({
        activeAgentRunRequestId: requestId,
        activeAgentRunAbortController: abortController,
        agentRunStatus: 'running',
        agentRunErrorMessage: null,
        generationStatus: 'streaming',
        realModelNotice: '',
        errorMessage: undefined,
        confirmStatus: 'cancelled',
        currentReportRunId: null,
        reportActionState: 'skipped',
        isRagSourcesLoading: false,
        ragSourcesError: null,
      });
    } finally {
      agentRunStartInFlight = false;
    }

    try {
      const authState = useAuthStore.getState();
      const accessToken = authState.accessToken ?? authState.session?.access_token;

      await streamAgentRunAnalysis({
        prompt,
        provider: 'supabase',
        conversationId: sessionId,
        clientRunId: runId,
        accessToken,
        signal: abortController.signal,
        onEvent: (event) => {
          const current = get();

          if (current.activeAgentRunRequestId !== requestId || current.currentSessionId !== sessionId) {
            return;
          }

          const normalizedEvent =
            event.type === 'run_failed'
              ? {
                  ...event,
                  errorMessage: withDemoFallbackHint(event.errorMessage),
                }
              : event;

          get().applyRunEvent(normalizedEvent);

          if (normalizedEvent.type === 'conclusion_completed') {
            finalConclusion = normalizedEvent.conclusion;
            finalConclusionSource = normalizedEvent.conclusionSource;
            finalConclusionNotice = normalizedEvent.conclusionNotice;
            return;
          }

          if (normalizedEvent.type === 'report_pending') {
            set({
              currentReportRunId: normalizedEvent.runId,
              reportActionState: 'pending',
            });
            return;
          }

          if (normalizedEvent.type === 'run_failed') {
            hasFailed = true;
            set({
              agentRunStatus: 'error',
              agentRunErrorMessage: normalizedEvent.errorMessage,
              generationStatus: 'error',
              realModelNotice: AGENT_UNAVAILABLE_HINT,
              confirmStatus: 'cancelled',
              currentReportRunId: null,
              reportActionState: 'skipped',
            });
          }
        },
      });

      if (get().activeAgentRunRequestId !== requestId || get().currentSessionId !== sessionId) {
        return;
      }

      if (!hasFailed) {
        set({
          agentRunStatus: 'success',
          agentRunErrorMessage: null,
          generationStatus: 'done',
          confirmStatus: get().currentRun?.reportState === 'pending' ? 'waiting' : 'cancelled',
          activeAgentRunRequestId: null,
          activeAgentRunAbortController: null,
        });

        const assistantMessage = buildAgentConclusionMessage(
          finalConclusion,
          finalConclusionSource === 'fallback' ? finalConclusionNotice : undefined
        );

        if (assistantMessage) {
          hasAppendedFinalMessage = true;
          const persistedAssistantMessage = get().appendAssistantMessageToCurrentSession(assistantMessage, {
            runId,
            kind: 'normal',
          });

          if (persistedAssistantMessage && get().isPersistentMode) {
            void get().persistMessageToConversation(sessionId, persistedAssistantMessage);
          }
        }

        return;
      }

      set({
        activeAgentRunRequestId: null,
        activeAgentRunAbortController: null,
      });
    } catch (error) {
      if (get().activeAgentRunRequestId !== requestId || get().currentSessionId !== sessionId) {
        return;
      }

      if (isAbortError(error)) {
        const activeRun = get().currentRun;

        if (activeRun?.mode === 'agent' && activeRun.status === 'running') {
          get().applyRunEvent({
            type: 'run_stopped',
            runId: activeRun.id,
          });
        }

        set({
          agentRunStatus: 'stopped',
          agentRunErrorMessage: null,
          generationStatus: 'stopped',
          confirmStatus: 'cancelled',
          activeAgentRunRequestId: null,
          activeAgentRunAbortController: null,
        });
        return;
      }

      const activeRunId = get().currentRun?.id ?? pendingRunEvent.run.id;
      const errorMessage = withDemoFallbackHint(getAgentRunErrorMessage(error));

      get().applyRunEvent({
        type: 'run_failed',
        runId: activeRunId,
        errorMessage,
      });

      set({
        agentRunStatus: 'error',
        agentRunErrorMessage: errorMessage,
        generationStatus: 'error',
        realModelNotice: AGENT_UNAVAILABLE_HINT,
        confirmStatus: 'cancelled',
        currentReportRunId: null,
        reportActionState: 'skipped',
        activeAgentRunRequestId: null,
        activeAgentRunAbortController: null,
      });
    } finally {
      agentRunStartInFlight = false;
      void useAuthStore.getState().refreshAgentAccess();
      void get().loadRecentTools();

      if (
        get().activeAgentRunRequestId === requestId &&
        get().currentSessionId === sessionId &&
        finalConclusion.trim() &&
        !hasFailed &&
        !hasAppendedFinalMessage
      ) {
        const assistantMessage = buildAgentConclusionMessage(
          finalConclusion,
          finalConclusionSource === 'fallback' ? finalConclusionNotice : undefined
        );

        if (assistantMessage) {
          const persistedAssistantMessage = get().appendAssistantMessageToCurrentSession(assistantMessage, {
            runId,
            kind: 'normal',
          });

          if (persistedAssistantMessage && get().isPersistentMode) {
            void get().persistMessageToConversation(sessionId, persistedAssistantMessage);
          }
        }
      }
    }
  },
});
