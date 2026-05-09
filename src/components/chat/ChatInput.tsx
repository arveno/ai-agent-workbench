import { useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { useWorkbenchStore } from '../../stores/workbenchStore';
import { AppIcon } from '../common/AppIcon';
import { icons } from '../common/iconMap';

const MAX_PROMPT_LENGTH = 2000;

export function ChatInput() {
  const [isComposing, setIsComposing] = useState(false);
  const isComposingRef = useRef(false);
  const chatDraft = useWorkbenchStore((state) => state.chatDraft);
  const setChatDraft = useWorkbenchStore((state) => state.setChatDraft);
  const sendPrompt = useWorkbenchStore((state) => state.sendPrompt);
  const stopGenerating = useWorkbenchStore((state) => state.stopGenerating);
  const generationStatus = useWorkbenchStore((state) => state.generationStatus);
  const currentModelProvider = useWorkbenchStore((state) => state.currentModelProvider);
  const agentRunStatus = useWorkbenchStore((state) => state.agentRunStatus);
  const isStreaming = currentModelProvider === 'mock' && generationStatus === 'streaming';
  const isAgentRunning = currentModelProvider === 'groq' && agentRunStatus === 'running';
  const trimmedValue = chatDraft.trim();
  const isEmpty = trimmedValue.length === 0;
  const sendDisabled = isEmpty || isAgentRunning;

  const handleSend = () => {
    if (isStreaming || sendDisabled) {
      return;
    }

    sendPrompt(trimmedValue);
  };

  const handlePrimaryAction = () => {
    if (isStreaming) {
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
      <textarea
        className="composer-input chat-input-textarea"
        placeholder="继续输入问题，或让 AI 生成报告..."
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
      <div className="composer-footer">
        <div className="composer-tools">
          <button type="button" className="composer-tool-btn input-tool-button">
            <span className="icon-text-inline">
              <AppIcon icon={icons.attachment} size={14} />
              <span>附件</span>
            </span>
          </button>
          <button type="button" className="composer-tool-btn input-tool-button">
            <span className="icon-text-inline">
              <AppIcon icon={icons.template} size={14} />
              <span>模板</span>
            </span>
          </button>
        </div>
        <div className="composer-actions">
          <span className="composer-count">
            {chatDraft.length} / {MAX_PROMPT_LENGTH}
          </span>
          <button
            type="button"
            className={[
              'composer-action-button',
              isStreaming ? 'composer-stop-button' : 'composer-send-button',
            ].join(' ')}
            onClick={handlePrimaryAction}
            disabled={!isStreaming && sendDisabled}
            aria-label={isStreaming ? '停止生成' : '发送'}
            title={isStreaming ? '停止生成' : isAgentRunning ? '运行中...' : '发送'}
          >
            <AppIcon icon={isStreaming ? icons.stop : icons.send} size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
