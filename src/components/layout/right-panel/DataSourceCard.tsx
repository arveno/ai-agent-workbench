import { AppIcon } from '../../common/AppIcon';
import { icons } from '../../common/iconMap';
import { useWorkbenchStore } from '../../../stores/workbenchStore';
import { shouldUseUnifiedRun } from '../../../utils/run';

export function DataSourceCard() {
  const currentRun = useWorkbenchStore((state) => state.currentRun);
  const currentAgentRun = useWorkbenchStore((state) => state.currentAgentRun);
  const unifiedRun = shouldUseUnifiedRun(currentRun) ? currentRun : null;

  if (!unifiedRun && !currentAgentRun) {
    return (
      <section className="right-card right-section">
        <h2 className="panel-section-title">
          <AppIcon icon={icons.database} size={16} />
          <span>当前数据源</span>
        </h2>
        <div className="right-panel-empty-state">
          <strong>尚未访问数据源</strong>
          发送数据分析问题后，这里会展示本次使用的数据源和执行信息。
        </div>
      </section>
    );
  }

  if (unifiedRun) {
    const dataSource = unifiedRun.dataSource;
    const unifiedMeta = [
      { label: '数据源类型', value: dataSource?.typeLabel ?? (unifiedRun.mode === 'mock' ? '本地模拟数据' : '-') },
      { label: 'Run 状态', value: unifiedRun.status },
      { label: 'Run ID', value: unifiedRun.id },
      { label: 'Schema', value: dataSource?.schema ?? '-' },
      { label: '表数量', value: typeof dataSource?.tableCount === 'number' ? String(dataSource.tableCount) : '-' },
    ];
    const statusText =
      unifiedRun.mode === 'mock'
        ? 'Mock'
        : unifiedRun.status === 'running'
          ? '运行中'
          : unifiedRun.status === 'stopped'
            ? '已停止'
            : unifiedRun.status;
    const statusClass =
      unifiedRun.status === 'running'
        ? 'status-badge-active'
        : unifiedRun.status === 'stopped'
          ? 'status-badge-stopped'
          : 'status-badge-success';

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
                  <div className="datasource-name">
                    {dataSource?.name ?? (unifiedRun.mode === 'mock' ? 'Mock 教学数据源' : 'Agent Run')}
                  </div>
                  <div className="datasource-subtitle">
                    {unifiedRun.mode === 'mock' ? 'Mock 模式使用本地模拟数据完成演示流程' : 'Agent 模式正在执行本轮分析'}
                  </div>
                </div>
              </div>
            </div>
            <span className={`status-badge ${statusClass}`}>
              {statusText}
            </span>
          </div>

          <div className="datasource-meta-grid">
            {unifiedMeta.map((item) => (
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

  if (!currentAgentRun) {
    return null;
  }

  const isDataAnalysisRun =
    currentAgentRun.plan?.intent === 'data_analysis' || Boolean(currentAgentRun.toolInvocations?.length);
  const runProviderLabel = currentAgentRun.provider === 'postgresql' ? 'PostgreSQL' : 'Supabase';
  const runTitle = `${runProviderLabel} / Agent Run`;
  const runSubtitle = `当前 Run 使用 ${runProviderLabel} 数据源完成分析`;
  const runUpdatedAt = new Date(currentAgentRun.createdAt).toLocaleString('zh-CN', { hour12: false });

  const runtimeMeta = isDataAnalysisRun
    ? [
        { label: '数据源类型', value: runProviderLabel },
        { label: 'Run 状态', value: currentAgentRun.status === 'success' ? '已执行' : currentAgentRun.status },
        { label: 'Run ID', value: currentAgentRun.id },
        { label: '执行耗时', value: `${currentAgentRun.elapsedMs}ms` },
        { label: '更新时间', value: runUpdatedAt },
      ]
    : [];

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
                <div className="datasource-name">{isDataAnalysisRun ? runTitle : '本次未访问数据源'}</div>
                <div className="datasource-subtitle">{isDataAnalysisRun ? runSubtitle : '本次请求无需访问数据库'}</div>
              </div>
            </div>
          </div>
          <span className={`status-badge ${isDataAnalysisRun ? 'status-badge-success' : 'status-badge-muted'}`}>
            {isDataAnalysisRun ? '已执行' : '未访问'}
          </span>
        </div>

        {!isDataAnalysisRun ? (
          <div className="right-panel-empty-state">
            <strong>本次未访问数据源</strong>
            该请求属于能力说明或暂不支持类型，无需读取数据库。
          </div>
        ) : (
          <div className="datasource-meta-grid">
            {runtimeMeta.map((item) => (
              <div key={item.label}>
                <div className="datasource-meta-label">{item.label}</div>
                <div className="datasource-meta-value">{item.value}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
