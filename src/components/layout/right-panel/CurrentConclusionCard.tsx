import { AppIcon } from '../../common/AppIcon';
import { icons } from '../../common/iconMap';
import { useWorkbenchStore } from '../../../stores/workbenchStore';

const CURRENT_CONCLUSION =
  '本月教学指标整体下降，主要受平均分下降和出勤率降低影响。异常集中在八年级部分班级，建议重点关注出勤异常班级，并加强数学和英语薄弱学科辅导，优化课堂互动与作业反馈。';

export function CurrentConclusionCard() {
  const currentAgentRun = useWorkbenchStore((state) => state.currentAgentRun);
  const agentRunStatus = useWorkbenchStore((state) => state.agentRunStatus);
  const agentRunErrorMessage = useWorkbenchStore((state) => state.agentRunErrorMessage);
  const isFallbackConclusion = currentAgentRun?.conclusionSource === 'fallback';
  const conclusionNotice = currentAgentRun?.conclusionNotice;
  const conclusionText =
    agentRunStatus === 'error'
      ? `Agent Run 执行失败：${agentRunErrorMessage ?? '未知错误'}`
      : currentAgentRun?.conclusion ?? CURRENT_CONCLUSION;
  const updatedText = currentAgentRun?.createdAt
    ? `更新时间：${new Date(currentAgentRun.createdAt).toLocaleString('zh-CN', { hour12: false })}`
    : '更新时间：2026-05-17 10:10:00';

  return (
    <section className="right-card right-section">
      <h2 className="panel-section-title">
        <AppIcon icon={icons.alert} size={16} />
        <span>当前结论</span>
      </h2>
      {currentAgentRun?.conclusionSource === 'model' ? (
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
