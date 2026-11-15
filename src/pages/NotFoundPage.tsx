import { useI18n } from '../i18n/I18nProvider';
import { ButtonLink } from '../components/ui/Button';
import { useDocumentMeta } from '../hooks/useDocumentMeta';

export default function NotFoundPage() {
  const { t } = useI18n();
  useDocumentMeta(t.common.notFoundTitle);
  return (
    <div className="container-page flex min-h-[60vh] flex-col items-center justify-center py-16 text-center">
      <p className="text-sm font-semibold text-primary-strong">404</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink">{t.common.notFoundTitle}</h1>
      <p className="mt-2 max-w-md text-muted">{t.common.notFoundText}</p>
      <ButtonLink to="/" className="mt-6">
        {t.common.goHome}
      </ButtonLink>
    </div>
  );
}
