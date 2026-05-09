import { mockAnalyticsResult } from '../../../mocks/analytics';
import { useWorkbenchStore } from '../../../stores/workbenchStore';
import { GradeScoreChart } from '../../analytics/GradeScoreChart';
import { AppIcon } from '../../common/AppIcon';
import { icons } from '../../common/iconMap';

export function AnalyticsResultCard() {
  const showAnalyticsResult = useWorkbenchStore((state) => state.showAnalyticsResult);

  return (
    <section className="right-card right-section">
      <h2 className="panel-section-title">
        <AppIcon icon={icons.chart} size={16} />
        <span>数据分析结果</span>
      </h2>
      {showAnalyticsResult ? (
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
