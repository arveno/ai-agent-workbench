import { getSupabaseAdminClient } from './supabaseAdmin';
import type { VerifySupabaseAccessTokenResult } from './types';

export async function verifySupabaseAccessToken(accessToken: string): Promise<VerifySupabaseAccessTokenResult> {
  const normalizedAccessToken = accessToken.trim();

  if (!normalizedAccessToken) {
    return {
      ok: false,
      errorCode: 'invalid_token',
      message: '缺少 Supabase access token。',
    };
  }

  const supabaseAdmin = getSupabaseAdminClient();

  if (!supabaseAdmin) {
    return {
      ok: false,
      errorCode: 'auth_unavailable',
      message: 'Supabase Admin Client 未配置，暂不能校验登录态。',
    };
  }

  try {
    const { data, error } = await supabaseAdmin.auth.getUser(normalizedAccessToken);

    if (error || !data.user) {
      return {
        ok: false,
        errorCode: 'invalid_token',
        message: 'Supabase access token 无效或已过期。',
      };
    }

    return {
      ok: true,
      user: {
        userId: data.user.id,
        email: data.user.email ?? null,
        user: data.user,
      },
    };
  } catch {
    return {
      ok: false,
      errorCode: 'auth_unavailable',
      message: '校验 Supabase access token 失败。',
    };
  }
}
