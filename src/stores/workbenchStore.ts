import { create } from 'zustand';
import { mockTasks } from '../mocks/tasks';

const DEFAULT_TASK_ID = 't_month_analytics';
const DEFAULT_PROMPT = '请分析 2026 年 5 月教学质量相关数据，找出异常指标，并给出简短结论。';

interface WorkbenchState {
  currentSessionId: string;
  currentTaskId: string;
  currentPrompt: string;
  setCurrentSessionId: (sessionId: string) => void;
  setCurrentTaskId: (taskId: string) => void;
  setCurrentPrompt: (prompt: string) => void;
  startTask: (taskId: string, prompt: string) => void;
  hydrateFromUrl: (state: { sessionId?: string; taskId?: string }) => void;
}

export const useWorkbenchStore = create<WorkbenchState>((set) => ({
  currentSessionId: 's_001',
  currentTaskId: DEFAULT_TASK_ID,
  currentPrompt: DEFAULT_PROMPT,
  setCurrentSessionId: (sessionId) => {
    set({ currentSessionId: sessionId });
  },
  setCurrentTaskId: (taskId) => {
    set({ currentTaskId: taskId });
  },
  setCurrentPrompt: (prompt) => {
    set({ currentPrompt: prompt });
  },
  startTask: (taskId, prompt) => {
    set({
      currentTaskId: taskId,
      currentPrompt: prompt,
    });
  },
  hydrateFromUrl: (state) => {
    const nextTaskId = state.taskId ?? DEFAULT_TASK_ID;
    const matchedTask = mockTasks.find((task) => task.id === nextTaskId);

    set({
      currentSessionId: state.sessionId ?? 's_001',
      currentTaskId: nextTaskId,
      currentPrompt: matchedTask?.prompt ?? DEFAULT_PROMPT,
    });
  },
}));
