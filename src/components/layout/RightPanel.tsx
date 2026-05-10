import { AgentStepsCard } from './right-panel/AgentStepsCard';
import { AnalyticsResultCard } from './right-panel/AnalyticsResultCard';
import { CurrentConclusionCard } from './right-panel/CurrentConclusionCard';
import { DataSourceCard } from './right-panel/DataSourceCard';
import { RagSourcesCard } from './right-panel/RagSourcesCard';
import { RunOverviewCard } from './right-panel/RunOverviewCard';
import { ToolInvocationsCard } from './right-panel/ToolInvocationsCard';

export function RightPanel() {
  return (
    <div className="right-panel">
      <div className="right-panel-content">
        <RunOverviewCard />
        <AgentStepsCard />
        <DataSourceCard />
        <ToolInvocationsCard />
        <RagSourcesCard />
        <AnalyticsResultCard />
        <CurrentConclusionCard />
      </div>
    </div>
  );
}
