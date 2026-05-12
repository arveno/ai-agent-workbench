import type { StateCreator } from 'zustand';
import type { RunEvent, RunSlice, RunSnapshot, WorkbenchStore } from '../../types/workbench';
import { applyRunEventToSnapshot } from '../../utils/runReducer';
import { getSessionLatestRun, initialWorkbenchState, persistWorkbenchSessions, upsertRunIntoSessions } from './shared';

const MAX_RUN_EVENT_LOG_LENGTH = 200;
const initialCurrentRun = getSessionLatestRun(
  initialWorkbenchState.sessions.find((session) => session.id === initialWorkbenchState.currentSessionId),
);

export const createRunSlice: StateCreator<WorkbenchStore, [], [], RunSlice> = (set) => ({
  currentRun: initialCurrentRun,
  runEventLog: [],

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
});
