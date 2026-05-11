import type { AgentRunResponse, DataSourceTestableProviderId } from '../types/workbench';

export async function runAgentAnalysis(params: {
  prompt: string;
  provider: DataSourceTestableProviderId;
}): Promise<AgentRunResponse> {
  const response = await fetch('/api/agent/run', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt: params.prompt,
      provider: params.provider,
      modelProvider: 'groq',
    }),
  });

  return (await response.json()) as AgentRunResponse;
}
