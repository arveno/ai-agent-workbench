import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { buildRealAgentAvailabilityView, getRealAgentBlockedMessage } from '@/services/agentAccessViewModel';
import { useAuthSessionView, useAuthStore } from '../../stores/authStore';
import { useWorkbenchStore } from '../../stores/workbenchStore';
import type { ModelProviderId } from '../../types/workbench';
import { AppIcon } from '../common/AppIcon';
import { icons } from '../common/iconMap';
import { Button } from '../ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { Textarea } from '../ui/textarea';

const MAX_PROMPT_LENGTH = 2000;
const COMPOSER_TEXTAREA_MAX_HEIGHT = 180;
type ChatModeProviderId = ModelProviderId;

interface ChatModeOption {
  id: ChatModeProviderId;
  label: string;
  icon: typeof icons.brand;
}

const CHAT_MODE_OPTIONS: ChatModeOption[] = [
  {
    id: 'mock-agent',
    label: 'Mock 模式',
    icon: icons.brand,
  },
  {
    id: 'siliconflow-qwen-free',
    label: 'Qwen Free',
    icon: icons.agent,
  },
  {
    id: 'siliconflow-glm-free',
    label: 'SiliconFlow GLM',
    icon: icons.agent,
  },
  {
    id: 'zhipu-glm-flash-free',
    label: 'Zhipu GLM Flash',
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
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
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
  const selectedModelId = useWorkbenchStore((state) => state.selectedModelId);
  const setSelectedModelId = useWorkbenchStore((state) => state.setSelectedModelId);
  const openWorkflowModal = useWorkbenchStore((state) => state.openWorkflowModal);
  const sessions = useWorkbenchStore((state) => state.sessions);
  const currentSessionId = useWorkbenchStore((state) => state.currentSessionId);
  const currentRun = useWorkbenchStore((state) => state.currentRun);
  const agentRunStatus = useWorkbenchStore((state) => state.agentRunStatus);
  const currentSession = sessions.find((session) => session.id === currentSessionId);
  const isReadOnlySession = currentSession?.isReadOnly === true || currentSession?.visibility === 'demo';
  const activeChatMode: ChatModeProviderId = selectedModelId;
  const isMockMode = activeChatMode === 'mock-agent';
  const isMockGenerating = selectedModelId === 'mock-agent' && generationStatus === 'streaming';
  const isAgentRunning =
    selectedModelId !== 'mock-agent' &&
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
  const activeModeOption = CHAT_MODE_OPTIONS.find((option) => option.id === activeChatMode) ?? CHAT_MODE_OPTIONS[0];
  const ActiveModeIcon = activeModeOption.icon;
  const activeModeStatusLabel =
    activeChatMode !== 'mock-agent' ? getRealAgentModeStatus(realAgentAvailability.status) : '可用';
  const shouldShowRealAgentNotice =
    selectedModelId !== 'mock-agent' && !realAgentAvailability.canEnterRealAgent && realAgentNotice;

  useEffect(() => {
    const textarea = textareaRef.current;

    if (!textarea) {
      return;
    }

    textarea.style.height = 'auto';
    const nextHeight = Math.min(textarea.scrollHeight, COMPOSER_TEXTAREA_MAX_HEIGHT);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > COMPOSER_TEXTAREA_MAX_HEIGHT ? 'auto' : 'hidden';
  }, [chatDraft]);

  const handleSend = () => {
    if (isGenerating || sendDisabled) {
      return;
    }

    if (selectedModelId !== 'mock-agent' && !realAgentAvailability.canEnterRealAgent) {
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
      {shouldShowRealAgentNotice ? <p className="composer-agent-access-notice">{realAgentNotice}</p> : null}
      <div className={isReadOnlySession ? 'composer-input-shell composer-input-shell-disabled' : 'composer-input-shell'}>
        <div className="composer-input-area">
          <Textarea
            ref={textareaRef}
            rows={1}
            className="composer-input chat-input-textarea"
            placeholder={
              isReadOnlySession
                ? '示例会话为公开只读，不能在这里发送新消息。'
                : isMockMode
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
        </div>

        <div className="composer-footer">
          <div className="composer-left-actions">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  className="composer-plus-button"
                  variant="outline"
                  size="icon-sm"
                  disabled={isReadOnlySession}
                  aria-label="打开输入工具"
                  title={isReadOnlySession ? '示例会话只读，工具不可用' : '输入工具'}
                >
                  <AppIcon icon={icons.plus} size={16} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" sideOffset={8} className="composer-tool-menu">
                <DropdownMenuItem
                  className="composer-menu-item"
                  onSelect={() => {
                    openWorkflowModal();
                  }}
                >
                  <AppIcon icon={icons.template} size={15} />
                  <span className="composer-menu-copy">
                    <span className="composer-menu-title">模板</span>
                    <span className="composer-menu-description">打开 Prompt 模板</span>
                  </span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="composer-footer-spacer" aria-hidden="true"></div>

          <div className="composer-right-actions">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  className="composer-model-trigger"
                  variant="outline"
                  size="sm"
                  disabled={isGenerating || isReadOnlySession}
                  aria-label={`模型或模式选择：${activeModeOption.label}`}
                  title={activeModeOption.label}
                >
                  <ActiveModeIcon size={14} aria-hidden="true" />
                  <span className="composer-mode-label">{activeModeOption.label}</span>
                  <span className={`composer-mode-status composer-mode-status-${activeChatMode !== 'mock-agent' ? realAgentAvailability.status : 'available'}`}>
                    {activeModeStatusLabel}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={8} className="composer-model-menu">
                {CHAT_MODE_OPTIONS.map((option) => {
                  const Icon = option.icon;
                  const isActive = activeChatMode === option.id;
                  const statusLabel =
                    option.id !== 'mock-agent' ? getRealAgentModeStatus(realAgentAvailability.status) : '可用';

                  return (
                    <DropdownMenuItem
                      key={option.id}
                      className={isActive ? 'composer-menu-item composer-menu-item-active' : 'composer-menu-item'}
                      onSelect={() => {
                        setRealAgentNotice('');
                        setSelectedModelId(option.id);
                      }}
                    >
                      <Icon size={15} aria-hidden="true" />
                      <span className="composer-menu-copy">
                        <span className="composer-menu-title">{option.label}</span>
                      </span>
                      <span className={`composer-mode-status composer-mode-status-${option.id !== 'mock-agent' ? realAgentAvailability.status : 'available'}`}>
                        {statusLabel}
                      </span>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
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
    </div>
  );
}
