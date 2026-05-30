import { useWorkbenchStore } from '../../../stores/workbenchStore';
import { createRunSourcesPanelModel } from '../../../utils/runPresentationModel';
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
  const panelModel = createRunSourcesPanelModel({
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
            <span>{panelModel.title}</span>
          </CardTitle>
          <CardDescription>{panelModel.description}</CardDescription>
        </CardHeader>
        <CardContent className="right-card-content">
          <div className="right-panel-empty-state">
            <strong>{panelModel.emptyTitle}</strong>
            {panelModel.emptyDescription}
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
            <span>{panelModel.title}</span>
          </CardTitle>
          <CardDescription>{panelModel.description}</CardDescription>
        </div>
        {panelModel.countLabel ? (
          <Badge variant="outline" className="right-card-count-badge">
            {panelModel.countLabel}
          </Badge>
        ) : null}
      </CardHeader>

      <CardContent className="right-card-content">
        {panelModel.state === 'loading' ? (
          <div className="right-panel-empty-state">
            <strong>{panelModel.loadingTitle}</strong>
            {panelModel.loadingDescription}
          </div>
        ) : null}

        {panelModel.state === 'error' ? (
          <div className="right-panel-empty-state">
            <strong>{panelModel.errorTitle}</strong>
            {panelModel.errorMessage}
            {panelModel.canRetry ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  if (panelModel.actionRunId) {
                    void loadRagRetrievals(panelModel.actionRunId);
                  }
                }}
              >
                {panelModel.retryLabel}
              </Button>
            ) : null}
          </div>
        ) : null}

        {panelModel.state === 'empty' ? (
          <div className="right-panel-empty-state">
            <strong>{panelModel.emptyTitle}</strong>
            {panelModel.emptyDescription}
          </div>
        ) : null}

        {panelModel.state === 'ready' ? (
          <div className="rag-source-list">
            {panelModel.items.map((source) => (
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

                <div className="rag-source-chunk-title">
                  来源：{source.sourceName}
                </div>
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
