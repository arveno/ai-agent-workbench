import type { StateCreator } from 'zustand';
import { createRunReportArtifact, fetchConversationReportArtifacts } from '../../services/reportArtifactApi';
import {
  fetchLatestRunBundleForConversation,
  fetchRunBundle,
  fetchRunEvents,
  fetchToolInvocations,
} from '../../services/runPersistenceApi';
import type { ReportArtifactRecord } from '../../types/persistence';
import type {
  RunEvent,
  RunReportState,
  RunSlice,
  RunSnapshot,
  WorkbenchMessage,
  WorkbenchSession,
  WorkbenchStore,
} from '../../types/workbench';
import { reportArtifactToMessage } from '../../utils/reportArtifactMapper';
import { runEventsRecordToRunEvents, runPersistenceRecordsToSnapshot } from '../../utils/runPersistenceMapper';
import { applyRunEventToSnapshot } from '../../utils/runReducer';
import { toolInvocationRecordToRunTool } from '../../utils/toolInvocationMapper';
import { getSessionLatestRun, initialWorkbenchState, persistWorkbenchSessions, upsertRunIntoSessions } from './shared';
import { useAuthStore } from '../authStore';

const MAX_RUN_EVENT_LOG_LENGTH = 200;
const initialCurrentRun = getSessionLatestRun(
  initialWorkbenchState.sessions.find((session) => session.id === initialWorkbenchState.currentSessionId),
);
let latestRunRequestId = 0;
let selectedRunRequestId = 0;
let reportArtifactsRequestId = 0;

function getAccessToken(): string | null {
  const authState = useAuthStore.getState();
  const accessToken = authState.accessToken?.trim() || authState.session?.access_token?.trim();
  return accessToken || null;
}

function getReportArtifactAccessToken(): string | null {
  return getAccessToken();
}

function getMetadataString(metadata: Record<string, unknown>, key: string): string {
  const value = metadata[key];
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function getReportArtifactRunId(report: ReportArtifactRecord): string | null {
  return getMetadataString(report.metadata, 'runtimeRunId') || report.run_id || null;
}

function getReportArtifactState(report: ReportArtifactRecord): RunReportState | null {
  const reportState = getMetadataString(report.metadata, 'reportState');

  if (reportState === 'skipped' || reportState === 'generated' || reportState === 'failed') {
    return reportState;
  }

  return null;
}

function hasReportMessageForRun(messages: WorkbenchMessage[], runId: string): boolean {
  return messages.some(
    (message) => message.role === 'assistant' && message.kind === 'report' && message.runId === runId,
  );
}

function withGeneratedReportState(run: RunSnapshot): RunSnapshot {
  if (run.reportState === 'generated') {
    return run;
  }

  return {
    ...run,
    reportState: 'generated',
  };
}

function withSkippedReportState(run: RunSnapshot): RunSnapshot {
  if (run.reportState === 'generated' || run.reportState === 'skipped') {
    return run;
  }

  return {
    ...run,
    reportState: 'skipped',
  };
}

function withReportStateFromSessionMessages(run: RunSnapshot, session: WorkbenchSession): RunSnapshot {
  return hasReportMessageForRun(session.messages, run.id) ? withGeneratedReportState(run) : run;
}

function getReportActionState(reportState: RunReportState): WorkbenchStore['reportActionState'] {
  if (
    reportState === 'pending' ||
    reportState === 'generating' ||
    reportState === 'generated' ||
    reportState === 'failed'
  ) {
    return reportState;
  }

  return 'skipped';
}

function getReportRunId(run: RunSnapshot | null): string | null {
  return run && run.reportState !== 'hidden' ? run.id : null;
}

function isReportDecisionState(reportState: RunReportState): boolean {
  return reportState === 'generated' || reportState === 'skipped' || reportState === 'failed';
}

function upsertReportArtifactsIntoSessions(
  sessions: WorkbenchStore['sessions'],
  conversationId: string,
  reports: ReportArtifactRecord[],
): WorkbenchStore['sessions'] {
  const reportMessages = reports
    .filter((report) => getReportArtifactState(report) !== 'skipped')
    .map((report) => {
      const message = reportArtifactToMessage(report);
      const reportRunId = getReportArtifactRunId(report);

      return !message.runId && reportRunId
        ? {
            ...message,
            runId: reportRunId,
          }
        : message;
    });
  const generatedRunIds = new Set(
    reportMessages.map((message) => message.runId).filter((runId): runId is string => Boolean(runId)),
  );
  const skippedRunIds = new Set(
    reports
      .filter((report) => getReportArtifactState(report) === 'skipped')
      .map((report) => getReportArtifactRunId(report))
      .filter((runId): runId is string => Boolean(runId)),
  );

  return sessions.map((session) => {
    if (session.id !== conversationId) {
      return session;
    }

    const existingMessageIds = new Set(session.messages.map((message) => message.id));
    const nextMessages = [...session.messages];
    let didUpdateMessages = false;

    for (const message of reportMessages) {
      const hasRunReport =
        message.runId &&
        nextMessages.some(
          (existingMessage) =>
            existingMessage.kind === 'report' && existingMessage.runId === message.runId,
        );

      if (!existingMessageIds.has(message.id) && !hasRunReport) {
        nextMessages.push(message);
        existingMessageIds.add(message.id);
        didUpdateMessages = true;
      }
    }

    if (didUpdateMessages) {
      nextMessages.sort((left, right) => left.createdAt - right.createdAt);
    }

    const runsById = { ...session.runsById };
    let didUpdateRuns = false;

    for (const runId of skippedRunIds) {
      const run = runsById[runId];

      if (!run || run.reportState === 'generated' || run.reportState === 'skipped') {
        continue;
      }

      runsById[runId] = withSkippedReportState(run);
      didUpdateRuns = true;
    }

    for (const runId of generatedRunIds) {
      const run = runsById[runId];

      if (!run || run.reportState === 'generated') {
        continue;
      }

      runsById[runId] = withGeneratedReportState(run);
      didUpdateRuns = true;
    }

    if (!didUpdateMessages && !didUpdateRuns) {
      return session;
    }

    return {
      ...session,
      messages: nextMessages,
      messageCount: nextMessages.length,
      runsById: didUpdateRuns ? runsById : session.runsById,
    };
  });
}

function createReportArtifactMetadata(run: RunSnapshot | null | undefined, runId: string): Record<string, unknown> {
  return {
    source: 'agent-run',
    runId,
    runtimeRunId: runId,
    conclusionSource: run?.conclusionSource ?? null,
    fallbackReason: run?.conclusionSource === 'fallback' ? run.conclusionNotice ?? null : null,
    conclusionNotice: run?.conclusionNotice ?? null,
    toolNames: run?.toolInvocations.map((tool) => tool.toolName || tool.toolId) ?? [],
  };
}

function cacheRunInSession(
  sessions: WorkbenchStore['sessions'],
  conversationId: string,
  run: RunSnapshot,
): WorkbenchStore['sessions'] {
  return sessions.map((session) => {
    if (session.id !== conversationId) {
      return session;
    }

    const runWithSession: RunSnapshot = {
      ...run,
      sessionId: run.sessionId ?? conversationId,
    };
    const syncedRun = withReportStateFromSessionMessages(runWithSession, session);

    return {
      ...session,
      runsById: {
        ...session.runsById,
        [syncedRun.id]: syncedRun,
      },
    };
  });
}

function getRunUpdatedAt(run: RunSnapshot | null | undefined): number {
  if (!run) {
    return 0;
  }

  const timestamp = Date.parse(run.updatedAt);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function getLatestRunByUpdatedAt(session: WorkbenchStore['sessions'][number] | undefined): RunSnapshot | null {
  if (!session) {
    return null;
  }

  return Object.values(session.runsById).reduce<RunSnapshot | null>((latestRun, run) => {
    return getRunUpdatedAt(run) >= getRunUpdatedAt(latestRun) ? run : latestRun;
  }, null);
}

function setSessionLatestRunId(
  sessions: WorkbenchStore['sessions'],
  conversationId: string,
  latestRunId: string | undefined,
): WorkbenchStore['sessions'] {
  if (!latestRunId) {
    return sessions;
  }

  return sessions.map((session) =>
    session.id === conversationId
      ? {
          ...session,
          latestRunId,
        }
      : session,
  );
}

export const createRunSlice: StateCreator<WorkbenchStore, [], [], RunSlice> = (set, get) => ({
  currentRun: initialCurrentRun,
  selectedRunId: initialCurrentRun?.id ?? null,
  runEventLog: [],
  isLatestRunLoading: false,
  latestRunError: null,
  isRunEventsLoading: false,
  runEventsError: null,
  isReportArtifactsLoading: false,
  reportArtifactsError: null,
  isRagSourcesLoading: false,
  ragSourcesError: null,

  setCurrentRun: (run: RunSnapshot | null) => {
    set((state) => {
      if (!run) {
        return {
          currentRun: null,
          selectedRunId: null,
        };
      }

      const runWithSession: RunSnapshot = {
        ...run,
        sessionId: run.sessionId ?? state.currentSessionId,
      };
      const activeSession = state.sessions.find((session) => session.id === state.currentSessionId);
      const syncedRun = activeSession ? withReportStateFromSessionMessages(runWithSession, activeSession) : runWithSession;
      const nextSessions = upsertRunIntoSessions(state.sessions, state.currentSessionId, syncedRun);

      if (!state.isPersistentMode) {
        persistWorkbenchSessions(nextSessions, state.currentSessionId);
      }

      return {
        currentRun: syncedRun,
        selectedRunId: syncedRun.id,
        sessions: nextSessions,
        currentReportRunId: getReportRunId(syncedRun),
        reportActionState: getReportActionState(syncedRun.reportState),
      };
    });
  },

  clearCurrentRun: () => {
    set({
      currentRun: null,
      selectedRunId: null,
      runEventLog: [],
      currentReportRunId: null,
      reportActionState: 'skipped',
    });
  },

  applyRunEvent: (event: RunEvent) => {
    set((state) => {
      const nextRun = applyRunEventToSnapshot(state.currentRun, event);
      const nextLog = [...state.runEventLog, event].slice(-MAX_RUN_EVENT_LOG_LENGTH);

      if (!nextRun) {
        return {
          currentRun: null,
          selectedRunId: null,
          runEventLog: nextLog,
        };
      }

      const protectedRun =
        event.type === 'report_pending' &&
        state.currentRun?.id === nextRun.id &&
        isReportDecisionState(state.currentRun.reportState)
          ? {
              ...nextRun,
              reportState: state.currentRun.reportState,
            }
          : nextRun;
      const runWithSession: RunSnapshot = {
        ...protectedRun,
        sessionId: protectedRun.sessionId ?? state.currentSessionId,
      };
      const activeSession = state.sessions.find((session) => session.id === state.currentSessionId);
      const syncedRun = activeSession ? withReportStateFromSessionMessages(runWithSession, activeSession) : runWithSession;
      const nextSessions = upsertRunIntoSessions(state.sessions, state.currentSessionId, syncedRun);

      if (!state.isPersistentMode) {
        persistWorkbenchSessions(nextSessions, state.currentSessionId);
      }

      return {
        currentRun: syncedRun,
        selectedRunId: syncedRun.id,
        runEventLog: nextLog,
        sessions: nextSessions,
        currentReportRunId: getReportRunId(syncedRun),
        reportActionState: getReportActionState(syncedRun.reportState),
      };
    });
  },

  loadLatestRunForConversation: async (conversationId) => {
    const accessToken = getAccessToken();

    if (!accessToken || !get().isPersistentMode) {
      return;
    }

    const requestId = latestRunRequestId + 1;
    latestRunRequestId = requestId;
    set({
      isLatestRunLoading: true,
      isRunEventsLoading: true,
      isRagSourcesLoading: true,
      latestRunError: null,
      runEventsError: null,
      ragSourcesError: null,
    });

    const latestRunResult = await fetchLatestRunBundleForConversation(conversationId);

    if (requestId !== latestRunRequestId || get().currentSessionId !== conversationId) {
      return;
    }

    if (!latestRunResult.ok) {
      set({
        isLatestRunLoading: false,
        isRunEventsLoading: false,
        isRagSourcesLoading: false,
        latestRunError: latestRunResult.message,
        runEventsError: latestRunResult.message,
        ragSourcesError: null,
      });
      return;
    }

    const runRecord = latestRunResult.data.run;

    if (!runRecord) {
      const localRun = getSessionLatestRun(get().sessions.find((session) => session.id === conversationId));

      set({
        currentRun: localRun,
        selectedRunId: localRun?.id ?? null,
        runEventLog: [],
        isLatestRunLoading: false,
        isRunEventsLoading: false,
        isRagSourcesLoading: false,
        latestRunError: null,
        runEventsError: null,
        ragSourcesError: null,
        currentReportRunId: getReportRunId(localRun),
        reportActionState: localRun ? getReportActionState(localRun.reportState) : 'skipped',
      });
      return;
    }

    if (requestId !== latestRunRequestId || get().currentSessionId !== conversationId) {
      return;
    }

    const runSnapshot = runPersistenceRecordsToSnapshot({
      run: runRecord,
      events: latestRunResult.data.events,
      tools: latestRunResult.data.toolInvocations,
    });
    const runEvents = runEventsRecordToRunEvents(latestRunResult.data.events).slice(-MAX_RUN_EVENT_LOG_LENGTH);

    set((state) => {
      const activeSession = state.sessions.find((session) => session.id === conversationId);
      const syncedRunSnapshot = activeSession
        ? withReportStateFromSessionMessages(runSnapshot, activeSession)
        : runSnapshot;
      const sessionsWithCloudRun = upsertRunIntoSessions(state.sessions, conversationId, syncedRunSnapshot);
      const latestRun = getLatestRunByUpdatedAt(
        sessionsWithCloudRun.find((session) => session.id === conversationId),
      ) ?? syncedRunSnapshot;
      const nextSessions = setSessionLatestRunId(sessionsWithCloudRun, conversationId, latestRun.id);

      return {
        sessions: nextSessions,
        currentRun: latestRun,
        selectedRunId: latestRun.id,
        runEventLog: latestRun.id === syncedRunSnapshot.id ? runEvents : [],
        isLatestRunLoading: false,
        isRunEventsLoading: false,
        isRagSourcesLoading: false,
        latestRunError: null,
        runEventsError: null,
        ragSourcesError: null,
        currentReportRunId: getReportRunId(latestRun),
        reportActionState: getReportActionState(latestRun.reportState),
      };
    });
  },

  selectRunForCurrentSession: async (runId) => {
    const normalizedRunId = runId.trim();

    if (!normalizedRunId) {
      return;
    }

    const state = get();
    const conversationId = state.currentSessionId;
    const activeSession = state.sessions.find((session) => session.id === conversationId);

    if (!conversationId || !activeSession) {
      return;
    }

    const cachedRun = activeSession.runsById[normalizedRunId];
    const hasActiveRunRequest =
      state.generationStatus === 'streaming' ||
      state.agentRunStatus === 'running' ||
      Boolean(state.activeAgentRunRequestId);

    if (hasActiveRunRequest && state.currentRun?.id !== normalizedRunId) {
      return;
    }

    if (cachedRun) {
      const runWithSession = {
        ...cachedRun,
        sessionId: cachedRun.sessionId ?? conversationId,
      };
      const syncedRun = withReportStateFromSessionMessages(runWithSession, activeSession);
      const nextSessions = cacheRunInSession(state.sessions, conversationId, syncedRun);

      if (!state.isPersistentMode) {
        persistWorkbenchSessions(nextSessions, conversationId);
      }

      set({
        sessions: nextSessions,
        currentRun: syncedRun,
        selectedRunId: normalizedRunId,
        runEventLog: [],
        latestRunError: null,
        runEventsError: null,
        isLatestRunLoading: false,
        isRunEventsLoading: false,
        isRagSourcesLoading: false,
        ragSourcesError: null,
        currentReportRunId: getReportRunId(syncedRun),
        reportActionState: getReportActionState(syncedRun.reportState),
      });
      return;
    }

    if (!state.isPersistentMode || activeSession.isReadOnly || activeSession.visibility === 'demo') {
      return;
    }

    const accessToken = getAccessToken();

    if (!accessToken) {
      return;
    }

    const requestId = selectedRunRequestId + 1;
    selectedRunRequestId = requestId;
    set({
      selectedRunId: normalizedRunId,
      isLatestRunLoading: true,
      isRunEventsLoading: true,
      isRagSourcesLoading: true,
      latestRunError: null,
      runEventsError: null,
      ragSourcesError: null,
    });

    const result = await fetchRunBundle(normalizedRunId);

    if (
      requestId !== selectedRunRequestId ||
      get().currentSessionId !== conversationId ||
      get().selectedRunId !== normalizedRunId
    ) {
      return;
    }

    if (!result.ok) {
      set({
        isLatestRunLoading: false,
        isRunEventsLoading: false,
        isRagSourcesLoading: false,
        latestRunError: result.message,
        runEventsError: result.message,
        ragSourcesError: null,
      });
      return;
    }

    if (!result.data.run) {
      const message = '未找到这条回复对应的 Run。';
      set({
        isLatestRunLoading: false,
        isRunEventsLoading: false,
        isRagSourcesLoading: false,
        latestRunError: message,
        runEventsError: message,
        ragSourcesError: null,
      });
      return;
    }

    const runSnapshot = runPersistenceRecordsToSnapshot({
      run: result.data.run,
      events: result.data.events,
      tools: result.data.toolInvocations,
    });

    if (runSnapshot.sessionId && runSnapshot.sessionId !== conversationId) {
      const message = '这条 Run 不属于当前会话。';
      set({
        isLatestRunLoading: false,
        isRunEventsLoading: false,
        isRagSourcesLoading: false,
        latestRunError: message,
        runEventsError: message,
        ragSourcesError: null,
      });
      return;
    }

    const runEvents = runEventsRecordToRunEvents(result.data.events).slice(-MAX_RUN_EVENT_LOG_LENGTH);

    set((currentState) => {
      const currentActiveSession = currentState.sessions.find((session) => session.id === conversationId);
      const syncedRun = currentActiveSession
        ? withReportStateFromSessionMessages(runSnapshot, currentActiveSession)
        : runSnapshot;

      return {
        sessions: cacheRunInSession(currentState.sessions, conversationId, syncedRun),
        currentRun: syncedRun,
        selectedRunId: normalizedRunId,
        runEventLog: runEvents,
        isLatestRunLoading: false,
        isRunEventsLoading: false,
        isRagSourcesLoading: false,
        latestRunError: null,
        runEventsError: null,
        ragSourcesError: null,
        currentReportRunId: getReportRunId(syncedRun),
        reportActionState: getReportActionState(syncedRun.reportState),
      };
    });
  },

  loadRunEvents: async (runId) => {
    const accessToken = getAccessToken();

    if (!accessToken) {
      return;
    }

    set({
      isRunEventsLoading: true,
      runEventsError: null,
    });

    const result = await fetchRunEvents(runId);

    if (!result.ok) {
      set({
        isRunEventsLoading: false,
        runEventsError: result.message,
      });
      return;
    }

    set({
      runEventLog: runEventsRecordToRunEvents(result.data.events).slice(-MAX_RUN_EVENT_LOG_LENGTH),
      isRunEventsLoading: false,
      runEventsError: null,
    });
  },

  loadToolInvocations: async (runId) => {
    const accessToken = getAccessToken();

    if (!accessToken) {
      return;
    }

    const result = await fetchToolInvocations(runId);

    if (!result.ok) {
      set({
        runEventsError: result.message,
      });
      return;
    }

    const tools = result.data.tools.map((tool) => toolInvocationRecordToRunTool(tool));

    set((state) => {
      if (!state.currentRun || state.currentRun.id !== runId) {
        return {
          runEventsError: null,
        };
      }

      const nextRun: RunSnapshot = {
        ...state.currentRun,
        toolInvocations: tools,
        updatedAt: new Date().toISOString(),
      };
      const nextSessions = upsertRunIntoSessions(state.sessions, state.currentSessionId, nextRun);

      return {
        currentRun: nextRun,
        sessions: nextSessions,
        runEventsError: null,
      };
    });
  },

  loadReportArtifacts: async (conversationId) => {
    const accessToken = getReportArtifactAccessToken();

    if (!accessToken || !get().isPersistentMode) {
      return;
    }

    const requestId = reportArtifactsRequestId + 1;
    reportArtifactsRequestId = requestId;
    set({
      isReportArtifactsLoading: true,
      reportArtifactsError: null,
    });

    const result = await fetchConversationReportArtifacts(conversationId);

    if (requestId !== reportArtifactsRequestId || get().currentSessionId !== conversationId) {
      return;
    }

    if (!result.ok) {
      set({
        isReportArtifactsLoading: false,
        reportArtifactsError: result.message,
      });
      return;
    }

    set((state) => {
      const nextSessions = upsertReportArtifactsIntoSessions(state.sessions, conversationId, result.data.reports);
      const activeSession = nextSessions.find((session) => session.id === conversationId);
      const nextCurrentRun =
        state.currentRun && activeSession?.runsById[state.currentRun.id]
          ? activeSession.runsById[state.currentRun.id]
          : state.currentRun;

      return {
        sessions: nextSessions,
        currentRun: nextCurrentRun,
        selectedRunId: nextCurrentRun?.id ?? state.selectedRunId,
        isReportArtifactsLoading: false,
        reportArtifactsError: null,
        currentReportRunId: getReportRunId(nextCurrentRun),
        reportActionState: nextCurrentRun ? getReportActionState(nextCurrentRun.reportState) : 'skipped',
      };
    });
  },

  loadRagRetrievals: async (runId) => {
    void runId;
  },

  saveReportArtifact: async (params) => {
    const accessToken = getReportArtifactAccessToken();

    if (!accessToken || !get().isPersistentMode) {
      return;
    }

    const state = get();
    const activeSession = state.sessions.find((session) => session.id === params.conversationId);
    const run = activeSession?.runsById[params.runId] ?? (state.currentRun?.id === params.runId ? state.currentRun : null);

    const result = await createRunReportArtifact(
      params.runId,
      {
        conversationId: params.conversationId,
        title: params.title,
        contentMarkdown: params.contentMarkdown,
        runtimeRunId: params.runId,
        metadata: createReportArtifactMetadata(run, params.runId),
      },
    );

    if (!result.ok) {
      if (result.errorCode === 'not_found') {
        set({
          reportArtifactsError: null,
        });
        return;
      }

      set({
        reportArtifactsError: result.message,
      });
      return;
    }

    set((currentState) => {
      const nextSessions = upsertReportArtifactsIntoSessions(currentState.sessions, params.conversationId, [
        result.data.report,
      ]);
      const activeSession = nextSessions.find((session) => session.id === params.conversationId);
      const nextCurrentRun =
        currentState.currentRun && activeSession?.runsById[currentState.currentRun.id]
          ? activeSession.runsById[currentState.currentRun.id]
          : currentState.currentRun;

      return {
        sessions: nextSessions,
        currentRun: nextCurrentRun,
        reportArtifactsError: null,
        currentReportRunId: getReportRunId(nextCurrentRun),
        reportActionState: nextCurrentRun ? getReportActionState(nextCurrentRun.reportState) : 'skipped',
      };
    });
  },
});
