import { Suspense } from 'react';
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { Header, Logo } from './Header';
import { useI18n } from '../../i18n/I18nProvider';
import { useAuth } from '../../auth/AuthProvider';
import { PageSpinner } from '../ui/Notice';
import { isSupabaseConfigured } from '../../lib/supabase';
import { BackendMissing } from '../BackendMissing';

export function Footer() {
  const { t } = useI18n();
  return (
    <footer className="mt-auto border-t border-line bg-surface">
      <div className="container-page flex flex-col gap-6 py-8 sm:flex-row sm:items-center sm:justify-between">
        <div className="max-w-xs">
          <Logo />
          <p className="mt-2 text-sm text-muted">{t.common.footerTagline}</p>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted">
          <Link to="/" className="hover:text-ink">
            {t.common.home}
          </Link>
          <Link to="/dashboard" className="hover:text-ink">
            {t.common.myQr}
          </Link>
          <Link to="/pricing" className="hover:text-ink">
            {t.common.pricing}
          </Link>
          <Link to="/help" className="hover:text-ink">
            {t.common.help}
          </Link>
        </nav>
      </div>
      <div className="container-page">
        <div className="flex flex-col gap-3 border-t border-line py-4 text-xs text-subtle sm:flex-row sm:items-center sm:justify-between">
          <span>
            © {new Date().getFullYear()} QR Studio. {t.common.rights}
          </span>
          <a
            href="https://t.me/azbekDev"
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex items-center gap-2.5 self-start rounded-md text-muted transition-colors hover:text-ink sm:self-auto"
            data-testid="built-by"
          >
            <span>{t.common.builtBy}</span>
            {/* Light theme → black logo, dark theme → white logo. */}
            <img
              src="/azbekdev-logo-black.png"
              alt="AzbekDev — Software Solutions"
              width={480}
              height={112}
              loading="lazy"
              className="h-6 w-auto transition-opacity group-hover:opacity-75 dark:hidden"
            />
            <img
              src="/azbekdev-logo-white.png"
              alt="AzbekDev — Software Solutions"
              width={480}
              height={116}
              loading="lazy"
              className="hidden h-6 w-auto transition-opacity group-hover:opacity-75 dark:block"
            />
          </a>
        </div>
      </div>
    </footer>
  );
}

export function AppLayout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <Header />
      <main id="main" className="flex-1" tabIndex={-1}>
        <Suspense fallback={<PageSpinner />}>
          <Outlet />
        </Suspense>
      </main>
      <Footer />
    </div>
  );
}

/** Routes that need a signed-in user. Guests are sent to /login and returned afterwards. */
export function RequireAuth() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (!isSupabaseConfigured) return <BackendMissing />;
  if (loading) return <PageSpinner />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <Outlet />;
}
