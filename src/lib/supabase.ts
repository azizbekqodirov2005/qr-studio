import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();

/** True when the Supabase URL and anon key are configured at build time. */
export const isSupabaseConfigured = Boolean(url && anonKey && /^https?:\/\//.test(url));

/**
 * Supabase client, or null when the backend isn't configured.
 * Only the public anon key is used in the browser — data access is enforced by RLS.
 */
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url as string, anonKey as string, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
    })
  : null;

export const STORAGE_BUCKET = 'qr-files';

export class BackendNotConfiguredError extends Error {
  constructor() {
    super('backend-not-configured');
  }
}

export function requireSupabase(): SupabaseClient {
  if (!supabase) throw new BackendNotConfiguredError();
  return supabase;
}
