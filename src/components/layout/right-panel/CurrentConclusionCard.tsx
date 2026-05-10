import { useWorkbenchStore } from '../../../stores/workbenchStore';
import { getConclusionSourceLabel } from '../../../utils/runViewModel';
import { AppIcon } from '../../common/AppIcon';
import { icons } from '../../common/iconMap';

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
      <section className="right-card right-section">
        <h2 className="panel-section-title">
          <AppIcon icon={icons.alert} size={16} />
          <span>当前结论</span>
        </h2>
        <div className="right-panel-empty-state">
          <strong>暂无结论</strong>
          Agent 完成本轮执行后，会在这里展示最终结论。
        </div>
      </section>
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
    <section className="right-card right-section">
      <h2 className="panel-section-title">
        <AppIcon icon={icons.alert} size={16} />
        <span>当前结论</span>
      </h2>

      <div className="conclusion-badge-row">
        {currentRun.status === 'running' ? <div className="conclusion-source-badge">生成中</div> : null}
        {currentRun.status === 'stopped' ? (
          <div className="conclusion-source-badge conclusion-source-badge-stopped">本轮已停止</div>
        ) : null}
        {currentRun.status === 'error' ? (
          <div className="conclusion-source-badge conclusion-source-badge-danger">执行失败</div>
        ) : null}
        {shouldShowSourceBadge ? (
          <div className="conclusion-source-badge">{getConclusionSourceLabel(currentRun.conclusionSource)}</div>
        ) : null}
      </div>

      {currentRun.conclusionNotice ? (
        <div className="conclusion-fallback-notice">{currentRun.conclusionNotice}</div>
      ) : null}

      <div className="conclusion-card">
        {conclusionText}
        <div className="conclusion-updated-at">{updatedText}</div>
      </div>
    </section>
  );
}
