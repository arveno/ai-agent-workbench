import { useWorkbenchStore } from '../../../stores/workbenchStore';
import type { RagSourceChunk } from '../../../types/rag';
import { formatSourceScore, getRunRagSources } from '../../../utils/ragSources';
import { AppIcon } from '../../common/AppIcon';
import { icons } from '../../common/iconMap';
import { Badge } from '../../ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';

function getSourceTypeLabel(sourceType: RagSourceChunk['sourceType']): string {
  if (sourceType === 'knowledge_base') {
    return '知识库';
  }

  if (sourceType === 'database_note') {
    return '数据说明';
  }

  if (sourceType === 'policy') {
    return '规则口径';
  }

  return '文档';
}

function truncatePreview(content: string): string {
  const normalizedContent = content.trim().replace(/\s+/g, ' ');

  if (normalizedContent.length <= 120) {
    return normalizedContent;
  }

  return `${normalizedContent.slice(0, 119)}…`;
}

export function RagSourcesCard() {
  const currentRun = useWorkbenchStore((state) => state.currentRun);
  const sources = getRunRagSources(currentRun);

  if (!currentRun) {
    return (
      <Card size="sm" className="right-card right-section">
        <CardHeader className="right-card-header">
          <CardTitle className="panel-section-title">
            <AppIcon icon={icons.search} size={16} />
            <span>检索来源</span>
          </CardTitle>
          <CardDescription>来源片段和引用信息</CardDescription>
        </CardHeader>
        <CardContent className="right-card-content">
          <div className="right-panel-empty-state">
            <strong>暂无检索来源</strong>
            发送涉及知识检索的问题后，这里会展示来源片段和引用信息。
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card size="sm" className="right-card right-section">
      <CardHeader className="right-card-header right-card-head">
        <div>
          <CardTitle className="panel-section-title">
            <AppIcon icon={icons.search} size={16} />
            <span>检索来源</span>
          </CardTitle>
          <CardDescription>RAG 来源、引用与证据链</CardDescription>
        </div>
        {sources.length > 0 ? (
          <Badge variant="outline" className="right-card-count-badge">
            {sources.length} 条来源
          </Badge>
        ) : null}
      </CardHeader>

      <CardContent className="right-card-content">
        {sources.length === 0 ? (
          <div className="right-panel-empty-state">
            <strong>暂无检索来源</strong>
            当前 Run 未返回来源片段。后续接入真实 RAG 工具后，这里会展示引用和证据链。
          </div>
        ) : (
          <div className="rag-source-list">
            {sources.map((source) => (
              <article key={source.id} className="rag-source-item">
                <div className="rag-source-header">
                  <Badge variant="outline" className="rag-source-citation">
                    {source.citationLabel}
                  </Badge>
                  <span className="rag-source-score">相关度 {formatSourceScore(source.score)}</span>
                </div>

                <div className="rag-source-title-row">
                  <h3 className="rag-source-title">{source.documentTitle}</h3>
                  <Badge variant="outline" className="rag-source-badge rag-source-badge-type">
                    {getSourceTypeLabel(source.sourceType)}
                  </Badge>
                </div>

                {source.chunkTitle ? <div className="rag-source-chunk-title">{source.chunkTitle}</div> : null}
                <p className="rag-source-preview">{truncatePreview(source.contentPreview)}</p>

                <div className="rag-source-meta">
                  <Badge
                    variant="outline"
                    className={[
                      'rag-source-badge',
                      source.usedInAnswer ? 'rag-source-badge-used' : 'rag-source-badge-muted',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    {source.usedInAnswer ? '已用于回答' : '未引用'}
                  </Badge>
                  {source.updatedAt ? <span className="rag-source-updated">更新：{source.updatedAt}</span> : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
