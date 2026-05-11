import { createClient, type SupabaseClient } from '@supabase/supabase-js';

function getPublicEnvValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

const supabaseUrl = getPublicEnvValue(import.meta.env.VITE_SUPABASE_URL);
const supabasePublishableKey = getPublicEnvValue(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);

export const isSupabaseAuthConfigured = Boolean(supabaseUrl && supabasePublishableKey);

export const supabase: SupabaseClient | null = isSupabaseAuthConfigured
  ? createClient(supabaseUrl, supabasePublishableKey)
  : null;
