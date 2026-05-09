import type { StateCreator } from 'zustand';
import type { UiSlice, WorkbenchStore } from '../../types/workbench';

export const createUiSlice: StateCreator<WorkbenchStore, [], [], UiSlice> = (set) => ({
  isDataSourcePanelOpen: false,
  isToolLibraryPanelOpen: false,
  isWorkflowPanelOpen: false,
  setDataSourcePanelOpen: (open) => {
    set({ isDataSourcePanelOpen: open });
  },
  setToolLibraryPanelOpen: (open) => {
    set({ isToolLibraryPanelOpen: open });
  },
  setWorkflowPanelOpen: (open) => {
    set({ isWorkflowPanelOpen: open });
  },
});
