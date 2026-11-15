import { useState, type ReactNode } from 'react';
import { Copy, Download, Printer, QrCode, RotateCcw } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider';
import { DEFAULT_STYLE, type QrStyle, type QrType } from '../../lib/types';
import { downloadQr, printQr } from '../../lib/qr/export';
import { EXPORT_FORMATS, effectiveErrorCorrection, type ExportFormat } from '../../lib/qr/render';
import { QrRender } from './QrRender';
import { Button, IconButton } from '../ui/Button';
import { Segmented, Select } from '../ui/Form';
import { Notice } from '../ui/Notice';
import { useToast } from '../ui/Toast';
import { SIZE_OPTIONS } from './CustomizePanel';
import { TypeIcon } from './typeMeta';
import { cx } from '../../lib/cx';

const CHECKER =
  'bg-[length:16px_16px] bg-[position:0_0,0_8px,8px_-8px,-8px_0] bg-[image:linear-gradient(45deg,#eceff4_25%,transparent_25%),linear-gradient(-45deg,#eceff4_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#eceff4_75%),linear-gradient(-45deg,transparent_75%,#eceff4_75%)]';

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for non-secure contexts / older browsers.
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

interface Props {
  type: QrType;
  name: string;
  content: string | null;
  style: QrStyle;
  onStyleChange: (style: QrStyle) => void;
  /** Shown in place of the QR while content isn't ready. */
  waiting: ReactNode;
  /** Save / publish controls. */
  actions?: ReactNode;
  className?: string;
}

export function PreviewPanel({ type, name, content, style, onStyleChange, waiting, actions, className }: Props) {
  const { t } = useI18n();
  const toast = useToast();
  const [format, setFormat] = useState<ExportFormat>('png');
  const [busy, setBusy] = useState<'download' | 'print' | null>(null);
  const [renderError, setRenderError] = useState<'tooLong' | 'render' | null>(null);
  const p = t.preview;
  const ready = Boolean(content) && !renderError;

  async function onDownload() {
    if (!content) return;
    setBusy('download');
    try {
      await downloadQr(content, style, format, name || t.types[type].title);
      toast.success(p.downloadedToast(p.formats[format]));
    } catch (e) {
      toast.error(String(e).includes('format-unsupported') ? p.formatUnsupported : p.downloadFailed);
    } finally {
      setBusy(null);
    }
  }

  async function onPrint() {
    if (!content) return;
    setBusy('print');
    try {
      await printQr(content, style, name);
    } catch {
      toast.error(p.printFailed);
    } finally {
      setBusy(null);
    }
  }

  async function onCopy() {
    if (content && (await copyText(content))) toast.success(t.common.copied);
  }

  return (
    <section className={cx('card overflow-hidden', className)} aria-labelledby="preview-h">
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <h2 id="preview-h" className="text-[15px] font-semibold text-ink">
          {p.title}
        </h2>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-soft px-2.5 py-1 text-xs font-medium text-muted">
          {t.types[type].title}
        </span>
      </div>

      <div className="p-5">
        <div
          className={cx(
            'mx-auto flex aspect-square w-full max-w-[300px] items-center justify-center overflow-hidden rounded-xl border border-line',
            style.transparentBg ? CHECKER : 'bg-sunken',
          )}
        >
          {content ? (
            <>
              <QrRender content={content} style={style} label={name || t.types[type].title} onError={setRenderError} />
              {renderError && (
                <div className="p-6 text-center">
                  <QrCode className="mx-auto size-10 text-subtle" aria-hidden />
                  <p className="mt-3 text-sm text-danger">{renderError === 'tooLong' ? p.tooLong : t.common.errorGeneric}</p>
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center px-6 text-center" data-testid="qr-waiting">
              <span className="flex size-14 items-center justify-center rounded-2xl bg-surface text-subtle ring-1 ring-line">
                <QrCode className="size-7" aria-hidden />
              </span>
              <div className="mt-4 text-sm text-muted">{waiting}</div>
            </div>
          )}
        </div>
        {ready && <p className="mt-3 text-center text-xs text-muted">{p.scanTip}</p>}

        {actions && <div className="mt-5">{actions}</div>}

        <div className={cx('mt-5 space-y-3', !ready && 'pointer-events-none opacity-50')} aria-disabled={!ready}>
          <div>
            <p className="label">{p.downloadAs}</p>
            <Segmented
              label={p.downloadAs}
              value={format}
              onChange={setFormat}
              options={EXPORT_FORMATS.map((f) => ({ value: f, label: p.formats[f] }))}
            />
            <p className="help">
              {p.formatHints[format]}
              {format === 'jpeg' && style.transparentBg ? ` · ${p.jpegNote}` : ''}
            </p>
          </div>
          <div className="flex gap-2">
            <div className="w-[130px] shrink-0">
              <Select
                aria-label={t.design.size}
                value={String(style.size)}
                onChange={(e) => onStyleChange({ ...style, size: Number(e.target.value) })}
                disabled={format === 'svg' || !ready}
              >
                {SIZE_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s} × {s}
                  </option>
                ))}
              </Select>
            </div>
            <Button className="flex-1" icon={<Download className="size-4" />} onClick={onDownload} loading={busy === 'download'} disabled={!ready} data-testid="download-btn">
              {t.common.download}
            </Button>
          </div>
          <div className="flex items-center justify-center gap-1 pt-1">
            <IconButton label={p.copyContent} onClick={onCopy} disabled={!ready}>
              <Copy className="size-[18px]" />
            </IconButton>
            <IconButton label={t.common.print} onClick={onPrint} disabled={!ready || busy === 'print'}>
              <Printer className="size-[18px]" />
            </IconButton>
            <IconButton label={t.design.resetDesign} onClick={() => onStyleChange({ ...DEFAULT_STYLE })}>
              <RotateCcw className="size-[18px]" />
            </IconButton>
          </div>
        </div>

        {renderError === 'tooLong' && content && (
          <Notice tone="error" className="mt-4">
            {p.tooLong}
          </Notice>
        )}
      </div>

      <dl className="space-y-2.5 border-t border-line bg-sunken px-5 py-4 text-[13px]">
        <SummaryRow label={p.type}>
          <span className="inline-flex items-center gap-2">
            <TypeIcon type={type} size="sm" className="size-6 rounded-md [&>svg]:size-3.5" />
            {t.types[type].title}
          </span>
        </SummaryRow>
        {name && <SummaryRow label={p.name}>{name}</SummaryRow>}
        <SummaryRow label={p.destination}>
          <span className="block max-h-16 overflow-hidden break-all font-mono text-[12px] leading-relaxed text-ink" title={content ?? ''} data-testid="qr-content">
            {content ? (content.length > 160 ? content.slice(0, 160) + '…' : content) : '—'}
          </span>
        </SummaryRow>
        <SummaryRow label={p.settings}>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>{t.design.dotStyles[style.dotStyle]}</span>
            <span className="text-subtle">·</span>
            <span>{t.design.cornerStyles[style.cornerStyle]}</span>
            <span className="text-subtle">·</span>
            <span className="inline-flex items-center gap-1">
              <span className="size-3 rounded-sm ring-1 ring-line" style={{ background: style.fgColor }} />
              <span className={cx('size-3 rounded-sm ring-1 ring-line', style.transparentBg && CHECKER)} style={style.transparentBg ? undefined : { background: style.bgColor }} />
            </span>
            <span className="text-subtle">·</span>
            <span>ECC {effectiveErrorCorrection(style)}</span>
            <span className="text-subtle">·</span>
            <span>{format === 'svg' ? 'SVG' : `${style.size}px`}</span>
          </span>
        </SummaryRow>
      </dl>
    </section>
  );
}

function SummaryRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[88px_1fr] gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 text-ink">{children}</dd>
    </div>
  );
}
