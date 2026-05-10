import { useWorkbenchStore } from '../../../stores/workbenchStore';
import type { RunToolStatus } from '../../../types/run';
import { formatToolInvocationForInspector } from '../../../utils/toolInvocationFormat';
import { AppIcon } from '../../common/AppIcon';
import { icons } from '../../common/iconMap';
import { Badge } from '../../ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import { Separator } from '../../ui/separator';

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
      <Card size="sm" className="right-card right-section">
        <CardHeader className="right-card-header">
          <CardTitle className="panel-section-title">
            <AppIcon icon={icons.settings} size={16} />
            <span>工具调用</span>
          </CardTitle>
          <CardDescription>本轮工具调用记录</CardDescription>
        </CardHeader>
        <CardContent className="right-card-content">
          <div className="right-panel-empty-state">
            <strong>暂无工具调用</strong>
            发送数据分析类请求后，这里会展示本轮工具调用记录。
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card size="sm" className="right-card right-section">
      <CardHeader className="right-card-header right-card-head">
        <div>
          <CardTitle className="panel-section-title">
            <AppIcon icon={icons.settings} size={16} />
            <span>工具调用</span>
          </CardTitle>
          <CardDescription>受控工具执行记录</CardDescription>
        </div>
        {runtimeTools.length > 0 ? (
          <Badge variant="outline" className="right-card-count-badge">
            {runtimeTools.length} 次调用
          </Badge>
        ) : null}
      </CardHeader>

      <CardContent className="right-card-content">
        {runtimeTools.length === 0 ? (
          <div className="right-panel-empty-state">
            <strong>本次未调用工具</strong>
            当前请求未进入数据分析流程，或工具尚未开始执行。
          </div>
        ) : (
          <div className="tool-invocation-list">
            {runtimeTools.map((tool, index) => {
              const formattedTool = formatToolInvocationForInspector(tool);

              return (
                <div key={tool.id}>
                  {index > 0 ? <Separator className="tool-invocation-separator" /> : null}
                  <div className="tool-invocation-row">
                    <div className="tool-invocation-main">
                      <div className="tool-invocation-name">{formattedTool.displayName}</div>
                      <div className="tool-invocation-description">
                        {formattedTool.categoryLabel} · {formattedTool.toolName}
                      </div>
                      <div className="tool-invocation-summary">输入：{formattedTool.inputText}</div>
                      <div className="tool-invocation-summary">输出：{formattedTool.outputText}</div>
                    </div>
                    <div className="tool-invocation-meta">
                      <Badge variant="outline" className={`status-badge ${getToolStatusClass(tool.status)}`}>
                        {formattedTool.statusLabel}
                      </Badge>
                      <span>{formattedTool.elapsedText}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
