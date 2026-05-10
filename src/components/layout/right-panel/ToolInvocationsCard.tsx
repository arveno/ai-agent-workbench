import { useWorkbenchStore } from '../../../stores/workbenchStore';
import type { RunToolStatus } from '../../../types/run';
import { formatToolInvocationForInspector } from '../../../utils/toolInvocationFormat';
import { getToolStatusLabel } from '../../../utils/runViewModel';
import { AppIcon } from '../../common/AppIcon';
import { icons } from '../../common/iconMap';

function getToolStatusClass(status: RunToolStatus): string {
  if (status === 'success') {
    return 'status-badge-success';
  }

  if (status === 'running') {
    return 'status-badge-active';
  }

  if (status === 'error') {
    return 'status-badge-error';
  }

  if (status === 'stopped') {
    return 'status-badge-stopped';
  }

  return 'status-badge-muted';
}

export function ToolInvocationsCard() {
  const currentRun = useWorkbenchStore((state) => state.currentRun);
  const runtimeTools = currentRun?.toolInvocations ?? [];

  if (!currentRun) {
    return (
      <section className="right-card right-section">
        <div className="right-card-head">
          <h2 className="panel-section-title">
            <AppIcon icon={icons.settings} size={16} />
            <span>工具调用</span>
          </h2>
        </div>
        <div className="right-panel-empty-state">
          <strong>暂无工具调用</strong>
          发送数据分析类请求后，这里会展示本轮工具调用记录。
        </div>
      </section>
    );
  }

  return (
    <section className="right-card right-section">
      <div className="right-card-head">
        <h2 className="panel-section-title">
          <AppIcon icon={icons.settings} size={16} />
          <span>工具调用</span>
        </h2>
      </div>

      {runtimeTools.length === 0 ? (
        <div className="right-panel-empty-state">
          <strong>本次未调用工具</strong>
          当前请求未进入数据分析流程，或工具尚未开始执行。
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
                    {getToolStatusLabel(tool.status)}
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
