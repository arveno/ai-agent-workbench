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

function getRunStatusBadgeClass(tone: ReturnType<typeof getRunStatusTone>): string {
  return `run-status-badge run-status-badge-${tone}`;
}

export function RunOverviewCard() {
  const currentRun = useWorkbenchStore((state) => state.currentRun);

  if (!currentRun) {
    return (
      <section className="right-card right-section">
        <h2 className="panel-section-title">
          <AppIcon icon={icons.agent} size={16} />
          <span>Run 概览</span>
        </h2>
        <div className="right-panel-empty-state">
          <strong>暂无 Run</strong>
          发送问题后，这里会展示本轮 Run 的基础信息。
        </div>
      </section>
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
    <section className="right-card right-section run-overview-card">
      <div className="right-card-head">
        <h2 className="panel-section-title">
          <AppIcon icon={icons.agent} size={16} />
          <span>Run 概览</span>
        </h2>
        <span className={getRunStatusBadgeClass(statusTone)}>{getRunStatusLabel(currentRun.status)}</span>
      </div>

      <div className="run-overview-title">{getRunTitle(currentRun)}</div>
      <div className="run-overview-grid">
        {overviewItems.map((item) => (
          <div key={item.label} className="run-overview-item">
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}
