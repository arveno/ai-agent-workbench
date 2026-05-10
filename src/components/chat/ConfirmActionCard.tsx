import type { RunSnapshot } from '../../types/run';
import { useWorkbenchStore } from '../../stores/workbenchStore';
import { createRunReportMarkdown } from '../../utils/report';
import { shouldShowReportConfirm } from '../../utils/run';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';

interface ConfirmActionCardProps {
  run?: RunSnapshot;
}

export function ConfirmActionCard({ run }: ConfirmActionCardProps) {
  const currentRun = useWorkbenchStore((state) => state.currentRun);
  const setCurrentRun = useWorkbenchStore((state) => state.setCurrentRun);
  const applyRunEvent = useWorkbenchStore((state) => state.applyRunEvent);
  const appendAssistantMessageToCurrentSession = useWorkbenchStore(
    (state) => state.appendAssistantMessageToCurrentSession,
  );
  const confirmGenerateReport = useWorkbenchStore((state) => state.confirmGenerateReport);
  const cancelGenerateReport = useWorkbenchStore((state) => state.cancelGenerateReport);
  const targetRun = run ?? currentRun;

  if (!targetRun || !shouldShowReportConfirm(targetRun)) {
    return null;
  }

  const isCurrentRun = currentRun?.id === targetRun.id;

  const handleGenerateReport = () => {
    if (isCurrentRun) {
      void confirmGenerateReport();
      return;
    }

    setCurrentRun(targetRun);
    appendAssistantMessageToCurrentSession(createRunReportMarkdown(targetRun), {
      kind: 'report',
      runId: targetRun.id,
    });
    applyRunEvent({
      type: 'report_generated',
      runId: targetRun.id,
    });
  };

  const handleSkipReport = () => {
    if (isCurrentRun) {
      cancelGenerateReport();
      return;
    }

    setCurrentRun(targetRun);
    applyRunEvent({
      type: 'report_skipped',
      runId: targetRun.id,
    });
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
