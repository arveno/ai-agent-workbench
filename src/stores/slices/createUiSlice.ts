import type { StateCreator } from 'zustand';
import { streamAgentRunAnalysis } from '../../services/agentRunStreamApi';
import type { RunConclusionSource, UiSlice, WorkbenchStore } from '../../types/workbench';
import { createAgentPendingRunStartedEvent } from '../../utils/agentRunMapping';

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
  return error instanceof DOMException && error.name === 'AbortError';
}

export const createUiSlice: StateCreator<WorkbenchStore, [], [], UiSlice> = (set, get) => ({
  isDataSourceModalOpen: false,
  isToolLibraryModalOpen: false,
  isWorkflowModalOpen: false,
  chatDraft: '',
  currentAgentRun: null,
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
    const state = get();
    const prompt = (promptOverride ?? state.chatDraft).trim();

    if (!prompt) {
      set({
        agentRunStatus: 'error',
        agentRunErrorMessage: '请输入要分析的问题后再发送。',
      });
      return;
    }

    const apiKey = state.modelConfigs.groq?.apiKey?.trim();
    const requestId = createAgentRunRequestId();
    const sessionId = state.currentSessionId;
    const abortController = new AbortController();
    const previousAbortController = state.activeAgentRunAbortController;
    const pendingRunEvent = createAgentPendingRunStartedEvent({
      prompt,
      provider: 'supabase',
    });
    let finalConclusion = '';
    let finalConclusionSource: RunConclusionSource = 'fallback';
    let finalConclusionNotice: string | undefined;
    let hasFailed = false;
    let hasAppendedFinalMessage = false;

    previousAbortController?.abort();

    get().appendUserMessageToCurrentSession(prompt);
    get().applyRunEvent(pendingRunEvent);
    get().clearChatDraft();

    set({
      activeAgentRunRequestId: requestId,
      activeAgentRunAbortController: abortController,
      currentAgentRun: null,
      agentRunStatus: 'running',
      agentRunErrorMessage: null,
      generationStatus: 'streaming',
      realModelNotice: '',
      errorMessage: undefined,
      confirmStatus: 'cancelled',
      finalMessage: {
        content: '',
        status: 'hidden',
      },
      currentReportRunId: null,
      reportActionState: 'skipped',
    });

    try {
      await streamAgentRunAnalysis({
        prompt,
        provider: 'supabase',
        apiKey: apiKey || undefined,
        signal: abortController.signal,
        onEvent: (event) => {
          const current = get();

          if (current.activeAgentRunRequestId !== requestId || current.currentSessionId !== sessionId) {
            return;
          }

          get().applyRunEvent(event);

          if (event.type === 'conclusion_completed') {
            finalConclusion = event.conclusion;
            finalConclusionSource = event.conclusionSource;
            finalConclusionNotice = event.conclusionNotice;
            return;
          }

          if (event.type === 'report_pending') {
            set({
              currentReportRunId: event.runId,
              reportActionState: 'pending',
            });
            return;
          }

          if (event.type === 'run_failed') {
            hasFailed = true;
            set({
              agentRunStatus: 'error',
              agentRunErrorMessage: event.errorMessage,
              generationStatus: 'error',
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
          finalMessage: {
            content: '',
            status: 'hidden',
          },
          visibleToolCallIds: [],
          showKnowledgeSources: false,
          showAnalyticsResult: false,
          activeAgentRunRequestId: null,
          activeAgentRunAbortController: null,
        });

        const assistantMessage = buildAgentConclusionMessage(
          finalConclusion,
          finalConclusionSource === 'fallback' ? finalConclusionNotice : undefined
        );

        if (assistantMessage) {
          hasAppendedFinalMessage = true;
          get().appendAssistantMessageToCurrentSession(assistantMessage);
        }

        return;
      }

      set({
        activeAgentRunRequestId: null,
        activeAgentRunAbortController: null,
      });
    } catch {
      if (get().activeAgentRunRequestId !== requestId || get().currentSessionId !== sessionId) {
        return;
      }

      if (isAbortError(abortController.signal.reason)) {
        return;
      }

      const activeRunId = get().currentRun?.id ?? pendingRunEvent.run.id;
      const errorMessage = 'Agent Run 流式请求失败，请检查数据源连接或服务端状态。';

      get().applyRunEvent({
        type: 'run_failed',
        runId: activeRunId,
        errorMessage,
      });

      set({
        agentRunStatus: 'error',
        agentRunErrorMessage: errorMessage,
        generationStatus: 'error',
        confirmStatus: 'cancelled',
        currentReportRunId: null,
        reportActionState: 'skipped',
        activeAgentRunRequestId: null,
        activeAgentRunAbortController: null,
      });
    } finally {
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
          get().appendAssistantMessageToCurrentSession(assistantMessage);
        }
      }
    }
  },
  clearCurrentAgentRun: () => {
    get().activeAgentRunAbortController?.abort();
    set({
      currentAgentRun: null,
      currentRun: null,
      runEventLog: [],
      agentRunStatus: 'idle',
      agentRunErrorMessage: null,
      activeAgentRunRequestId: null,
      activeAgentRunAbortController: null,
      currentReportRunId: null,
      reportActionState: 'skipped',
    });
  },
});
