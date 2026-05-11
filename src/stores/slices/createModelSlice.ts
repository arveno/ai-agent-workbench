import type { StateCreator } from 'zustand';
import type { ModelSlice, ModelProviderConfig, ModelProviderConfigMap, WorkbenchStore } from '../../types/workbench';
import { writeSessionStorageJson } from '../../utils/sessionStorage';
import {
  getInitialModelConfigs,
  initialWorkbenchState,
  MODEL_CONFIG_SESSION_KEY,
  MODEL_PROVIDER_SESSION_KEY,
} from './shared';

export const createModelSlice: StateCreator<WorkbenchStore, [], [], ModelSlice> = (set) => ({
  currentModelProvider: initialWorkbenchState.currentModelProvider,
  isModelModalOpen: false,
  modelConfigs: getInitialModelConfigs(),
  modelTestStatusMap: {},
  openModelModal: () => {
    set({ isModelModalOpen: true });
  },
  closeModelModal: () => {
    set({ isModelModalOpen: false });
  },
  setCurrentModelProvider: (provider) => {
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(MODEL_PROVIDER_SESSION_KEY, provider);
    }

    set({ currentModelProvider: provider });
  },
  saveModelConfig: (providerId, config) => {
    const normalizedConfig: ModelProviderConfig = {
      baseUrl: config.baseUrl?.trim(),
      modelName: config.modelName?.trim(),
    };

    set((state) => {
      const nextConfigs: ModelProviderConfigMap = {
        ...state.modelConfigs,
        [providerId]: normalizedConfig,
      };

      writeSessionStorageJson(MODEL_CONFIG_SESSION_KEY, nextConfigs);

      return {
        modelConfigs: nextConfigs,
      };
    });
  },
  clearModelConfig: (providerId) => {
    set((state) => {
      const nextConfigs: ModelProviderConfigMap = { ...state.modelConfigs };
      delete nextConfigs[providerId];
      const shouldFallbackToMock = state.currentModelProvider === providerId;
      const nextProvider = shouldFallbackToMock ? 'mock' : state.currentModelProvider;

      writeSessionStorageJson(MODEL_CONFIG_SESSION_KEY, nextConfigs);

      if (typeof window !== 'undefined' && shouldFallbackToMock) {
        window.sessionStorage.setItem(MODEL_PROVIDER_SESSION_KEY, 'mock');
      }

      return {
        modelConfigs: nextConfigs,
        currentModelProvider: nextProvider,
        modelTestStatusMap: {
          ...state.modelTestStatusMap,
          [providerId]: 'idle',
        },
      };
    });
  },
  setModelTestStatus: (providerId, status) => {
    set((state) => ({
      modelTestStatusMap: {
        ...state.modelTestStatusMap,
        [providerId]: status,
      },
    }));
  },
});
