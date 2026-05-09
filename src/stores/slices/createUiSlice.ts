import type { StateCreator } from 'zustand';
import type { UiSlice, WorkbenchStore } from '../../types/workbench';

export const createUiSlice: StateCreator<WorkbenchStore, [], [], UiSlice> = (set) => ({
  isDataSourceModalOpen: false,
  isToolLibraryModalOpen: false,
  isWorkflowPanelOpen: false,
  openDataSourceModal: () => {
    set({ isDataSourceModalOpen: true });
  },
  closeDataSourceModal: () => {
    set({ isDataSourceModalOpen: false });
  },
  openToolLibraryModal: () => {
    set({ isToolLibraryModalOpen: true });
  },
  closeToolLibraryModal: () => {
    set({ isToolLibraryModalOpen: false });
  },
  setWorkflowPanelOpen: (open) => {
    set({ isWorkflowPanelOpen: open });
  },
});
