import { AppIcon } from '../../common/AppIcon';
import { icons } from '../../common/iconMap';
import { useWorkbenchStore } from '../../../stores/workbenchStore';
import type { AgentToolInvocationResult } from '../../../types/workbench';
import type { RunToolInvocation } from '../../../types/run';
import { shouldUseUnifiedRun } from '../../../utils/run';
import { formatToolInvocationForInspector } from '../../../utils/toolInvocationFormat';

function getToolStatusClass(status: string): string {
  if (status === 'success') {
    return 'status-badge-success';
  }

  if (status === 'running') {
    return 'status-badge-active';
  }

  if (status === 'error') {
    return 'status-badge-error';
  }

  return 'status-badge-muted';
}

function mapAgentToolInvocation(invocation: AgentToolInvocationResult): RunToolInvocation {
  return {
    id: invocation.id,
    toolId: invocation.toolId,
    toolName: invocation.toolId,
    displayName: invocation.toolName,
    status: invocation.status,
    inputSummary: invocation.inputSummary,
    outputSummary: invocation.outputSummary,
    elapsedMs: invocation.elapsedMs,
  };
}

export function ToolInvocationsCard() {
  const currentRun = useWorkbenchStore((state) => state.currentRun);
  const currentAgentRun = useWorkbenchStore((state) => state.currentAgentRun);
  const unifiedRun = shouldUseUnifiedRun(currentRun) ? currentRun : null;

  const agentRun = currentAgentRun;

  if (!unifiedRun && !agentRun) {
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

  const isDataAnalysisRun = unifiedRun
    ? unifiedRun.intent === 'data_analysis'
    : agentRun?.plan?.intent === 'data_analysis' || Boolean(agentRun?.toolInvocations?.length);
  const runtimeTools = unifiedRun
    ? unifiedRun.toolInvocations
    : (agentRun?.toolInvocations ?? []).map((tool) => mapAgentToolInvocation(tool));
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
          {unifiedRun?.status === 'running'
            ? '等待工具调用结果...'
            : isDataAnalysisRun
              ? '当前请求未产出可展示的工具调用结果。'
              : '当前请求未进入数据分析流程。'}
        </div>
      ) : (
        <div className="tool-invocation-list">
          {runtimeTools.map((tool) => {
            const formattedTool = formatToolInvocationForInspector(tool);

            return (
              <div key={tool.id} className="tool-invocation-row">
                <div className="tool-invocation-main">
                  <div className="tool-invocation-name">{formattedTool.displayName}</div>
                  <div className="tool-invocation-description">
                    {formattedTool.categoryLabel} · {formattedTool.toolName}
                  </div>
                  <div className="tool-invocation-summary">{formattedTool.inputText}</div>
                  <div className="tool-invocation-summary">{formattedTool.outputText}</div>
                </div>
                <div className="tool-invocation-meta">
                  <span className={`status-badge ${getToolStatusClass(tool.status)}`}>
                    {formattedTool.statusLabel}
                  </span>
                  <span>{formattedTool.elapsedText}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
