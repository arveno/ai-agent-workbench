import { AppIcon } from '../../common/AppIcon';
import { icons } from '../../common/iconMap';
import { useWorkbenchStore } from '../../../stores/workbenchStore';

export function CurrentConclusionCard() {
  const currentAgentRun = useWorkbenchStore((state) => state.currentAgentRun);
  const agentRunStatus = useWorkbenchStore((state) => state.agentRunStatus);
  const agentRunErrorMessage = useWorkbenchStore((state) => state.agentRunErrorMessage);

  if (!currentAgentRun) {
    return (
      <section className="right-card right-section">
        <h2 className="panel-section-title">
          <AppIcon icon={icons.alert} size={16} />
          <span>当前结论</span>
        </h2>
        <div className="right-panel-empty-state">
          <strong>暂无结论</strong>
          发送问题后，Agent 完成本轮执行会在这里展示最终分析结论或能力说明。
        </div>
      </section>
    );
  }

  const runIntent = currentAgentRun?.plan?.intent;
  const isDataAnalysisRun = runIntent === 'data_analysis' || Boolean(currentAgentRun.toolInvocations?.length);
  const isFallbackConclusion = currentAgentRun.conclusionSource === 'fallback' && isDataAnalysisRun;
  const conclusionNotice = currentAgentRun.conclusionNotice;
  const conclusionText =
    agentRunStatus === 'error'
      ? `Agent Run 执行失败：${agentRunErrorMessage ?? '未知错误'}`
      : currentAgentRun.conclusion;
  const updatedText = `更新时间：${new Date(currentAgentRun.createdAt).toLocaleString('zh-CN', { hour12: false })}`;

  return (
    <section className="right-card right-section">
      <h2 className="panel-section-title">
        <AppIcon icon={icons.alert} size={16} />
        <span>当前结论</span>
      </h2>
      {runIntent === 'capability_intro' ? (
        <div className="conclusion-source-badge conclusion-source-badge-capability">能力说明</div>
      ) : null}
      {runIntent === 'unsupported' ? (
        <div className="conclusion-source-badge conclusion-source-badge-unsupported">暂不支持</div>
      ) : null}
      {isDataAnalysisRun && currentAgentRun.conclusionSource === 'model' ? (
        <div className="conclusion-source-badge">Groq 生成</div>
      ) : null}
      {isFallbackConclusion ? (
        <div className="conclusion-fallback-notice">
          {conclusionNotice ?? '未配置模型 Key，已使用本地工具摘要兜底。'}
        </div>
      ) : null}

      <div className="conclusion-card">
        {conclusionText}
        <div className="conclusion-updated-at">{updatedText}</div>
      </div>
    </section>
  );
}
