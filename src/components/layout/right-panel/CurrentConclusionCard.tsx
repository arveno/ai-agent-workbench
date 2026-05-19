import { useWorkbenchStore } from '../../../stores/workbenchStore';
import type { ConclusionSectionView } from '../../../utils/runConclusionViewModel';
import { createConclusionViewModel } from '../../../utils/runConclusionViewModel';
import { getConclusionSourceLabel } from '../../../utils/runViewModel';
import {
  LONG_MESSAGE_CHARACTER_THRESHOLD,
  LONG_MESSAGE_LINE_THRESHOLD,
  LONG_MESSAGE_PREVIEW_LENGTH,
} from '../../../utils/messageTimelineViewModel';
import { AppIcon } from '../../common/AppIcon';
import { icons } from '../../common/iconMap';
import { LongTextBlock } from '../../chat/LongTextBlock';
import { MarkdownMessage } from '../../chat/MarkdownMessage';
import { Badge } from '../../ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';

function getConclusionText(params: {
  status: string;
  compactMarkdownText: string;
  errorMessage?: string;
}): string {
  if (params.status === 'error') {
    return `执行失败：${params.errorMessage ?? '未知错误'}`;
  }

  const conclusionText = params.compactMarkdownText.trim();

  if (conclusionText) {
    return conclusionText;
  }

  if (params.status === 'running') {
    return '正在生成结论...';
  }

  if (params.status === 'stopped') {
    return '本轮已停止。';
  }

  return '暂无结论';
}

function isLongText(value: string): boolean {
  return value.length > LONG_MESSAGE_CHARACTER_THRESHOLD || value.split(/\r?\n/).length > LONG_MESSAGE_LINE_THRESHOLD;
}

function createConclusionPreview(value: string): string {
  if (value.length <= LONG_MESSAGE_PREVIEW_LENGTH) {
    return value;
  }

  return `${value.slice(0, LONG_MESSAGE_PREVIEW_LENGTH).trimEnd()}...`;
}

function renderCompactSections(sections: ConclusionSectionView[]) {
  return (
    <div className="conclusion-compact-sections">
      {sections.map((section) => (
        <section key={section.title} className="conclusion-compact-section">
          <h4 className="conclusion-compact-section-title">{section.title}</h4>
          <p className="conclusion-compact-section-content">{section.content}</p>
        </section>
      ))}
    </div>
  );
}

export function CurrentConclusionCard() {
  const currentRun = useWorkbenchStore((state) => state.currentRun);

  if (!currentRun) {
    return (
      <Card size="sm" className="right-card right-section">
        <CardHeader className="right-card-header">
          <CardTitle className="panel-section-title">
            <AppIcon icon={icons.alert} size={16} />
            <span>结论摘要</span>
          </CardTitle>
          <CardDescription>选中 Run 的最终回复摘要</CardDescription>
        </CardHeader>
        <CardContent className="right-card-content">
          <div className="right-panel-empty-state">
            <strong>暂无结论</strong>
            Agent 完成本轮执行后，会在这里展示最终结论。
          </div>
        </CardContent>
      </Card>
    );
  }

  const conclusionView = createConclusionViewModel(currentRun);
  const conclusionText = getConclusionText({
    status: currentRun.status,
    compactMarkdownText: conclusionView.compactMarkdownText,
    errorMessage: currentRun.errorMessage,
  });
  const updatedText = `更新时间：${new Date(currentRun.updatedAt).toLocaleString('zh-CN', { hour12: false })}`;
  const shouldShowSourceBadge = currentRun.conclusionSource !== 'none';
  const shouldShowCompactSections = currentRun.status !== 'running' && currentRun.status !== 'error' && conclusionView.compactSections.length > 0;
  const shouldCollapseConclusion = isLongText(conclusionText) && currentRun.status !== 'running';

  return (
    <Card size="sm" className="right-card right-section">
      <CardHeader className="right-card-header">
        <CardTitle className="panel-section-title">
          <AppIcon icon={icons.alert} size={16} />
          <span>结论摘要</span>
        </CardTitle>
        <CardDescription>作为右侧证据链的结论备份，完整对话仍在聊天区</CardDescription>
      </CardHeader>

      <CardContent className="right-card-content">
        <div className="conclusion-badge-row">
          {currentRun.status === 'running' ? (
            <Badge variant="outline" className="conclusion-source-badge">
              生成中
            </Badge>
          ) : null}
          {currentRun.status === 'stopped' ? (
            <Badge variant="outline" className="conclusion-source-badge conclusion-source-badge-stopped">
              本轮已停止
            </Badge>
          ) : null}
          {currentRun.status === 'error' ? (
            <Badge variant="outline" className="conclusion-source-badge conclusion-source-badge-danger">
              执行失败
            </Badge>
          ) : null}
          {shouldShowSourceBadge ? (
            <Badge variant="outline" className="conclusion-source-badge">
              {getConclusionSourceLabel(currentRun.conclusionSource)}
            </Badge>
          ) : null}
        </div>

        {currentRun.conclusionNotice ? (
          <div className="conclusion-fallback-notice">{currentRun.conclusionNotice}</div>
        ) : null}

        <div className="conclusion-card">
          {shouldShowCompactSections ? (
            renderCompactSections(conclusionView.compactSections)
          ) : (
            <LongTextBlock
              key={`${currentRun.id}:${currentRun.status}:${shouldCollapseConclusion ? 'collapsed' : 'open'}`}
              content={conclusionText}
              previewText={createConclusionPreview(conclusionText)}
              shouldCollapseByDefault={shouldCollapseConclusion}
              expandLabel="展开完整结论"
              collapseLabel="收起结论"
              renderContent={(visibleContent) => (
                <div className="conclusion-card-text">
                  <MarkdownMessage content={visibleContent} />
                </div>
              )}
            />
          )}
          <div className="conclusion-updated-at">{updatedText}</div>
        </div>
      </CardContent>
    </Card>
  );
}
