import { AppIcon } from '../../common/AppIcon';
import { icons } from '../../common/iconMap';
import { useWorkbenchStore } from '../../../stores/workbenchStore';

function truncateText(text: string, maxLength = 120): string {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength)}...`;
}

export function ToolInvocationsCard() {
  const currentAgentRun = useWorkbenchStore((state) => state.currentAgentRun);

  if (!currentAgentRun) {
    return (
      <section className="right-card right-section">
        <div className="right-card-head">
          <h2 className="panel-section-title">
            <AppIcon icon={icons.settings} size={16} />
            <span>本轮工具调用</span>
          </h2>
        </div>
        <div className="right-panel-empty-state">
          <strong>暂无工具调用</strong>
          数据分析类请求会在这里展示 schema_inspect、aggregate_table、chart_render 等工具调用结果。
        </div>
      </section>
    );
  }

  const isDataAnalysisRun =
    currentAgentRun.plan?.intent === 'data_analysis' || Boolean(currentAgentRun.toolInvocations?.length);
  const runtimeTools = currentAgentRun.toolInvocations.map((tool) => ({
    id: tool.id,
    name: tool.toolName,
    desc: truncateText(`${tool.inputSummary} -> ${tool.outputSummary}`),
    duration: `${tool.elapsedMs}ms`,
    status: tool.status,
  }));
  const showEmptyState = runtimeTools.length === 0;

  return (
    <section className="right-card right-section">
      <div className="right-card-head">
        <h2 className="panel-section-title">
          <AppIcon icon={icons.settings} size={16} />
          <span>本轮工具调用</span>
        </h2>
        <button type="button" className="view-all-btn">
          查看全部
        </button>
      </div>

      {showEmptyState ? (
        <div className="right-panel-empty-state">
          <strong>本次未调用工具</strong>
          {isDataAnalysisRun ? '当前请求未产出可展示的工具调用结果。' : '当前请求未进入数据分析流程。'}
        </div>
      ) : (
        <div className="tool-invocation-list">
          {runtimeTools.map((tool) => (
            <div key={tool.id} className="tool-invocation-row">
              <div className="tool-invocation-main">
                <div className="tool-invocation-name">{tool.name}</div>
                <div className="tool-invocation-desc">{tool.desc}</div>
              </div>
              <div className="tool-invocation-meta">
                <span className={`status-badge ${tool.status === 'success' ? 'status-badge-success' : 'status-badge-error'}`}>
                  {tool.status === 'success' ? '已完成' : '失败'}
                </span>
                <span>{tool.duration}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
