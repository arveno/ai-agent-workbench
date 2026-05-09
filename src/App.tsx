import { useEffect } from 'react';
import { ChatPanel } from './components/chat/ChatPanel';
import { AppHeader } from './components/layout/AppHeader';
import { RightPanel } from './components/layout/RightPanel';
import { Sidebar } from './components/layout/Sidebar';
import { WorkbenchHeader } from './components/layout/WorkbenchHeader';
import { ModelConnectModal } from './components/model/ModelConnectModal';
import { useWorkbenchStore } from './stores/workbenchStore';
import { parseWorkbenchUrl, replaceWorkbenchUrl } from './utils/urlState';

function App() {
  const hydrateFromUrl = useWorkbenchStore((state) => state.hydrateFromUrl);

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
    <div className="app-root">
      <AppHeader />

      <div className="app-body">
        <Sidebar />

        <main className="main-workspace">
          <WorkbenchHeader />
          <ChatPanel />
        </main>

        <RightPanel />
      </div>

      <ModelConnectModal />
    </div>
  );
}

export default App;
