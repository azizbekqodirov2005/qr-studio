import { ServerOff } from 'lucide-react';
import { useI18n } from '../i18n/I18nProvider';
import { ButtonLink } from './ui/Button';

export function BackendMissing({ compact }: { compact?: boolean }) {
  const { t } = useI18n();
  const body = (
    <div className="card mx-auto max-w-lg p-8 text-center">
      <span className="mx-auto flex size-12 items-center justify-center rounded-xl bg-warning-50 text-warning">
        <ServerOff className="size-6" aria-hidden />
      </span>
      <h1 className="mt-4 text-lg font-semibold text-ink">{t.common.backendMissingTitle}</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">{t.common.backendMissingText}</p>
      <ButtonLink to="/" variant="secondary" className="mt-6">
        {t.common.goHome}
      </ButtonLink>
    </div>
  );
  return compact ? body : <div className="container-page py-16">{body}</div>;
}
