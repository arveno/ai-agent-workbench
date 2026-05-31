import type { RunErrorBlockModel } from '../../utils/runPresentationModel';
import { Badge } from '../ui/badge';
import { Card, CardContent } from '../ui/card';

interface RunErrorBlockProps {
  model: RunErrorBlockModel;
}

export function RunErrorBlock({ model }: RunErrorBlockProps) {
  return (
    <Card size="sm" className="run-state-card run-error-card">
      <CardContent className="run-state-card-content">
        <Badge variant="outline" className="run-state-card-badge run-state-card-badge-error">
          执行失败
        </Badge>
        <div className="run-state-card-copy">
          <h3>本轮执行失败</h3>
          <p>{model.message}</p>
        </div>
      </CardContent>
    </Card>
  );
}
