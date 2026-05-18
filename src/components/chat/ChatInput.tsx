import { useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { buildRealAgentAvailabilityView, getRealAgentBlockedMessage } from '@/services/agentAccessViewModel';
import { useAuthSessionView, useAuthStore } from '../../stores/authStore';
import { useWorkbenchStore } from '../../stores/workbenchStore';
import { AppIcon } from '../common/AppIcon';
import { icons } from '../common/iconMap';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';

const MAX_PROMPT_LENGTH = 2000;

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
  const currentRun = useWorkbenchStore((state) => state.currentRun);
  const agentRunStatus = useWorkbenchStore((state) => state.agentRunStatus);
  const isPublicDemoMode = currentModelProvider === 'mock';
  const isMockGenerating = currentModelProvider === 'mock' && generationStatus === 'streaming';
  const isAgentRunning =
    currentModelProvider === 'groq' &&
    (agentRunStatus === 'running' || (currentRun?.mode === 'agent' && currentRun.status === 'running'));
  const isGenerating = isMockGenerating || isAgentRunning;
  const trimmedValue = chatDraft.trim();
  const isEmpty = trimmedValue.length === 0;
  const sendDisabled = isEmpty;
  const realAgentAvailability = buildRealAgentAvailabilityView({
    authView,
    agentAccess,
    isAgentAccessLoading,
  });
  const shouldShowRealAgentNotice =
    currentModelProvider === 'groq' && !realAgentAvailability.canEnterRealAgent && realAgentNotice;

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
          isPublicDemoMode
            ? '开始一条新聊天，或点击左侧示例任务一键体验完整流程。'
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
      />
      {shouldShowRealAgentNotice ? <p className="composer-agent-access-notice">{realAgentNotice}</p> : null}
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
