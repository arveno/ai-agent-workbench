import { useWorkbenchStore } from '../../../stores/workbenchStore';
import { getRunStatusLabel, getRunStatusTone } from '../../../utils/runViewModel';
import { AppIcon } from '../../common/AppIcon';
import { icons } from '../../common/iconMap';
import { Badge } from '../../ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';

function shouldShowDataSource(runIntent: string, toolCount: number): boolean {
  return runIntent === 'data_analysis' || toolCount > 0;
}

export function DataSourceCard() {
  const currentRun = useWorkbenchStore((state) => state.currentRun);

  if (!currentRun) {
    return (
      <Card size="sm" className="right-card right-section">
        <CardHeader className="right-card-header">
          <CardTitle className="panel-section-title">
            <AppIcon icon={icons.database} size={16} />
            <span>数据源使用</span>
          </CardTitle>
          <CardDescription>当前 Run 是否访问受控数据上下文</CardDescription>
        </CardHeader>
        <CardContent className="right-card-content">
          <div className="right-panel-empty-state">
            <strong>尚未访问数据源</strong>
            数据源是 Agent 可用的服务端上下文，不是聊天输入框；发送数据分析类请求后这里会展示使用情况。
          </div>
        </CardContent>
      </Card>
    );
  }

  const dataSource = currentRun.dataSource;
  const hasDataSourceAccess = shouldShowDataSource(currentRun.intent, currentRun.toolInvocations.length);

  if (!hasDataSourceAccess) {
    return (
      <Card size="sm" className="right-card right-section">
        <CardHeader className="right-card-header">
          <CardTitle className="panel-section-title">
            <AppIcon icon={icons.database} size={16} />
            <span>数据源使用</span>
          </CardTitle>
          <CardDescription>本轮是否访问数据源</CardDescription>
        </CardHeader>
        <CardContent className="right-card-content">
          <div className="right-panel-empty-state">
            <strong>{currentRun.status === 'running' ? '等待数据源决策' : '本次未访问数据源'}</strong>
            {currentRun.status === 'running' ? 'Planner 正在判断是否需要进入数据分析流程。' : '该请求没有使用服务端数据源上下文。'}
          </div>
        </CardContent>
      </Card>
    );
  }

  const metaItems = [
    { label: '数据源名称', value: dataSource?.name ?? '未记录' },
    { label: '底层类型', value: dataSource?.typeLabel ?? '-' },
    { label: '数据源标识', value: dataSource?.provider ?? '-' },
    { label: 'Schema', value: dataSource?.schema ?? '-' },
    { label: '表数量', value: typeof dataSource?.tableCount === 'number' ? String(dataSource.tableCount) : '-' },
    { label: 'Run 状态', value: getRunStatusLabel(currentRun.status) },
  ];

  return (
    <Card size="sm" className="right-card right-section">
      <CardHeader className="right-card-header right-card-head">
        <div>
          <CardTitle className="panel-section-title">
            <AppIcon icon={icons.database} size={16} />
            <span>数据源使用</span>
          </CardTitle>
          <CardDescription>{dataSource?.typeLabel ?? '当前 Run 使用的数据源上下文'}</CardDescription>
        </div>
        <Badge variant="outline" className={`run-status-badge run-status-badge-${getRunStatusTone(currentRun.status)}`}>
          {getRunStatusLabel(currentRun.status)}
        </Badge>
      </CardHeader>

      <CardContent className="right-card-content">
        <div className="datasource-card">
          <div className="datasource-title-wrap">
            <span className="datasource-title-icon" aria-hidden="true">
              <AppIcon icon={icons.database} size={14} />
            </span>
            <div>
              <div className="datasource-name">{dataSource?.name ?? 'Run 数据源'}</div>
              <div className="datasource-subtitle">{dataSource?.typeLabel ?? '当前 Run 使用的数据源上下文'}</div>
            </div>
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
      </CardContent>
    </Card>
  );
}
