import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
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

function PromptTemplateEditorForm({ template, onSave, onReset }: PromptTemplateEditorProps) {
  const [draftContent, setDraftContent] = useState(template.currentContent);
  const isDirty = draftContent !== template.currentContent;
  const characterCountText = useMemo(() => `${draftContent.length} 字符`, [draftContent.length]);

  return (
    <Card size="sm" className="prompt-template-editor">
      <CardHeader className="prompt-template-editor-header">
        <div>
          <CardTitle className="prompt-template-editor-title">{template.name}</CardTitle>
          <CardDescription className="prompt-template-editor-description">{template.description}</CardDescription>
        </div>
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
      </CardHeader>

      <CardContent className="prompt-template-editor-content">
        <div className="prompt-template-variable-row" aria-label="可用变量">
          {template.variables.map((variable) => (
            <Badge key={variable} variant="outline" className="prompt-template-variable-badge">
              {variable}
            </Badge>
          ))}
        </div>

        <Separator className="prompt-template-separator" />

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
      </CardContent>
    </Card>
  );
}

export function PromptTemplateEditor(props: PromptTemplateEditorProps) {
  return <PromptTemplateEditorForm key={`${props.template.id}:${props.template.currentContent}`} {...props} />;
}
