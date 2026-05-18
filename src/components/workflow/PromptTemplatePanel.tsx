import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
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
    [selectedTemplateId, templates]
  );

  const customTemplateCount = templates.filter((template) => Boolean(template.updatedAt)).length;

  return (
    <div className="prompt-template-panel">
      <Card size="sm" className="prompt-template-panel-head">
        <CardHeader className="prompt-template-panel-header">
          <div>
            <CardTitle className="prompt-template-panel-title">Prompt 模板</CardTitle>
            <CardDescription className="prompt-template-panel-description">
              作为输入辅助和任务模板参考。当前配置只保存在浏览器会话中，不改变 CloudBase 后端真实执行逻辑。
            </CardDescription>
          </div>
          <Badge variant="outline" className="prompt-template-local-badge">
            仅本地会话保存
          </Badge>
        </CardHeader>
        <CardContent className="prompt-template-panel-actions">
          <span>{customTemplateCount} 个模板已修改</span>
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
        </CardContent>
      </Card>

      <div className="prompt-template-layout">
        <Card size="sm" className="prompt-template-list-card">
          <CardHeader className="prompt-template-list-header">
            <CardTitle className="prompt-template-list-title">模板列表</CardTitle>
            <CardDescription className="prompt-template-list-subtitle">选择一个模板进行查看或编辑。</CardDescription>
          </CardHeader>
          <Separator className="prompt-template-separator" />
          <CardContent className="prompt-template-list-content">
            <ScrollArea className="prompt-template-list-scroll">
              <div className="prompt-template-list" aria-label="Prompt 模板列表">
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
                    <span className="prompt-template-list-meta">
                      <Badge
                        variant="outline"
                        className={
                          template.updatedAt
                            ? 'prompt-template-status-badge prompt-template-status-badge-custom'
                            : 'prompt-template-status-badge prompt-template-status-badge-default'
                        }
                      >
                        {template.updatedAt ? '已修改' : '默认模板'}
                      </Badge>
                      <Badge variant="outline" className="prompt-template-status-badge prompt-template-status-badge-variable">
                        {template.variables.length} 个变量
                      </Badge>
                    </span>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

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
