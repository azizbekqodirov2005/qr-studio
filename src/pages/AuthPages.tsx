import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, MailCheck } from 'lucide-react';
import { useI18n } from '../i18n/I18nProvider';
import { useAuth, displayName } from '../auth/AuthProvider';
import { isSupabaseConfigured } from '../lib/supabase';
import { errorMessage } from '../lib/errors';
import { isValidEmail } from '../lib/validation';
import { Button, IconButton } from '../components/ui/Button';
import { Field, Input } from '../components/ui/Form';
import { Notice, PageSpinner } from '../components/ui/Notice';
import { useToast } from '../components/ui/Toast';
import { BackendMissing } from '../components/BackendMissing';
import { useDocumentMeta } from '../hooks/useDocumentMeta';

function AuthCard({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  useDocumentMeta(title);
  return (
    <div className="container-page flex justify-center py-12 sm:py-16">
      <div className="w-full max-w-[420px]">
        <div className="card p-6 sm:p-8">
          <h1 className="text-xl font-semibold tracking-tight text-ink">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-muted">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
        {footer && <p className="mt-5 text-center text-sm text-muted">{footer}</p>}
      </div>
    </div>
  );
}

function PasswordInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { t } = useI18n();
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={show ? 'text' : 'password'} className="pr-11" />
      <IconButton
        size="sm"
        label={show ? t.wifi.hidePassword : t.wifi.showPassword}
        aria-pressed={show}
        className="absolute right-1 top-1/2 -translate-y-1/2"
        onClick={() => setShow((s) => !s)}
      >
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </IconButton>
    </div>
  );
}

export function isStrongPassword(p: string): boolean {
  return p.length >= 8 && /[A-Za-zЀ-ӿ]/.test(p) && /\d/.test(p);
}

function useRedirectTarget(): string {
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  return from && from.startsWith('/') && !from.startsWith('//') ? from : '/dashboard';
}

export function LoginPage() {
  const { t } = useI18n();
  const a = t.auth;
  const { signIn, user, loading } = useAuth();
  const navigate = useNavigate();
  const target = useRedirectTarget();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!isSupabaseConfigured) return <BackendMissing />;
  if (loading) return <PageSpinner />;
  if (user) return <Navigate to={target} replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!isValidEmail(email)) errs.email = t.validation.email;
    if (!password) errs.password = t.validation.required;
    setErrors(errs);
    setFormError(null);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      await signIn(email, password);
      toast.success(a.welcomeToast);
      navigate(target, { replace: true });
    } catch (err) {
      setFormError(errorMessage(err, t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard
      title={a.signInTitle}
      subtitle={a.signInSubtitle}
      footer={
        <>
          {a.noAccount}{' '}
          <Link to="/signup" state={{ from: target }} className="font-medium text-primary-strong hover:underline">
            {a.createAccount}
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {formError && <Notice tone="error">{formError}</Notice>}
        <Field label={a.email} error={errors.email}>
          <Input type="email" autoComplete="email" inputMode="email" placeholder={a.emailPh} value={email} onChange={(e) => setEmail(e.target.value)} name="email" />
        </Field>
        <Field label={a.password} error={errors.password}>
          {(p) => <PasswordInput {...p} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} name="password" />}
        </Field>
        <div className="flex justify-end">
          <Link to="/forgot-password" className="text-sm font-medium text-primary-strong hover:underline">
            {a.forgot}
          </Link>
        </div>
        <Button type="submit" block size="lg" loading={busy}>
          {t.common.signIn}
        </Button>
        <p className="text-center text-xs text-muted">{a.guestNote}</p>
      </form>
    </AuthCard>
  );
}

export function SignupPage() {
  const { t } = useI18n();
  const a = t.auth;
  const { signUp, user, loading } = useAuth();
  const navigate = useNavigate();
  const target = useRedirectTarget();
  const toast = useToast();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  if (!isSupabaseConfigured) return <BackendMissing />;
  if (loading) return <PageSpinner />;
  if (user && !sent) return <Navigate to={target} replace />;

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = t.validation.required;
    if (!isValidEmail(form.email)) errs.email = t.validation.email;
    if (!isStrongPassword(form.password)) errs.password = a.weakPassword;
    if (form.confirm !== form.password) errs.confirm = a.mismatch;
    setErrors(errs);
    setFormError(null);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      const { needsConfirmation } = await signUp(form.email, form.password, form.name);
      if (needsConfirmation) setSent(true);
      else {
        toast.success(a.welcomeToast);
        navigate(target, { replace: true });
      }
    } catch (err) {
      setFormError(errorMessage(err, t));
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <AuthCard title={a.signUpTitle}>
        <div className="text-center">
          <span className="mx-auto flex size-12 items-center justify-center rounded-xl bg-success-50 text-success">
            <MailCheck className="size-6" aria-hidden />
          </span>
          <p className="mt-4 text-sm leading-relaxed text-ink">{a.checkEmail}</p>
          <p className="mt-1 text-sm font-medium text-ink">{form.email}</p>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={a.signUpTitle}
      subtitle={a.signUpSubtitle}
      footer={
        <>
          {a.haveAccount}{' '}
          <Link to="/login" state={{ from: target }} className="font-medium text-primary-strong hover:underline">
            {t.common.signIn}
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {formError && <Notice tone="error">{formError}</Notice>}
        <Field label={a.name} error={errors.name}>
          <Input autoComplete="name" placeholder={a.namePh} value={form.name} onChange={set('name')} maxLength={80} name="name" />
        </Field>
        <Field label={a.email} error={errors.email}>
          <Input type="email" autoComplete="email" inputMode="email" placeholder={a.emailPh} value={form.email} onChange={set('email')} name="email" />
        </Field>
        <Field label={a.password} error={errors.password} help={a.passwordHint}>
          {(p) => <PasswordInput {...p} autoComplete="new-password" value={form.password} onChange={set('password')} name="password" />}
        </Field>
        <Field label={a.confirmPassword} error={errors.confirm}>
          {(p) => <PasswordInput {...p} autoComplete="new-password" value={form.confirm} onChange={set('confirm')} name="confirm" />}
        </Field>
        <Button type="submit" block size="lg" loading={busy}>
          {a.createAccount}
        </Button>
      </form>
    </AuthCard>
  );
}

export function ForgotPasswordPage() {
  const { t } = useI18n();
  const a = t.auth;
  const { sendPasswordReset } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  if (!isSupabaseConfigured) return <BackendMissing />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!isValidEmail(email)) return setError(t.validation.email);
    setError(null);
    setBusy(true);
    try {
      await sendPasswordReset(email);
      setSent(true);
    } catch (err) {
      setFormError(errorMessage(err, t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard
      title={a.resetTitle}
      subtitle={sent ? undefined : a.resetSubtitle}
      footer={
        <Link to="/login" className="font-medium text-primary-strong hover:underline">
          {t.common.back}
        </Link>
      }
    >
      {sent ? (
        <Notice tone="success">{a.resetSent}</Notice>
      ) : (
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          {formError && <Notice tone="error">{formError}</Notice>}
          <Field label={a.email} error={error ?? undefined}>
            <Input type="email" autoComplete="email" inputMode="email" placeholder={a.emailPh} value={email} onChange={(e) => setEmail(e.target.value)} name="email" />
          </Field>
          <Button type="submit" block size="lg" loading={busy}>
            {a.sendLink}
          </Button>
        </form>
      )}
    </AuthCard>
  );
}

export function UpdatePasswordPage() {
  const { t } = useI18n();
  const a = t.auth;
  const { updatePassword, user, loading } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [waited, setWaited] = useState(false);

  // The recovery link signs the user in asynchronously; give it a moment.
  useEffect(() => {
    const id = setTimeout(() => setWaited(true), 2500);
    return () => clearTimeout(id);
  }, []);

  if (!isSupabaseConfigured) return <BackendMissing />;
  if (loading || (!user && !waited)) return <PageSpinner />;

  if (!user) {
    return (
      <AuthCard title={a.newPasswordTitle}>
        <Notice tone="error">{a.recoveryInvalid}</Notice>
        <Link to="/forgot-password" className="mt-4 inline-block text-sm font-medium text-primary-strong hover:underline">
          {a.resetTitle}
        </Link>
      </AuthCard>
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!isStrongPassword(password)) errs.password = a.weakPassword;
    if (confirm !== password) errs.confirm = a.mismatch;
    setErrors(errs);
    setFormError(null);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      await updatePassword(password);
      toast.success(a.passwordUpdated);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setFormError(errorMessage(err, t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard title={a.newPasswordTitle}>
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {formError && <Notice tone="error">{formError}</Notice>}
        <Field label={a.newPassword} error={errors.password} help={a.passwordHint}>
          {(p) => <PasswordInput {...p} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
        </Field>
        <Field label={a.confirmPassword} error={errors.confirm}>
          {(p) => <PasswordInput {...p} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />}
        </Field>
        <Button type="submit" block size="lg" loading={busy}>
          {a.updatePassword}
        </Button>
      </form>
    </AuthCard>
  );
}

export function AccountPage() {
  const { t, formatDate } = useI18n();
  const a = t.auth;
  const { user, updateProfile, updatePassword, signOut } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [name, setName] = useState(displayName(user));
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<'profile' | 'password' | null>(null);
  const [pwError, setPwError] = useState<string | null>(null);
  useDocumentMeta(a.profileTitle);
  if (!user) return null;

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    setBusy('profile');
    try {
      await updateProfile(name);
      toast.success(a.profileSaved);
    } catch (err) {
      toast.error(errorMessage(err, t));
    } finally {
      setBusy(null);
    }
  }

  async function savePassword(e: FormEvent) {
    e.preventDefault();
    if (!isStrongPassword(password)) return setPwError(a.weakPassword);
    setPwError(null);
    setBusy('password');
    try {
      await updatePassword(password);
      setPassword('');
      toast.success(a.passwordUpdated);
    } catch (err) {
      toast.error(errorMessage(err, t));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="container-page py-10 sm:py-12">
      <div className="mx-auto max-w-xl space-y-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{a.profileTitle}</h1>
          <p className="mt-1 text-sm text-muted">{a.profileSubtitle}</p>
        </div>
        <form onSubmit={saveProfile} className="card space-y-4 p-6">
          <div className="flex items-center gap-4">
            <span className="flex size-12 items-center justify-center rounded-full bg-primary-50 text-lg font-semibold uppercase text-primary-strong">
              {displayName(user).slice(0, 1)}
            </span>
            <div className="min-w-0">
              <p className="truncate font-medium text-ink">{user.email}</p>
              <p className="text-xs text-muted">{a.memberSince(formatDate(user.created_at))}</p>
            </div>
          </div>
          <Field label={a.displayName}>
            <Input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </Field>
          <div className="flex justify-end">
            <Button type="submit" loading={busy === 'profile'} disabled={!name.trim()}>
              {t.common.save}
            </Button>
          </div>
        </form>
        <form onSubmit={savePassword} className="card space-y-4 p-6">
          <h2 className="text-[15px] font-semibold text-ink">{a.changePassword}</h2>
          <Field label={a.newPassword} error={pwError ?? undefined} help={a.passwordHint}>
            {(p) => <PasswordInput {...p} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
          </Field>
          <div className="flex justify-end">
            <Button type="submit" variant="secondary" loading={busy === 'password'} disabled={!password}>
              {a.updatePassword}
            </Button>
          </div>
        </form>
        <div className="flex justify-end">
          <Button
            variant="ghost"
            className="text-danger hover:bg-danger-50"
            onClick={async () => {
              await signOut();
              toast.info(a.signedOutToast);
              navigate('/');
            }}
          >
            {t.common.signOut}
          </Button>
        </div>
      </div>
    </div>
  );
}
