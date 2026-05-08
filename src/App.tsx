import { useEffect } from 'react';
import './App.css';
import { ChatPanel } from './components/chat/ChatPanel';
import { RightPanel } from './components/layout/RightPanel';
import { Sidebar } from './components/layout/Sidebar';
import { WorkbenchHeader } from './components/layout/WorkbenchHeader';
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
    <div className="app-shell">
      <Sidebar />

      <main className="main-panel">
        <WorkbenchHeader />
        <ChatPanel />
      </main>

      <RightPanel />
    </div>
  );
}

export default App;