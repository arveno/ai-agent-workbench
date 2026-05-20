import { useWorkbenchStore } from '../../../stores/workbenchStore';
import type { RunReportState, RunSnapshot } from '../../../types/run';
import { shouldShowReportConfirm } from '../../../utils/run';
import { AppIcon } from '../../common/AppIcon';
import { icons } from '../../common/iconMap';
import { Badge } from '../../ui/badge';
import { Button } from '../../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';

function getReportStateLabel(reportState: RunReportState): string {
  if (reportState === 'pending') {
    return '可生成';
  }

  if (reportState === 'generating') {
    return '生成中';
  }

  if (reportState === 'generated') {
    return '已生成';
  }

  if (reportState === 'skipped') {
    return '已跳过';
  }

  return '不适用';
}

function getReportStateClass(reportState: RunReportState): string {
  if (reportState === 'pending') {
    return 'report-status-badge report-status-badge-pending';
  }

  if (reportState === 'generating') {
    return 'report-status-badge report-status-badge-pending';
  }

  if (reportState === 'generated') {
    return 'report-status-badge report-status-badge-generated';
  }

  if (reportState === 'skipped') {
    return 'report-status-badge report-status-badge-skipped';
  }

  return 'report-status-badge report-status-badge-hidden';
}

function getReportDescription(run: RunSnapshot): string {
  if (run.reportState === 'generated') {
    return '当前选中 Run 已生成报告，可在聊天记录中查看和恢复。';
  }

  if (run.reportState === 'generating') {
    return '当前选中 Run 的报告正在生成。';
  }

  if (run.reportState === 'skipped') {
    return '当前选中 Run 已选择暂不生成报告。';
  }

  if (run.reportState === 'failed') {
    return '当前选中 Run 的报告生成失败。可重新发起分析后再生成报告。';
  }

  if (shouldShowReportConfirm(run)) {
    return '报告将基于当前选中 Run 的结论、工具调用、数据源和图表生成。';
  }

  if (run.intent !== 'data_analysis') {
    return '当前 Run 不是数据分析类任务，暂不提供报告生成。';
  }

  return '当前 Run 尚未满足报告生成条件。';
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
          {getReportStateLabel(currentRun.reportState)}
        </Badge>
      </CardHeader>

      <CardContent className="right-card-content">
        <div className="report-status-card">
          <p>{getReportDescription(currentRun)}</p>
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
