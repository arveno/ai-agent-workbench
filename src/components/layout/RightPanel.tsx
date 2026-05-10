import { AgentStepsCard } from './right-panel/AgentStepsCard';
import { AnalyticsResultCard } from './right-panel/AnalyticsResultCard';
import { CurrentConclusionCard } from './right-panel/CurrentConclusionCard';
import { DataSourceCard } from './right-panel/DataSourceCard';
import { ToolInvocationsCard } from './right-panel/ToolInvocationsCard';

export function RightPanel() {
  return (
    <div className="right-panel">
      <div className="right-panel-content">
        <AgentStepsCard />
        <DataSourceCard />
        <ToolInvocationsCard />
        <AnalyticsResultCard />
        <CurrentConclusionCard />
      </div>
    </div>
  );
}
