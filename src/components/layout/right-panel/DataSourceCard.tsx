import { AppIcon } from '../../common/AppIcon';
import { icons } from '../../common/iconMap';

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
                <div className="datasource-name">PostgreSQL / edu_analytics_prod</div>
                <div className="datasource-subtitle">业务数据分析库</div>
              </div>
            </div>
          </div>
          <span className="status-badge status-badge-success">已连接</span>
        </div>

        <div className="datasource-meta-grid">
          {DATASOURCE_META.map((item) => (
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
