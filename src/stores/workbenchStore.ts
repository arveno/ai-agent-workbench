import { create } from 'zustand';
import type { WorkbenchStore } from '../types/workbench';
import { createDemoTemplateSlice } from './slices/createDemoTemplateSlice';
import { createGenerationSlice } from './slices/createGenerationSlice';
import { createModelSlice } from './slices/createModelSlice';
import { createRunSlice } from './slices/createRunSlice';
import { createSessionSlice } from './slices/createSessionSlice';
import { createUiSlice } from './slices/createUiSlice';

export const useWorkbenchStore = create<WorkbenchStore>()((set, get, api) => ({
  ...createSessionSlice(set, get, api),
  ...createGenerationSlice(set, get, api),
  ...createDemoTemplateSlice(set, get, api),
  ...createModelSlice(set, get, api),
  ...createUiSlice(set, get, api),
  ...createRunSlice(set, get, api),
}));
