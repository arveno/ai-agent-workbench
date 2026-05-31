import { useWorkbenchStore } from '../../../stores/workbenchStore';
import { createRunAnalyticsPanelModel } from '../../../utils/runPresentationModel';
import { RunChart } from '../../analytics/RunChart';
import { AppIcon } from '../../common/AppIcon';
import { icons } from '../../common/iconMap';
import { Badge } from '../../ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';

export function AnalyticsResultCard() {
  const currentRun = useWorkbenchStore((state) => state.currentRun);
  const panelModel = createRunAnalyticsPanelModel(currentRun);

  if (!currentRun) {
    return (
      <Card size="sm" className="right-card right-section">
        <CardHeader className="right-card-header">
          <CardTitle className="panel-section-title">
            <AppIcon icon={icons.chart} size={16} />
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
      <CardHeader className="right-card-header">
        <CardTitle className="panel-section-title">
          <AppIcon icon={icons.chart} size={16} />
          <span>{panelModel.title}</span>
        </CardTitle>
        <CardDescription>{panelModel.description}</CardDescription>
      </CardHeader>
      <CardContent className="right-card-content">
        {panelModel.state === 'ready' && panelModel.chartData ? (
          <div className="run-chart-card">
            <div className="run-chart-kpis">
              <div className="run-chart-kpi">
                <span className="run-chart-kpi-label">数据点</span>
                <strong className="run-chart-kpi-value">{panelModel.pointCount}</strong>
              </div>
              <div className="run-chart-kpi">
                <span className="run-chart-kpi-label">最高值</span>
                <strong className="run-chart-kpi-value">{panelModel.maxValueText}</strong>
              </div>
              <div className="run-chart-kpi">
                <span className="run-chart-kpi-label">最低值</span>
                <strong className="run-chart-kpi-value">{panelModel.minValueText}</strong>
              </div>
            </div>

            <div className="run-chart-header">
              <div>
                <div className="run-chart-title">{panelModel.chartData.title}</div>
                <div className="run-chart-meta">
                  <Badge variant="outline" className="run-chart-type-badge">
                    {panelModel.chartTypeLabel}
                  </Badge>
                  <span>{panelModel.seriesCountLabel}</span>
                </div>
              </div>
            </div>

            <RunChart chartData={panelModel.chartData} />

            {panelModel.summary ? <div className="run-chart-text">{panelModel.summary}</div> : null}
          </div>
        ) : (
          <div className="right-panel-empty-state">
            <strong>{panelModel.emptyTitle}</strong>
            {panelModel.emptyDescription}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
