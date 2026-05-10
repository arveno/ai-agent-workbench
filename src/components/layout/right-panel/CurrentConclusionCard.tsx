import { useWorkbenchStore } from '../../../stores/workbenchStore';
import { getConclusionSourceLabel } from '../../../utils/runViewModel';
import { AppIcon } from '../../common/AppIcon';
import { icons } from '../../common/iconMap';
import { Badge } from '../../ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';

function getConclusionText(params: {
  status: string;
  conclusion: string;
  errorMessage?: string;
}): string {
  if (params.status === 'error') {
    return `执行失败：${params.errorMessage ?? '未知错误'}`;
  }

  if (params.conclusion.trim()) {
    return params.conclusion;
  }

  if (params.status === 'running') {
    return '正在生成结论...';
  }

  if (params.status === 'stopped') {
    return '本轮已停止。';
  }

  return '暂无结论';
}

export function CurrentConclusionCard() {
  const currentRun = useWorkbenchStore((state) => state.currentRun);

  if (!currentRun) {
    return (
      <Card size="sm" className="right-card right-section">
        <CardHeader className="right-card-header">
          <CardTitle className="panel-section-title">
            <AppIcon icon={icons.alert} size={16} />
            <span>当前结论</span>
          </CardTitle>
          <CardDescription>最终结论或运行中输出</CardDescription>
        </CardHeader>
        <CardContent className="right-card-content">
          <div className="right-panel-empty-state">
            <strong>暂无结论</strong>
            Agent 完成本轮执行后，会在这里展示最终结论。
          </div>
        </CardContent>
      </Card>
    );
  }

  const conclusionText = getConclusionText({
    status: currentRun.status,
    conclusion: currentRun.conclusion,
    errorMessage: currentRun.errorMessage,
  });
  const updatedText = `更新时间：${new Date(currentRun.updatedAt).toLocaleString('zh-CN', { hour12: false })}`;
  const shouldShowSourceBadge = currentRun.conclusionSource !== 'none';

  return (
    <Card size="sm" className="right-card right-section">
      <CardHeader className="right-card-header">
        <CardTitle className="panel-section-title">
          <AppIcon icon={icons.alert} size={16} />
          <span>当前结论</span>
        </CardTitle>
        <CardDescription>当前 Run 的最终回复</CardDescription>
      </CardHeader>

      <CardContent className="right-card-content">
        <div className="conclusion-badge-row">
          {currentRun.status === 'running' ? (
            <Badge variant="outline" className="conclusion-source-badge">
              生成中
            </Badge>
          ) : null}
          {currentRun.status === 'stopped' ? (
            <Badge variant="outline" className="conclusion-source-badge conclusion-source-badge-stopped">
              本轮已停止
            </Badge>
          ) : null}
          {currentRun.status === 'error' ? (
            <Badge variant="outline" className="conclusion-source-badge conclusion-source-badge-danger">
              执行失败
            </Badge>
          ) : null}
          {shouldShowSourceBadge ? (
            <Badge variant="outline" className="conclusion-source-badge">
              {getConclusionSourceLabel(currentRun.conclusionSource)}
            </Badge>
          ) : null}
        </div>

        {currentRun.conclusionNotice ? (
          <div className="conclusion-fallback-notice">{currentRun.conclusionNotice}</div>
        ) : null}

        <div className="conclusion-card">
          {conclusionText}
          <div className="conclusion-updated-at">{updatedText}</div>
        </div>
      </CardContent>
    </Card>
  );
}
