import { useWorkbenchStore } from '../../../stores/workbenchStore';
import { createRagSourcesView } from '../../../utils/ragSourcesViewModel';
import { AppIcon } from '../../common/AppIcon';
import { icons } from '../../common/iconMap';
import { Badge } from '../../ui/badge';
import { Button } from '../../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';

export function RagSourcesCard() {
  const currentRun = useWorkbenchStore((state) => state.currentRun);
  const isRagSourcesLoading = useWorkbenchStore((state) => state.isRagSourcesLoading);
  const ragSourcesError = useWorkbenchStore((state) => state.ragSourcesError);
  const loadRagRetrievals = useWorkbenchStore((state) => state.loadRagRetrievals);
  const view = createRagSourcesView({
    run: currentRun,
    isLoading: isRagSourcesLoading,
    errorMessage: ragSourcesError,
  });

  if (!currentRun) {
    return (
      <Card size="sm" className="right-card right-section">
        <CardHeader className="right-card-header">
          <CardTitle className="panel-section-title">
            <AppIcon icon={icons.search} size={16} />
            <span>{view.title}</span>
          </CardTitle>
          <CardDescription>{view.description}</CardDescription>
        </CardHeader>
        <CardContent className="right-card-content">
          <div className="right-panel-empty-state">
            <strong>{view.emptyTitle}</strong>
            {view.emptyDescription}
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
            <span>{view.title}</span>
          </CardTitle>
          <CardDescription>{view.description}</CardDescription>
        </div>
        {view.retrievedChunkCount > 0 ? (
          <Badge variant="outline" className="right-card-count-badge">
            retrievedChunkCount {view.retrievedChunkCount}
          </Badge>
        ) : null}
      </CardHeader>

      <CardContent className="right-card-content">
        {view.isLoading ? (
          <div className="right-panel-empty-state">
            <strong>{view.loadingMessage}</strong>
            正在恢复检索日志和来源片段。
          </div>
        ) : null}

        {!view.isLoading && view.errorMessage ? (
          <div className="right-panel-empty-state">
            <strong>RAG 来源加载失败</strong>
            {view.errorMessage}
            {view.canRetry ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  if (currentRun) {
                    void loadRagRetrievals(currentRun.id);
                  }
                }}
              >
                {view.retryLabel}
              </Button>
            ) : null}
          </div>
        ) : null}

        {!view.isLoading && !view.errorMessage && view.isEmpty ? (
          <div className="right-panel-empty-state">
            <strong>{view.emptyTitle}</strong>
            {view.emptyDescription}
          </div>
        ) : null}

        {!view.isLoading && !view.errorMessage && !view.isEmpty ? (
          <div className="rag-source-list">
            {view.items.map((source) => (
              <article key={source.id} className="rag-source-item">
                <div className="rag-source-header">
                  <Badge variant="outline" className="rag-source-citation">
                    {source.citationId}
                  </Badge>
                  <span className="rag-source-score">{source.scoreText}</span>
                </div>

                <div className="rag-source-title-row">
                  <h3 className="rag-source-title">{source.title}</h3>
                  <Badge variant="outline" className="rag-source-badge rag-source-badge-type">
                    {source.isMock ? '模拟来源' : '真实来源'}
                  </Badge>
                </div>

                <div className="rag-source-chunk-title">来源：{source.sourceName}</div>
                <p className="rag-source-preview">{source.snippet}</p>

                <div className="rag-source-meta">
                  <Badge
                    variant="outline"
                    className={[
                      'rag-source-badge',
                      source.isUsedInAnswer ? 'rag-source-badge-used' : 'rag-source-badge-muted',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    {source.isUsedInAnswer ? '已用于回答' : '未引用'}
                  </Badge>
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
