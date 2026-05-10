import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { PromptTemplateId } from '@/types/prompt';
import {
  readPromptTemplates,
  resetAllPromptTemplates,
  resetPromptTemplate,
  savePromptTemplate,
} from '@/utils/promptTemplates';
import { PromptTemplateEditor } from './PromptTemplateEditor';

function getStatusMessage(action: 'save' | 'reset' | 'resetAll' | null): string {
  if (action === 'save') {
    return '已保存到当前浏览器会话。';
  }

  if (action === 'reset') {
    return '当前模板已恢复默认。';
  }

  if (action === 'resetAll') {
    return '所有 Prompt 模板已恢复默认。';
  }

  return '当前 Prompt 模板仅保存在本浏览器会话中，暂未接入后端持久化。';
}

export function PromptTemplatePanel() {
  const [templates, setTemplates] = useState(() => readPromptTemplates());
  const [selectedTemplateId, setSelectedTemplateId] = useState<PromptTemplateId>('planner');
  const [lastAction, setLastAction] = useState<'save' | 'reset' | 'resetAll' | null>(null);
  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedTemplateId) ?? templates[0],
    [selectedTemplateId, templates],
  );

  const customTemplateCount = templates.filter((template) => Boolean(template.updatedAt)).length;

  return (
    <div className="prompt-template-panel">
      <div className="prompt-template-panel-head">
        <div>
          <h4 className="prompt-template-panel-title">Prompt 模板</h4>
          <p className="prompt-template-panel-description">
            管理 Planner、分析、报告和 fallback 摘要模板。当前配置只保存在浏览器会话中，不影响后端真实执行逻辑。
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setTemplates(resetAllPromptTemplates());
            setLastAction('resetAll');
          }}
          disabled={customTemplateCount === 0}
        >
          恢复全部默认
        </Button>
      </div>

      <div className="prompt-template-layout">
        <aside className="prompt-template-list" aria-label="Prompt 模板列表">
          {templates.map((template) => (
            <button
              key={template.id}
              type="button"
              className={[
                'prompt-template-list-item',
                template.id === selectedTemplateId ? 'prompt-template-list-item-active' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => {
                setSelectedTemplateId(template.id);
                setLastAction(null);
              }}
            >
              <span className="prompt-template-list-name">{template.name}</span>
              <span className="prompt-template-list-description">{template.description}</span>
              <span className="prompt-template-list-state">{template.updatedAt ? '已自定义' : '默认模板'}</span>
            </button>
          ))}
        </aside>

        <div className="prompt-template-editor-wrap">
          {selectedTemplate ? (
            <PromptTemplateEditor
              template={selectedTemplate}
              onSave={(content) => {
                setTemplates(savePromptTemplate(selectedTemplate.id, content));
                setLastAction('save');
              }}
              onReset={() => {
                setTemplates(resetPromptTemplate(selectedTemplate.id));
                setLastAction('reset');
              }}
            />
          ) : null}
        </div>
      </div>

      <p className="prompt-template-panel-note">{getStatusMessage(lastAction)}</p>
    </div>
  );
}
