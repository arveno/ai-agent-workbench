import type { StateCreator } from 'zustand';
import type { UiSlice, WorkbenchStore } from '../../types/workbench';
import { runAgentAnalysis } from '../../services/agentRunApi';

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

    get().appendUserMessageToCurrentSession(prompt);

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
    });

    try {
      const response = await runAgentAnalysis({
        prompt,
        provider: 'supabase',
        apiKey: apiKey || undefined,
      });

      if (response.ok) {
        const isDataAnalysisRun =
          response.run.plan?.intent === 'data_analysis' || response.run.toolInvocations.length > 0;
        const assistantMessage = buildAgentConclusionMessage(
          response.run.conclusion,
          response.run.conclusionSource === 'fallback' ? response.run.conclusionNotice : undefined
        );

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
        });

        if (assistantMessage) {
          get().appendAssistantMessageToCurrentSession(assistantMessage);
        }

        get().clearChatDraft();

        return;
      }

      set({
        agentRunStatus: 'error',
        agentRunErrorMessage: response.errorMessage,
        generationStatus: 'error',
        confirmStatus: 'cancelled',
      });
    } catch {
      set({
        agentRunStatus: 'error',
        agentRunErrorMessage: 'Agent Run 执行失败，请检查数据源连接或服务端状态。',
        generationStatus: 'error',
        confirmStatus: 'cancelled',
      });
    }
  },
  clearCurrentAgentRun: () => {
    set({
      currentAgentRun: null,
      agentRunStatus: 'idle',
      agentRunErrorMessage: null,
    });
  },
});
