import { useWorkbenchStore } from '../../../stores/workbenchStore';
import { getChartPointCount, getChartValueExtent, isValidRunChartData } from '../../../utils/chartData';
import { RunChart } from '../../analytics/RunChart';
import { AppIcon } from '../../common/AppIcon';
import { icons } from '../../common/iconMap';

function formatMetricValue(value: number | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '-';
  }

  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function getEmptyTitle(status: string | undefined): string {
  if (status === 'running') {
    return '等待数据分析结果';
  }

  if (status === 'stopped') {
    return '本轮已停止，未生成图表';
  }

  if (status === 'error') {
    return '本轮执行异常，未生成图表';
  }

  return '暂无分析结果';
}

function getEmptyDescription(status: string | undefined, isDataAnalysisRun: boolean): string {
  if (status === 'running') {
    return '等待数据分析结果...';
  }

  if (status === 'stopped') {
    return '当前 Run 已停止，未产出可展示的图表数据。';
  }

  if (status === 'error') {
    return '当前 Run 执行异常，未产出可展示的图表数据。';
  }

  if (isDataAnalysisRun) {
    return '当前运行未产出可展示的图表数据。';
  }

  return '仅数据分析类请求会生成图表和指标摘要。';
}

export function AnalyticsResultCard() {
  const currentRun = useWorkbenchStore((state) => state.currentRun);
  const chartData = currentRun?.chartData;
  const isValidChartData = isValidRunChartData(chartData);
  const pointCount = getChartPointCount(chartData);
  const valueExtent = getChartValueExtent(chartData);

  if (!currentRun) {
    return (
      <section className="right-card right-section">
        <h2 className="panel-section-title">
          <AppIcon icon={icons.chart} size={16} />
          <span>数据分析结果</span>
        </h2>
        <div className="right-panel-empty-state">
          <strong>暂无分析结果</strong>
          发送数据分析类请求后，这里会展示图表和指标摘要。
        </div>
      </section>
    );
  }

  const isDataAnalysisRun = currentRun.intent === 'data_analysis';

  return (
    <section className="right-card right-section">
      <h2 className="panel-section-title">
        <AppIcon icon={icons.chart} size={16} />
        <span>数据分析结果</span>
      </h2>
      {isValidChartData ? (
        <div className="run-chart-card">
          <div className="run-chart-kpis">
            <div className="run-chart-kpi">
              <span className="run-chart-kpi-label">数据点</span>
              <strong className="run-chart-kpi-value">{pointCount}</strong>
            </div>
            <div className="run-chart-kpi">
              <span className="run-chart-kpi-label">最高值</span>
              <strong className="run-chart-kpi-value">{formatMetricValue(valueExtent?.max)}</strong>
            </div>
            <div className="run-chart-kpi">
              <span className="run-chart-kpi-label">最低值</span>
              <strong className="run-chart-kpi-value">{formatMetricValue(valueExtent?.min)}</strong>
            </div>
          </div>

          <div className="run-chart-header">
            <div>
              <div className="run-chart-title">{chartData.title}</div>
              <div className="run-chart-meta">
                {chartData.chartType === 'bar' ? '柱状图' : '折线图'} · {chartData.series.length} 组数据
              </div>
            </div>
          </div>

          <RunChart chartData={chartData} />

          {chartData.summary ? <div className="run-chart-text">{chartData.summary}</div> : null}
        </div>
      ) : (
        <div className="right-panel-empty-state">
          <strong>{getEmptyTitle(currentRun.status)}</strong>
          {getEmptyDescription(currentRun.status, isDataAnalysisRun)}
        </div>
      )}
    </section>
  );
}
