import { useWorkbenchStore } from '../../stores/workbenchStore';
import { shouldShowReportConfirm } from '../../utils/run';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';

export function ConfirmActionCard() {
  const currentRun = useWorkbenchStore((state) => state.currentRun);
  const confirmGenerateReport = useWorkbenchStore((state) => state.confirmGenerateReport);
  const cancelGenerateReport = useWorkbenchStore((state) => state.cancelGenerateReport);

  if (!shouldShowReportConfirm(currentRun)) {
    return null;
  }

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
          <Button
            type="button"
            className="confirm-btn primary"
            onClick={() => {
              void confirmGenerateReport();
            }}
            size="sm"
          >
            生成报告
          </Button>
          <Button type="button" className="confirm-btn" onClick={cancelGenerateReport} variant="outline" size="sm">
            暂不生成
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
