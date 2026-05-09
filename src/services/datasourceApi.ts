import type {
  DataSourceSchemaResponse,
  DataSourceTestResponse,
  DataSourceTestableProviderId,
} from '../types/workbench';

export async function testDataSourceConnection(
  provider: DataSourceTestableProviderId
): Promise<DataSourceTestResponse> {
  const response = await fetch('/api/datasources/test', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ provider }),
  });

  const data = (await response.json()) as DataSourceTestResponse;

  if (!response.ok) {
    return data;
  }

  return data;
}

export async function readDataSourceSchema(
  provider: DataSourceTestableProviderId
): Promise<DataSourceSchemaResponse> {
  const response = await fetch('/api/datasources/schema', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ provider }),
  });

  const data = (await response.json()) as DataSourceSchemaResponse;

  if (!response.ok) {
    return data;
  }

  return data;
}
