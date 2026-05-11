import { useEffect } from 'react';
import { ChatPanel } from './components/chat/ChatPanel';
import { DataSourceModal } from './components/datasource/DataSourceModal';
import { RightPanel } from './components/layout/RightPanel';
import { Sidebar } from './components/layout/Sidebar';
import { Workspace } from './components/layout/Workspace';
import { WorkspaceHeader } from './components/layout/WorkspaceHeader';
import { WorkspaceInspector } from './components/layout/WorkspaceInspector';
import { WorkspaceMain } from './components/layout/WorkspaceMain';
import { ModelConnectModal } from './components/model/ModelConnectModal';
import { ToolLibraryModal } from './components/tools/ToolLibraryModal';
import { WorkflowModal } from './components/workflow/WorkflowModal';
import { useAuthStore } from './stores/authStore';
import { useWorkbenchStore } from './stores/workbenchStore';
import { parseWorkbenchUrl, replaceWorkbenchUrl } from './utils/urlState';

function App() {
  const initializeAuth = useAuthStore((state) => state.initializeAuth);
  const hydrateFromUrl = useWorkbenchStore((state) => state.hydrateFromUrl);

  useEffect(() => {
    void initializeAuth();
  }, [initializeAuth]);

  useEffect(() => {
    const urlState = parseWorkbenchUrl(window.location.search);
    const nextState = {
      sessionId: urlState.sessionId ?? 's_001',
      taskId: urlState.taskId ?? 't_month_analytics',
    };

    hydrateFromUrl(nextState);
    replaceWorkbenchUrl(nextState);
  }, [hydrateFromUrl]);

  return (
    <div className="app-shell app-root">
      <Sidebar />

      <Workspace>
        <WorkspaceHeader />

        <div className="workspace-content">
          <WorkspaceMain>
            <ChatPanel />
          </WorkspaceMain>

          <WorkspaceInspector>
            <RightPanel />
          </WorkspaceInspector>
        </div>
      </Workspace>

      <ModelConnectModal />
      <DataSourceModal />
      <ToolLibraryModal />
      <WorkflowModal />
    </div>
  );
}

export default App;
