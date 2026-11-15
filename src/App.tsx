import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { I18nProvider } from './i18n/I18nProvider';
import { ThemeProvider } from './theme/ThemeProvider';
import { AuthProvider } from './auth/AuthProvider';
import { ToastProvider } from './components/ui/Toast';
import { ConfirmProvider } from './components/ui/Modal';
import { AppLayout, RequireAuth } from './components/layout/Layout';
import { PageSpinner } from './components/ui/Notice';
import HomePage from './pages/HomePage';

const CreatePage = lazy(() => import('./pages/CreatePage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const PublicPage = lazy(() => import('./pages/PublicPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));
const PricingPage = lazy(() => import('./pages/InfoPages').then((m) => ({ default: m.PricingPage })));
const HelpPage = lazy(() => import('./pages/InfoPages').then((m) => ({ default: m.HelpPage })));
const LoginPage = lazy(() => import('./pages/AuthPages').then((m) => ({ default: m.LoginPage })));
const SignupPage = lazy(() => import('./pages/AuthPages').then((m) => ({ default: m.SignupPage })));
const ForgotPasswordPage = lazy(() => import('./pages/AuthPages').then((m) => ({ default: m.ForgotPasswordPage })));
const UpdatePasswordPage = lazy(() => import('./pages/AuthPages').then((m) => ({ default: m.UpdatePasswordPage })));
const AccountPage = lazy(() => import('./pages/AuthPages').then((m) => ({ default: m.AccountPage })));

export default function App() {
  return (
    <ThemeProvider>
    <I18nProvider>
      <ToastProvider>
        <ConfirmProvider>
          <AuthProvider>
            <BrowserRouter>
              <Suspense fallback={<PageSpinner />}>
                <Routes>
                  {/* Public landing pages: no app chrome, no login required */}
                  <Route path="/p/:slug" element={<PublicPage kind="social" />} />
                  <Route path="/b/:slug" element={<PublicPage kind="business" />} />
                  <Route path="/g/:slug" element={<PublicPage kind="gallery" />} />

                  <Route element={<AppLayout />}>
                    <Route index element={<HomePage />} />
                    <Route path="create/:type" element={<CreatePage />} />
                    <Route path="pricing" element={<PricingPage />} />
                    <Route path="help" element={<HelpPage />} />
                    <Route path="login" element={<LoginPage />} />
                    <Route path="signup" element={<SignupPage />} />
                    <Route path="forgot-password" element={<ForgotPasswordPage />} />
                    <Route path="update-password" element={<UpdatePasswordPage />} />
                    <Route element={<RequireAuth />}>
                      <Route path="dashboard" element={<DashboardPage />} />
                      <Route path="account" element={<AccountPage />} />
                    </Route>
                    <Route path="*" element={<NotFoundPage />} />
                  </Route>
                </Routes>
              </Suspense>
            </BrowserRouter>
          </AuthProvider>
        </ConfirmProvider>
      </ToastProvider>
    </I18nProvider>
    </ThemeProvider>
  );
}
