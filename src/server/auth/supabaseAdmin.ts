/// <reference types="node" />

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { ensureServerEnvLoaded } from '../datasources/connection';
import type { ServerAuthDatabase } from './types';

export type SupabaseAdminClient = SupabaseClient<ServerAuthDatabase>;

let supabaseAdminClient: SupabaseAdminClient | null = null;

function getServerEnvValue(name: string): string {
  const value = process.env[name];
  return typeof value === 'string' ? value.trim() : '';
}

export function getSupabaseAdminConfig(): {
  isConfigured: boolean;
  missingKeys: Array<'SUPABASE_URL' | 'SUPABASE_SERVICE_ROLE_KEY'>;
} {
  ensureServerEnvLoaded();

  const supabaseUrl = getServerEnvValue('SUPABASE_URL') || getServerEnvValue('VITE_SUPABASE_URL');
  const serviceRoleKey = getServerEnvValue('SUPABASE_SERVICE_ROLE_KEY');
  const missingKeys: Array<'SUPABASE_URL' | 'SUPABASE_SERVICE_ROLE_KEY'> = [];

  if (!supabaseUrl) {
    missingKeys.push('SUPABASE_URL');
  }

  if (!serviceRoleKey) {
    missingKeys.push('SUPABASE_SERVICE_ROLE_KEY');
  }

  return {
    isConfigured: missingKeys.length === 0,
    missingKeys,
  };
}

export function getSupabaseAdminClient(): SupabaseAdminClient | null {
  ensureServerEnvLoaded();

  if (supabaseAdminClient) {
    return supabaseAdminClient;
  }

  const supabaseUrl = getServerEnvValue('SUPABASE_URL') || getServerEnvValue('VITE_SUPABASE_URL');
  const serviceRoleKey = getServerEnvValue('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  supabaseAdminClient = createClient<ServerAuthDatabase>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return supabaseAdminClient;
}
