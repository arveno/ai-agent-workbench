import { useWorkbenchStore } from '../../stores/workbenchStore';
import { shouldShowReportConfirm } from '../../utils/run';

export function ConfirmActionCard() {
  const currentRun = useWorkbenchStore((state) => state.currentRun);
  const confirmGenerateReport = useWorkbenchStore((state) => state.confirmGenerateReport);
  const cancelGenerateReport = useWorkbenchStore((state) => state.cancelGenerateReport);

  if (!shouldShowReportConfirm(currentRun)) {
    return null;
  }

  return (
    <div className="confirm-card">
      <div className="confirm-icon" aria-hidden="true">
        ?
      </div>
      <div className="confirm-copy">
        <h3>后续操作</h3>
        <p>是否基于本次分析生成简版报告？</p>
      </div>
      <div className="confirm-actions">
        <button
          type="button"
          className="confirm-btn primary"
          onClick={() => {
            void confirmGenerateReport();
          }}
        >
          生成报告
        </button>
        <button type="button" className="confirm-btn" onClick={cancelGenerateReport}>
          暂不生成
        </button>
      </div>
    </div>
  );
}
