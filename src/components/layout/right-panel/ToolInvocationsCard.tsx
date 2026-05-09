import { AppIcon } from '../../common/AppIcon';
import { icons } from '../../common/iconMap';

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

export function ToolInvocationsCard() {
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
        {TOOL_INVOCATIONS.map((tool) => (
          <div key={tool.id} className="tool-invocation-row">
            <div className="tool-invocation-main">
              <div className="tool-invocation-name">{tool.name}</div>
              <div className="tool-invocation-desc">{tool.desc}</div>
            </div>
            <div className="tool-invocation-meta">
              <span className="status-badge status-badge-success">已完成</span>
              <span>{tool.duration}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
