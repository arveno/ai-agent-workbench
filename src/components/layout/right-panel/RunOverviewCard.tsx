import { useWorkbenchStore } from '../../../stores/workbenchStore';
import { createRunOverviewPanelModel } from '../../../utils/runPresentationModel';
import { AppIcon } from '../../common/AppIcon';
import { icons } from '../../common/iconMap';
import { Badge } from '../../ui/badge';
import { Button } from '../../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';

export function RunOverviewCard() {
  const sessions = useWorkbenchStore((state) => state.sessions);
  const currentRun = useWorkbenchStore((state) => state.currentRun);
  const runEventLog = useWorkbenchStore((state) => state.runEventLog);
  const currentSessionId = useWorkbenchStore((state) => state.currentSessionId);
  const selectedRunId = useWorkbenchStore((state) => state.selectedRunId);
  const isLatestRunLoading = useWorkbenchStore((state) => state.isLatestRunLoading);
  const latestRunError = useWorkbenchStore((state) => state.latestRunError);
  const loadLatestRunForConversation = useWorkbenchStore((state) => state.loadLatestRunForConversation);
  const selectRunForCurrentSession = useWorkbenchStore((state) => state.selectRunForCurrentSession);
  const currentSession = sessions.find((session) => session.id === currentSessionId);
  const overviewModel = createRunOverviewPanelModel({
    run: currentRun,
    runEventLog,
    currentSession: currentSession ?? null,
    isLatestRunLoading,
    latestRunError,
  });

  if (overviewModel.state !== 'ready') {
    return (
      <Card size="sm" className="right-card right-section">
        <CardHeader className="right-card-header">
          <CardTitle className="panel-section-title">
            <AppIcon icon={icons.agent} size={16} />
            <span>{overviewModel.title}</span>
          </CardTitle>
          <CardDescription>{overviewModel.description}</CardDescription>
        </CardHeader>
        <CardContent className="right-card-content">
          {overviewModel.state === 'loading' ? (
            <div className="right-panel-empty-state">
              <strong>正在恢复 Run</strong>
              正在读取最近一次 Agent Run。
            </div>
          ) : overviewModel.state === 'error' ? (
            <div className="right-panel-empty-state">
              <strong>Run 恢复失败</strong>
              {overviewModel.errorMessage}
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  if (selectedRunId) {
                    void selectRunForCurrentSession(selectedRunId);
                  } else if (currentSessionId) {
                    void loadLatestRunForConversation(currentSessionId);
                  }
                }}
              >
                {overviewModel.retryLabel}
              </Button>
            </div>
          ) : (
            <div className="right-panel-empty-state">
              <strong>{overviewModel.emptyTitle}</strong>
              {overviewModel.emptyDescription}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card size="sm" className="right-card right-section run-overview-card">
      <CardHeader className="right-card-header right-card-head">
        <div>
          <CardTitle className="panel-section-title">
            <AppIcon icon={icons.agent} size={16} />
            <span>{overviewModel.title}</span>
          </CardTitle>
          <CardDescription>{overviewModel.description}</CardDescription>
        </div>
        <Badge variant="outline" className={`run-status-badge run-status-badge-${overviewModel.statusTone}`}>
          {overviewModel.statusLabel}
        </Badge>
      </CardHeader>

      <CardContent className="right-card-content">
        <div className="run-overview-grid">
          {overviewModel.items.map((item) => (
            <div
              key={item.label}
              className={['run-overview-item', item.wide ? 'run-overview-item-wide' : ''].filter(Boolean).join(' ')}
            >
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
