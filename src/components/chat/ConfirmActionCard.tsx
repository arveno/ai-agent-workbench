import type { RunReportPanelModel } from '../../utils/runPresentationModel';
import { useWorkbenchStore } from '../../stores/workbenchStore';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';

interface ConfirmActionCardProps {
  model: RunReportPanelModel;
}

export function ConfirmActionCard({ model }: ConfirmActionCardProps) {
  const generateReportForRun = useWorkbenchStore((state) => state.generateReportForRun);
  const skipReportForRun = useWorkbenchStore((state) => state.skipReportForRun);

  if (!model.canGenerateReport || !model.runId) {
    return null;
  }

  const handleGenerateReport = () => {
    if (model.runId) {
      generateReportForRun(model.runId);
    }
  };

  const handleSkipReport = () => {
    if (model.runId) {
      skipReportForRun(model.runId);
    }
  };

  return (
    <Card size="sm" className="confirm-card">
      <CardContent className="confirm-card-content">
        <div className="confirm-icon" aria-hidden="true">
          ?
        </div>
        <div className="confirm-copy">
          <div className="confirm-title-row">
            <h3>后续操作</h3>
            <Badge variant="outline" className="confirm-badge">
              报告
            </Badge>
          </div>
          <p>是否基于本次分析生成简版报告？</p>
        </div>
        <div className="confirm-actions">
          <Button type="button" className="confirm-btn primary" onClick={handleGenerateReport} size="sm">
            {model.confirmGenerateLabel}
          </Button>
          <Button type="button" className="confirm-btn" onClick={handleSkipReport} variant="outline" size="sm">
            {model.skipLabel}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
