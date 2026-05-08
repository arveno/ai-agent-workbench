import { create } from 'zustand';

interface WorkbenchState {
  currentSessionId: string;
  currentTaskId: string;
  setCurrentSessionId: (sessionId: string) => void;
  setCurrentTaskId: (taskId: string) => void;
  hydrateFromUrl: (state: { sessionId?: string; taskId?: string }) => void;
}

export const useWorkbenchStore = create<WorkbenchState>((set) => ({
  currentSessionId: 's_001',
  currentTaskId: 't_month_analytics',
  setCurrentSessionId: (sessionId) => {
    set({ currentSessionId: sessionId });
  },
  setCurrentTaskId: (taskId) => {
    set({ currentTaskId: taskId });
  },
  hydrateFromUrl: (state) => {
    set({
      currentSessionId: state.sessionId ?? 's_001',
      currentTaskId: state.taskId ?? 't_month_analytics',
    });
  },
}));
