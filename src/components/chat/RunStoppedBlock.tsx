import type { RunSnapshot } from '../../types/run';
import { Badge } from '../ui/badge';
import { Card, CardContent } from '../ui/card';

interface RunStoppedBlockProps {
  run: RunSnapshot;
}

export function RunStoppedBlock({ run }: RunStoppedBlockProps) {
  return (
    <Card size="sm" className="run-state-card run-stopped-card">
      <CardContent className="run-state-card-content">
        <Badge variant="outline" className="run-state-card-badge run-state-card-badge-stopped">
          已停止
        </Badge>
        <div className="run-state-card-copy">
          <h3>本轮生成已停止</h3>
          <p>{run.conclusion.trim() ? '已生成的部分内容已保留。' : '本轮未生成可保留的结论内容。'}</p>
        </div>
      </CardContent>
    </Card>
  );
}
