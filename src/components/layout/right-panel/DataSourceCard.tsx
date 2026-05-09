import { AppIcon } from '../../common/AppIcon';
import { icons } from '../../common/iconMap';
import { useWorkbenchStore } from '../../../stores/workbenchStore';

const DATASOURCE_META = [
  {
    label: '数据库版本',
    value: 'PostgreSQL 14.8',
  },
  {
    label: 'Schema',
    value: 'public, dim, fact, metrics',
  },
  {
    label: '表数量',
    value: '12',
  },
  {
    label: '总行数',
    value: '2.4M',
  },
  {
    label: '更新时间',
    value: '2026-05-17 10:00:00',
  },
] as const;

export function DataSourceCard() {
  const currentAgentRun = useWorkbenchStore((state) => state.currentAgentRun);
  const runProviderLabel = currentAgentRun?.provider === 'postgresql' ? 'PostgreSQL' : 'Supabase';
  const runTitle = `${runProviderLabel} / Agent Run`;
  const runSubtitle = `当前 Run 使用 ${runProviderLabel} 数据源完成分析`;
  const runUpdatedAt = currentAgentRun?.createdAt
    ? new Date(currentAgentRun.createdAt).toLocaleString('zh-CN', { hour12: false })
    : '-';

  const runtimeMeta = currentAgentRun
    ? [
        { label: '数据源类型', value: runProviderLabel },
        { label: 'Run 状态', value: currentAgentRun.status === 'success' ? '已执行' : currentAgentRun.status },
        { label: 'Run ID', value: currentAgentRun.id },
        { label: '执行耗时', value: `${currentAgentRun.elapsedMs}ms` },
        { label: '更新时间', value: runUpdatedAt },
      ]
    : DATASOURCE_META;

  return (
    <section className="right-card right-section">
      <h2 className="panel-section-title">
        <AppIcon icon={icons.database} size={16} />
        <span>当前数据源</span>
      </h2>

      <div className="datasource-card">
        <div className="datasource-card-header">
          <div className="datasource-header-main">
            <div className="datasource-title-wrap">
              <span className="datasource-title-icon" aria-hidden="true">
                <AppIcon icon={icons.database} size={14} />
              </span>
              <div>
                <div className="datasource-name">{currentAgentRun ? runTitle : 'PostgreSQL / edu_analytics_prod'}</div>
                <div className="datasource-subtitle">{currentAgentRun ? runSubtitle : '业务数据分析库'}</div>
              </div>
            </div>
          </div>
          <span className="status-badge status-badge-success">{currentAgentRun ? '已执行' : '已连接'}</span>
        </div>

        <div className="datasource-meta-grid">
          {runtimeMeta.map((item) => (
            <div key={item.label}>
              <div className="datasource-meta-label">{item.label}</div>
              <div className="datasource-meta-value">{item.value}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
