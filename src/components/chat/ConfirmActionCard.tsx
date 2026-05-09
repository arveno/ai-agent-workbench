import type { ConfirmStatus } from '../../types/workbench';

interface ConfirmActionCardProps {
  status: ConfirmStatus;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  title?: string;
  waitingText?: string;
  confirmedText?: string;
  cancelledText?: string;
  confirmButtonText?: string;
  cancelButtonText?: string;
}

export function ConfirmActionCard({
  status,
  onConfirm,
  onCancel,
  title = '请确认下一步',
  waitingText = '是否基于当前结果生成简短分析报告？',
  confirmedText = '已确认，正在生成最终结论...',
  cancelledText = '已取消生成',
  confirmButtonText = '确认生成',
  cancelButtonText = '暂不生成',
}: ConfirmActionCardProps) {
  return (
    <div className="confirm-card">
      <div className="confirm-icon" aria-hidden="true">
        ?
      </div>
      <div className="confirm-copy">
        <h3>{title}</h3>
        {status === 'waiting' ? <p>{waitingText}</p> : null}
        {status === 'confirmed' ? <p>{confirmedText}</p> : null}
        {status === 'cancelled' ? <p>{cancelledText}</p> : null}
      </div>
      {status === 'waiting' ? (
        <div className="confirm-actions">
          <button type="button" className="confirm-btn primary" onClick={onConfirm}>
            {confirmButtonText}
          </button>
          <button type="button" className="confirm-btn" onClick={onCancel}>
            {cancelButtonText}
          </button>
        </div>
      ) : null}
    </div>
  );
}
