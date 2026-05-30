import { useWorkbenchStore } from '../../../stores/workbenchStore';
import { createRunToolsPanelModel } from '../../../utils/runPresentationModel';
import { AppIcon } from '../../common/AppIcon';
import { icons } from '../../common/iconMap';
import { Badge } from '../../ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import { Separator } from '../../ui/separator';

export function ToolInvocationsCard() {
  const currentRun = useWorkbenchStore((state) => state.currentRun);
  const panelModel = createRunToolsPanelModel(currentRun);

  if (!currentRun) {
    return (
      <Card size="sm" className="right-card right-section">
        <CardHeader className="right-card-header">
          <CardTitle className="panel-section-title">
            <AppIcon icon={icons.settings} size={16} />
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
            <AppIcon icon={icons.settings} size={16} />
            <span>{panelModel.title}</span>
          </CardTitle>
          <CardDescription>{panelModel.description}</CardDescription>
        </div>
        {panelModel.countLabel ? (
          <Badge variant="outline" className="right-card-count-badge">
            {panelModel.countLabel}
          </Badge>
        ) : null}
      </CardHeader>

      <CardContent className="right-card-content">
        {panelModel.state === 'empty' ? (
          <div className="right-panel-empty-state">
            <strong>{panelModel.emptyTitle}</strong>
            {panelModel.emptyDescription}
          </div>
        ) : (
          <div className="tool-invocation-list">
            {panelModel.tools.map((tool, index) => (
              <div key={tool.id}>
                {index > 0 ? <Separator className="tool-invocation-separator" /> : null}
                <div className="tool-invocation-row">
                  <div className="tool-invocation-main">
                    <div className="tool-invocation-name">{tool.displayName}</div>
                    <div className="tool-invocation-description">
                      {tool.categoryLabel} · {tool.toolName}
                    </div>
                    <div className="tool-invocation-summary">输入：{tool.inputText}</div>
                    <div className="tool-invocation-summary">输出：{tool.outputText}</div>
                    {tool.failureText ? (
                      <div className="tool-invocation-summary">失败原因：{tool.failureText}</div>
                    ) : null}
                  </div>
                  <div className="tool-invocation-meta">
                    <Badge variant="outline" className={`status-badge ${tool.statusClass}`}>
                      {tool.statusLabel}
                    </Badge>
                    <span>{tool.elapsedText}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
