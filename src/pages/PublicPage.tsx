import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { FileQuestion } from 'lucide-react';
import { useI18n } from '../i18n/I18nProvider';
import { getPublicPage, type PublicPage as PublicPageData } from '../lib/db';
import { errorMessage } from '../lib/errors';
import { isSupabaseConfigured } from '../lib/supabase';
import { SLUG_RE } from '../lib/qr/payloads';
import { defaultData } from '../lib/qr/content';
import type { BusinessData, ImagesData, PageKind, SocialData } from '../lib/types';
import { BusinessPageView, GalleryView, PublicShell, SocialPageView } from '../components/public/PageViews';
import { PageSpinner, Notice } from '../components/ui/Notice';
import { BackendMissing } from '../components/BackendMissing';
import { useDocumentMeta } from '../hooks/useDocumentMeta';
import { Button } from '../components/ui/Button';

type State = { status: 'loading' } | { status: 'notFound' } | { status: 'error'; message: string } | { status: 'ok'; page: PublicPageData<unknown> };

function metaFor(page: PublicPageData<unknown> | null): { title: string; description: string; image: string | null } {
  if (!page) return { title: '', description: '', image: null };
  const d = page.data as Partial<SocialData & BusinessData & ImagesData>;
  return {
    title: page.title,
    description: (d.description ?? '').toString(),
    image: d.avatar?.url ?? d.logo?.url ?? d.images?.[0]?.url ?? null,
  };
}

export default function PublicPage({ kind }: { kind: PageKind }) {
  const { slug = '' } = useParams();
  const { t } = useI18n();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const meta = metaFor(state.status === 'ok' ? state.page : null);
  useDocumentMeta(state.status === 'ok' ? meta.title : state.status === 'notFound' ? t.public.notFoundTitle : '', meta.description, meta.image);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    if (!SLUG_RE.test(slug)) {
      setState({ status: 'notFound' });
      return;
    }
    let cancelled = false;
    setState({ status: 'loading' });
    getPublicPage(kind, slug)
      .then((page) => !cancelled && setState(page ? { status: 'ok', page } : { status: 'notFound' }))
      .catch((e) => !cancelled && setState({ status: 'error', message: errorMessage(e, t) }));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, slug, attempt]);

  if (!isSupabaseConfigured) return <BackendMissing />;
  if (state.status === 'loading') return <PageSpinner />;

  if (state.status === 'notFound') {
    return (
      <PublicShell>
        <div className="py-16 text-center" data-testid="public-not-found">
          <span className="mx-auto flex size-12 items-center justify-center rounded-xl bg-soft-2 text-muted">
            <FileQuestion className="size-6" aria-hidden />
          </span>
          <h1 className="mt-4 text-xl font-semibold text-ink">{t.public.notFoundTitle}</h1>
          <p className="mt-2 text-sm text-muted">{t.public.notFoundText}</p>
        </div>
      </PublicShell>
    );
  }

  if (state.status === 'error') {
    return (
      <PublicShell>
        <Notice tone="error" action={<Button size="sm" variant="secondary" onClick={() => setAttempt((a) => a + 1)}>{t.common.retry}</Button>}>
          {state.message}
        </Notice>
      </PublicShell>
    );
  }

  const data = state.page.data as object;
  return (
    <PublicShell>
      {kind === 'social' && <SocialPageView data={{ ...defaultData('social'), ...data } as SocialData} />}
      {kind === 'business' && <BusinessPageView data={{ ...defaultData('business'), ...data } as BusinessData} />}
      {kind === 'gallery' && <GalleryView data={{ ...defaultData('images'), ...data } as ImagesData} />}
    </PublicShell>
  );
}
