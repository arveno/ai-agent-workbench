import { ScrollArea } from '../ui/scroll-area';
import { AgentStepsCard } from './right-panel/AgentStepsCard';
import { AnalyticsResultCard } from './right-panel/AnalyticsResultCard';
import { CurrentConclusionCard } from './right-panel/CurrentConclusionCard';
import { DataSourceCard } from './right-panel/DataSourceCard';
import { RagSourcesCard } from './right-panel/RagSourcesCard';
import { RunOverviewCard } from './right-panel/RunOverviewCard';
import { ToolInvocationsCard } from './right-panel/ToolInvocationsCard';

export function RightPanel() {
  return (
    <aside className="right-panel" aria-label="Workspace Inspector">
      <ScrollArea className="right-panel-scroll">
        <div className="right-panel-content">
          <RunOverviewCard />
          <AgentStepsCard />
          <DataSourceCard />
          <ToolInvocationsCard />
          <RagSourcesCard />
          <AnalyticsResultCard />
          <CurrentConclusionCard />
        </div>
      </ScrollArea>
    </aside>
  );
}
