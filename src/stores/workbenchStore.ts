import { create } from 'zustand';
import { mockAgentSteps } from '../mocks/agentSteps';
import { mockTasks } from '../mocks/tasks';
import type {
  AgentStep,
  AgentStepStatus,
  AssistantStreamState,
  ConfirmStatus,
  FinalMessage,
  GenerationStatus,
  ModelProvider,
} from '../types/workbench';
import { streamText } from '../utils/streamText';

const DEFAULT_TASK_ID = 't_month_analytics';
const DEFAULT_PROMPT = '请分析 2026 年 5 月教学质量相关数据，找出异常指标，并给出简短结论。';
const DEFAULT_ASSISTANT_REPLY =
  '我将先检索相关指标口径与教学质量分析规则，再查询本月各年级成绩与出勤数据，随后给出异常项和简短分析结论。';
const FINAL_REPORT_SUMMARY =
  '已基于当前数据生成简短分析结论：本月教学质量整体保持稳定，但七年级平均分和八年级出勤率出现明显波动，建议优先查看七年级周测成绩明细和八年级班级出勤记录，并将两个指标加入后续跟踪。';

function createInitialAgentSteps(): AgentStep[] {
  return [
    { id: 'understand', title: '理解用户问题', status: 'pending' },
    { id: 'search', title: '检索知识库', status: 'pending' },
    { id: 'query', title: '查询业务数据', status: 'pending' },
    { id: 'chart', title: '生成分析图表', status: 'pending' },
    { id: 'confirm', title: '等待用户确认', status: 'pending' },
    { id: 'final', title: '生成最终结论', status: 'pending' },
  ];
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

interface WorkbenchState {
  currentSessionId: string;
  currentTaskId: string;
  currentPrompt: string;
  generationStatus: GenerationStatus;
  errorMessage?: string;
  assistantStream: AssistantStreamState;
  agentSteps: AgentStep[];
  visibleToolCallIds: string[];
  showKnowledgeSources: boolean;
  showAnalyticsResult: boolean;
  confirmStatus: ConfirmStatus;
  finalMessage: FinalMessage;
  currentModelProvider: ModelProvider;
  isModelModalOpen: boolean;
  streamRunId: number;
  setCurrentSessionId: (sessionId: string) => void;
  setCurrentTaskId: (taskId: string) => void;
  setCurrentPrompt: (prompt: string) => void;
  sendPrompt: (prompt: string) => void;
  setAssistantStream: (stream: AssistantStreamState) => void;
  setShowKnowledgeSources: (visible: boolean) => void;
  setShowAnalyticsResult: (visible: boolean) => void;
  resetAgentSteps: () => void;
  setAgentStepStatus: (stepId: string, status: AgentStepStatus) => void;
  showToolCall: (toolCallId: string) => void;
  resetVisibleToolCalls: () => void;
  runAgentStepsPreview: (runId: number) => Promise<void>;
  triggerMockError: () => void;
  retryCurrentTask: () => Promise<void>;
  confirmGenerateReport: () => Promise<void>;
  cancelGenerateReport: () => void;
  openModelModal: () => void;
  closeModelModal: () => void;
  setCurrentModelProvider: (provider: ModelProvider) => void;
  stopGenerating: () => void;
  regenerate: () => Promise<void>;
  startAssistantStream: () => Promise<void>;
  startTask: (taskId: string, prompt: string) => void;
  hydrateFromUrl: (state: { sessionId?: string; taskId?: string }) => void;
}

export const useWorkbenchStore = create<WorkbenchState>((set, get) => ({
  currentSessionId: 's_001',
  currentTaskId: DEFAULT_TASK_ID,
  currentPrompt: DEFAULT_PROMPT,
  generationStatus: 'done',
  errorMessage: undefined,
  assistantStream: {
    content: DEFAULT_ASSISTANT_REPLY,
    status: 'done',
  },
  agentSteps: mockAgentSteps.map((step) => ({ ...step })),
  visibleToolCallIds: ['tool_knowledge_search', 'tool_query_data'],
  showKnowledgeSources: true,
  showAnalyticsResult: true,
  confirmStatus: 'waiting',
  finalMessage: {
    content: '',
    status: 'hidden',
  },
  currentModelProvider: 'mock',
  isModelModalOpen: false,
  streamRunId: 0,
  setCurrentSessionId: (sessionId) => {
    set({ currentSessionId: sessionId });
  },
  setCurrentTaskId: (taskId) => {
    set({ currentTaskId: taskId });
  },
  setCurrentPrompt: (prompt) => {
    set({ currentPrompt: prompt });
  },
  sendPrompt: (prompt) => {
    const trimmedPrompt = prompt.trim();

    if (!trimmedPrompt) {
      return;
    }

    set({
      currentPrompt: trimmedPrompt,
    });

    void get().startAssistantStream();
  },
  setAssistantStream: (assistantStream) => {
    set({ assistantStream });
  },
  setShowKnowledgeSources: (showKnowledgeSources) => {
    set({ showKnowledgeSources });
  },
  setShowAnalyticsResult: (showAnalyticsResult) => {
    set({ showAnalyticsResult });
  },
  resetAgentSteps: () => {
    set({ agentSteps: createInitialAgentSteps() });
  },
  setAgentStepStatus: (stepId, status) => {
    set((state) => ({
      agentSteps: state.agentSteps.map((step) =>
        step.id === stepId ? { ...step, status } : step
      ),
    }));
  },
  showToolCall: (toolCallId) => {
    set((state) => {
      if (state.visibleToolCallIds.includes(toolCallId)) {
        return state;
      }

      return {
        visibleToolCallIds: [...state.visibleToolCallIds, toolCallId],
      };
    });
  },
  resetVisibleToolCalls: () => {
    set({ visibleToolCallIds: [] });
  },
  runAgentStepsPreview: async (runId) => {
    const isCurrentRun = () => {
      const current = get();
      return current.streamRunId === runId && current.generationStatus === 'streaming';
    };

    get().resetAgentSteps();

    get().setAgentStepStatus('understand', 'running');
    await delay(160);
    if (!isCurrentRun()) return;
    get().setAgentStepStatus('understand', 'success');

    get().setAgentStepStatus('search', 'running');
    await delay(260);
    if (!isCurrentRun()) return;
    get().setAgentStepStatus('search', 'success');
    if (!isCurrentRun()) return;
    get().showToolCall('tool_knowledge_search');
    if (!isCurrentRun()) return;
    get().setShowKnowledgeSources(true);

    get().setAgentStepStatus('query', 'running');
    await delay(260);
    if (!isCurrentRun()) return;
    get().setAgentStepStatus('query', 'success');
    if (!isCurrentRun()) return;
    get().showToolCall('tool_query_data');

    get().setAgentStepStatus('chart', 'running');
    await delay(220);
    if (!isCurrentRun()) return;
    get().setAgentStepStatus('chart', 'success');
    if (!isCurrentRun()) return;
    get().setShowAnalyticsResult(true);

    get().setAgentStepStatus('confirm', 'running');
  },
  triggerMockError: () => {
    set((state) => ({
      generationStatus: 'error',
      errorMessage: '数据查询服务暂时不可用，请稍后重试。',
      assistantStream: {
        ...state.assistantStream,
        status: state.assistantStream.status === 'streaming' ? 'stopped' : state.assistantStream.status,
      },
      finalMessage: {
        content: '',
        status: 'hidden',
      },
      agentSteps: state.agentSteps.map((step) =>
        step.status === 'running' ? { ...step, status: 'error' } : step
      ),
    }));
  },
  retryCurrentTask: async () => {
    set({
      errorMessage: undefined,
    });

    await get().startAssistantStream();
  },
  confirmGenerateReport: async () => {
    const currentBeforeConfirm = get();
    const confirmStep = currentBeforeConfirm.agentSteps.find((step) => step.id === 'confirm');

    if (currentBeforeConfirm.confirmStatus !== 'waiting' || confirmStep?.status !== 'running') {
      return;
    }

    const runId = get().streamRunId;

    set({
      confirmStatus: 'confirmed',
      generationStatus: 'streaming',
    });

    get().setAgentStepStatus('confirm', 'success');
    get().setAgentStepStatus('final', 'running');

    await delay(600);

    const current = get();

    if (current.streamRunId !== runId || current.generationStatus !== 'streaming') {
      return;
    }

    get().setAgentStepStatus('final', 'success');

    set({
      generationStatus: 'done',
      finalMessage: {
        content: FINAL_REPORT_SUMMARY,
        status: 'visible',
      },
    });
  },
  cancelGenerateReport: () => {
    set((state) => ({
      confirmStatus: 'cancelled',
      generationStatus: 'stopped',
      finalMessage: {
        content: '已取消生成分析报告。',
        status: 'visible',
      },
      agentSteps: state.agentSteps.map((step) =>
        step.status === 'running' ? { ...step, status: 'error' } : step
      ),
    }));
  },
  openModelModal: () => {
    set({ isModelModalOpen: true });
  },
  closeModelModal: () => {
    set({ isModelModalOpen: false });
  },
  setCurrentModelProvider: (provider) => {
    set({ currentModelProvider: provider });
  },
  stopGenerating: () => {
    set((state) => ({
      generationStatus: 'stopped',
      assistantStream: {
        ...state.assistantStream,
        status: state.assistantStream.status === 'streaming' ? 'stopped' : state.assistantStream.status,
      },
      agentSteps: state.agentSteps.map((step) =>
        step.status === 'running' ? { ...step, status: 'error' } : step
      ),
    }));
  },
  regenerate: async () => {
    await get().startAssistantStream();
  },
  startAssistantStream: async () => {
    const runId = get().streamRunId + 1;

    set({
      streamRunId: runId,
      generationStatus: 'streaming',
      errorMessage: undefined,
      assistantStream: {
        content: '',
        status: 'streaming',
      },
      agentSteps: createInitialAgentSteps(),
      visibleToolCallIds: [],
      showKnowledgeSources: false,
      showAnalyticsResult: false,
      confirmStatus: 'waiting',
      finalMessage: {
        content: '',
        status: 'hidden',
      },
    });
    void get().runAgentStepsPreview(runId);

    const result = await streamText(
      DEFAULT_ASSISTANT_REPLY,
      (content) => {
        const current = get();

        if (current.streamRunId !== runId) {
          return;
        }

        set({
          assistantStream: {
            content,
            status: 'streaming',
          },
        });
      },
      {
        interval: 24,
        shouldStop: () => {
          const current = get();
          return current.streamRunId !== runId || current.generationStatus !== 'streaming';
        },
      }
    );

    const current = get();

    if (current.streamRunId !== runId) {
      return;
    }

    set({
      generationStatus: result === 'stopped' ? 'stopped' : 'done',
      assistantStream: {
        content: current.assistantStream.content,
        status: result === 'stopped' ? 'stopped' : 'done',
      },
    });
  },
  startTask: (taskId, prompt) => {
    set({
      currentTaskId: taskId,
      currentPrompt: prompt,
    });

    void get().startAssistantStream();
  },
  hydrateFromUrl: (state) => {
    const nextTaskId = state.taskId ?? DEFAULT_TASK_ID;
    const matchedTask = mockTasks.find((task) => task.id === nextTaskId);

    set({
      currentSessionId: state.sessionId ?? 's_001',
      currentTaskId: nextTaskId,
      currentPrompt: matchedTask?.prompt ?? DEFAULT_PROMPT,
    });
  },
}));
