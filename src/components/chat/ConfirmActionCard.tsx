export function ConfirmActionCard() {
  return (
    <div className="confirm-card">
      <div className="confirm-icon" aria-hidden="true">
        ?
      </div>
      <div className="confirm-copy">
        <h3>请确认下一步</h3>
        <p>是否基于当前结果生成简短分析报告？</p>
      </div>
      <div className="confirm-actions">
        <button type="button" className="confirm-btn primary">
          确认生成
        </button>
        <button type="button" className="confirm-btn">
          暂不生成
        </button>
      </div>
    </div>
  );
}