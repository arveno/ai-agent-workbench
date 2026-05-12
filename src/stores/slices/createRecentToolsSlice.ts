import type { StateCreator } from 'zustand';
import { fetchRecentTools } from '../../services/recentToolsApi';
import type { RecentToolsSlice, WorkbenchStore } from '../../types/workbench';
import { useAuthStore } from '../authStore';

let recentToolsRequestId = 0;

function getAccessToken(): string | null {
  const session = useAuthStore.getState().session;
  const accessToken = session?.access_token?.trim();
  return accessToken || null;
}

export const createRecentToolsSlice: StateCreator<WorkbenchStore, [], [], RecentToolsSlice> = (set, get) => ({
  recentTools: [],
  isRecentToolsLoading: false,
  recentToolsError: null,

  loadRecentTools: async () => {
    const accessToken = getAccessToken();

    if (!accessToken) {
      get().clearRecentTools();
      return;
    }

    const requestId = recentToolsRequestId + 1;
    recentToolsRequestId = requestId;
    set({
      isRecentToolsLoading: true,
      recentToolsError: null,
    });

    const result = await fetchRecentTools(accessToken);

    if (requestId !== recentToolsRequestId) {
      return;
    }

    if (!result.ok) {
      set({
        isRecentToolsLoading: false,
        recentToolsError: result.message,
      });
      return;
    }

    set({
      recentTools: result.data.tools,
      isRecentToolsLoading: false,
      recentToolsError: null,
    });
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
