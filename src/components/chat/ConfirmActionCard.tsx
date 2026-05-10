import type { RunSnapshot } from '../../types/run';
import { useWorkbenchStore } from '../../stores/workbenchStore';
import { shouldShowReportConfirm } from '../../utils/run';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';

interface ConfirmActionCardProps {
  run: RunSnapshot;
}

export function ConfirmActionCard({ run }: ConfirmActionCardProps) {
  const generateReportForRun = useWorkbenchStore((state) => state.generateReportForRun);
  const skipReportForRun = useWorkbenchStore((state) => state.skipReportForRun);

  if (!shouldShowReportConfirm(run)) {
    return null;
  }

  const runId = run.id;

  const handleGenerateReport = () => {
    generateReportForRun(runId);
  };

  const handleSkipReport = () => {
    skipReportForRun(runId);
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
            生成报告
          </Button>
          <Button type="button" className="confirm-btn" onClick={handleSkipReport} variant="outline" size="sm">
            暂不生成
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
