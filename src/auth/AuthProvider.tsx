import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, requireSupabase } from '../lib/supabase';

interface AuthValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  /** True after the user arrived via a password-recovery link. */
  recovery: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name: string) => Promise<{ needsConfirmation: boolean }>;
  signOut: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  updateProfile: (name: string) => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [recovery, setRecovery] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      setSession(next);
      setLoading(false);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      user: session?.user ?? null,
      session,
      loading,
      recovery,
      async signIn(email, password) {
        const { error } = await requireSupabase().auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      },
      async signUp(email, password, name) {
        const { data, error } = await requireSupabase().auth.signUp({
          email: email.trim(),
          password,
          options: { data: { full_name: name.trim() }, emailRedirectTo: `${window.location.origin}/dashboard` },
        });
        if (error) throw error;
        // With email confirmation enabled, Supabase returns a user without a session.
        // An empty identities array means the email is already registered.
        if (data.user && data.user.identities && data.user.identities.length === 0) {
          const err = new Error('User already registered');
          (err as Error & { code?: string }).code = 'user_already_exists';
          throw err;
        }
        return { needsConfirmation: !data.session };
      },
      async signOut() {
        const { error } = await requireSupabase().auth.signOut();
        if (error) throw error;
        setRecovery(false);
      },
      async sendPasswordReset(email) {
        const { error } = await requireSupabase().auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/update-password`,
        });
        if (error) throw error;
      },
      async updatePassword(password) {
        const { error } = await requireSupabase().auth.updateUser({ password });
        if (error) throw error;
        setRecovery(false);
      },
      async updateProfile(name) {
        const { data, error } = await requireSupabase().auth.updateUser({ data: { full_name: name.trim() } });
        if (error) throw error;
        if (data.user) setSession((s) => (s ? { ...s, user: data.user } : s));
      },
    }),
    [session, loading, recovery],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

export function displayName(user: User | null): string {
  if (!user) return '';
  const meta = user.user_metadata as { full_name?: string } | undefined;
  return meta?.full_name?.trim() || user.email?.split('@')[0] || '';
}
