import { useWorkbenchStore } from '../../../stores/workbenchStore';
import { shouldUseUnifiedRun } from '../../../utils/run';
import { AppIcon } from '../../common/AppIcon';
import { icons } from '../../common/iconMap';

export function AnalyticsResultCard() {
  const currentRun = useWorkbenchStore((state) => state.currentRun);
  const currentAgentRun = useWorkbenchStore((state) => state.currentAgentRun);
  const unifiedRun = shouldUseUnifiedRun(currentRun) ? currentRun : null;

  const agentRun = currentAgentRun;

  if (!unifiedRun && !agentRun) {
    return (
      <section className="right-card right-section">
        <h2 className="panel-section-title">
          <AppIcon icon={icons.chart} size={16} />
          <span>数据分析结果</span>
        </h2>
        <div className="right-panel-empty-state">
          <strong>暂无分析结果</strong>
          发送数据分析类请求后，这里会展示图表数据和指标摘要。
        </div>
      </section>
    );
  }

  const chartData = unifiedRun?.chartData ?? agentRun?.chartData;
  const isDataAnalysisRun = unifiedRun
    ? unifiedRun.intent === 'data_analysis'
    : agentRun?.plan?.intent === 'data_analysis' || Boolean(agentRun?.toolInvocations?.length);
  const runSeriesText = unifiedRun?.chartData
    ? `，series=${unifiedRun.chartData.series.map((series) => `${series.name}:${series.values.length}`).join(', ')}`
    : '';

  return (
    <section className="right-card right-section">
      <h2 className="panel-section-title">
        <AppIcon icon={icons.chart} size={16} />
        <span>数据分析结果</span>
      </h2>
      {chartData ? (
        <div className="run-chart-summary">
          <div className="run-chart-title">{chartData.title}</div>
          <div className="run-chart-meta">图表类型：{chartData.chartType}</div>
          <div className="run-chart-text">{chartData.summary}</div>
          <div className="run-chart-points">
            数据点：{chartData.labels.length}（labels={chartData.labels.join(', ') || '-'}{runSeriesText}）
          </div>
        </div>
      ) : (
        <div className="right-panel-empty-state">
          <strong>本次未生成数据分析结果</strong>
          {unifiedRun?.status === 'running'
            ? '等待数据分析结果...'
            : isDataAnalysisRun
              ? '当前运行未产出可展示的图表数据。'
              : '仅数据分析类请求会生成图表和指标摘要。'}
        </div>
      )}
    </section>
  );
}
