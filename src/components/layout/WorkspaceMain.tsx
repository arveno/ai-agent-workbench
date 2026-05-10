import type { ReactNode } from 'react';

interface WorkspaceMainProps {
  children: ReactNode;
}

export function WorkspaceMain({ children }: WorkspaceMainProps) {
  return <section className="workspace-main">{children}</section>;
}
