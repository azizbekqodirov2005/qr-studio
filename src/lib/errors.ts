import type { Dict } from '../i18n/uz';
import { BackendNotConfiguredError } from './supabase';

interface MaybeErr {
  code?: string;
  status?: number;
  message?: string;
  name?: string;
}

/** Maps errors from Supabase / fetch / our own code to a translated, user-facing message. */
export function errorMessage(err: unknown, t: Dict): string {
  if (err instanceof BackendNotConfiguredError) return t.common.backendMissingTitle;
  const e = (err ?? {}) as MaybeErr;
  const code = e.code ?? '';
  const msg = (e.message ?? '').toLowerCase();

  if (code === 'invalid_credentials' || msg.includes('invalid login credentials')) return t.auth.invalidCredentials;
  if (code === 'email_not_confirmed' || msg.includes('email not confirmed')) return t.auth.emailNotConfirmed;
  if (code === 'user_already_exists' || code === 'email_exists' || msg.includes('already registered')) return t.auth.emailTaken;
  if (code === 'weak_password' || msg.includes('password should')) return t.auth.weakPassword;
  if (code.startsWith('over_') || e.status === 429 || msg.includes('rate limit')) return t.auth.rateLimited;
  if (code === 'same_password') return t.auth.weakPassword;
  if (msg.includes('mime type') || msg.includes('invalid_mime_type')) return t.files.invalidType;
  if (msg.includes('exceeded the maximum allowed size') || msg.includes('payload too large') || e.status === 413) return t.files.tooLarge(20);
  if (msg === 'failed to fetch' || msg.includes('networkerror') || msg.includes('network request failed') || e.name === 'AuthRetryableFetchError') {
    return t.common.networkError;
  }
  return t.common.errorGeneric;
}
