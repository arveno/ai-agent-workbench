import { useWorkbenchStore } from '../../../stores/workbenchStore';
import type { RunSnapshot, WorkbenchMessage } from '../../../types/workbench';
import type { ModelTraceViewModel } from '../../../utils/modelTraceViewModel';
import { createModelTraceViewModel } from '../../../utils/modelTraceViewModel';
import {
  formatRunElapsed,
  getConclusionSourceLabel,
  getRunIntentLabel,
  getRunStatusLabel,
  getRunStatusTone,
  getRunTitle,
} from '../../../utils/runViewModel';
import { AppIcon } from '../../common/AppIcon';
import { icons } from '../../common/iconMap';
import { Badge } from '../../ui/badge';
import { Button } from '../../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';

type RunOverviewItem = {
  label: string;
  value: string;
  wide?: boolean;
};

function getRunStatusBadgeClass(tone: ReturnType<typeof getRunStatusTone>): string {
  return `run-status-badge run-status-badge-${tone}`;
}

function getRunPromptText(prompt: string): string {
  const normalizedPrompt = prompt.replace(/\s+/g, ' ').trim();
  return normalizedPrompt || '历史 Run 未记录本轮问题';
}

function getAssistantRunIds(messages: WorkbenchMessage[]): string[] {
  const runIds: string[] = [];

  for (const message of messages) {
    if (message.role !== 'assistant' || message.kind !== 'normal' || !message.runId) {
      continue;
    }

    if (!runIds.includes(message.runId)) {
      runIds.push(message.runId);
    }
  }

  return runIds;
}

function getRunRoundLabel(runId: string, messages: WorkbenchMessage[]): string {
  const runIds = getAssistantRunIds(messages);
  const runIndex = runIds.indexOf(runId);

  if (runIndex < 0) {
    return runIds.length > 0 ? `未匹配消息 / 共 ${runIds.length} 轮` : '未匹配消息';
  }

  return `第 ${runIndex + 1} 轮 / 共 ${runIds.length} 轮`;
}

function getVisibleRunModeLabel(mode: RunSnapshot['mode']): string {
  return mode === 'mock' ? '模拟模式（Mock）' : '真实 Agent';
}

function getModelTraceItems(modelTraceView: ModelTraceViewModel | null): RunOverviewItem[] {
  if (!modelTraceView) {
    return [];
  }

  return [
    { label: '模型 ID', value: modelTraceView.selectedModelIdLabel },
    { label: '模型服务商', value: modelTraceView.providerLabel },
    { label: '模型名称', value: modelTraceView.modelLabel },
    { label: '模型耗时', value: modelTraceView.latencyLabel },
    { label: 'Token 状态', value: modelTraceView.tokenUsageStatus },
    { label: '输入 Tokens', value: modelTraceView.promptTokensLabel },
    { label: '输出 Tokens', value: modelTraceView.completionTokensLabel },
    { label: '总 Tokens', value: modelTraceView.totalTokensLabel },
    { label: 'Fallback', value: modelTraceView.fallbackReasonLabel },
    { label: '模型错误', value: modelTraceView.modelErrorTypeLabel },
  ];
}

export function RunOverviewCard() {
  const sessions = useWorkbenchStore((state) => state.sessions);
  const currentRun = useWorkbenchStore((state) => state.currentRun);
  const currentSessionId = useWorkbenchStore((state) => state.currentSessionId);
  const selectedRunId = useWorkbenchStore((state) => state.selectedRunId);
  const isLatestRunLoading = useWorkbenchStore((state) => state.isLatestRunLoading);
  const latestRunError = useWorkbenchStore((state) => state.latestRunError);
  const loadLatestRunForConversation = useWorkbenchStore((state) => state.loadLatestRunForConversation);
  const selectRunForCurrentSession = useWorkbenchStore((state) => state.selectRunForCurrentSession);
  const currentSession = sessions.find((session) => session.id === currentSessionId);

  if (!currentRun) {
    const isDraftNewChat = !currentSession;
    const isDemoSession = currentSession?.visibility === 'demo';
    const emptyTitle = isDraftNewChat ? '新聊天尚未运行' : isDemoSession ? '示例会话暂无 Run Trace' : '暂无 Run';
    const emptyDescription = isDraftNewChat
      ? '发送第一条消息后，这里会展示当前 Run 的状态、步骤和证据。'
      : isDemoSession
        ? '该示例会话没有提供预置 Run 信息时，右侧保持只读空态。'
        : '完成一次 Agent Run 后，这里会展示执行过程。';

    return (
      <Card size="sm" className="right-card right-section">
        <CardHeader className="right-card-header">
          <CardTitle className="panel-section-title">
            <AppIcon icon={icons.agent} size={16} />
            <span>Run 概览</span>
          </CardTitle>
          <CardDescription>本轮 Run 的基础信息</CardDescription>
        </CardHeader>
        <CardContent className="right-card-content">
          {isLatestRunLoading ? (
            <div className="right-panel-empty-state">
              <strong>正在恢复 Run</strong>
              正在读取最近一次 Agent Run。
            </div>
          ) : latestRunError ? (
            <div className="right-panel-empty-state">
              <strong>Run 恢复失败</strong>
              {latestRunError}
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  if (selectedRunId) {
                    void selectRunForCurrentSession(selectedRunId);
                  } else if (currentSessionId) {
                    void loadLatestRunForConversation(currentSessionId);
                  }
                }}
              >
                重试
              </Button>
            </div>
          ) : (
            <div className="right-panel-empty-state">
              <strong>{emptyTitle}</strong>
              {emptyDescription}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  const statusTone = getRunStatusTone(currentRun.status);
  const runPrompt = getRunPromptText(currentRun.prompt);
  const modelTraceView = createModelTraceViewModel(currentRun.modelTrace);
  const overviewItems: RunOverviewItem[] = [
    { label: '本轮问题', value: runPrompt, wide: true },
    { label: 'Run ID', value: currentRun.id },
    { label: '轮次', value: getRunRoundLabel(currentRun.id, currentSession?.messages ?? []) },
    { label: '模式', value: getVisibleRunModeLabel(currentRun.mode) },
    { label: '任务类型', value: getRunIntentLabel(currentRun.intent) },
    { label: '耗时', value: formatRunElapsed(currentRun) },
    {
      label: '结论来源',
      value: modelTraceView?.conclusionSourceLabel ?? getConclusionSourceLabel(currentRun.conclusionSource),
    },
    ...getModelTraceItems(modelTraceView),
  ];

  return (
    <Card size="sm" className="right-card right-section run-overview-card">
      <CardHeader className="right-card-header right-card-head">
        <div>
          <CardTitle className="panel-section-title">
            <AppIcon icon={icons.agent} size={16} />
            <span>Run 概览</span>
          </CardTitle>
          <CardDescription>{getRunTitle(currentRun)}</CardDescription>
        </div>
        <Badge variant="outline" className={getRunStatusBadgeClass(statusTone)}>
          {getRunStatusLabel(currentRun.status)}
        </Badge>
      </CardHeader>

      <CardContent className="right-card-content">
        <div className="run-overview-grid">
          {overviewItems.map((item) => (
            <div
              key={item.label}
              className={['run-overview-item', item.wide ? 'run-overview-item-wide' : ''].filter(Boolean).join(' ')}
            >
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
