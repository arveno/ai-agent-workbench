import { mockAnalyticsResult } from '../../../mocks/analytics';
import { useWorkbenchStore } from '../../../stores/workbenchStore';
import { GradeScoreChart } from '../../analytics/GradeScoreChart';
import { AppIcon } from '../../common/AppIcon';
import { icons } from '../../common/iconMap';

export function AnalyticsResultCard() {
  const showAnalyticsResult = useWorkbenchStore((state) => state.showAnalyticsResult);
  const currentAgentRun = useWorkbenchStore((state) => state.currentAgentRun);
  const chartData = currentAgentRun?.chartData;
  const isDataAnalysisRun =
    currentAgentRun?.plan?.intent === 'data_analysis' || Boolean(currentAgentRun?.toolInvocations?.length);

  return (
    <section className="right-card right-section">
      <h2 className="panel-section-title">
        <AppIcon icon={icons.chart} size={16} />
        <span>数据分析结果</span>
      </h2>
      {currentAgentRun ? (
        chartData ? (
          <>
            <div className="run-chart-summary">
              <div className="run-chart-title">{chartData.title}</div>
              <div className="run-chart-meta">图表类型：{chartData.chartType}</div>
              <div className="run-chart-text">{chartData.summary}</div>
              <div className="run-chart-points">
                数据点：{chartData.labels.length}（labels={chartData.labels.join(', ') || '-'}）
              </div>
            </div>
          </>
        ) : (
          <div className="right-panel-empty-state">
            <strong>本次未生成数据分析结果</strong>
            {isDataAnalysisRun ? '当前运行未产出可展示的图表数据。' : '仅数据分析类请求会生成图表和指标摘要。'}
          </div>
        )
      ) : chartData ? (
        <>
          <div className="run-chart-summary">
            <div className="run-chart-title">{chartData.title}</div>
            <div className="run-chart-meta">图表类型：{chartData.chartType}</div>
            <div className="run-chart-text">{chartData.summary}</div>
            <div className="run-chart-points">
              数据点：{chartData.labels.length}（labels={chartData.labels.join(', ') || '-'}）
            </div>
          </div>
        </>
      ) : showAnalyticsResult ? (
        <>
          <div className="kpi-grid">
            <div className="kpi-item">
              <span className="kpi-icon" aria-hidden="true">
                <AppIcon icon={icons.chart} size={14} />
              </span>
              <p className="kpi-label">平均分</p>
              <p className="kpi-value">78.6</p>
              <p className="kpi-trend kpi-trend-down">较上月 -6.8%</p>
            </div>
            <div className="kpi-item">
              <span className="kpi-icon" aria-hidden="true">
                <AppIcon icon={icons.chart} size={14} />
              </span>
              <p className="kpi-label">出勤率</p>
              <p className="kpi-value">94.1%</p>
              <p className="kpi-trend kpi-trend-down">较上月 -3.2%</p>
            </div>
            <div className="kpi-item">
              <span className="kpi-icon" aria-hidden="true">
                <AppIcon icon={icons.alert} size={14} />
              </span>
              <p className="kpi-label">异常指标</p>
              <p className="kpi-value">2</p>
              <p className="kpi-trend kpi-trend-up">较上月 +1</p>
            </div>
          </div>

          <div className="chart-block">
            <h3>各年级平均分对比（分）</h3>
            <GradeScoreChart data={mockAnalyticsResult.gradeScores} />
          </div>
        </>
      ) : (
        <p className="right-empty-hint">等待数据分析结果...</p>
      )}
    </section>
  );
}
