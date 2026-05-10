import { useWorkbenchStore } from '../../../stores/workbenchStore';
import { getRunStatusLabel, getRunStatusTone } from '../../../utils/runViewModel';
import { AppIcon } from '../../common/AppIcon';
import { icons } from '../../common/iconMap';

function shouldShowDataSource(runIntent: string, toolCount: number): boolean {
  return runIntent === 'data_analysis' || toolCount > 0;
}

export function DataSourceCard() {
  const currentRun = useWorkbenchStore((state) => state.currentRun);

  if (!currentRun) {
    return (
      <section className="right-card right-section">
        <h2 className="panel-section-title">
          <AppIcon icon={icons.database} size={16} />
          <span>当前数据源</span>
        </h2>
        <div className="right-panel-empty-state">
          <strong>尚未访问数据源</strong>
          发送数据分析类请求后，这里会展示本轮使用的数据源。
        </div>
      </section>
    );
  }

  const dataSource = currentRun.dataSource;
  const hasDataSourceAccess = shouldShowDataSource(currentRun.intent, currentRun.toolInvocations.length);

  if (!hasDataSourceAccess) {
    return (
      <section className="right-card right-section">
        <h2 className="panel-section-title">
          <AppIcon icon={icons.database} size={16} />
          <span>当前数据源</span>
        </h2>
        <div className="right-panel-empty-state">
          <strong>{currentRun.status === 'running' ? '等待数据源决策' : '本次未访问数据源'}</strong>
          {currentRun.status === 'running' ? 'Planner 正在判断是否需要进入数据分析流程。' : '该请求无需进入数据分析流程。'}
        </div>
      </section>
    );
  }

  const metaItems = [
    { label: '数据源名称', value: dataSource?.name ?? '未记录' },
    { label: '底层类型', value: dataSource?.typeLabel ?? '-' },
    { label: 'Provider', value: dataSource?.provider ?? '-' },
    { label: 'Schema', value: dataSource?.schema ?? '-' },
    { label: '表数量', value: typeof dataSource?.tableCount === 'number' ? String(dataSource.tableCount) : '-' },
    { label: 'Run 状态', value: getRunStatusLabel(currentRun.status) },
  ];

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
                <div className="datasource-name">{dataSource?.name ?? 'Run 数据源'}</div>
                <div className="datasource-subtitle">{dataSource?.typeLabel ?? '当前 Run 使用的数据源上下文'}</div>
              </div>
            </div>
          </div>
          <span className={`run-status-badge run-status-badge-${getRunStatusTone(currentRun.status)}`}>
            {getRunStatusLabel(currentRun.status)}
          </span>
        </div>

        <div className="datasource-meta-grid">
          {metaItems.map((item) => (
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
