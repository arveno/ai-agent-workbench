import type { AgentRunResponse, DataSourceTestableProviderId } from '../types/workbench';

export async function runAgentAnalysis(params: {
  prompt: string;
  provider: DataSourceTestableProviderId;
  apiKey?: string;
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
      apiKey: params.apiKey,
    }),
  });

  return (await response.json()) as AgentRunResponse;
}
