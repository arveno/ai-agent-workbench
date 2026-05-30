import { useWorkbenchStore } from '../../../stores/workbenchStore';
import { createRunReportPanelModel } from '../../../utils/runPresentationModel';
import { AppIcon } from '../../common/AppIcon';
import { icons } from '../../common/iconMap';
import { Badge } from '../../ui/badge';
import { Button } from '../../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';

export function ReportStatusCard() {
  const currentRun = useWorkbenchStore((state) => state.currentRun);
  const generateReportForRun = useWorkbenchStore((state) => state.generateReportForRun);
  const skipReportForRun = useWorkbenchStore((state) => state.skipReportForRun);
  const panelModel = createRunReportPanelModel(currentRun);

  if (panelModel.state === 'empty') {
    return (
      <Card size="sm" className="right-card right-section">
        <CardHeader className="right-card-header">
          <CardTitle className="panel-section-title">
            <AppIcon icon={icons.report} size={16} />
            <span>{panelModel.title}</span>
          </CardTitle>
          <CardDescription>{panelModel.description}</CardDescription>
        </CardHeader>
        <CardContent className="right-card-content">
          <div className="right-panel-empty-state">
            <strong>{panelModel.emptyTitle}</strong>
            {panelModel.emptyDescription}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card size="sm" className="right-card right-section">
      <CardHeader className="right-card-header right-card-head">
        <div>
          <CardTitle className="panel-section-title">
            <AppIcon icon={icons.report} size={16} />
            <span>{panelModel.title}</span>
          </CardTitle>
          <CardDescription>{panelModel.description}</CardDescription>
        </div>
        <Badge variant="outline" className={panelModel.badgeClassName}>
          {panelModel.badgeLabel}
        </Badge>
      </CardHeader>

      <CardContent className="right-card-content">
        <div className="report-status-card">
          <p>{panelModel.statusDescription}</p>
          {panelModel.canGenerateReport && panelModel.runId ? (
            <div className="report-status-actions">
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  if (panelModel.runId) {
                    generateReportForRun(panelModel.runId);
                  }
                }}
              >
                {panelModel.generateLabel}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  if (panelModel.runId) {
                    skipReportForRun(panelModel.runId);
                  }
                }}
              >
                {panelModel.skipLabel}
              </Button>
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
