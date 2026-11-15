import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, Copy, ExternalLink, Eye, LogIn, Save } from 'lucide-react';
import { useI18n } from '../i18n/I18nProvider';
import { useAuth } from '../auth/AuthProvider';
import { isSupabaseConfigured } from '../lib/supabase';
import {
  DEFAULT_STYLE,
  PAGE_KIND_BY_TYPE,
  isPageType,
  isQrType,
  type BusinessData,
  type ImagesData,
  type QrDataMap,
  type QrRecord,
  type QrStyle,
  type QrType,
  type SocialData,
} from '../lib/types';
import { buildContent, defaultData, suggestName } from '../lib/qr/content';
import { makeSchemas, validateData, type FieldErrors } from '../lib/validation';
import { cleanupRemovedFiles, createPage, createQrCode, deletePage, getQrCode, pageUrl, updatePage, updateQrCode } from '../lib/db';
import { errorMessage } from '../lib/errors';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useDocumentMeta } from '../hooks/useDocumentMeta';
import { Button, ButtonLink, IconButton } from '../components/ui/Button';
import { Field, Input } from '../components/ui/Form';
import { Modal } from '../components/ui/Modal';
import { Notice, PageSpinner } from '../components/ui/Notice';
import { useToast } from '../components/ui/Toast';
import { TypeGrid } from '../components/qr/TypeGrid';
import { TypeIcon } from '../components/qr/typeMeta';
import { CustomizePanel } from '../components/qr/CustomizePanel';
import { PreviewPanel, copyText } from '../components/qr/PreviewPanel';
import { QrRender } from '../components/qr/QrRender';
import { UrlForm, VCardForm, WifiForm } from '../components/forms/StaticForms';
import { PdfForm } from '../components/forms/PdfForm';
import { BusinessForm, ImagesForm, SocialForm } from '../components/forms/PageForms';
import { AuthRequired } from '../components/forms/shared';
import { BusinessPageView, GalleryView, PublicShell, SocialPageView } from '../components/public/PageViews';
import { cx } from '../lib/cx';
import NotFoundPage from './NotFoundPage';

type Step = 'type' | 'content' | 'design' | 'export';

interface Draft {
  data: unknown;
  style: QrStyle;
  name: string;
  folder: string;
}

const draftKey = (type: QrType) => `qrstudio.draft.${type}`;

function loadDraft(type: QrType): Draft | null {
  try {
    const raw = sessionStorage.getItem(draftKey(type));
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}

function getPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[key] : undefined), obj);
}

interface NavState {
  record?: QrRecord;
  step?: Step;
}

export default function CreatePage() {
  const { type } = useParams();
  const [searchParams] = useSearchParams();
  if (!isQrType(type)) return <NotFoundPage />;
  // Remount when switching type or between "new" and a specific saved QR code.
  return <CreateEditor key={`${type}:${searchParams.get('edit') ?? 'new'}`} type={type} />;
}

function CreateEditor({ type }: { type: QrType }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const editId = searchParams.get('edit');
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const schemas = useMemo(() => makeSchemas(t), [t]);
  const pageKind = isPageType(type) ? PAGE_KIND_BY_TYPE[type] : null;

  // A record handed over via navigation state (right after saving) avoids a refetch.
  const navState = (location.state ?? {}) as NavState;
  const handed = editId && navState.record?.id === editId ? navState.record : null;
  const initial = useRef<Draft | null>(
    handed
      ? { data: { ...defaultData(type), ...(handed.data as object) }, style: { ...DEFAULT_STYLE, ...handed.style }, name: handed.name, folder: handed.folder ?? '' }
      : editId
        ? null
        : loadDraft(type),
  );
  const [data, setData] = useState<QrDataMap[QrType]>(() => (initial.current?.data as QrDataMap[QrType]) ?? defaultData(type));
  const [style, setStyle] = useState<QrStyle>(() => ({ ...DEFAULT_STYLE, ...(initial.current?.style ?? {}) }));
  const [name, setName] = useState(initial.current?.name ?? '');
  const [folder, setFolder] = useState(initial.current?.folder ?? '');
  const [record, setRecord] = useState<QrRecord | null>(handed);
  const [snapshot, setSnapshot] = useState<string | null>(() => (handed && initial.current ? JSON.stringify(initial.current) : null));
  const [loading, setLoading] = useState(Boolean(editId) && !handed);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [step, setStep] = useState<Step>(navState.step ?? 'content');
  const [pagePreview, setPagePreview] = useState(false);
  const [settledData, setSettledData] = useState(data);
  const stepTop = useRef<HTMLDivElement>(null);

  useDocumentMeta(record ? t.create.editTitle(record.name) : t.create.newTitle(t.types[type].title));

  /* ---------- Load an existing QR for editing ---------- */
  useEffect(() => {
    if (!editId || record?.id === editId) return;
    if (!isSupabaseConfigured) {
      setLoading(false);
      setLoadError(t.common.backendMissingTitle);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getQrCode(editId)
      .then((r) => {
        if (cancelled) return;
        if (!r || r.type !== type) {
          setLoadError(t.create.notFound);
          return;
        }
        const loadedStyle = { ...DEFAULT_STYLE, ...r.style };
        const loadedData = { ...defaultData(type), ...(r.data as object) } as QrDataMap[QrType];
        setRecord(r);
        setData(loadedData);
        setSettledData(loadedData);
        setStyle(loadedStyle);
        setName(r.name);
        setFolder(r.folder ?? '');
        setSnapshot(JSON.stringify({ data: loadedData, style: loadedStyle, name: r.name, folder: r.folder ?? '' }));
      })
      .catch((e) => !cancelled && setLoadError(errorMessage(e, t)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId, type]);

  /* ---------- Draft persistence (new QR codes only) ---------- */
  useEffect(() => {
    if (record || editId) return;
    try {
      sessionStorage.setItem(draftKey(type), JSON.stringify({ data, style, name, folder }));
    } catch {
      /* quota / private mode */
    }
  }, [data, style, name, folder, record, editId, type]);

  useEffect(() => {
    const id = setTimeout(() => setSettledData(data), 700);
    return () => clearTimeout(id);
  }, [data]);

  useEffect(() => {
    if (isDesktop && step === 'export') setStep('design');
  }, [isDesktop, step]);

  /* ---------- Derived state ---------- */
  const errors = useMemo(() => validateData(schemas, type, data as never), [schemas, type, data]);
  const valid = Object.keys(errors).length === 0;
  const visibleErrors: FieldErrors = useMemo(() => {
    if (showErrors) return errors;
    const out: FieldErrors = {};
    for (const [key, msg] of Object.entries(errors)) {
      const v = getPath(settledData, key);
      if (typeof v === 'string' && v.trim() && getPath(data, key) === v) out[key] = msg;
    }
    return out;
  }, [errors, showErrors, settledData, data]);

  const content = pageKind ? (record?.content ?? null) : valid ? buildContent(type, data as never) : null;
  const currentSnapshot = JSON.stringify({ data, style, name, folder });
  const dirty = record ? snapshot !== currentSnapshot : true;
  const canUpload = Boolean(user) && isSupabaseConfigured;
  const displayNameValue = name.trim() || suggestName(type, data as never, t.types[type].title);

  useEffect(() => {
    if (!record || !dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [record, dirty]);

  function goTo(next: Step) {
    setStep(next);
    requestAnimationFrame(() => stepTop.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
  }

  function revealErrors() {
    setShowErrors(true);
    setStep('content');
    toast.error(t.create.fixErrors);
    requestAnimationFrame(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
  }

  function toLogin() {
    navigate('/login', { state: { from: location.pathname + location.search } });
  }

  /* ---------- Save / publish ---------- */
  async function save() {
    if (!user) return toLogin();
    if (!valid) return revealErrors();
    setSaving(true);
    let createdPageId: string | null = null;
    try {
      const finalName = displayNameValue.slice(0, 120);
      let pageId = record?.page_id ?? null;
      let finalContent: string;
      if (pageKind) {
        const title = suggestName(type, data as never, t.types[type].title);
        if (pageId && record) {
          await updatePage(pageId, title, data as object);
          finalContent = record.content;
        } else {
          const page = await createPage(pageKind, title, data as object);
          createdPageId = page.id;
          pageId = page.id;
          finalContent = pageUrl(page.kind, page.slug);
        }
      } else {
        finalContent = buildContent(type, data as never) as string;
      }
      const payload = { type, name: finalName, folder: folder.trim() || null, content: finalContent, data, style, page_id: pageId };
      const previous = record;
      const saved = previous ? await updateQrCode(previous.id, payload) : await createQrCode(payload);
      createdPageId = null;
      if (previous) cleanupRemovedFiles(type, previous.data, data).catch(() => undefined);
      setRecord(saved);
      setName(finalName);
      setSnapshot(JSON.stringify({ data, style, name: finalName, folder }));
      if (!previous) navigate(`/create/${type}?edit=${saved.id}`, { replace: true, state: { record: saved, step } satisfies NavState });
      try {
        sessionStorage.removeItem(draftKey(type));
      } catch {
        /* ignore */
      }
      if (pageKind) toast.success(previous ? t.create.pageUpdatedToast : t.create.publishedToast);
      else toast.success(previous ? t.create.updatedToast : t.create.savedToast);
    } catch (e) {
      if (createdPageId) deletePage(createdPageId).catch(() => undefined);
      toast.error(errorMessage(e, t));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <PageSpinner />;
  if (loadError) {
    return (
      <div className="container-page py-16">
        <div className="mx-auto max-w-lg">
          <Notice tone="error" title={t.create.loadError}>
            {loadError}
          </Notice>
          <ButtonLink to="/dashboard" variant="secondary" className="mt-4" icon={<ArrowLeft className="size-4" />}>
            {t.common.myQr}
          </ButtonLink>
        </div>
      </div>
    );
  }

  /* ---------- Save / publish controls ---------- */
  const pageLink = pageKind && record ? record.content : null;
  const previewButton = pageKind ? (
    <Button variant="secondary" block icon={<Eye className="size-4" />} onClick={() => (valid ? setPagePreview(true) : revealErrors())}>
      {t.create.previewPage}
    </Button>
  ) : null;

  let actions: ReactNode = null;
  if (pageKind) {
    if (!canUpload) actions = <AuthRequired />;
    else if (!record)
      actions = (
        <div className="space-y-2">
          <Button block size="lg" onClick={save} loading={saving} data-testid="publish-btn">
            {saving ? t.create.publishing : t.create.publish}
          </Button>
          {previewButton}
        </div>
      );
    else
      actions = (
        <div className="space-y-3">
          {pageLink && <PageLinkRow url={pageLink} />}
          <SaveStateButton dirty={dirty} saving={saving} onSave={save} label={t.create.updatePage} />
          {previewButton}
        </div>
      );
  } else if (isSupabaseConfigured) {
    if (!user)
      actions = (
        <Button variant="secondary" block icon={<LogIn className="size-4" />} onClick={toLogin}>
          {t.create.signInToSave}
        </Button>
      );
    else if (!record)
      actions = (
        <Button variant="secondary" block icon={<Save className="size-4" />} onClick={save} loading={saving} data-testid="save-btn">
          {t.create.saveToAccount}
        </Button>
      );
    else actions = <SaveStateButton dirty={dirty} saving={saving} onSave={save} label={t.create.saveChanges} />;
  }

  const waiting = pageKind ? (
    <p>{canUpload ? t.create.publishHint : t.create.signInToPublish}</p>
  ) : (
    <>
      <p className="font-medium text-ink">{t.preview.waitingContent}</p>
      <p className="mt-1">{t.preview.waitingContentHint}</p>
    </>
  );

  const preview = (
    <PreviewPanel type={type} name={displayNameValue} content={content} style={style} onStyleChange={setStyle} waiting={waiting} actions={actions} />
  );

  const formProps = { errors: visibleErrors, canUpload };
  const form = (() => {
    switch (type) {
      case 'url':
        return <UrlForm value={data as QrDataMap['url']} onChange={setData} {...formProps} />;
      case 'vcard':
        return <VCardForm value={data as QrDataMap['vcard']} onChange={setData} {...formProps} />;
      case 'wifi':
        return <WifiForm value={data as QrDataMap['wifi']} onChange={setData} {...formProps} />;
      case 'pdf':
        return <PdfForm value={data as QrDataMap['pdf']} onChange={setData} {...formProps} />;
      case 'images':
        return <ImagesForm value={data as QrDataMap['images']} onChange={setData} {...formProps} />;
      case 'social':
        return <SocialForm value={data as QrDataMap['social']} onChange={setData} {...formProps} />;
      case 'business':
        return <BusinessForm value={data as QrDataMap['business']} onChange={setData} {...formProps} />;
    }
  })();

  const steps: { key: Step; label: string }[] = [
    { key: 'type', label: t.create.stepType },
    { key: 'content', label: t.create.stepContent },
    { key: 'design', label: t.create.stepDesign },
    { key: 'export', label: t.create.stepDownload },
  ];
  const stepIndex = steps.findIndex((s) => s.key === step);

  return (
    <div className="container-page pb-28 pt-6 sm:pt-8 lg:pb-16">
      {/* Title row */}
      <div className="flex flex-wrap items-center gap-3">
        <TypeIcon type={type} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold tracking-tight text-ink sm:text-2xl">
            {record ? t.create.editTitle(record.name) : t.create.newTitle(t.types[type].title)}
          </h1>
          <p className="text-sm text-muted">{t.types[type].desc}</p>
        </div>
        {record && (
          <span className={cx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium', dirty ? 'bg-warning-50 text-warning' : 'bg-success-50 text-success')}>
            {dirty ? t.create.unsavedChanges : t.create.savedState}
          </span>
        )}
      </div>

      {/* Stepper */}
      <nav aria-label={t.create.stepProgress(stepIndex + 1, steps.length)} className="mt-6">
        <ol className="flex items-center gap-1 overflow-x-auto rounded-xl border border-line bg-surface p-1.5 shadow-card">
          {steps.map((s, i) => {
            const isCurrent = s.key === step;
            const done = i < stepIndex;
            const disabled = (s.key === 'type' && Boolean(record)) || (s.key === 'export' && isDesktop);
            return (
              <li key={s.key} className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => goTo(s.key)}
                  disabled={disabled}
                  aria-current={isCurrent ? 'step' : undefined}
                  className={cx(
                    'flex w-full min-w-max items-center justify-center gap-2 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors sm:min-w-0',
                    isCurrent ? 'bg-primary-50 text-primary-strong' : 'text-muted hover:text-ink disabled:hover:text-muted',
                    disabled && 'cursor-default',
                  )}
                >
                  <span
                    className={cx(
                      'flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
                      isCurrent ? 'bg-primary-fill text-white' : done ? 'bg-success text-white' : 'bg-soft-2 text-muted',
                    )}
                  >
                    {done && !isCurrent ? <Check className="size-3" strokeWidth={3} aria-hidden /> : i + 1}
                  </span>
                  <span className={cx('truncate', !isCurrent && 'hidden sm:inline')}>{s.label}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <div ref={stepTop} className="mt-6 grid scroll-mt-24 gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
        <div className="min-w-0">
          {step === 'type' && (
            <div className="card p-5 sm:p-6">
              <TypeGrid
                selected={type}
                showHelpCard={false}
                compact
                onSelect={(next) => (next === type ? goTo('content') : navigate(`/create/${next}`))}
              />
            </div>
          )}

          {step === 'content' && (
            <div className="card">
              <div className="space-y-6 p-5 sm:p-6">
                {form}
                <div className="grid gap-4 border-t border-line pt-6 sm:grid-cols-2">
                  <Field label={t.create.nameLabel} optional help={t.create.nameHelp}>
                    <Input value={name} maxLength={120} placeholder={suggestName(type, data as never, t.create.namePlaceholder)} onChange={(e) => setName(e.target.value)} name="qrName" />
                  </Field>
                  {user && (
                    <Field label={t.create.folderLabel} optional>
                      <Input value={folder} maxLength={60} placeholder={t.create.folderPlaceholder} onChange={(e) => setFolder(e.target.value)} name="folder" />
                    </Field>
                  )}
                </div>
              </div>
              <div className="flex justify-end gap-2 border-t border-line px-5 py-4 sm:px-6">
                <Button onClick={() => goTo('design')} icon={null} className="gap-1.5">
                  {t.create.toDesign}
                  <ArrowRight className="size-4" aria-hidden />
                </Button>
              </div>
            </div>
          )}

          {step === 'design' && (
            <div className="card">
              <div className="p-5 sm:p-6">
                <CustomizePanel style={style} onChange={setStyle} />
              </div>
              <div className="flex justify-between gap-2 border-t border-line px-5 py-4 sm:px-6">
                <Button variant="ghost" icon={<ArrowLeft className="size-4" />} onClick={() => goTo('content')}>
                  {t.common.back}
                </Button>
                {!isDesktop && (
                  <Button onClick={() => goTo('export')} className="gap-1.5">
                    {t.create.toDownload}
                    <ArrowRight className="size-4" aria-hidden />
                  </Button>
                )}
              </div>
            </div>
          )}

          {step === 'export' && !isDesktop && preview}
        </div>

        {isDesktop && <aside className="sticky top-24">{preview}</aside>}
      </div>

      {/* Mobile bottom bar: keeps the QR visible while editing */}
      {!isDesktop && step !== 'export' && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto flex max-w-[1200px] items-center gap-3">
            <button
              type="button"
              onClick={() => goTo('export')}
              className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-sunken"
              aria-label={t.create.toDownload}
            >
              {content ? <QrRender content={content} style={{ ...style, logo: style.logo }} renderWidth={160} /> : <TypeIcon type={type} size="sm" />}
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink">{displayNameValue}</p>
              <p className="truncate text-xs text-muted">{content ? t.preview.scanTip : pageKind ? t.preview.waitingPage : t.preview.waitingContentHint}</p>
            </div>
            <Button size="md" onClick={() => goTo(step === 'content' ? 'design' : step === 'design' ? 'export' : 'content')} className="gap-1.5">
              {t.common.next}
              <ArrowRight className="size-4" aria-hidden />
            </Button>
          </div>
        </div>
      )}

      {pageKind && (
        <Modal open={pagePreview} onClose={() => setPagePreview(false)} title={t.create.previewPage} size="lg">
          <div className="-mx-5 -my-5 sm:-mx-6">
            <PublicShell
              banner={<div className="bg-warning-50 px-4 py-2 text-center text-xs font-medium text-warning">{t.public.previewBanner}</div>}
            >
              {type === 'social' && <SocialPageView data={data as SocialData} />}
              {type === 'business' && <BusinessPageView data={data as BusinessData} />}
              {type === 'images' && <GalleryView data={data as ImagesData} />}
            </PublicShell>
          </div>
        </Modal>
      )}
    </div>
  );
}

function SaveStateButton({ dirty, saving, onSave, label }: { dirty: boolean; saving: boolean; onSave: () => void; label: string }) {
  const { t } = useI18n();
  return dirty ? (
    <Button block onClick={onSave} loading={saving} icon={<Save className="size-4" />} data-testid="save-changes-btn">
      {label}
    </Button>
  ) : (
    <Button block variant="secondary" disabled icon={<Check className="size-4" />}>
      {t.create.savedState}
    </Button>
  );
}

function PageLinkRow({ url }: { url: string }) {
  const { t } = useI18n();
  const toast = useToast();
  return (
    <div>
      <p className="label">{t.create.pageLink}</p>
      <div className="flex items-center gap-1 rounded-lg border border-line bg-sunken py-1 pl-3 pr-1">
        <Link to={new URL(url).pathname} className="min-w-0 flex-1 truncate font-mono text-[12px] text-primary-strong hover:underline" data-testid="page-link">
          {url.replace(/^https?:\/\//, '')}
        </Link>
        <IconButton size="sm" label={t.common.copy} onClick={async () => (await copyText(url)) && toast.success(t.common.copied)}>
          <Copy className="size-4" />
        </IconButton>
        <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex size-8 items-center justify-center rounded-lg text-muted hover:bg-soft-2 hover:text-ink" aria-label={t.create.openPage} title={t.create.openPage}>
          <ExternalLink className="size-4" />
        </a>
      </div>
    </div>
  );
}
