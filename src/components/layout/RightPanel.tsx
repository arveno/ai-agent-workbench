import { mockAnalyticsResult } from '../../mocks/analytics';
import { mockKnowledgeSources } from '../../mocks/knowledgeSources';
import { useWorkbenchStore } from '../../stores/workbenchStore';
import { GradeScoreChart } from '../analytics/GradeScoreChart';
import { AppIcon } from '../common/AppIcon';
import { icons, type IconKey } from '../common/iconMap';
import type { AgentStepStatus } from '../../types/workbench';

const CURRENT_CONCLUSION =
  '当前发现七年级平均分下降和八年级出勤率下滑为主要异常项，建议进一步查看班级维度数据，并基于当前结果生成简要分析报告。';

function getStepClass(status: AgentStepStatus): string {
  switch (status) {
    case 'success':
      return 'done';
    case 'running':
      return 'in-progress';
    case 'pending':
      return 'pending';
    case 'error':
      return 'error';
    default:
      return 'pending';
  }
}

function getStepStatusText(status: AgentStepStatus): string {
  switch (status) {
    case 'success':
      return '已完成';
    case 'running':
      return '进行中';
    case 'pending':
      return '待执行';
    case 'error':
      return '已中断';
    default:
      return '待执行';
  }
}

function getStepIcon(status: AgentStepStatus): IconKey {
  switch (status) {
    case 'success':
      return 'stepDone';
    case 'running':
      return 'stepCurrent';
    case 'pending':
      return 'stepPending';
    case 'error':
      return 'alert';
    default:
      return 'stepPending';
  }
}

export function RightPanel() {
  const agentSteps = useWorkbenchStore((state) => state.agentSteps);
  const showKnowledgeSources = useWorkbenchStore((state) => state.showKnowledgeSources);
  const showAnalyticsResult = useWorkbenchStore((state) => state.showAnalyticsResult);

  return (
    <aside className="right-panel">
      <div className="right-panel-content">
        <section className="right-card">
          <h2 className="panel-section-title">
            <AppIcon icon={icons.agent} size={16} />
            <span>Agent 执行步骤</span>
          </h2>
          <ul className="agent-steps">
            {agentSteps.map((step, index) => {
              const statusClass = getStepClass(step.status);
              const isRunning = step.status === 'running';

              return (
                <li
                  key={step.id}
                  className={`agent-step ${statusClass}${isRunning ? ' active' : ''}`}
                >
                  <span className="step-main">
                    <span className={`step-icon-wrap step-icon-${step.status}`} aria-hidden="true">
                      <AppIcon icon={icons[getStepIcon(step.status)]} size={16} />
                    </span>
                    <span className="step-label">{`${index + 1}. ${step.title}`}</span>
                  </span>
                  <span className="step-status">{getStepStatusText(step.status)}</span>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="right-card">
          <div className="right-card-head">
            <h2 className="panel-section-title">
              <AppIcon icon={icons.knowledge} size={16} />
              <span>知识库来源</span>
            </h2>
            <button type="button" className="view-all-btn">
              查看全部
            </button>
          </div>
          {showKnowledgeSources ? (
            <div className="source-list">
              {mockKnowledgeSources.map((source) => (
                <article key={source.id} className="source-item">
                  <div className="source-top">
                    <span className="source-icon" aria-hidden="true">
                      <AppIcon icon={icons.document} size={16} />
                    </span>
                    <strong>{source.title}</strong>
                    <span className="match-tag">匹配度 {source.matchRate}%</span>
                  </div>
                  <p>摘要：{source.summary}</p>
                </article>
              ))}
            </div>
          ) : (
            <p style={{ margin: '10px 0 0', color: '#6b7280', fontSize: '13px' }}>等待知识库检索结果...</p>
          )}
        </section>

        <section className="right-card">
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
                  <p className="kpi-value">{mockAnalyticsResult.kpis.averageScore.toFixed(1)}</p>
                </div>
                <div className="kpi-item">
                  <span className="kpi-icon" aria-hidden="true">
                    <AppIcon icon={icons.chart} size={14} />
                  </span>
                  <p className="kpi-label">出勤率</p>
                  <p className="kpi-value">{mockAnalyticsResult.kpis.attendanceRate.toFixed(1)}%</p>
                </div>
                <div className="kpi-item">
                  <span className="kpi-icon" aria-hidden="true">
                    <AppIcon icon={icons.alert} size={14} />
                  </span>
                  <p className="kpi-label">异常指标</p>
                  <p className="kpi-value">{mockAnalyticsResult.kpis.abnormalCount}</p>
                </div>
              </div>

              <div className="chart-block">
                <h3>各年级平均分对比</h3>
                <GradeScoreChart data={mockAnalyticsResult.gradeScores} />
              </div>
            </>
          ) : (
            <p style={{ margin: '10px 0 0', color: '#6b7280', fontSize: '13px' }}>等待数据分析结果...</p>
          )}
        </section>

        <section className="right-card">
          <h2 className="panel-section-title">
            <AppIcon icon={icons.alert} size={16} />
            <span>当前结论</span>
          </h2>
          <p className="conclusion-text">{CURRENT_CONCLUSION}</p>
        </section>
      </div>
    </aside>
  );
}
