import type {
  WorkbenchPersistenceErrorCode,
  WorkbenchPersistenceResponse,
} from '@/types/persistence';

const WORKBENCH_ERROR_CODES = new Set<WorkbenchPersistenceErrorCode>([
  'auth_required',
  'auth_unavailable',
  'db_error',
  'invalid_request',
  'method_not_allowed',
  'not_found',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizePersistenceErrorCode(value: unknown): WorkbenchPersistenceErrorCode {
  if (value === 'validation_error') {
    return 'invalid_request';
  }

  if (value === 'auth_invalid') {
    return 'auth_required';
  }

  if (typeof value === 'string' && WORKBENCH_ERROR_CODES.has(value as WorkbenchPersistenceErrorCode)) {
    return value as WorkbenchPersistenceErrorCode;
  }

  return 'db_error';
}

export function createAuthRequiredPersistenceResponse<TData>(
  message: string,
): WorkbenchPersistenceResponse<TData> {
  return {
    ok: false,
    errorCode: 'auth_required',
    message,
  };
}

export function createNetworkPersistenceResponse<TData>(
  message: string,
): WorkbenchPersistenceResponse<TData> {
  return {
    ok: false,
    errorCode: 'db_error',
    message,
  };
}

export async function readWorkbenchPersistenceResponse<TData>(
  response: Response,
  fallbackMessage: string,
): Promise<WorkbenchPersistenceResponse<TData>> {
  const payload = (await response.json().catch(() => null)) as unknown;

  if (isRecord(payload) && payload.ok === true && 'data' in payload) {
    return {
      ok: true,
      data: payload.data as TData,
    };
  }

  if (isRecord(payload) && payload.ok === false) {
    return {
      ok: false,
      errorCode: normalizePersistenceErrorCode(payload.errorCode),
      message: typeof payload.message === 'string' ? payload.message : fallbackMessage,
    };
  }

  return {
    ok: false,
    errorCode: response.status === 401 ? 'auth_required' : 'db_error',
    message: fallbackMessage,
  };
}
