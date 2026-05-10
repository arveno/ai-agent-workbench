import type { StateCreator } from 'zustand';
import { streamGroqChat } from '../../services/chatApi';
import type { GenerationSlice, WorkbenchMessage, WorkbenchStore } from '../../types/workbench';
import { createMessageId } from '../../utils/message';
import {
  MOCK_RUN_STEP_IDS,
  MOCK_RUN_TOOL_IDS,
  createMockChartReadyEvent,
  createMockConclusionCompletedEvent,
  createMockReportPendingEvent,
  createMockRunCompletedEvent,
  createMockRunStartedEvent,
  createMockRunStoppedEvent,
  createMockStepCompletedEvent,
  createMockStepStartedEvent,
  createMockToolCompletedEvent,
  createMockToolInvocation,
  createMockToolStartedEvent,
} from '../../utils/mockRun';
import { createRunReportMarkdown } from '../../utils/report';
import { shouldShowReportConfirm } from '../../utils/run';
import { streamText } from '../../utils/streamText';
import {
  createInitialAgentSteps,
  createSessionTitle,
  DEFAULT_ASSISTANT_REPLY,
  initialWorkbenchState,
  persistWorkbenchSessions,
  sortSessionsByUpdatedAt,
  updateCurrentSessionAssistantInSessions,
  delay,
} from './shared';

export const createGenerationSlice: StateCreator<WorkbenchStore, [], [], GenerationSlice> = (set, get) => ({
  generationStatus: initialWorkbenchState.generationStatus,
  errorMessage: undefined,
  realModelNotice: '',
  assistantStream: initialWorkbenchState.assistantStream,
  agentSteps: initialWorkbenchState.agentSteps,
  visibleToolCallIds: initialWorkbenchState.visibleToolCallIds,
  showKnowledgeSources: initialWorkbenchState.showKnowledgeSources,
  showAnalyticsResult: initialWorkbenchState.showAnalyticsResult,
  confirmStatus: 'waiting',
  finalMessage: {
    content: '',
    status: 'hidden',
  },
  streamRunId: 0,
  sendPrompt: (prompt) => {
    const trimmedPrompt = prompt.trim();

    if (!trimmedPrompt) {
      return;
    }

    if (get().currentModelProvider === 'groq') {
      void get().runCurrentAgentAnalysis(trimmedPrompt);
      return;
    }

    get().clearCurrentAgentRun();
    get().clearChatDraft();
    void get().runPromptWithCurrentModel(trimmedPrompt);
  },
  regenerateFromAssistantMessage: (assistantMessageId) => {
    const state = get();
    const currentSession = state.sessions.find((session) => session.id === state.currentSessionId);

    if (!currentSession) {
      return;
    }

    const assistantIndex = currentSession.messages.findIndex(
      (message) => message.id === assistantMessageId && message.role === 'assistant'
    );

    if (assistantIndex <= 0) {
      return;
    }

    for (let index = assistantIndex - 1; index >= 0; index -= 1) {
      const candidateMessage = currentSession.messages[index];

      if (candidateMessage.role !== 'user') {
        continue;
      }

      const prompt = candidateMessage.content.trim();

      if (!prompt) {
        return;
      }

      void get().runPromptWithCurrentModel(prompt);
      return;
    }
  },
  setRealModelNotice: (notice) => {
    set({
      realModelNotice: notice,
    });
  },
  runPromptWithCurrentModel: async (prompt) => {
    const trimmedPrompt = prompt.trim();

    if (!trimmedPrompt) {
      return;
    }

    const snapshot = get();
    const groqApiKey = snapshot.modelConfigs.groq?.apiKey?.trim();
    const shouldUseGroq = snapshot.currentModelProvider === 'groq' && Boolean(groqApiKey);
    const shouldUseMockRun = snapshot.currentModelProvider === 'mock';
    const runId = snapshot.streamRunId + 1;
    const now = Date.now();
    const nextMessages: WorkbenchMessage[] = [
      {
        id: createMessageId('user'),
        role: 'user',
        content: trimmedPrompt,
        createdAt: now,
      },
      {
        id: createMessageId('assistant'),
        role: 'assistant',
        content: '',
        createdAt: now + 1,
      },
    ];
    const assistantMessageId = nextMessages[1].id;

    set((state) => {
      let hasCurrentSession = false;
      const sessions = state.sessions.map((session) => {
        if (session.id !== state.currentSessionId) {
          return session;
        }

        hasCurrentSession = true;
        const shouldRenameSession = session.title === '新会话' || session.messages.length === 0;

        return {
          ...session,
          title: shouldRenameSession ? createSessionTitle(trimmedPrompt) : session.title,
          updatedAt: now,
          taskId: state.currentTaskId,
          messages: [...session.messages, ...nextMessages],
        };
      });

      const nextSessions = hasCurrentSession
        ? sortSessionsByUpdatedAt(sessions)
        : sortSessionsByUpdatedAt([
            ...sessions,
            {
              id: state.currentSessionId,
              title: createSessionTitle(trimmedPrompt),
              updatedAt: now,
              taskId: state.currentTaskId,
              messages: nextMessages,
            },
          ]);

      persistWorkbenchSessions(nextSessions);

      return {
        sessions: nextSessions,
        currentPrompt: trimmedPrompt,
        activeAssistantMessageId: assistantMessageId,
        streamRunId: runId,
        generationStatus: 'streaming',
        errorMessage: undefined,
        realModelNotice: '',
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
      };
    });
    if (shouldUseMockRun) {
      const runStartedEvent = createMockRunStartedEvent(trimmedPrompt);
      get().applyRunEvent(runStartedEvent);
    }

    void get().runAgentStepsPreview(runId);

    const streamMockReplyForRun = async () => {
      const result = await streamText(
        DEFAULT_ASSISTANT_REPLY,
        (content) => {
          const current = get();

          if (current.streamRunId !== runId) {
            return;
          }

          set((state) => {
            const updatedSessions = updateCurrentSessionAssistantInSessions(
              state.sessions,
              state.currentSessionId,
              assistantMessageId,
              content
            );

            persistWorkbenchSessions(updatedSessions);

            return {
              sessions: updatedSessions,
              assistantStream: {
                content,
                status: 'streaming',
              },
            };
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

      if (current.generationStatus !== 'streaming') {
        set({
          assistantStream: {
            content: current.assistantStream.content,
            status: current.generationStatus === 'stopped' ? 'stopped' : current.assistantStream.status,
          },
        });
        return;
      }

      set((state) => {
        const updatedSessions = updateCurrentSessionAssistantInSessions(
          state.sessions,
          state.currentSessionId,
          assistantMessageId,
          current.assistantStream.content
        );

        persistWorkbenchSessions(updatedSessions);

        return {
          sessions: updatedSessions,
          generationStatus: result === 'stopped' ? 'stopped' : 'done',
          assistantStream: {
            content: current.assistantStream.content,
            status: result === 'stopped' ? 'stopped' : 'done',
          },
        };
      });

      const nextRun = get().currentRun;

      if (nextRun?.mode === 'mock' && nextRun.status === 'running') {
        get().applyRunEvent(createMockConclusionCompletedEvent(nextRun.id, current.assistantStream.content));
        get().applyRunEvent(createMockReportPendingEvent(nextRun.id));
        get().applyRunEvent(createMockRunCompletedEvent(nextRun.id, 1200));
      }
    };

    if (!shouldUseGroq) {
      await streamMockReplyForRun();
      return;
    }

    try {
      await streamGroqChat({
        prompt: trimmedPrompt,
        apiKey: groqApiKey,
        onChunk: (chunk) => {
          const current = get();

          if (current.streamRunId !== runId || current.generationStatus !== 'streaming') {
            return;
          }

          set((state) => {
            const nextContent = state.assistantStream.content + chunk;
            const nextSessions = updateCurrentSessionAssistantInSessions(
              state.sessions,
              state.currentSessionId,
              assistantMessageId,
              nextContent
            );

            persistWorkbenchSessions(nextSessions);

            return {
              sessions: nextSessions,
              assistantStream: {
                content: nextContent,
                status: 'streaming',
              },
            };
          });
        },
      });
      const current = get();

      if (current.streamRunId !== runId || current.generationStatus !== 'streaming') {
        return;
      }

      set((state) => {
        const updatedSessions = updateCurrentSessionAssistantInSessions(
          state.sessions,
          state.currentSessionId,
          assistantMessageId,
          current.assistantStream.content
        );

        persistWorkbenchSessions(updatedSessions);

        return {
          sessions: updatedSessions,
          assistantStream: {
            content: current.assistantStream.content,
            status: 'done',
          },
          generationStatus: 'done',
        };
      });
    } catch {
      const current = get();

      if (current.streamRunId !== runId || current.generationStatus !== 'streaming') {
        return;
      }

      set({
        realModelNotice: 'Groq 当前不可用，已自动切回 Mock 演示结果。',
      });

      await streamMockReplyForRun();
    }
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
      agentSteps: state.agentSteps.map((step) => (step.id === stepId ? { ...step, status } : step)),
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
      return (
        current.streamRunId === runId &&
        current.generationStatus !== 'stopped' &&
        current.generationStatus !== 'error'
      );
    };

    get().resetAgentSteps();
    const getMockRunId = () => {
      const currentRun = get().currentRun;
      return currentRun?.mode === 'mock' ? currentRun.id : null;
    };
    const startMockStep = (stepId: string, title: string) => {
      const mockRunId = getMockRunId();

      if (mockRunId) {
        get().applyRunEvent(createMockStepStartedEvent(mockRunId, stepId, title));
      }
    };
    const completeMockStep = (stepId: string, elapsedMs?: number) => {
      const mockRunId = getMockRunId();

      if (mockRunId) {
        get().applyRunEvent(createMockStepCompletedEvent(mockRunId, stepId, elapsedMs));
      }
    };
    const startMockTool = (toolKey: Parameters<typeof createMockToolInvocation>[0]) => {
      const mockRunId = getMockRunId();

      if (mockRunId) {
        get().applyRunEvent(createMockToolStartedEvent(mockRunId, createMockToolInvocation(toolKey)));
      }
    };
    const completeMockTool = (toolId: string, outputSummary: string, elapsedMs?: number) => {
      const mockRunId = getMockRunId();

      if (mockRunId) {
        get().applyRunEvent(createMockToolCompletedEvent(mockRunId, toolId, outputSummary, elapsedMs));
      }
    };

    startMockStep(MOCK_RUN_STEP_IDS.understandPrompt, '理解用户问题');
    get().setAgentStepStatus('understand', 'running');
    await delay(160);
    if (!isCurrentRun()) return;
    get().setAgentStepStatus('understand', 'success');
    completeMockStep(MOCK_RUN_STEP_IDS.understandPrompt, 160);

    startMockStep(MOCK_RUN_STEP_IDS.knowledgeSearch, '检索知识资料');
    startMockTool('knowledgeSearch');
    get().setAgentStepStatus('search', 'running');
    await delay(260);
    if (!isCurrentRun()) return;
    get().setAgentStepStatus('search', 'success');
    completeMockStep(MOCK_RUN_STEP_IDS.knowledgeSearch, 260);
    if (!isCurrentRun()) return;
    get().showToolCall('tool_knowledge_search');
    completeMockTool(MOCK_RUN_TOOL_IDS.knowledgeSearch, '找到 3 条相关知识资料', 260);
    if (!isCurrentRun()) return;
    get().setShowKnowledgeSources(true);

    startMockStep(MOCK_RUN_STEP_IDS.queryData, '查询业务数据');
    startMockTool('queryData');
    get().setAgentStepStatus('query', 'running');
    await delay(260);
    if (!isCurrentRun()) return;
    get().setAgentStepStatus('query', 'success');
    completeMockStep(MOCK_RUN_STEP_IDS.queryData, 260);
    if (!isCurrentRun()) return;
    get().showToolCall('tool_query_data');
    completeMockTool(MOCK_RUN_TOOL_IDS.queryData, '返回 6 个年级统计结果', 260);

    startMockStep(MOCK_RUN_STEP_IDS.generateChart, '生成分析图表');
    startMockTool('chartRender');
    get().setAgentStepStatus('chart', 'running');
    await delay(220);
    if (!isCurrentRun()) return;
    get().setAgentStepStatus('chart', 'success');
    completeMockStep(MOCK_RUN_STEP_IDS.generateChart, 220);
    completeMockTool(MOCK_RUN_TOOL_IDS.chartRender, '生成 1 个柱状图数据', 220);
    if (!isCurrentRun()) return;
    get().setShowAnalyticsResult(true);
    const mockRunId = getMockRunId();

    if (mockRunId) {
      get().applyRunEvent(createMockChartReadyEvent(mockRunId));
    }

    startMockStep(MOCK_RUN_STEP_IDS.waitConfirmation, '等待用户确认');
    get().setAgentStepStatus('confirm', 'running');
  },
  triggerMockError: () => {
    const currentRun = get().currentRun;

    set((state) => ({
      generationStatus: 'error',
      errorMessage: '数据查询服务暂时不可用，请稍后重试。',
      realModelNotice: '',
      assistantStream: {
        ...state.assistantStream,
        status: state.assistantStream.status === 'streaming' ? 'stopped' : state.assistantStream.status,
      },
      finalMessage: {
        content: '',
        status: 'hidden',
      },
      agentSteps: state.agentSteps.map((step) => (step.status === 'running' ? { ...step, status: 'error' } : step)),
    }));

    if (currentRun?.mode === 'mock' && currentRun.status === 'running') {
      get().applyRunEvent({
        type: 'run_failed',
        runId: currentRun.id,
        errorMessage: '数据查询服务暂时不可用，请稍后重试。',
      });
    }
  },
  retryCurrentTask: async () => {
    set({
      errorMessage: undefined,
      realModelNotice: '',
    });

    await get().runPromptWithCurrentModel(get().currentPrompt);
  },
  confirmGenerateReport: async () => {
    const currentRun = get().currentRun;

    if (!currentRun || !shouldShowReportConfirm(currentRun)) {
      return;
    }

    get().appendAssistantMessageToCurrentSession(createRunReportMarkdown(currentRun));
    get().applyRunEvent({
      type: 'report_generated',
      runId: currentRun.id,
    });

    set({
      confirmStatus: 'confirmed',
      generationStatus: 'done',
      currentReportRunId: currentRun.id,
      reportActionState: 'generated',
      finalMessage: {
        content: '',
        status: 'hidden',
      },
    });
  },
  cancelGenerateReport: () => {
    const currentRun = get().currentRun;

    if (!currentRun || !shouldShowReportConfirm(currentRun)) {
      return;
    }

    get().applyRunEvent({
      type: 'report_skipped',
      runId: currentRun.id,
    });

    set({
      confirmStatus: 'cancelled',
      generationStatus: 'done',
      currentReportRunId: currentRun.id,
      reportActionState: 'skipped',
      finalMessage: {
        content: '',
        status: 'hidden',
      },
    });
  },
  stopGenerating: () => {
    const currentRun = get().currentRun;
    const shouldStopMockRun = currentRun?.mode === 'mock' && currentRun.status === 'running';
    const shouldStopAgentRun = currentRun?.mode === 'agent' && currentRun.status === 'running';
    const agentAbortController = get().activeAgentRunAbortController;
    const shouldStopAgentRequest = Boolean(agentAbortController) || get().agentRunStatus === 'running';
    const partialAgentConclusion =
      shouldStopAgentRun && currentRun.conclusion.trim()
        ? `${currentRun.conclusion.trim()}\n\n> 已停止生成。`
        : '';

    agentAbortController?.abort();

    if (shouldStopAgentRun) {
      get().applyRunEvent({
        type: 'run_stopped',
        runId: currentRun.id,
      });
    }

    if (partialAgentConclusion) {
      get().appendAssistantMessageToCurrentSession(partialAgentConclusion);
    }

    set((state) => ({
      streamRunId: state.streamRunId + 1,
      generationStatus: 'stopped',
      agentRunStatus: shouldStopAgentRequest ? 'stopped' : state.agentRunStatus,
      agentRunErrorMessage: shouldStopAgentRequest ? null : state.agentRunErrorMessage,
      activeAgentRunRequestId: shouldStopAgentRequest ? null : state.activeAgentRunRequestId,
      activeAgentRunAbortController: shouldStopAgentRequest ? null : state.activeAgentRunAbortController,
      assistantStream: {
        ...state.assistantStream,
        status: state.assistantStream.status === 'streaming' ? 'stopped' : state.assistantStream.status,
      },
      agentSteps: state.agentSteps.map((step) => (step.status === 'running' ? { ...step, status: 'error' } : step)),
      confirmStatus: shouldStopAgentRequest ? 'cancelled' : state.confirmStatus,
    }));

    if (shouldStopMockRun) {
      get().applyRunEvent(createMockRunStoppedEvent(currentRun.id));
    }
  },
  regenerate: async () => {
    await get().runPromptWithCurrentModel(get().currentPrompt);
  },
  startAssistantStream: async () => {
    await get().runPromptWithCurrentModel(get().currentPrompt);
  },
});
