import type { StateCreator } from 'zustand';
import type { UiSlice, WorkbenchStore } from '../../types/workbench';
import { runAgentAnalysis } from '../../services/agentRunApi';

const DEFAULT_AGENT_PROMPT = '分析本月教学质量数据，找出异常指标';

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
  runCurrentAgentAnalysis: async () => {
    const state = get();
    const apiKey = state.modelConfigs.groq?.apiKey?.trim();

    set({
      agentRunStatus: 'running',
      agentRunErrorMessage: null,
    });

    try {
      const response = await runAgentAnalysis({
        prompt: DEFAULT_AGENT_PROMPT,
        provider: 'supabase',
        apiKey: apiKey || undefined,
      });

      if (response.ok) {
        const assistantMessage = buildAgentConclusionMessage(
          response.run.conclusion,
          response.run.conclusionSource === 'fallback' ? response.run.conclusionNotice : undefined
        );

        set({
          currentAgentRun: response.run,
          agentRunStatus: 'success',
          agentRunErrorMessage: null,
        });

        if (assistantMessage) {
          get().appendAssistantMessageToCurrentSession(assistantMessage);
        }

        return;
      }

      set({
        agentRunStatus: 'error',
        agentRunErrorMessage: response.errorMessage,
      });
    } catch {
      set({
        agentRunStatus: 'error',
        agentRunErrorMessage: 'Agent Run 执行失败，请检查数据源连接或服务端状态。',
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
