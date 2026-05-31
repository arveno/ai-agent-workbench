import type { RunStoppedBlockModel } from '../../utils/runPresentationModel';
import { Badge } from '../ui/badge';
import { Card, CardContent } from '../ui/card';

interface RunStoppedBlockProps {
  model: RunStoppedBlockModel;
}

export function RunStoppedBlock({ model }: RunStoppedBlockProps) {
  return (
    <Card size="sm" className="run-state-card run-stopped-card">
      <CardContent className="run-state-card-content">
        <Badge variant="outline" className="run-state-card-badge run-state-card-badge-stopped">
          已停止
        </Badge>
        <div className="run-state-card-copy">
          <h3>本轮生成已停止</h3>
          <p>{model.message}</p>
        </div>
      </CardContent>
    </Card>
  );
}
