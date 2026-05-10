import type { StateCreator } from 'zustand';
import type { RunEvent, RunSlice, RunSnapshot, WorkbenchStore } from '../../types/workbench';
import { applyRunEventToSnapshot } from '../../utils/runReducer';

const MAX_RUN_EVENT_LOG_LENGTH = 200;

export const createRunSlice: StateCreator<WorkbenchStore, [], [], RunSlice> = (set) => ({
  currentRun: null,
  runEventLog: [],

  setCurrentRun: (run: RunSnapshot | null) => {
    set({ currentRun: run });
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

      return {
        currentRun: nextRun,
        runEventLog: nextLog,
      };
    });
  },
});
