import type { StateCreator } from 'zustand';
import { streamGroqChat } from '../../services/chatApi';
import type { AgentRunResult, GenerationSlice, WorkbenchMessage, WorkbenchStore } from '../../types/workbench';
import { createMessageId } from '../../utils/message';
import { streamText } from '../../utils/streamText';
import {
  createInitialAgentSteps,
  createSessionTitle,
  DEFAULT_ASSISTANT_REPLY,
  FINAL_REPORT_SUMMARY,
  initialWorkbenchState,
  persistWorkbenchSessions,
  sortSessionsByUpdatedAt,
  updateCurrentSessionAssistantInSessions,
  delay,
} from './shared';

function createAgentRunReportMarkdown(run: AgentRunResult): string {
  const providerLabel = run.provider === 'postgresql' ? 'PostgreSQL' : 'Supabase';
  const toolNames = Array.from(new Set(run.toolInvocations.map((tool) => tool.toolName)));
  const toolLines =
    toolNames.length > 0 ? toolNames.map((toolName) => `- ${toolName}`).join('\n') : '- 本次未调用工具';

  return [
    '# 教学质量分析简版报告',
    '',
    '## 分析问题',
    run.prompt,
    '',
    '## 使用数据源',
    providerLabel,
    '',
    '## 调用工具',
    toolLines,
    '',
    '## 分析结论',
    run.conclusion,
    '',
    '## 后续建议',
    '建议优先关注异常指标较高的学科或班级，并结合平均分、出勤率和作业完成率做进一步排查。',
  ].join('\n');
}

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
  },
  retryCurrentTask: async () => {
    set({
      errorMessage: undefined,
      realModelNotice: '',
    });

    await get().runPromptWithCurrentModel(get().currentPrompt);
  },
  confirmGenerateReport: async () => {
    const currentState = get();
    const currentRun = currentState.currentAgentRun;
    const isDataAnalysisRun =
      currentRun?.plan?.intent === 'data_analysis' || Boolean(currentRun?.toolInvocations.length);

    if (currentState.currentModelProvider === 'groq') {
      if (
        currentState.confirmStatus !== 'waiting' ||
        !currentRun ||
        currentRun.status !== 'success' ||
        !isDataAnalysisRun ||
        !currentRun.conclusion.trim()
      ) {
        return;
      }

      const runConclusionMessageId = currentState.activeAssistantMessageId;
      get().appendAssistantMessageToCurrentSession(createAgentRunReportMarkdown(currentRun));
      set({
        activeAssistantMessageId: runConclusionMessageId,
        confirmStatus: 'confirmed',
        finalMessage: {
          content: '',
          status: 'hidden',
        },
        generationStatus: 'done',
      });
      return;
    }

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
    if (get().currentModelProvider === 'groq') {
      set({
        confirmStatus: 'cancelled',
        finalMessage: {
          content: '',
          status: 'hidden',
        },
      });
      return;
    }

    set((state) => ({
      confirmStatus: 'cancelled',
      generationStatus: 'stopped',
      finalMessage: {
        content: '已取消生成分析报告。',
        status: 'visible',
      },
      agentSteps: state.agentSteps.map((step) => (step.status === 'running' ? { ...step, status: 'error' } : step)),
    }));
  },
  stopGenerating: () => {
    set((state) => ({
      streamRunId: state.streamRunId + 1,
      generationStatus: 'stopped',
      assistantStream: {
        ...state.assistantStream,
        status: state.assistantStream.status === 'streaming' ? 'stopped' : state.assistantStream.status,
      },
      agentSteps: state.agentSteps.map((step) => (step.status === 'running' ? { ...step, status: 'error' } : step)),
    }));
  },
  regenerate: async () => {
    await get().runPromptWithCurrentModel(get().currentPrompt);
  },
  startAssistantStream: async () => {
    await get().runPromptWithCurrentModel(get().currentPrompt);
  },
});
