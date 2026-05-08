import type { ConfirmStatus } from '../../types/workbench';

interface ConfirmActionCardProps {
  status: ConfirmStatus;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export function ConfirmActionCard({ status, onConfirm, onCancel }: ConfirmActionCardProps) {
  return (
    <div className="confirm-card">
      <div className="confirm-icon" aria-hidden="true">
        ?
      </div>
      <div className="confirm-copy">
        <h3>请确认下一步</h3>
        {status === 'waiting' ? <p>是否基于当前结果生成简短分析报告？</p> : null}
        {status === 'confirmed' ? <p>已确认，正在生成最终结论...</p> : null}
        {status === 'cancelled' ? <p>已取消生成</p> : null}
      </div>
      {status === 'waiting' ? (
        <div className="confirm-actions">
          <button type="button" className="confirm-btn primary" onClick={onConfirm}>
            确认生成
          </button>
          <button type="button" className="confirm-btn" onClick={onCancel}>
            暂不生成
          </button>
        </div>
      ) : null}
    </div>
  );
}
