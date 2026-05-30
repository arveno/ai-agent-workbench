import { useWorkbenchStore } from '../../../stores/workbenchStore';
import { createRunDataSourcePanelModel } from '../../../utils/runPresentationModel';
import { AppIcon } from '../../common/AppIcon';
import { icons } from '../../common/iconMap';
import { Badge } from '../../ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';

export function DataSourceCard() {
  const currentRun = useWorkbenchStore((state) => state.currentRun);
  const panelModel = createRunDataSourcePanelModel(currentRun);

  if (!panelModel.hasRun) {
    return (
      <Card size="sm" className="right-card right-section">
        <CardHeader className="right-card-header">
          <CardTitle className="panel-section-title">
            <AppIcon icon={icons.database} size={16} />
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

  if (panelModel.state === 'empty') {
    return (
      <Card size="sm" className="right-card right-section">
        <CardHeader className="right-card-header">
          <CardTitle className="panel-section-title">
            <AppIcon icon={icons.database} size={16} />
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
            <AppIcon icon={icons.database} size={16} />
            <span>{panelModel.title}</span>
          </CardTitle>
          <CardDescription>{panelModel.description}</CardDescription>
        </div>
        <Badge variant="outline" className={`run-status-badge run-status-badge-${panelModel.statusTone}`}>
          {panelModel.statusLabel}
        </Badge>
      </CardHeader>

      <CardContent className="right-card-content">
        <div className="datasource-card">
          <div className="datasource-title-wrap">
            <span className="datasource-title-icon" aria-hidden="true">
              <AppIcon icon={icons.database} size={14} />
            </span>
            <div>
              <div className="datasource-name">{panelModel.name}</div>
              <div className="datasource-subtitle">{panelModel.subtitle}</div>
            </div>
          </div>

          <div className="datasource-meta-grid">
            {panelModel.metaItems.map((item) => (
              <div key={item.label}>
                <div className="datasource-meta-label">{item.label}</div>
                <div className="datasource-meta-value">{item.value}</div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
