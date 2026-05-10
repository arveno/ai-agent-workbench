import type { RunSnapshot } from '../../types/run';
import { Badge } from '../ui/badge';
import { Card, CardContent } from '../ui/card';

interface RunErrorBlockProps {
  run: RunSnapshot;
}

export function RunErrorBlock({ run }: RunErrorBlockProps) {
  return (
    <Card size="sm" className="run-state-card run-error-card">
      <CardContent className="run-state-card-content">
        <Badge variant="outline" className="run-state-card-badge run-state-card-badge-error">
          执行失败
        </Badge>
        <div className="run-state-card-copy">
          <h3>本轮执行失败</h3>
          <p>{run.errorMessage || 'Agent Run 执行失败，请检查数据源或模型配置。'}</p>
        </div>
      </CardContent>
    </Card>
  );
}
