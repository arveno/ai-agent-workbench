import type { RealAgentAvailabilityView } from '../../services/agentAccessViewModel';
import type { DemoTaskView } from '../../utils/demoTemplateViewModel';
import { Button } from '../ui/button';

interface DemoTaskRunChoiceModalProps {
  isOpen: boolean;
  task: DemoTaskView | null;
  availability: RealAgentAvailabilityView;
  isSubmitting: boolean;
  errorMessage: string | null;
  onUseAgent: () => void;
  onUseMock: () => void;
  onLogin: () => void;
  onCancel: () => void;
}

function getChoiceDescription(availability: RealAgentAvailabilityView): string {
  if (availability.status === 'available') {
    return '真实 Agent 会调用服务端模型和数据工具链，并消耗 1 次 Agent Run 额度。公开演示模式不会消耗额度，可查看完整流程示例。';
  }

  if (availability.status === 'login_required') {
    return '登录后可运行真实分析。你也可以使用公开演示模式查看完整流程。';
  }

  if (availability.status === 'quota_exceeded') {
    return '本月真实 Agent Run 额度已用完。你仍可使用公开演示模式查看完整流程。';
  }

  if (availability.status === 'checking') {
    return '正在检查真实 Agent 使用资格。你可以等待检查完成，也可以使用公开演示模式查看完整流程。';
  }

  return '真实 Agent 暂不可用。可使用公开演示模式查看示例流程。';
}

export function DemoTaskRunChoiceModal({
  isOpen,
  task,
  availability,
  isSubmitting,
  errorMessage,
  onUseAgent,
  onUseMock,
  onLogin,
  onCancel,
}: DemoTaskRunChoiceModalProps) {
  if (!isOpen || !task) {
    return null;
  }

  const canUseAgent = availability.status === 'available';
  const canLogin = availability.status === 'login_required' && Boolean(availability.actionLabel);

  return (
    <div
      className="demo-choice-modal-mask"
      role="dialog"
      aria-modal="true"
      aria-label="选择示例运行模式"
      onClick={onCancel}
    >
      <div
        className="demo-choice-modal"
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        <header className="demo-choice-modal-head">
          <div>
            <h3 className="demo-choice-modal-title">该示例推荐使用真实 Agent</h3>
            <p className="demo-choice-modal-subtitle">{task.title}</p>
          </div>
          <Button type="button" variant="outline" size="icon-sm" onClick={onCancel} aria-label="关闭">
            ×
          </Button>
        </header>

        <div className="demo-choice-modal-body">
          <p className="demo-choice-description">{getChoiceDescription(availability)}</p>

          <div className={`demo-choice-status demo-choice-status-${availability.status}`}>
            <strong>{availability.title}</strong>
            <span>{availability.description}</span>
          </div>

          {errorMessage ? <p className="demo-choice-error">{errorMessage}</p> : null}
        </div>

        <footer className="demo-choice-modal-actions">
          <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
            取消
          </Button>
          {canLogin ? (
            <Button type="button" variant="outline" onClick={onLogin} disabled={isSubmitting}>
              登录后使用
            </Button>
          ) : null}
          <Button type="button" variant="outline" onClick={onUseMock} disabled={isSubmitting}>
            使用公开演示模式
          </Button>
          {canUseAgent ? (
            <Button type="button" onClick={onUseAgent} disabled={isSubmitting}>
              {isSubmitting ? '正在启动...' : '使用真实 Agent'}
            </Button>
          ) : null}
        </footer>
      </div>
    </div>
  );
}
