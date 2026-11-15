import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Check, Languages, LogOut, Menu as MenuIcon, Monitor, Moon, QrCode, Sun, User, X } from 'lucide-react';
import { useTheme, type ThemeMode } from '../../theme/ThemeProvider';
import { useI18n, LANGS, type Lang } from '../../i18n/I18nProvider';
import { useAuth, displayName } from '../../auth/AuthProvider';
import { Menu } from '../ui/Menu';
import { ButtonLink, IconButton } from '../ui/Button';
import { useToast } from '../ui/Toast';
import { cx } from '../../lib/cx';
import { errorMessage } from '../../lib/errors';
import uz from '../../i18n/uz';
import ru from '../../i18n/ru';
import en from '../../i18n/en';

const LANG_META: Record<Lang, { name: string; short: string }> = { uz: uz.meta, ru: ru.meta, en: en.meta };

export function Logo({ className }: { className?: string }) {
  return (
    <Link to="/" className={cx('flex items-center gap-2.5 rounded-md', className)} aria-label="QR Studio">
      <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-white">
        <QrCode className="size-[18px]" strokeWidth={2.25} aria-hidden />
      </span>
      <span className="text-[15px] font-semibold tracking-tight text-ink">QR Studio</span>
    </Link>
  );
}

export function LanguageSelect({ compact }: { compact?: boolean }) {
  const { lang, setLang, t } = useI18n();
  return (
    <Menu
      width="w-44"
      items={LANGS.map((l) => ({
        key: l,
        label: LANG_META[l].name,
        active: l === lang,
        icon: l === lang ? <Check /> : <span />,
        onSelect: () => setLang(l),
      }))}
      trigger={(p) => (
        <button
          {...p}
          type="button"
          aria-label={`${t.common.language}: ${LANG_META[lang].name}`}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-muted transition-colors hover:bg-soft-2 hover:text-ink"
        >
          <Languages className="size-4" aria-hidden />
          {compact ? LANG_META[lang].short : LANG_META[lang].name}
        </button>
      )}
    />
  );
}

export function ThemeSelect() {
  const { t } = useI18n();
  const { mode, resolved, setMode } = useTheme();
  const options: { value: ThemeMode; label: string; icon: JSX.Element }[] = [
    { value: 'light', label: t.common.themeLight, icon: <Sun /> },
    { value: 'dark', label: t.common.themeDark, icon: <Moon /> },
    { value: 'system', label: t.common.themeSystem, icon: <Monitor /> },
  ];
  const Icon = resolved === 'dark' ? Moon : Sun;
  return (
    <Menu
      width="w-48"
      items={options.map((o) => ({ key: o.value, label: o.label, icon: o.icon, active: o.value === mode, onSelect: () => setMode(o.value) }))}
      trigger={(p) => (
        <button
          {...p}
          type="button"
          aria-label={`${t.common.theme}: ${options.find((o) => o.value === mode)?.label}`}
          className="inline-flex size-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-soft-2 hover:text-ink"
          data-testid="theme-toggle"
        >
          <Icon className="size-[18px]" aria-hidden />
        </button>
      )}
    />
  );
}

function UserMenu() {
  const { t } = useI18n();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const name = displayName(user);
  return (
    <Menu
      header={
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">{name}</p>
          <p className="truncate text-xs text-muted">{user?.email}</p>
        </div>
      }
      items={[
        { key: 'qr', label: t.common.myQr, icon: <QrCode />, onSelect: () => navigate('/dashboard') },
        { key: 'acc', label: t.common.account, icon: <User />, onSelect: () => navigate('/account') },
        {
          key: 'out',
          label: t.common.signOut,
          icon: <LogOut />,
          onSelect: async () => {
            try {
              await signOut();
              toast.info(t.auth.signedOutToast);
              navigate('/');
            } catch (e) {
              toast.error(errorMessage(e, t));
            }
          },
        },
      ]}
      trigger={(p) => (
        <button
          {...p}
          type="button"
          aria-label={t.common.account}
          className="flex size-9 items-center justify-center rounded-full bg-primary-50 text-sm font-semibold uppercase text-primary-strong ring-1 ring-primary-100 transition-colors hover:bg-primary-100"
        >
          {name.slice(0, 1) || <User className="size-4" />}
        </button>
      )}
    />
  );
}

export function Header() {
  const { t } = useI18n();
  const { user, loading } = useAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();

  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const links = [
    { to: '/', label: t.common.home, end: true },
    { to: '/dashboard', label: t.common.myQr },
    { to: '/pricing', label: t.common.pricing },
    { to: '/help', label: t.common.help },
  ];

  const navClass = ({ isActive }: { isActive: boolean }) =>
    cx(
      'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
      isActive ? 'text-ink bg-soft-2' : 'text-muted hover:text-ink hover:bg-soft',
    );

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/85">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:shadow-pop">
        {t.common.skipToContent}
      </a>
      <div className="container-page flex h-16 items-center gap-4">
        <Logo />
        <nav aria-label="Main" className="ml-6 hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end} className={navClass}>
              {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <ThemeSelect />
          <div className="hidden sm:block">
            <LanguageSelect />
          </div>
          {!loading &&
            (user ? (
              <UserMenu />
            ) : (
              <div className="hidden items-center gap-2 sm:flex">
                <ButtonLink to="/login" variant="ghost" size="sm" className="h-9">
                  {t.common.signIn}
                </ButtonLink>
                <ButtonLink to="/signup" size="sm" className="h-9">
                  {t.common.getStarted}
                </ButtonLink>
              </div>
            ))}
          <IconButton label={t.common.menu} className="md:hidden" aria-expanded={open} aria-controls="mobile-nav" onClick={() => setOpen((o) => !o)}>
            {open ? <X className="size-5" /> : <MenuIcon className="size-5" />}
          </IconButton>
        </div>
      </div>

      {open && (
        <div id="mobile-nav" className="border-t border-line bg-surface md:hidden">
          <nav aria-label="Mobile" className="container-page flex flex-col gap-1 py-3">
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => cx(navClass({ isActive }), 'py-3 text-[15px]')}>
                {l.label}
              </NavLink>
            ))}
            <div className="mt-2 flex items-center justify-between border-t border-line pt-3">
              <LanguageSelect />
            </div>
            {!loading && !user && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <ButtonLink to="/login" variant="secondary">
                  {t.common.signIn}
                </ButtonLink>
                <ButtonLink to="/signup">{t.common.getStarted}</ButtonLink>
              </div>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
