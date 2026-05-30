import { useWorkbenchStore } from '../../../stores/workbenchStore';
import type { ConclusionSectionView } from '../../../utils/runConclusionViewModel';
import { createRunConclusionPanelModel } from '../../../utils/runPresentationModel';
import { AppIcon } from '../../common/AppIcon';
import { icons } from '../../common/iconMap';
import { LongTextBlock } from '../../chat/LongTextBlock';
import { MarkdownMessage } from '../../chat/MarkdownMessage';
import { Badge } from '../../ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';

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
  const panelModel = createRunConclusionPanelModel(currentRun);

  if (panelModel.state === 'empty') {
    return (
      <Card size="sm" className="right-card right-section">
        <CardHeader className="right-card-header">
          <CardTitle className="panel-section-title">
            <AppIcon icon={icons.alert} size={16} />
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
      <CardHeader className="right-card-header">
        <CardTitle className="panel-section-title">
          <AppIcon icon={icons.alert} size={16} />
          <span>{panelModel.title}</span>
        </CardTitle>
        <CardDescription>{panelModel.description}</CardDescription>
      </CardHeader>

      <CardContent className="right-card-content">
        <div className="conclusion-badge-row">
          {panelModel.badges.map((badge) => (
            <Badge key={badge.label} variant="outline" className={badge.className}>
              {badge.label}
            </Badge>
          ))}
        </div>

        {panelModel.notice ? (
          <div className="conclusion-fallback-notice">{panelModel.notice}</div>
        ) : null}

        <div className="conclusion-card">
          {panelModel.shouldShowCompactSections ? (
            renderCompactSections(panelModel.compactSections)
          ) : (
            <LongTextBlock
              key={panelModel.contentKey}
              content={panelModel.text}
              previewText={panelModel.previewText}
              shouldCollapseByDefault={panelModel.shouldCollapseByDefault}
              expandLabel="展开完整结论"
              collapseLabel="收起结论"
              renderContent={(visibleContent) => (
                <div className="conclusion-card-text">
                  <MarkdownMessage content={visibleContent} />
                </div>
              )}
            />
          )}
          <div className="conclusion-updated-at">{panelModel.updatedText}</div>
        </div>
      </CardContent>
    </Card>
  );
}
