import type {
  DemoConversationTemplateListView,
  DemoTaskListView,
} from '../../utils/demoTemplateViewModel';
import { DemoTaskCard } from './DemoTaskCard';
import { DemoTemplateState } from './DemoTemplateState';

interface DemoTaskListProps {
  taskView: DemoTaskListView;
  conversationView: DemoConversationTemplateListView;
  isCopying: boolean;
  copyErrorMessage: string | null;
  onStartTask: (id: string) => void;
  onCopyConversation: (id: string) => void;
  onRetryTasks: () => void;
  onRetryConversations: () => void;
  onRetryCopy: () => void;
}

export function DemoTaskList({
  taskView,
  conversationView,
  isCopying,
  copyErrorMessage,
  onStartTask,
  onCopyConversation,
  onRetryTasks,
  onRetryConversations,
  onRetryCopy,
}: DemoTaskListProps) {
  return (
    <div className="demo-template-panel">
      {copyErrorMessage ? (
        <DemoTemplateState
          title="示例复制失败"
          description={copyErrorMessage}
          actionLabel="重试"
          onAction={onRetryCopy}
        />
      ) : null}

      {taskView.isLoading ? <DemoTemplateState title={taskView.loadingMessage} /> : null}

      {!taskView.isLoading && taskView.errorMessage ? (
        <DemoTemplateState
          title="示例任务加载失败"
          description={taskView.errorMessage}
          actionLabel={taskView.canRetry ? taskView.retryLabel : undefined}
          onAction={taskView.canRetry ? onRetryTasks : undefined}
        />
      ) : null}

      {!taskView.isLoading && taskView.isEmpty ? (
        <DemoTemplateState title={taskView.emptyTitle} description={taskView.emptyDescription} />
      ) : null}

      {!taskView.isLoading && !taskView.errorMessage && !taskView.isEmpty ? (
        <div className="demo-task-list">
          {taskView.items.map((task) => (
            <DemoTaskCard
              key={task.id}
              item={task}
              disabled={isCopying}
              onClick={onStartTask}
            />
          ))}
        </div>
      ) : null}

      <div className="demo-template-group">
        <h3 className="demo-template-subtitle">公开示例会话</h3>

        {conversationView.isLoading ? <DemoTemplateState title={conversationView.loadingMessage} /> : null}

        {!conversationView.isLoading && conversationView.errorMessage ? (
          <DemoTemplateState
            title="示例会话加载失败"
            description={conversationView.errorMessage}
            actionLabel={conversationView.canRetry ? conversationView.retryLabel : undefined}
            onAction={conversationView.canRetry ? onRetryConversations : undefined}
          />
        ) : null}

        {!conversationView.isLoading && conversationView.isEmpty ? (
          <DemoTemplateState
            title={conversationView.emptyTitle}
            description={conversationView.emptyDescription}
          />
        ) : null}

        {!conversationView.isLoading && !conversationView.errorMessage && !conversationView.isEmpty ? (
          <div className="demo-task-list">
            {conversationView.items.map((template) => (
              <DemoTaskCard
                key={template.id}
                item={template}
                disabled={isCopying}
                onClick={onCopyConversation}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
