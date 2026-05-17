import type {
  DataSourceSchemaResponse,
  DataSourceTestResponse,
  DataSourceTestableProviderId,
} from '../types/workbench';

export async function testDataSourceConnection(
  provider: DataSourceTestableProviderId
): Promise<DataSourceTestResponse> {
  return {
    ok: false,
    provider,
    status: 'error',
    errorMessage: '旧外部数据源连接测试已删除；当前正式数据链路由 CloudBase MySQL 和受控工具提供。',
    elapsedMs: 0,
  };
}

export async function readDataSourceSchema(
  provider: DataSourceTestableProviderId
): Promise<DataSourceSchemaResponse> {
  return {
    ok: false,
    provider,
    status: 'error',
    errorMessage: '旧外部数据源 schema 接口已删除；当前正式数据链路由 CloudBase MySQL 和受控工具提供。',
    elapsedMs: 0,
  };
}
