import type { StateCreator } from 'zustand';
import type { UiSlice, WorkbenchStore } from '../../types/workbench';
import { runAgentAnalysis } from '../../services/agentRunApi';
import { createAgentPendingRunStartedEvent, mapAgentRunResultToRunSnapshot } from '../../utils/agentRunMapping';

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

export const createUiSlice: StateCreator<WorkbenchStore, [], [], UiSlice> = (set, get) => ({
  isDataSourceModalOpen: false,
  isToolLibraryModalOpen: false,
  isWorkflowModalOpen: false,
  chatDraft: '',
  currentAgentRun: null,
  agentRunStatus: 'idle',
  agentRunErrorMessage: null,
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
    const pendingRunEvent = createAgentPendingRunStartedEvent({
      prompt,
      provider: 'supabase',
    });
    const pendingRunId = pendingRunEvent.run.id;

    get().appendUserMessageToCurrentSession(prompt);
    get().applyRunEvent(pendingRunEvent);
    get().clearChatDraft();

    set({
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
      const response = await runAgentAnalysis({
        prompt,
        provider: 'supabase',
        apiKey: apiKey || undefined,
      });

      if (get().currentRun?.id !== pendingRunId) {
        return;
      }

      if (response.ok) {
        const isDataAnalysisRun =
          response.run.plan?.intent === 'data_analysis' || response.run.toolInvocations.length > 0;
        const finalRun = mapAgentRunResultToRunSnapshot(response.run);
        const assistantMessage = buildAgentConclusionMessage(
          response.run.conclusion,
          response.run.conclusionSource === 'fallback' ? response.run.conclusionNotice : undefined
        );

        get().applyRunEvent({
          type: 'run_started',
          run: finalRun,
        });

        set({
          currentAgentRun: response.run,
          agentRunStatus: 'success',
          agentRunErrorMessage: null,
          generationStatus: 'done',
          confirmStatus: isDataAnalysisRun && response.run.status === 'success' ? 'waiting' : 'cancelled',
          finalMessage: {
            content: '',
            status: 'hidden',
          },
          visibleToolCallIds: [],
          showKnowledgeSources: false,
          showAnalyticsResult: false,
          currentReportRunId:
            isDataAnalysisRun && response.run.status === 'success' && Boolean(response.run.conclusion.trim())
              ? response.run.id
              : null,
          reportActionState:
            isDataAnalysisRun && response.run.status === 'success' && Boolean(response.run.conclusion.trim())
              ? 'pending'
              : 'skipped',
        });

        if (assistantMessage) {
          get().appendAssistantMessageToCurrentSession(assistantMessage);
        }

        return;
      }

      get().applyRunEvent({
        type: 'run_failed',
        runId: pendingRunId,
        errorMessage: response.errorMessage,
      });

      set({
        agentRunStatus: 'error',
        agentRunErrorMessage: response.errorMessage,
        generationStatus: 'error',
        confirmStatus: 'cancelled',
        currentReportRunId: null,
        reportActionState: 'skipped',
      });
    } catch {
      if (get().currentRun?.id !== pendingRunId) {
        return;
      }

      get().applyRunEvent({
        type: 'run_failed',
        runId: pendingRunId,
        errorMessage: 'Agent Run 执行失败，请检查数据源连接或服务端状态。',
      });

      set({
        agentRunStatus: 'error',
        agentRunErrorMessage: 'Agent Run 执行失败，请检查数据源连接或服务端状态。',
        generationStatus: 'error',
        confirmStatus: 'cancelled',
        currentReportRunId: null,
        reportActionState: 'skipped',
      });
    }
  },
  clearCurrentAgentRun: () => {
    set({
      currentAgentRun: null,
      currentRun: null,
      runEventLog: [],
      agentRunStatus: 'idle',
      agentRunErrorMessage: null,
      currentReportRunId: null,
      reportActionState: 'skipped',
    });
  },
});
