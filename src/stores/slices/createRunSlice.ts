import type { StateCreator } from 'zustand';
import { isCloudBasePrivateApiEnabled } from '../../services/cloudbaseApiClient';
import { fetchRagRetrievals } from '../../services/ragRetrievalApi';
import { createRunReportArtifact, fetchConversationReportArtifacts } from '../../services/reportArtifactApi';
import { fetchLatestRunForConversation, fetchRunEvents, fetchToolInvocations } from '../../services/runPersistenceApi';
import type { RunEvent, RunSlice, RunSnapshot, WorkbenchStore } from '../../types/workbench';
import { ragRetrievalLogsToSources } from '../../utils/ragSourceMapper';
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
let reportArtifactsRequestId = 0;

function getAccessToken(): string | null {
  const authState = useAuthStore.getState();
  const accessToken = authState.accessToken?.trim() || authState.session?.access_token?.trim();
  return accessToken || null;
}

function getReportArtifactAccessToken(): string | null {
  return getAccessToken();
}

export const createRunSlice: StateCreator<WorkbenchStore, [], [], RunSlice> = (set, get) => ({
  currentRun: initialCurrentRun,
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
        return { currentRun: null };
      }

      const runWithSession: RunSnapshot = {
        ...run,
        sessionId: run.sessionId ?? state.currentSessionId,
      };
      const nextSessions = upsertRunIntoSessions(state.sessions, state.currentSessionId, runWithSession);

      if (!state.isPersistentMode) {
        persistWorkbenchSessions(nextSessions, state.currentSessionId);
      }

      return {
        currentRun: runWithSession,
        sessions: nextSessions,
      };
    });
  },

  clearCurrentRun: () => {
    set({
      currentRun: null,
      runEventLog: [],
    });
  },

  applyRunEvent: (event: RunEvent) => {
    set((state) => {
      const nextRun = applyRunEventToSnapshot(state.currentRun, event);
      const nextLog = [...state.runEventLog, event].slice(-MAX_RUN_EVENT_LOG_LENGTH);

      if (!nextRun) {
        return {
          currentRun: null,
          runEventLog: nextLog,
        };
      }

      const runWithSession: RunSnapshot = {
        ...nextRun,
        sessionId: nextRun.sessionId ?? state.currentSessionId,
      };
      const nextSessions = upsertRunIntoSessions(state.sessions, state.currentSessionId, runWithSession);

      if (!state.isPersistentMode) {
        persistWorkbenchSessions(nextSessions, state.currentSessionId);
      }

      return {
        currentRun: runWithSession,
        runEventLog: nextLog,
        sessions: nextSessions,
      };
    });
  },

  loadLatestRunForConversation: async (conversationId) => {
    if (isCloudBasePrivateApiEnabled()) {
      return;
    }

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

    const latestRunResult = await fetchLatestRunForConversation(conversationId, accessToken);

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
      set({
        currentRun: null,
        runEventLog: [],
        isLatestRunLoading: false,
        isRunEventsLoading: false,
        isRagSourcesLoading: false,
        latestRunError: null,
        runEventsError: null,
        ragSourcesError: null,
      });
      return;
    }

    const runId = runRecord.runtime_run_id ?? runRecord.id;
    const [eventsResult, toolsResult, retrievalsResult] = await Promise.all([
      fetchRunEvents(runId, accessToken),
      fetchToolInvocations(runId, accessToken),
      fetchRagRetrievals(runId, accessToken),
    ]);

    if (requestId !== latestRunRequestId || get().currentSessionId !== conversationId) {
      return;
    }

    if (!eventsResult.ok) {
      set({
        isLatestRunLoading: false,
        isRunEventsLoading: false,
        isRagSourcesLoading: false,
        latestRunError: null,
        runEventsError: eventsResult.message,
        ragSourcesError: null,
      });
      return;
    }

    if (!toolsResult.ok) {
      set({
        isLatestRunLoading: false,
        isRunEventsLoading: false,
        isRagSourcesLoading: false,
        latestRunError: null,
        runEventsError: toolsResult.message,
        ragSourcesError: null,
      });
      return;
    }

    const restoredSources = retrievalsResult.ok
      ? ragRetrievalLogsToSources(retrievalsResult.data.retrievals)
      : [];
    const runSnapshot = runPersistenceRecordsToSnapshot({
      run: runRecord,
      events: eventsResult.data.events,
      tools: toolsResult.data.tools,
    });
    const runSnapshotWithSources: RunSnapshot = restoredSources.length > 0 && (runSnapshot.sources ?? []).length === 0
      ? {
          ...runSnapshot,
          sources: restoredSources,
        }
      : runSnapshot;
    const runEvents = runEventsRecordToRunEvents(eventsResult.data.events).slice(-MAX_RUN_EVENT_LOG_LENGTH);

    set((state) => {
      const nextSessions = upsertRunIntoSessions(state.sessions, conversationId, runSnapshotWithSources);

      return {
        sessions: nextSessions,
        currentRun: runSnapshotWithSources,
        runEventLog: runEvents,
        isLatestRunLoading: false,
        isRunEventsLoading: false,
        isRagSourcesLoading: false,
        latestRunError: null,
        runEventsError: null,
        ragSourcesError: retrievalsResult.ok || (runSnapshotWithSources.sources ?? []).length > 0
          ? null
          : retrievalsResult.message,
      };
    });
  },

  loadRunEvents: async (runId) => {
    if (isCloudBasePrivateApiEnabled()) {
      return;
    }

    const accessToken = getAccessToken();

    if (!accessToken) {
      return;
    }

    set({
      isRunEventsLoading: true,
      runEventsError: null,
    });

    const result = await fetchRunEvents(runId, accessToken);

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
    if (isCloudBasePrivateApiEnabled()) {
      return;
    }

    const accessToken = getAccessToken();

    if (!accessToken) {
      return;
    }

    const result = await fetchToolInvocations(runId, accessToken);

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

    const result = await fetchConversationReportArtifacts(conversationId, accessToken);

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

    const reportMessages = result.data.reports.map((report) => reportArtifactToMessage(report));

    set((state) => ({
      sessions: state.sessions.map((session) => {
        if (session.id !== conversationId) {
          return session;
        }

        const existingMessageIds = new Set(session.messages.map((message) => message.id));
        const nextMessages = [...session.messages];

        for (const message of reportMessages) {
          const hasRunReport =
            message.runId &&
            nextMessages.some(
              (existingMessage) =>
                existingMessage.kind === 'report' && existingMessage.runId === message.runId,
            );

          if (!existingMessageIds.has(message.id) && !hasRunReport) {
            nextMessages.push(message);
          }
        }

        nextMessages.sort((left, right) => left.createdAt - right.createdAt);

        return {
          ...session,
          messages: nextMessages,
          messageCount: nextMessages.length,
        };
      }),
      isReportArtifactsLoading: false,
      reportArtifactsError: null,
    }));
  },

  loadRagRetrievals: async (runId) => {
    if (isCloudBasePrivateApiEnabled()) {
      return;
    }

    const accessToken = getAccessToken();

    if (!accessToken || !get().isPersistentMode) {
      return;
    }

    set({
      isRagSourcesLoading: true,
      ragSourcesError: null,
    });

    const result = await fetchRagRetrievals(runId, accessToken);

    if (!result.ok) {
      set({
        isRagSourcesLoading: false,
        ragSourcesError: result.message,
      });
      return;
    }

    const sources = ragRetrievalLogsToSources(result.data.retrievals);

    set((state) => {
      if (!state.currentRun || state.currentRun.id !== runId) {
        return {
          isRagSourcesLoading: false,
          ragSourcesError: null,
        };
      }

      const nextRun: RunSnapshot = {
        ...state.currentRun,
        sources,
        updatedAt: new Date().toISOString(),
      };
      const nextSessions = upsertRunIntoSessions(state.sessions, state.currentSessionId, nextRun);

      return {
        currentRun: nextRun,
        sessions: nextSessions,
        isRagSourcesLoading: false,
        ragSourcesError: null,
      };
    });
  },

  saveReportArtifact: async (params) => {
    const accessToken = getReportArtifactAccessToken();

    if (!accessToken || !get().isPersistentMode) {
      return;
    }

    const result = await createRunReportArtifact(
      params.runId,
      {
        conversationId: params.conversationId,
        title: params.title,
        contentMarkdown: params.contentMarkdown,
        runtimeRunId: params.runId,
      },
      accessToken,
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

    set({
      reportArtifactsError: null,
    });
  },
});
