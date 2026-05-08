import { mockAgentSteps } from '../../mocks/agentSteps';
import { mockAnalyticsResult } from '../../mocks/analytics';
import { mockKnowledgeSources } from '../../mocks/knowledgeSources';
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
      return '失败';
    default:
      return '待执行';
  }
}

const maxGradeScore = Math.max(1, ...mockAnalyticsResult.gradeScores.map((grade) => grade.value));

export function RightPanel() {
  return (
    <aside className="right-panel">
      <div className="right-panel-content">
        <section className="right-card">
          <h2 className="right-card-title">Agent 执行步骤</h2>
          <ul className="agent-steps">
            {mockAgentSteps.map((step, index) => {
              const statusClass = getStepClass(step.status);
              const isRunning = step.status === 'running';

              return (
                <li
                  key={step.id}
                  className={`agent-step ${statusClass}${isRunning ? ' active' : ''}`}
                >
                  <span className="step-main">
                    <span className="step-dot" aria-hidden="true"></span>
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
            <h2 className="right-card-title">知识库来源</h2>
            <button type="button" className="view-all-btn">
              查看全部
            </button>
          </div>
          <div className="source-list">
            {mockKnowledgeSources.map((source) => (
              <article key={source.id} className="source-item">
                <div className="source-top">
                  <span className="source-icon" aria-hidden="true">
                    📄
                  </span>
                  <strong>{source.title}</strong>
                  <span className="match-tag">匹配度 {source.matchRate}%</span>
                </div>
                <p>摘要：{source.summary}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="right-card">
          <h2 className="right-card-title">数据分析结果</h2>
          <div className="kpi-grid">
            <div className="kpi-item">
              <p className="kpi-label">平均分</p>
              <p className="kpi-value">{mockAnalyticsResult.kpis.averageScore.toFixed(1)}</p>
            </div>
            <div className="kpi-item">
              <p className="kpi-label">出勤率</p>
              <p className="kpi-value">{mockAnalyticsResult.kpis.attendanceRate.toFixed(1)}%</p>
            </div>
            <div className="kpi-item">
              <p className="kpi-label">异常指标</p>
              <p className="kpi-value">{mockAnalyticsResult.kpis.abnormalCount}</p>
            </div>
          </div>

          <div className="chart-block">
            <h3>各年级平均分对比</h3>
            <div className="bar-chart" aria-label="各年级平均分对比">
              {mockAnalyticsResult.gradeScores.map((gradeScore) => (
                <div key={gradeScore.grade} className="bar-col">
                  <div
                    className="bar"
                    style={{ height: `${Math.round((gradeScore.value / maxGradeScore) * 100)}%` }}
                  ></div>
                  <span className="bar-label">{gradeScore.grade}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="right-card">
          <h2 className="right-card-title">当前结论</h2>
          <p className="conclusion-text">{CURRENT_CONCLUSION}</p>
        </section>
      </div>
    </aside>
  );
}