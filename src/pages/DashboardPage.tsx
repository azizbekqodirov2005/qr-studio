import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Copy, Download, Ellipsis, ExternalLink, FolderInput, Pencil, Plus, QrCode, Search, Trash } from 'lucide-react';
import { useI18n } from '../i18n/I18nProvider';
import { QR_TYPES, type QrRecord, type QrType, DEFAULT_STYLE } from '../lib/types';
import { deleteQrCode, duplicateQrCode, listQrCodes, updateQrCode } from '../lib/db';
import { downloadQr } from '../lib/qr/export';
import { errorMessage } from '../lib/errors';
import { Button, ButtonLink } from '../components/ui/Button';
import { Field, Input, Select } from '../components/ui/Form';
import { Menu } from '../components/ui/Menu';
import { Modal, useConfirm } from '../components/ui/Modal';
import { Notice } from '../components/ui/Notice';
import { useToast } from '../components/ui/Toast';
import { QrRender } from '../components/qr/QrRender';
import { TypeIcon } from '../components/qr/typeMeta';
import { useDocumentMeta } from '../hooks/useDocumentMeta';

type Sort = 'newest' | 'oldest' | 'name';
const NO_FOLDER = '__none__';

/** Renders the QR only once the card scrolls into view. */
function LazyQr({ record }: { record: QrRecord }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className="flex aspect-square w-full items-center justify-center">
      {visible ? <QrRender content={record.content} style={{ ...DEFAULT_STYLE, ...record.style }} renderWidth={240} label={record.name} /> : <div className="skeleton size-full" />}
    </div>
  );
}

export default function DashboardPage() {
  const { t, formatDate } = useI18n();
  const d = t.dashboard;
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  useDocumentMeta(d.title);

  const [items, setItems] = useState<QrRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<QrType | ''>('');
  const [folderFilter, setFolderFilter] = useState('');
  const [sort, setSort] = useState<Sort>('newest');
  const [moving, setMoving] = useState<QrRecord | null>(null);
  const [folderInput, setFolderInput] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = () => {
    setError(null);
    listQrCodes()
      .then(setItems)
      .catch((e) => setError(errorMessage(e, t)));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, []);

  const folders = useMemo(() => [...new Set((items ?? []).map((i) => i.folder).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b)), [items]);

  const visible = useMemo(() => {
    if (!items) return [];
    const q = query.trim().toLowerCase();
    const list = items.filter((i) => {
      if (typeFilter && i.type !== typeFilter) return false;
      if (folderFilter === NO_FOLDER && i.folder) return false;
      if (folderFilter && folderFilter !== NO_FOLDER && i.folder !== folderFilter) return false;
      if (q && !i.name.toLowerCase().includes(q) && !i.content.toLowerCase().includes(q)) return false;
      return true;
    });
    return list.sort((a, b) =>
      sort === 'name' ? a.name.localeCompare(b.name) : sort === 'oldest' ? a.created_at.localeCompare(b.created_at) : b.created_at.localeCompare(a.created_at),
    );
  }, [items, query, typeFilter, folderFilter, sort]);

  const filtered = Boolean(query || typeFilter || folderFilter);

  async function onDelete(r: QrRecord) {
    const ok = await confirm({ title: d.deleteTitle, description: d.deleteText(r.name), confirmLabel: t.common.delete });
    if (!ok) return;
    setBusyId(r.id);
    try {
      await deleteQrCode(r);
      setItems((list) => list?.filter((i) => i.id !== r.id) ?? null);
      toast.success(d.deletedToast);
    } catch (e) {
      toast.error(errorMessage(e, t));
    } finally {
      setBusyId(null);
    }
  }

  async function onDuplicate(r: QrRecord) {
    setBusyId(r.id);
    try {
      const copy = await duplicateQrCode(r, d.copySuffix);
      setItems((list) => (list ? [copy, ...list] : [copy]));
      toast.success(d.duplicatedToast);
    } catch (e) {
      toast.error(errorMessage(e, t));
    } finally {
      setBusyId(null);
    }
  }

  async function onDownload(r: QrRecord, format: 'png' | 'svg') {
    try {
      await downloadQr(r.content, { ...DEFAULT_STYLE, ...r.style }, format, r.name);
      toast.success(t.preview.downloadedToast(format.toUpperCase()));
    } catch {
      toast.error(t.preview.downloadFailed);
    }
  }

  async function onMove() {
    if (!moving) return;
    const folder = folderInput.trim() || null;
    setBusyId(moving.id);
    try {
      const updated = await updateQrCode(moving.id, { folder });
      setItems((list) => list?.map((i) => (i.id === updated.id ? updated : i)) ?? null);
      toast.success(d.movedToast);
      setMoving(null);
    } catch (e) {
      toast.error(errorMessage(e, t));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="container-page py-8 sm:py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{d.title}</h1>
          <p className="mt-1 text-sm text-muted">{items ? d.total(items.length) : d.subtitle}</p>
        </div>
        <ButtonLink to="/" icon={<Plus className="size-4" />}>
          {d.create}
        </ButtonLink>
      </div>

      {items && items.length > 0 && (
        <div className="mt-6 grid gap-3 rounded-xl border border-line bg-surface p-3 shadow-card sm:grid-cols-2 lg:grid-cols-[1fr_180px_180px_170px]">
          <div className="relative sm:col-span-2 lg:col-span-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden />
            <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={d.searchPlaceholder} aria-label={d.searchPlaceholder} className="pl-9" />
          </div>
          <Select aria-label={t.preview.type} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as QrType | '')}>
            <option value="">{d.allTypes}</option>
            {QR_TYPES.map((ty) => (
              <option key={ty} value={ty}>
                {t.types[ty].title}
              </option>
            ))}
          </Select>
          <Select aria-label={t.create.folderLabel} value={folderFilter} onChange={(e) => setFolderFilter(e.target.value)}>
            <option value="">{d.allFolders}</option>
            <option value={NO_FOLDER}>{d.noFolder}</option>
            {folders.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </Select>
          <Select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="newest">{d.sortNewest}</option>
            <option value="oldest">{d.sortOldest}</option>
            <option value="name">{d.sortName}</option>
          </Select>
        </div>
      )}

      <div className="mt-6">
        {error ? (
          <Notice tone="error" action={<Button size="sm" variant="secondary" onClick={load}>{t.common.retry}</Button>}>
            {error}
          </Notice>
        ) : items === null ? (
          <ul className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-busy="true">
            {Array.from({ length: 4 }, (_, i) => (
              <li key={i} className="card p-4">
                <div className="skeleton aspect-square w-full" />
                <div className="skeleton mt-4 h-4 w-2/3" />
                <div className="skeleton mt-2 h-3 w-1/3" />
              </li>
            ))}
          </ul>
        ) : items.length === 0 ? (
          <div className="card flex flex-col items-center px-6 py-16 text-center" data-testid="dashboard-empty">
            <span className="flex size-14 items-center justify-center rounded-2xl bg-primary-50 text-primary-strong ring-1 ring-primary-100">
              <QrCode className="size-7" aria-hidden />
            </span>
            <h2 className="mt-4 text-lg font-semibold text-ink">{d.emptyTitle}</h2>
            <p className="mt-1 max-w-sm text-sm text-muted">{d.emptyText}</p>
            <ButtonLink to="/" className="mt-6" icon={<Plus className="size-4" />}>
              {d.create}
            </ButtonLink>
          </div>
        ) : visible.length === 0 ? (
          <div className="card px-6 py-12 text-center">
            <p className="text-sm text-muted">{d.noResults}</p>
            {filtered && (
              <Button
                variant="secondary"
                size="sm"
                className="mt-4"
                onClick={() => {
                  setQuery('');
                  setTypeFilter('');
                  setFolderFilter('');
                }}
              >
                {d.clearFilters}
              </Button>
            )}
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" data-testid="qr-list">
            {visible.map((r) => (
              <li key={r.id} className={`card flex flex-col overflow-hidden ${busyId === r.id ? 'pointer-events-none opacity-60' : ''}`} data-testid="qr-card">
                <button
                  type="button"
                  onClick={() => navigate(`/create/${r.type}?edit=${r.id}`)}
                  className="block border-b border-line bg-sunken p-5"
                  aria-label={`${t.common.edit}: ${r.name}`}
                >
                  <div className="mx-auto w-full max-w-[180px] overflow-hidden rounded-lg bg-surface">
                    <LazyQr record={r} />
                  </div>
                </button>
                <div className="flex flex-1 items-start gap-3 p-4">
                  <TypeIcon type={r.type} size="sm" />
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-semibold text-ink" title={r.name}>
                      {r.name}
                    </h3>
                    <p className="mt-0.5 truncate text-xs text-muted">
                      {t.types[r.type].title}
                      {r.folder && <> · {r.folder}</>}
                    </p>
                    <p className="mt-0.5 text-xs text-subtle">{d.createdAt(formatDate(r.created_at))}</p>
                  </div>
                  <Menu
                    width="w-52"
                    items={[
                      { key: 'edit', label: t.common.edit, icon: <Pencil />, onSelect: () => navigate(`/create/${r.type}?edit=${r.id}`) },
                      { key: 'png', label: `${t.common.download} PNG`, icon: <Download />, onSelect: () => onDownload(r, 'png') },
                      { key: 'svg', label: `${t.common.download} SVG`, icon: <Download />, onSelect: () => onDownload(r, 'svg') },
                      ...(r.page
                        ? [{ key: 'open', label: d.openPage, icon: <ExternalLink />, onSelect: () => window.open(r.content, '_blank', 'noopener,noreferrer') }]
                        : []),
                      { key: 'dup', label: t.common.duplicate, icon: <Copy />, onSelect: () => onDuplicate(r) },
                      {
                        key: 'move',
                        label: d.moveToFolder,
                        icon: <FolderInput />,
                        onSelect: () => {
                          setFolderInput(r.folder ?? '');
                          setMoving(r);
                        },
                      },
                      { key: 'del', label: t.common.delete, icon: <Trash />, tone: 'danger', onSelect: () => onDelete(r) },
                    ]}
                    trigger={(p) => (
                      <button
                        {...p}
                        type="button"
                        aria-label={`${d.actions}: ${r.name}`}
                        className="-mr-1.5 -mt-1 inline-flex size-8 items-center justify-center rounded-lg text-muted hover:bg-soft-2 hover:text-ink"
                        data-testid="qr-card-menu"
                      >
                        <Ellipsis className="size-[18px]" />
                      </button>
                    )}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Modal
        open={Boolean(moving)}
        onClose={() => setMoving(null)}
        title={d.moveToFolder}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setMoving(null)}>
              {t.common.cancel}
            </Button>
            <Button onClick={onMove} loading={busyId === moving?.id}>
              {t.common.save}
            </Button>
          </>
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onMove();
          }}
        >
          <Field label={d.folderName} help={d.folderHelp}>
            <Input value={folderInput} onChange={(e) => setFolderInput(e.target.value)} maxLength={60} list="folder-options" placeholder={t.create.folderPlaceholder} data-autofocus />
          </Field>
          <datalist id="folder-options">
            {folders.map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>
        </form>
      </Modal>
    </div>
  );
}
