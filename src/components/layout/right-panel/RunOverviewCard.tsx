import { useWorkbenchStore } from '../../../stores/workbenchStore';
import {
  formatRunElapsed,
  getConclusionSourceLabel,
  getRunIntentLabel,
  getRunModeLabel,
  getRunStatusLabel,
  getRunStatusTone,
  getRunTitle,
} from '../../../utils/runViewModel';
import { AppIcon } from '../../common/AppIcon';
import { icons } from '../../common/iconMap';
import { Badge } from '../../ui/badge';
import { Button } from '../../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';

function getRunStatusBadgeClass(tone: ReturnType<typeof getRunStatusTone>): string {
  return `run-status-badge run-status-badge-${tone}`;
}

export function RunOverviewCard() {
  const currentRun = useWorkbenchStore((state) => state.currentRun);
  const currentSessionId = useWorkbenchStore((state) => state.currentSessionId);
  const isLatestRunLoading = useWorkbenchStore((state) => state.isLatestRunLoading);
  const latestRunError = useWorkbenchStore((state) => state.latestRunError);
  const loadLatestRunForConversation = useWorkbenchStore((state) => state.loadLatestRunForConversation);

  if (!currentRun) {
    return (
      <Card size="sm" className="right-card right-section">
        <CardHeader className="right-card-header">
          <CardTitle className="panel-section-title">
            <AppIcon icon={icons.agent} size={16} />
            <span>Run 概览</span>
          </CardTitle>
          <CardDescription>本轮 Run 的基础信息</CardDescription>
        </CardHeader>
        <CardContent className="right-card-content">
          {isLatestRunLoading ? (
            <div className="right-panel-empty-state">
              <strong>正在恢复 Run</strong>
              正在读取最近一次 Agent Run。
            </div>
          ) : latestRunError ? (
            <div className="right-panel-empty-state">
              <strong>Run 恢复失败</strong>
              {latestRunError}
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  if (currentSessionId) {
                    void loadLatestRunForConversation(currentSessionId);
                  }
                }}
              >
                重试
              </Button>
            </div>
          ) : (
            <div className="right-panel-empty-state">
              <strong>暂无 Run</strong>
              完成一次 Agent Run 后，这里会展示执行过程。
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  const statusTone = getRunStatusTone(currentRun.status);
  const overviewItems = [
    { label: 'Run ID', value: currentRun.id },
    { label: '模式', value: getRunModeLabel(currentRun.mode) },
    { label: '任务类型', value: getRunIntentLabel(currentRun.intent) },
    { label: '耗时', value: formatRunElapsed(currentRun) },
    { label: '结论来源', value: getConclusionSourceLabel(currentRun.conclusionSource) },
  ];

  return (
    <Card size="sm" className="right-card right-section run-overview-card">
      <CardHeader className="right-card-header right-card-head">
        <div>
          <CardTitle className="panel-section-title">
            <AppIcon icon={icons.agent} size={16} />
            <span>Run 概览</span>
          </CardTitle>
          <CardDescription>{getRunTitle(currentRun)}</CardDescription>
        </div>
        <Badge variant="outline" className={getRunStatusBadgeClass(statusTone)}>
          {getRunStatusLabel(currentRun.status)}
        </Badge>
      </CardHeader>

      <CardContent className="right-card-content">
        <div className="run-overview-grid">
          {overviewItems.map((item) => (
            <div key={item.label} className="run-overview-item">
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
