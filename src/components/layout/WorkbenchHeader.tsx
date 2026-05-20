import { Fragment } from 'react';
import { useWorkbenchStore } from '../../stores/workbenchStore';
import type { GenerationStatus, RunSnapshot } from '../../types/workbench';
import {
  formatRunElapsed,
  getRunStatusLabel,
  getRunStatusTone,
  type RunStatusTone,
} from '../../utils/runViewModel';
import { WORKBENCH_TOOL_DEFINITIONS } from '../../utils/toolRegistryView';
import { Badge } from '../ui/badge';
import { Separator } from '../ui/separator';
import { AppIcon } from '../common/AppIcon';
import { icons } from '../common/iconMap';
import { HeaderCapabilityButton } from './HeaderCapabilityButton';

const DEFAULT_HEADER_TITLE = '新聊天';
const DATA_SOURCE_TABLES = 'teaching_metrics、knowledge_documents、knowledge_chunks';

function getGenerationLabel(status: GenerationStatus): string {
  if (status === 'streaming') {
    return '任务进行中';
  }

  if (status === 'done') {
    return '已完成';
  }

  if (status === 'stopped') {
    return '已停止';
  }

  if (status === 'error') {
    return '执行失败';
  }

  return '待开始';
}

function getGenerationStatusTone(status: GenerationStatus): RunStatusTone {
  if (status === 'streaming') {
    return 'active';
  }

  if (status === 'done') {
    return 'success';
  }

  if (status === 'stopped') {
    return 'warning';
  }

  if (status === 'error') {
    return 'danger';
  }

  return 'muted';
}

function getRunSummaryItems(currentRun: RunSnapshot | null): string[] {
  if (!currentRun) {
    return ['尚未开始 Run'];
  }

  const summaryItems = [
    `工具 ${currentRun.toolInvocations.length}`,
    `图表 ${currentRun.chartData ? 1 : 0}`,
  ];
  const elapsedText = formatRunElapsed(currentRun);

  if (elapsedText !== '-') {
    summaryItems.push(`耗时 ${elapsedText}`);
  }

  return summaryItems;
}

export function WorkbenchHeader() {
  const sessions = useWorkbenchStore((state) => state.sessions);
  const currentSessionId = useWorkbenchStore((state) => state.currentSessionId);
  const generationStatus = useWorkbenchStore((state) => state.generationStatus);
  const currentRun = useWorkbenchStore((state) => state.currentRun);
  const openDataSourceModal = useWorkbenchStore((state) => state.openDataSourceModal);
  const openToolLibraryModal = useWorkbenchStore((state) => state.openToolLibraryModal);
  const openWorkflowModal = useWorkbenchStore((state) => state.openWorkflowModal);
  const currentSession = sessions.find((session) => session.id === currentSessionId);
  const headerTitle = currentSession?.title || DEFAULT_HEADER_TITLE;
  const statusLabel = currentRun ? getRunStatusLabel(currentRun.status) : getGenerationLabel(generationStatus);
  const statusTone = currentRun ? getRunStatusTone(currentRun.status) : getGenerationStatusTone(generationStatus);
  const runSummaryItems = getRunSummaryItems(currentRun);
  const enabledToolCount = WORKBENCH_TOOL_DEFINITIONS.filter((tool) => tool.enabled).length;
  const serverToolCount = WORKBENCH_TOOL_DEFINITIONS.filter(
    (tool) => tool.enabled && tool.runtime === 'server' && tool.status === 'connected',
  ).length;

  return (
    <header className="workspace-header workbench-header">
      <div className="workspace-header-main header-main">
        <div className="workspace-title-row">
          <div className="workbench-title-icon" aria-hidden="true">
            <AppIcon icon={icons.task} size={18} />
          </div>
          <h2 className="header-title">{headerTitle}</h2>
        </div>
        <div className="workspace-status-row" aria-label="Run 状态摘要">
          <Badge variant="outline" className={`workspace-status-badge workspace-status-badge-${statusTone}`}>
            <span className="workspace-status-dot" aria-hidden="true"></span>
            {statusLabel}
          </Badge>
          {runSummaryItems.map((item, index) => (
            <Fragment key={item}>
              {index > 0 ? <Separator orientation="vertical" className="workspace-status-separator" /> : null}
              <span className="workspace-status-item">{item}</span>
            </Fragment>
          ))}
        </div>
      </div>

      <div className="workspace-actions">
        <span className="workspace-actions-label">能力入口</span>

        <HeaderCapabilityButton
          icon={icons.stepDone}
          label="模拟模式可用"
          tone="success"
          title="当前可使用模拟模式验证核心流程。"
          ariaLabel="模拟模式可用"
          tooltip={{
            title: '模拟模式可用',
            description: '当前可使用 Mock Run 验证 Run Trace、RAG 来源和报告生成流程。',
            items: [
              { label: '模拟模式', status: '可用', variant: 'success' },
              { label: 'Mock Run', status: '已接入', variant: 'success' },
              { label: 'Run Trace', status: '已接入', variant: 'success' },
              { label: 'RAG 来源展示', status: '已接入', variant: 'success' },
              { label: '报告生成', status: '已接入', variant: 'success' },
              { label: '真实 Agent', status: '需登录 / 需模型配置', variant: 'warning' },
            ],
          }}
        />

        <HeaderCapabilityButton
          icon={icons.database}
          label="数据源"
          tone="success"
          title={`CloudBase MySQL 已作为主数据源接入；可用表：${DATA_SOURCE_TABLES}。用于数据分析、RAG 检索和报告生成。`}
          ariaLabel="数据源：受控访问"
          tooltip={{
            title: 'CloudBase MySQL 受控访问',
            description: '数据读取通过 CloudBase HTTP Functions 和服务端工具执行，前端不保存数据库连接串。',
            items: [
              { label: 'CloudBase MySQL', status: '已连接', variant: 'success' },
              { label: 'teaching_metrics', status: '已接入', variant: 'success' },
              { label: 'knowledge_documents', status: '已接入', variant: 'success' },
              { label: 'knowledge_chunks', status: '已接入', variant: 'success' },
            ],
          }}
          onClick={openDataSourceModal}
        />

        <HeaderCapabilityButton
          icon={icons.settings}
          label="工具库"
          tone="success"
          title={`服务端白名单工具链已启用 ${enabledToolCount} 个工具；模型不能直接执行 SQL，工具调用进入 Run Trace。`}
          ariaLabel={`工具库：${serverToolCount} 个服务端工具`}
          tooltip={{
            title: '服务端工具库',
            description: '模型只能选择服务端白名单工具，不能直接执行 SQL。',
            items: [
              { label: '数据源结构读取', status: '已接入', variant: 'success' },
              { label: '受控数据查询', status: '已接入', variant: 'success' },
              { label: '数据聚合分析', status: '已接入', variant: 'success' },
              { label: '图表数据生成', status: '已接入', variant: 'success' },
              { label: '知识库检索', status: '已接入', variant: 'success' },
              { label: '报告生成', status: '本地辅助', variant: 'info' },
            ],
          }}
          onClick={openToolLibraryModal}
        />

        <HeaderCapabilityButton
          icon={icons.agent}
          label="Workflow / Prompt"
          tone="neutral"
          title="查看固定执行流程和本地 Prompt 模板。"
          ariaLabel="Workflow / Prompt：固定流程"
          onClick={openWorkflowModal}
        />
      </div>
    </header>
  );
}
