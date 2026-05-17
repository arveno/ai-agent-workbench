import type { StateCreator } from 'zustand';
import type { RecentToolsSlice, WorkbenchStore } from '../../types/workbench';

let recentToolsRequestId = 0;

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
    recentToolsRequestId += 1;
    set({
      recentTools: [],
      isRecentToolsLoading: false,
      recentToolsError: null,
    });
  },
});
