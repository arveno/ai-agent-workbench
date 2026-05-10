import type { ReactNode } from 'react';

interface WorkspaceProps {
  children: ReactNode;
}

export function Workspace({ children }: WorkspaceProps) {
  return <main className="workspace">{children}</main>;
}
