import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { WorkbenchPersistenceErrorCode } from '../../types/persistence';
import { verifySupabaseAccessToken } from '../auth/verifySupabaseToken';

export interface VerifiedWorkbenchRequestUser {
  userId: string;
}

function getHeaderValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? '';
  }

  return value ?? '';
}

function getBearerToken(req: VercelRequest): string | null {
  const authorization = getHeaderValue(req.headers.authorization).trim();

  if (!authorization.toLowerCase().startsWith('bearer ')) {
    return null;
  }

  const token = authorization.slice('bearer '.length).trim();
  return token || null;
}

export function sendWorkbenchError(
  res: VercelResponse,
  statusCode: number,
  errorCode: WorkbenchPersistenceErrorCode,
  message: string,
): void {
  res.status(statusCode).json({
    ok: false,
    errorCode,
    message,
  });
}

export async function verifyWorkbenchRequestUser(
  req: VercelRequest,
): Promise<
  | { ok: true; user: VerifiedWorkbenchRequestUser }
  | { ok: false; statusCode: number; errorCode: WorkbenchPersistenceErrorCode; message: string }
> {
  const accessToken = getBearerToken(req);

  if (!accessToken) {
    return {
      ok: false,
      statusCode: 401,
      errorCode: 'auth_required',
      message: '请先登录后使用 Workbench 数据持久化。',
    };
  }

  const verified = await verifySupabaseAccessToken(accessToken);

  if (!verified.ok) {
    return {
      ok: false,
      statusCode: verified.errorCode === 'auth_unavailable' ? 503 : 401,
      errorCode: verified.errorCode === 'auth_unavailable' ? 'auth_unavailable' : 'auth_required',
      message:
        verified.errorCode === 'auth_unavailable'
          ? '服务端登录权限检查暂不可用。'
          : '请先登录后使用 Workbench 数据持久化。',
    };
  }

  return {
    ok: true,
    user: {
      userId: verified.user.userId,
    },
  };
}

export function readRouteId(value: string | string[] | undefined): string | null {
  const rawId = Array.isArray(value) ? value[0] : value;
  const id = rawId?.trim();
  return id ? id : null;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseRequestBody(body: unknown): Record<string, unknown> {
  if (typeof body === 'string') {
    try {
      const parsed = JSON.parse(body) as unknown;
      return isRecord(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  return isRecord(body) ? body : {};
}
