import { useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { buildRealAgentAvailabilityView, getRealAgentBlockedMessage } from '@/services/agentAccessViewModel';
import { useAuthSessionView, useAuthStore } from '../../stores/authStore';
import { useWorkbenchStore } from '../../stores/workbenchStore';
import type { ModelProviderId } from '../../types/workbench';
import { AppIcon } from '../common/AppIcon';
import { icons } from '../common/iconMap';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';

const MAX_PROMPT_LENGTH = 2000;
type ChatModeProviderId = Extract<ModelProviderId, 'mock' | 'groq'>;

interface ChatModeOption {
  id: ChatModeProviderId;
  label: string;
  description: string;
  icon: typeof icons.brand;
}

const CHAT_MODE_OPTIONS: ChatModeOption[] = [
  {
    id: 'mock',
    label: '公开演示 Mock',
    description: 'Mock 模式，不消耗真实 Agent 额度。',
    icon: icons.brand,
  },
  {
    id: 'groq',
    label: '真实 Agent',
    description: 'CloudBase 后端受控工具链。',
    icon: icons.agent,
  },
];

function getRealAgentModeStatus(status: ReturnType<typeof buildRealAgentAvailabilityView>['status']): string {
  if (status === 'available') return '可用';
  if (status === 'login_required') return '需登录';
  if (status === 'quota_exceeded') return '额度用完';
  if (status === 'checking') return '检查中';
  if (status === 'forbidden') return '无权限';
  return '暂不可用';
}

export function ChatInput() {
  const [isComposing, setIsComposing] = useState(false);
  const [realAgentNotice, setRealAgentNotice] = useState('');
  const isComposingRef = useRef(false);
  const authView = useAuthSessionView();
  const agentAccess = useAuthStore((state) => state.agentAccess);
  const isAgentAccessLoading = useAuthStore((state) => state.isAgentAccessLoading);
  const openLoginModal = useAuthStore((state) => state.openLoginModal);
  const chatDraft = useWorkbenchStore((state) => state.chatDraft);
  const setChatDraft = useWorkbenchStore((state) => state.setChatDraft);
  const setCurrentPrompt = useWorkbenchStore((state) => state.setCurrentPrompt);
  const sendPrompt = useWorkbenchStore((state) => state.sendPrompt);
  const stopGenerating = useWorkbenchStore((state) => state.stopGenerating);
  const generationStatus = useWorkbenchStore((state) => state.generationStatus);
  const currentModelProvider = useWorkbenchStore((state) => state.currentModelProvider);
  const setCurrentModelProvider = useWorkbenchStore((state) => state.setCurrentModelProvider);
  const sessions = useWorkbenchStore((state) => state.sessions);
  const currentSessionId = useWorkbenchStore((state) => state.currentSessionId);
  const currentRun = useWorkbenchStore((state) => state.currentRun);
  const agentRunStatus = useWorkbenchStore((state) => state.agentRunStatus);
  const currentSession = sessions.find((session) => session.id === currentSessionId);
  const isReadOnlySession = currentSession?.isReadOnly === true || currentSession?.visibility === 'demo';
  const activeChatMode: ChatModeProviderId = currentModelProvider === 'groq' ? 'groq' : 'mock';
  const isPublicDemoMode = activeChatMode === 'mock';
  const isMockGenerating = currentModelProvider === 'mock' && generationStatus === 'streaming';
  const isAgentRunning =
    currentModelProvider === 'groq' &&
    (agentRunStatus === 'running' || (currentRun?.mode === 'agent' && currentRun.status === 'running'));
  const isGenerating = isMockGenerating || isAgentRunning;
  const trimmedValue = chatDraft.trim();
  const isEmpty = trimmedValue.length === 0;
  const sendDisabled = isEmpty || isReadOnlySession;
  const realAgentAvailability = buildRealAgentAvailabilityView({
    authView,
    agentAccess,
    isAgentAccessLoading,
  });
  const shouldShowRealAgentNotice =
    currentModelProvider === 'groq' && !realAgentAvailability.canEnterRealAgent && realAgentNotice;
  const modeHelpText = isReadOnlySession
    ? '示例会话为公开只读。点击左侧“新聊天”后再发送消息。'
    : activeChatMode === 'mock'
      ? 'Mock 是主动选择的公开演示模式，不会伪装成真实 Agent。'
      : '真实 Agent 通过 CloudBase 后端受控工具链运行；不可用时会显示明确 fallback。';

  const handleSend = () => {
    if (isGenerating || sendDisabled) {
      return;
    }

    if (currentModelProvider === 'groq' && !realAgentAvailability.canEnterRealAgent) {
      setRealAgentNotice(getRealAgentBlockedMessage(realAgentAvailability));

      if (realAgentAvailability.status === 'login_required' && authView.isAuthConfigured) {
        openLoginModal();
      }

      return;
    }

    setRealAgentNotice('');
    setCurrentPrompt(trimmedValue);
    sendPrompt(trimmedValue);
  };

  const handlePrimaryAction = () => {
    if (isGenerating) {
      stopGenerating();
      return;
    }

    handleSend();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter') {
      return;
    }

    if (event.shiftKey) {
      return;
    }

    if (isComposing || isComposingRef.current || event.nativeEvent.isComposing) {
      return;
    }

    event.preventDefault();
    handleSend();
  };

  return (
    <div className="composer">
      <Textarea
        className="composer-input chat-input-textarea"
        placeholder={
          isReadOnlySession
            ? '示例会话为公开只读，不能在这里发送新消息。'
            : isPublicDemoMode
            ? '开始一条新聊天，或打开左侧示例会话查看完整流程。'
            : '继续输入问题，或让 AI 生成报告...'
        }
        value={chatDraft}
        onChange={(event) => setChatDraft(event.target.value)}
        onCompositionStart={() => {
          isComposingRef.current = true;
          setIsComposing(true);
        }}
        onCompositionEnd={() => {
          window.setTimeout(() => {
            isComposingRef.current = false;
            setIsComposing(false);
          }, 0);
        }}
        onKeyDown={handleKeyDown}
        maxLength={MAX_PROMPT_LENGTH}
        disabled={isReadOnlySession}
      />
      {shouldShowRealAgentNotice ? <p className="composer-agent-access-notice">{realAgentNotice}</p> : null}
      <div className={isReadOnlySession ? 'composer-mode-row composer-mode-row-disabled' : 'composer-mode-row'}>
        <div className="composer-mode-switch" aria-label="模型或模式选择">
          {CHAT_MODE_OPTIONS.map((option) => {
            const isActive = activeChatMode === option.id;
            const Icon = option.icon;
            const statusLabel = option.id === 'groq' ? getRealAgentModeStatus(realAgentAvailability.status) : '可用';

            return (
              <button
                key={option.id}
                type="button"
                className={isActive ? 'composer-mode-option active' : 'composer-mode-option'}
                disabled={isGenerating || isReadOnlySession}
                title={option.id === 'groq' ? realAgentAvailability.description : option.description}
                onClick={() => {
                  setRealAgentNotice('');
                  setCurrentModelProvider(option.id);
                }}
              >
                <Icon size={14} aria-hidden="true" />
                <span className="composer-mode-label">{option.label}</span>
                <span className={`composer-mode-status composer-mode-status-${option.id === 'groq' ? realAgentAvailability.status : 'available'}`}>
                  {statusLabel}
                </span>
              </button>
            );
          })}
        </div>
        <span className="composer-mode-help">{modeHelpText}</span>
      </div>
      <div className="composer-footer">
        <div className="composer-tools">
          <Button type="button" className="composer-tool-btn input-tool-button" variant="outline" size="sm">
            <span className="icon-text-inline">
              <AppIcon icon={icons.attachment} size={14} />
              <span>附件</span>
            </span>
          </Button>
          <Button type="button" className="composer-tool-btn input-tool-button" variant="outline" size="sm">
            <span className="icon-text-inline">
              <AppIcon icon={icons.template} size={14} />
              <span>模板</span>
            </span>
          </Button>
        </div>
        <div className="composer-actions">
          <span className="composer-count">
            {chatDraft.length} / {MAX_PROMPT_LENGTH}
          </span>
          <Button
            type="button"
            className={[
              'composer-action-button',
              isGenerating ? 'composer-stop-button' : 'composer-send-button',
            ].join(' ')}
            onClick={handlePrimaryAction}
            disabled={!isGenerating && sendDisabled}
            aria-label={isGenerating ? '停止生成' : '发送'}
            title={isGenerating ? '停止生成' : '发送'}
            variant={isGenerating ? 'destructive' : 'default'}
            size="icon"
          >
            <AppIcon icon={isGenerating ? icons.stop : icons.send} size={16} />
          </Button>
        </div>
      </div>
    </div>
  );
}
