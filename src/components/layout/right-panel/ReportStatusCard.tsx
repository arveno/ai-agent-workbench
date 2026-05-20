import { useWorkbenchStore } from '../../../stores/workbenchStore';
import type { RunReportState } from '../../../types/run';
import {
  getReportStatusDescription,
  getReportStatusLabel,
  getReportStatusTone,
} from '../../../utils/observabilityLabels';
import { shouldShowReportConfirm } from '../../../utils/run';
import { AppIcon } from '../../common/AppIcon';
import { icons } from '../../common/iconMap';
import { Badge } from '../../ui/badge';
import { Button } from '../../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';

function getReportStateClass(reportState: RunReportState): string {
  const tone = getReportStatusTone(reportState);

  if (tone === 'active') {
    return 'report-status-badge report-status-badge-pending';
  }

  if (tone === 'success') {
    return 'report-status-badge report-status-badge-generated';
  }

  if (reportState === 'skipped') {
    return 'report-status-badge report-status-badge-skipped';
  }

  if (tone === 'danger') {
    return 'report-status-badge status-badge-error';
  }

  return 'report-status-badge report-status-badge-hidden';
}

export function ReportStatusCard() {
  const currentRun = useWorkbenchStore((state) => state.currentRun);
  const generateReportForRun = useWorkbenchStore((state) => state.generateReportForRun);
  const skipReportForRun = useWorkbenchStore((state) => state.skipReportForRun);

  if (!currentRun) {
    return (
      <Card size="sm" className="right-card right-section">
        <CardHeader className="right-card-header">
          <CardTitle className="panel-section-title">
            <AppIcon icon={icons.report} size={16} />
            <span>报告</span>
          </CardTitle>
          <CardDescription>当前 Run 的报告状态</CardDescription>
        </CardHeader>
        <CardContent className="right-card-content">
          <div className="right-panel-empty-state">
            <strong>暂无报告上下文</strong>
            完成一次数据分析 Run 后，这里会显示报告是否可生成以及绑定的 Run。
          </div>
        </CardContent>
      </Card>
    );
  }

  const canGenerateReport = shouldShowReportConfirm(currentRun);

  return (
    <Card size="sm" className="right-card right-section">
      <CardHeader className="right-card-header right-card-head">
        <div>
          <CardTitle className="panel-section-title">
            <AppIcon icon={icons.report} size={16} />
            <span>报告</span>
          </CardTitle>
          <CardDescription>绑定当前选中 Run：{currentRun.id}</CardDescription>
        </div>
        <Badge variant="outline" className={getReportStateClass(currentRun.reportState)}>
          {getReportStatusLabel(currentRun.reportState)}
        </Badge>
      </CardHeader>

      <CardContent className="right-card-content">
        <div className="report-status-card">
          <p>{getReportStatusDescription(currentRun, canGenerateReport)}</p>
          {canGenerateReport ? (
            <div className="report-status-actions">
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  generateReportForRun(currentRun.id);
                }}
              >
                生成当前 Run 报告
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  skipReportForRun(currentRun.id);
                }}
              >
                暂不生成
              </Button>
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
