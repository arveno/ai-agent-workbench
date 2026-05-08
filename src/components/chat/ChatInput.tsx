import { useState } from 'react';
import type { KeyboardEvent } from 'react';
import { useWorkbenchStore } from '../../stores/workbenchStore';

const MAX_PROMPT_LENGTH = 2000;

export function ChatInput() {
  const [value, setValue] = useState('');
  const sendPrompt = useWorkbenchStore((state) => state.sendPrompt);
  const generationStatus = useWorkbenchStore((state) => state.generationStatus);
  const isStreaming = generationStatus === 'streaming';
  const trimmedValue = value.trim();
  const isEmpty = trimmedValue.length === 0;
  const sendDisabled = isEmpty || isStreaming;

  const handleSend = () => {
    if (sendDisabled) {
      return;
    }

    sendPrompt(trimmedValue);
    setValue('');
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="composer">
      <textarea
        className="composer-input"
        placeholder="继续输入问题，或让 AI 生成报告..."
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={handleKeyDown}
        maxLength={MAX_PROMPT_LENGTH}
      />
      <div className="composer-footer">
        <div className="composer-tools">
          <button type="button" className="composer-tool-btn">
            附件
          </button>
          <button type="button" className="composer-tool-btn">
            模板
          </button>
        </div>
        <div className="composer-actions">
          <span className="composer-count">
            {value.length} / {MAX_PROMPT_LENGTH}
          </span>
          <button
            type="button"
            className={[
              'send-btn',
              sendDisabled ? 'send-btn-disabled' : '',
              isStreaming ? 'send-btn-streaming' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={handleSend}
            disabled={sendDisabled}
          >
            {isStreaming ? '生成中' : '发送'}
          </button>
        </div>
      </div>
    </div>
  );
}
