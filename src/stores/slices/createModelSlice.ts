import type { StateCreator } from 'zustand';
import type { ModelSlice, WorkbenchStore } from '../../types/workbench';
import {
  initialWorkbenchState,
  SELECTED_MODEL_ID_SESSION_KEY,
} from './shared';

export const createModelSlice: StateCreator<WorkbenchStore, [], [], ModelSlice> = (set) => ({
  selectedModelId: initialWorkbenchState.selectedModelId,
  isModelModalOpen: false,
  openModelModal: () => {
    set({ isModelModalOpen: true });
  },
  closeModelModal: () => {
    set({ isModelModalOpen: false });
  },
  setSelectedModelId: (selectedModelId) => {
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(SELECTED_MODEL_ID_SESSION_KEY, selectedModelId);
    }

    set({ selectedModelId });
  },
});
