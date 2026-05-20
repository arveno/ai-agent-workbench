import type { StateCreator } from 'zustand';
import type { RecentToolsSlice, WorkbenchStore } from '../../types/workbench';

export const createRecentToolsSlice: StateCreator<WorkbenchStore, [], [], RecentToolsSlice> = (set, get) => ({
  recentTools: [],
  isRecentToolsLoading: false,
  recentToolsError: null,

  loadRecentTools: async () => {
    get().clearRecentTools();
  },

  retryLoadRecentTools: async () => {
    await get().loadRecentTools();
  },

  clearRecentTools: () => {
    set({
      recentTools: [],
      isRecentToolsLoading: false,
      recentToolsError: null,
    });
  },
});
