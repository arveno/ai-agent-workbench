import { useState } from 'react';
import { useWorkbenchStore } from '../../../stores/workbenchStore';
import { createRunStepsPanelModel } from '../../../utils/runPresentationModel';
import { AppIcon } from '../../common/AppIcon';
import { icons } from '../../common/iconMap';
import { Badge } from '../../ui/badge';
import { Button } from '../../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';

function truncateStepDescription(value: string): string {
  const normalizedValue = value.trim();

  if (normalizedValue.length <= 110) {
    return normalizedValue;
  }

  return `${normalizedValue.slice(0, 109)}…`;
}

export function AgentStepsCard() {
  const currentRun = useWorkbenchStore((state) => state.currentRun);
  const isRunEventsLoading = useWorkbenchStore((state) => state.isRunEventsLoading);
  const runEventsError = useWorkbenchStore((state) => state.runEventsError);
  const selectedRunId = useWorkbenchStore((state) => state.selectedRunId);
  const loadLatestRunForConversation = useWorkbenchStore((state) => state.loadLatestRunForConversation);
  const selectRunForCurrentSession = useWorkbenchStore((state) => state.selectRunForCurrentSession);
  const currentSessionId = useWorkbenchStore((state) => state.currentSessionId);
  const panelModel = createRunStepsPanelModel({
    run: currentRun,
    isLoading: isRunEventsLoading,
    errorMessage: runEventsError,
  });
  const [expandedStepIds, setExpandedStepIds] = useState<Set<string>>(() => new Set());

  const toggleStep = (stepId: string) => {
    setExpandedStepIds((currentValue) => {
      const nextValue = new Set(currentValue);

      if (nextValue.has(stepId)) {
        nextValue.delete(stepId);
      } else {
        nextValue.add(stepId);
      }

      return nextValue;
    });
  };

  return (
    <Card size="sm" className="right-card right-section">
      <CardHeader className="right-card-header">
        <CardTitle className="panel-section-title">
          <AppIcon icon={icons.agent} size={16} />
          <span>{panelModel.title}</span>
        </CardTitle>
        <CardDescription>{panelModel.description}</CardDescription>
      </CardHeader>
      <CardContent className="right-card-content">
        {panelModel.state === 'loading' ? (
          <div className="right-panel-empty-state">
            <strong>{panelModel.loadingTitle}</strong>
            {panelModel.loadingDescription}
          </div>
        ) : panelModel.state === 'error' ? (
          <div className="right-panel-empty-state">
            <strong>{panelModel.errorTitle}</strong>
            {panelModel.errorMessage}
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                if (selectedRunId) {
                  void selectRunForCurrentSession(selectedRunId);
                } else if (currentSessionId) {
                  void loadLatestRunForConversation(currentSessionId);
                }
              }}
            >
              {panelModel.retryLabel}
            </Button>
          </div>
        ) : panelModel.state === 'empty' ? (
          <div className="right-panel-empty-state">
            <strong>{panelModel.emptyTitle}</strong>
            {panelModel.emptyDescription}
          </div>
        ) : (
          <ol className="run-step-timeline">
            {panelModel.steps.map((step, index) => {
              const shouldDefaultExpand = step.statusClass === 'error';
              const isExpanded = shouldDefaultExpand || expandedStepIds.has(step.id);
              const description = step.description
                ? isExpanded
                  ? step.description
                  : truncateStepDescription(step.description)
                : '';

              return (
                <li key={step.id} className={`run-step-item ${step.statusClass}${step.isRunning ? ' active' : ''}`}>
                  <span className={`run-step-marker step-icon-${step.markerStatusClass}`} aria-hidden="true">
                    <AppIcon icon={icons[step.icon]} size={15} />
                  </span>
                  <div className="run-step-content">
                    <div className="run-step-main">
                      <span className="run-step-title">{`${index + 1}. ${step.title}`}</span>
                      <Badge variant="outline" className={`run-step-status run-step-status-${step.statusClass}`}>
                        {step.statusLabel}
                      </Badge>
                    </div>
	                    {description ? <div className="run-step-description">{description}</div> : null}
	                    {step.isLongDescription && step.statusClass !== 'error' ? (
	                      <button
	                        type="button"
	                        className="run-step-detail-toggle"
	                        onClick={() => {
	                          toggleStep(step.id);
	                        }}
	                      >
	                        {isExpanded ? '收起详情' : '查看详情'}
	                      </button>
	                    ) : null}
	                    {step.elapsedText ? <div className="run-step-meta">耗时：{step.elapsedText}</div> : null}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
