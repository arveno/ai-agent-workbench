export interface WorkbenchUrlState {
  sessionId?: string;
  taskId?: string;
}

export function parseWorkbenchUrl(search: string): WorkbenchUrlState {
  const params = new URLSearchParams(search);

  return {
    sessionId: params.get('sessionId') || undefined,
    taskId: params.get('taskId') || undefined,
  };
}

export function buildWorkbenchSearch(state: WorkbenchUrlState): string {
  const params = new URLSearchParams();

  if (state.sessionId) {
    params.set('sessionId', state.sessionId);
  }

  if (state.taskId) {
    params.set('taskId', state.taskId);
  }

  const query = params.toString();
  return query ? `?${query}` : '';
}

export function replaceWorkbenchUrl(state: WorkbenchUrlState): void {
  const search = buildWorkbenchSearch(state);
  const nextUrl = `${window.location.pathname}${search}`;
  window.history.replaceState(null, '', nextUrl);
}
