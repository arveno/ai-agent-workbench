import type { ReactNode } from 'react';
import { ScrollArea } from '../ui/scroll-area';
import { AgentStepsCard } from './right-panel/AgentStepsCard';
import { AnalyticsResultCard } from './right-panel/AnalyticsResultCard';
import { CurrentConclusionCard } from './right-panel/CurrentConclusionCard';
import { DataSourceCard } from './right-panel/DataSourceCard';
import { RagSourcesCard } from './right-panel/RagSourcesCard';
import { ReportStatusCard } from './right-panel/ReportStatusCard';
import { RunOverviewCard } from './right-panel/RunOverviewCard';
import { ToolInvocationsCard } from './right-panel/ToolInvocationsCard';

interface RightPanelSectionProps {
  title: string;
  description: string;
  children: ReactNode;
}

function RightPanelSection({ title, description, children }: RightPanelSectionProps) {
  return (
    <section className="right-panel-group" aria-label={title}>
      <div className="right-panel-group-heading">
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      <div className="right-panel-group-body">{children}</div>
    </section>
  );
}

export function RightPanel() {
  return (
    <aside className="right-panel" aria-label="Workspace Inspector">
      <ScrollArea className="right-panel-scroll">
        <div className="right-panel-content">
          <RightPanelSection title="执行概览" description="当前选中 Run 的状态、问题和步骤。">
            <RunOverviewCard />
            <AgentStepsCard />
          </RightPanelSection>

          <RightPanelSection title="工具与数据" description="服务端受控工具、数据源使用和分析结果。">
            <DataSourceCard />
            <ToolInvocationsCard />
            <AnalyticsResultCard />
          </RightPanelSection>

          <RightPanelSection title="来源与报告" description="RAG 证据、报告状态和选中 Run 的结论摘要。">
            <RagSourcesCard />
            <ReportStatusCard />
            <CurrentConclusionCard />
          </RightPanelSection>
        </div>
      </ScrollArea>
    </aside>
  );
}
