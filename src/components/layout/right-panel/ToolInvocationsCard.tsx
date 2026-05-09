import { AppIcon } from '../../common/AppIcon';
import { icons } from '../../common/iconMap';
import { useWorkbenchStore } from '../../../stores/workbenchStore';

const TOOL_INVOCATIONS = [
  {
    id: 'schema_inspect',
    name: 'schema_inspect',
    desc: '检查数据结构',
    duration: '180ms',
  },
  {
    id: 'query_data',
    name: 'query_data',
    desc: '查询业务数据',
    duration: '420ms',
  },
  {
    id: 'chart_render',
    name: 'chart_render',
    desc: '生成图表',
    duration: '220ms',
  },
] as const;

function truncateText(text: string, maxLength = 120): string {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength)}...`;
}

export function ToolInvocationsCard() {
  const currentAgentRun = useWorkbenchStore((state) => state.currentAgentRun);
  const runtimeTools = currentAgentRun
    ? currentAgentRun.toolInvocations.map((tool) => ({
        id: tool.id,
        name: tool.toolName,
        desc: truncateText(`${tool.inputSummary} -> ${tool.outputSummary}`),
        duration: `${tool.elapsedMs}ms`,
        status: tool.status,
      }))
    : TOOL_INVOCATIONS.map((tool) => ({
        ...tool,
        status: 'success' as const,
      }));

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
    </section>
  );
}
