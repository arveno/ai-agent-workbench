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

  const query = params.toString();
  return query ? `?${query}` : '';
}

export function replaceWorkbenchUrl(state: WorkbenchUrlState): void {
  if (typeof window === 'undefined') {
    return;
  }

  const search = buildWorkbenchSearch(state);
  const nextUrl = `${window.location.pathname}${search}`;
  window.history.replaceState(null, '', nextUrl);
}
