import type { ReactNode } from 'react';

interface WorkspaceInspectorProps {
  children: ReactNode;
}

export function WorkspaceInspector({ children }: WorkspaceInspectorProps) {
  return <aside className="workspace-inspector">{children}</aside>;
}
