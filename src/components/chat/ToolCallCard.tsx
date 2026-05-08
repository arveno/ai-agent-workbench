interface ToolCallCardProps {
  title: string;
  toolName: string;
  params: string;
  result: string;
}

export function ToolCallCard({ title, toolName, params, result }: ToolCallCardProps) {
  return (
    <article className="tool-card">
      <div className="tool-card-head">
        <span className="tool-dot" aria-hidden="true"></span>
        <span className="tool-state">已完成</span>
      </div>
      <h3>{title}</h3>
      <p>
        工具名：<code>{toolName}</code>
      </p>
      <p>参数：{params}</p>
      <p>结果摘要：{result}</p>
      <p className="tool-status-line">状态：已完成</p>
    </article>
  );
}