import type { StateCreator } from 'zustand';
import type {
  GenerationSlice,
  RunReportState,
  RunSnapshot,
  WorkbenchMessage,
  WorkbenchSession,
  WorkbenchStore,
} from '../../types/workbench';
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
import { createRunId } from '../../utils/run';
import { streamText } from '../../utils/streamText';
import {
  createWorkbenchMessage,
  createSessionTitle,
  DEFAULT_ASSISTANT_REPLY,
  initialWorkbenchState,
  persistWorkbenchSessions,
  sortSessionsByUpdatedAt,
  updateCurrentSessionAssistantInSessions,
  delay,
} from './shared';

function findLastMessageIndex(
  messages: WorkbenchMessage[],
  predicate: (message: WorkbenchMessage) => boolean,
): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (predicate(messages[index])) {
      return index;
    }
  }

  return -1;
}

function hasReportMessageForRun(messages: WorkbenchMessage[], runId: string): boolean {
  return messages.some(
    (message) => message.role === 'assistant' && message.kind === 'report' && message.runId === runId,
  );
}

function insertReportMessageAfterRunAssistant(
  messages: WorkbenchMessage[],
  reportMessage: WorkbenchMessage,
  runId: string,
): WorkbenchMessage[] {
  const assistantFinalIndex = findLastMessageIndex(
    messages,
    (message) => message.role === 'assistant' && message.kind === 'normal' && message.runId === runId,
  );

  if (assistantFinalIndex >= 0) {
    return [
      ...messages.slice(0, assistantFinalIndex + 1),
      reportMessage,
      ...messages.slice(assistantFinalIndex + 1),
    ];
  }

  const lastRunMessageIndex = findLastMessageIndex(messages, (message) => message.runId === runId);

  if (lastRunMessageIndex >= 0) {
    return [
      ...messages.slice(0, lastRunMessageIndex + 1),
      reportMessage,
      ...messages.slice(lastRunMessageIndex + 1),
    ];
  }

  return [...messages, reportMessage];
}

function updateRunReportState(run: RunSnapshot, reportState: RunReportState): RunSnapshot {
  return {
    ...run,
    reportState,
    updatedAt: new Date().toISOString(),
  };
}

function updateSessionRunReportState(params: {
  session: WorkbenchSession;
  runId: string;
  nextRun: RunSnapshot;
  nextMessages?: WorkbenchMessage[];
}): WorkbenchSession {
  return {
    ...params.session,
    updatedAt: Date.now(),
    messages: params.nextMessages ?? params.session.messages,
    runsById: {
      ...params.session.runsById,
      [params.runId]: params.nextRun,
    },
  };
}

export const createGenerationSlice: StateCreator<WorkbenchStore, [], [], GenerationSlice> = (set, get) => ({
  generationStatus: initialWorkbenchState.generationStatus,
  errorMessage: undefined,
  realModelNotice: '',
  assistantStream: initialWorkbenchState.assistantStream,
  confirmStatus: 'waiting',
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

    get().activeAgentRunAbortController?.abort();
    set({
      currentRun: null,
      runEventLog: [],
      agentRunStatus: 'idle',
      agentRunErrorMessage: null,
      activeAgentRunRequestId: null,
      activeAgentRunAbortController: null,
      currentReportRunId: null,
      reportActionState: 'skipped',
    });
    get().clearChatDraft();
    void get().runMockPrompt(trimmedPrompt);
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

      void get().runMockPrompt(prompt);
      return;
    }
  },
  setRealModelNotice: (notice) => {
    set({
      realModelNotice: notice,
    });
  },
  runMockPrompt: async (prompt) => {
    const trimmedPrompt = prompt.trim();

    if (!trimmedPrompt) {
      return;
    }

    const snapshot = get();
    const streamRunId = snapshot.streamRunId + 1;
    const runId = createRunId('mock_run');
    const now = Date.now();
    const nextMessages: WorkbenchMessage[] = [
      createWorkbenchMessage({
        role: 'user',
        kind: 'normal',
        content: trimmedPrompt,
        createdAt: now,
        runId,
      }),
      createWorkbenchMessage({
        role: 'assistant',
        kind: 'normal',
        content: '',
        createdAt: now + 1,
        runId,
      }),
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
              runsById: {},
            },
          ]);

      persistWorkbenchSessions(nextSessions, state.currentSessionId);

      return {
        sessions: nextSessions,
        currentPrompt: trimmedPrompt,
        activeAssistantMessageId: assistantMessageId,
        streamRunId,
        generationStatus: 'streaming',
        errorMessage: undefined,
        realModelNotice: '',
        assistantStream: {
          content: '',
          status: 'streaming',
        },
        confirmStatus: 'waiting',
      };
    });
    if (runId) {
      const runStartedEvent = createMockRunStartedEvent({
        runId,
        prompt: trimmedPrompt,
        sessionId: snapshot.currentSessionId,
      });
      get().applyRunEvent(runStartedEvent);
    }

    void get().runAgentStepsPreview(streamRunId);

    const streamMockReplyForRun = async () => {
      const result = await streamText(
        DEFAULT_ASSISTANT_REPLY,
        (content) => {
          const current = get();

          if (current.streamRunId !== streamRunId) {
            return;
          }

          set((state) => {
            const updatedSessions = updateCurrentSessionAssistantInSessions(
              state.sessions,
              state.currentSessionId,
              assistantMessageId,
              content
            );

            persistWorkbenchSessions(updatedSessions, state.currentSessionId);

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
            return current.streamRunId !== streamRunId || current.generationStatus !== 'streaming';
          },
        }
      );

      const current = get();

      if (current.streamRunId !== streamRunId) {
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

        persistWorkbenchSessions(updatedSessions, state.currentSessionId);

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

    await streamMockReplyForRun();
  },
  setAssistantStream: (assistantStream) => {
    set({ assistantStream });
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
    await delay(160);
    if (!isCurrentRun()) return;
    completeMockStep(MOCK_RUN_STEP_IDS.understandPrompt, 160);

    startMockStep(MOCK_RUN_STEP_IDS.knowledgeSearch, '检索知识资料');
    startMockTool('knowledgeSearch');
    await delay(260);
    if (!isCurrentRun()) return;
    completeMockStep(MOCK_RUN_STEP_IDS.knowledgeSearch, 260);
    if (!isCurrentRun()) return;
    completeMockTool(MOCK_RUN_TOOL_IDS.knowledgeSearch, '找到 3 条相关知识资料', 260);

    startMockStep(MOCK_RUN_STEP_IDS.queryData, '查询业务数据');
    startMockTool('queryData');
    await delay(260);
    if (!isCurrentRun()) return;
    completeMockStep(MOCK_RUN_STEP_IDS.queryData, 260);
    if (!isCurrentRun()) return;
    completeMockTool(MOCK_RUN_TOOL_IDS.queryData, '返回 6 个年级统计结果', 260);

    startMockStep(MOCK_RUN_STEP_IDS.generateChart, '生成分析图表');
    startMockTool('chartRender');
    await delay(220);
    if (!isCurrentRun()) return;
    completeMockStep(MOCK_RUN_STEP_IDS.generateChart, 220);
    completeMockTool(MOCK_RUN_TOOL_IDS.chartRender, '生成 1 个柱状图数据', 220);
    const mockRunId = getMockRunId();

    if (mockRunId) {
      get().applyRunEvent(createMockChartReadyEvent(mockRunId));
    }

    startMockStep(MOCK_RUN_STEP_IDS.waitConfirmation, '等待用户确认');
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

    await get().runMockPrompt(get().currentPrompt);
  },
  generateReportForRun: (runId) => {
    const normalizedRunId = runId.trim();

    if (!normalizedRunId) {
      return;
    }

    set((state) => {
      const activeSession = state.sessions.find((session) => session.id === state.currentSessionId);
      const run = activeSession?.runsById[normalizedRunId];

      if (!activeSession || !run || run.reportState !== 'pending') {
        return state;
      }

      const nextRun = updateRunReportState(run, 'generated');
      const hasExistingReport = hasReportMessageForRun(activeSession.messages, normalizedRunId);
      const reportMessage = hasExistingReport
        ? null
        : createWorkbenchMessage({
            role: 'assistant',
            kind: 'report',
            content: createRunReportMarkdown(run),
            runId: normalizedRunId,
          });
      const nextMessages = reportMessage
        ? insertReportMessageAfterRunAssistant(activeSession.messages, reportMessage, normalizedRunId)
        : activeSession.messages;

      const nextSessions = sortSessionsByUpdatedAt(
        state.sessions.map((session) =>
          session.id === state.currentSessionId
            ? updateSessionRunReportState({
                session,
                runId: normalizedRunId,
                nextRun,
                nextMessages,
              })
            : session,
        ),
      );

      persistWorkbenchSessions(nextSessions, state.currentSessionId);

      return {
        sessions: nextSessions,
        currentRun: state.currentRun?.id === normalizedRunId ? nextRun : state.currentRun,
        confirmStatus: 'confirmed',
        generationStatus: 'done',
        currentReportRunId: normalizedRunId,
        reportActionState: 'generated',
      };
    });
  },
  skipReportForRun: (runId) => {
    const normalizedRunId = runId.trim();

    if (!normalizedRunId) {
      return;
    }

    set((state) => {
      const activeSession = state.sessions.find((session) => session.id === state.currentSessionId);
      const run = activeSession?.runsById[normalizedRunId];

      if (!activeSession || !run || run.reportState !== 'pending') {
        return state;
      }

      const nextRun = updateRunReportState(run, 'skipped');
      const nextSessions = sortSessionsByUpdatedAt(
        state.sessions.map((session) =>
          session.id === state.currentSessionId
            ? updateSessionRunReportState({
                session,
                runId: normalizedRunId,
                nextRun,
              })
            : session,
        ),
      );

      persistWorkbenchSessions(nextSessions, state.currentSessionId);

      return {
        sessions: nextSessions,
        currentRun: state.currentRun?.id === normalizedRunId ? nextRun : state.currentRun,
        confirmStatus: 'cancelled',
        generationStatus: 'done',
        currentReportRunId: normalizedRunId,
        reportActionState: 'skipped',
      };
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

    if (partialAgentConclusion && currentRun) {
      get().appendAssistantMessageToCurrentSession(partialAgentConclusion, {
        kind: 'partial',
        runId: currentRun.id,
      });
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
      confirmStatus: shouldStopAgentRequest ? 'cancelled' : state.confirmStatus,
    }));

    if (shouldStopMockRun) {
      get().applyRunEvent(createMockRunStoppedEvent(currentRun.id));
    }
  },
  regenerate: async () => {
    await get().runMockPrompt(get().currentPrompt);
  },
  startAssistantStream: async () => {
    await get().runMockPrompt(get().currentPrompt);
  },
});
