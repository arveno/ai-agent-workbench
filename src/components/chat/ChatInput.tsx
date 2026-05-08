export function ChatInput() {
  return (
    <div className="composer">
      <textarea
        className="composer-input"
        placeholder="继续输入问题，或让 AI 生成报告..."
        readOnly
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
          <span className="composer-count">0 / 2000</span>
          <button type="button" className="send-btn">
            发送
          </button>
        </div>
      </div>
    </div>
  );
}