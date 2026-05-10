import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { PromptTemplate } from '@/types/prompt';

interface PromptTemplateEditorProps {
  template: PromptTemplate;
  onSave: (content: string) => void;
  onReset: () => void;
}

function formatUpdatedAt(updatedAt: string | undefined): string {
  if (!updatedAt) {
    return '当前为默认模板';
  }

  return `上次保存：${new Date(updatedAt).toLocaleString('zh-CN', { hour12: false })}`;
}

export function PromptTemplateEditor({ template, onSave, onReset }: PromptTemplateEditorProps) {
  const [draftContent, setDraftContent] = useState(template.currentContent);
  const isDirty = draftContent !== template.currentContent;
  const characterCountText = useMemo(() => `${draftContent.length} 字符`, [draftContent.length]);

  useEffect(() => {
    setDraftContent(template.currentContent);
  }, [template.currentContent, template.id]);

  return (
    <section className="prompt-template-editor">
      <div className="prompt-template-editor-header">
        <div>
          <h4 className="prompt-template-editor-title">{template.name}</h4>
          <p className="prompt-template-editor-description">{template.description}</p>
        </div>
        <Badge variant={template.updatedAt ? 'secondary' : 'outline'}>{template.updatedAt ? '已自定义' : '默认启用'}</Badge>
      </div>

      <div className="prompt-template-variable-row" aria-label="可用变量">
        {template.variables.map((variable) => (
          <Badge key={variable} variant="outline" className="prompt-template-variable-badge">
            {variable}
          </Badge>
        ))}
      </div>

      <Textarea
        className="prompt-template-textarea"
        value={draftContent}
        onChange={(event) => {
          setDraftContent(event.target.value);
        }}
        spellCheck={false}
      />

      <div className="prompt-template-editor-footer">
        <div className="prompt-template-editor-meta">
          <span>{formatUpdatedAt(template.updatedAt)}</span>
          <span>{characterCountText}</span>
          {isDirty ? <span>有未保存修改</span> : null}
        </div>
        <div className="prompt-template-editor-actions">
          <Button type="button" variant="outline" size="sm" onClick={onReset}>
            恢复默认
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              onSave(draftContent);
            }}
            disabled={!draftContent.trim() || !isDirty}
          >
            保存模板
          </Button>
        </div>
      </div>
    </section>
  );
}
