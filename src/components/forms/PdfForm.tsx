import { useState } from 'react';
import { ExternalLink, FileText, RefreshCw } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider';
import { Field, Input, Segmented } from '../ui/Form';
import { Button } from '../ui/Button';
import { Notice, Spinner } from '../ui/Notice';
import { FileDrop } from './FileDrop';
import { AuthRequired, type FormProps } from './shared';
import { checkPdf, formatBytes, LIMITS } from '../../lib/files';
import { uploadFile } from '../../lib/db';
import { errorMessage } from '../../lib/errors';
import { isPdfUrl, normalizeUrl } from '../../lib/qr/payloads';
import type { PdfData } from '../../lib/types';

export function PdfForm({ value, onChange, errors, canUpload }: FormProps<PdfData>) {
  const { t } = useI18n();
  const p = t.pdf;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);

  async function onFiles(files: File[]) {
    const file = files[0];
    if (!file) return;
    setError(null);
    const check = await checkPdf(file);
    if (!check.ok) {
      setError(check.reason === 'size' ? t.files.tooLarge(LIMITS.pdfBytes / 1024 / 1024) : check.reason === 'type' ? t.files.invalidType : t.files.corrupt);
      return;
    }
    setBusy(true);
    try {
      const stored = await uploadFile(file, 'pdf', 'pdf');
      if (localPreview) URL.revokeObjectURL(localPreview);
      setLocalPreview(URL.createObjectURL(file));
      onChange({ ...value, source: 'upload', file: { ...stored, name: file.name.slice(0, 200), size: file.size } });
    } catch (e) {
      const msg = errorMessage(e, t);
      setError(msg === t.common.errorGeneric ? t.files.uploadFailed : msg);
    } finally {
      setBusy(false);
    }
  }

  const previewSrc = value.source === 'upload' ? (localPreview ?? value.file?.url ?? null) : null;
  const normalizedUrl = value.source === 'url' && value.url.trim() ? normalizeUrl(value.url) : null;

  return (
    <div className="space-y-5">
      <Segmented<PdfData['source']>
        label="PDF"
        value={value.source}
        onChange={(source) => onChange({ ...value, source })}
        options={[
          { value: 'upload', label: p.tabUpload },
          { value: 'url', label: p.tabUrl },
        ]}
      />

      {value.source === 'upload' ? (
        <div className="space-y-4">
          {!canUpload && <AuthRequired />}
          {value.file ? (
            <div className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3.5" data-testid="pdf-file">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-danger-50 text-danger">
                <FileText className="size-5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">{value.file.name}</p>
                <p className="text-xs text-muted">
                  {formatBytes(value.file.size)} · <span className="text-success">{p.uploaded}</span>
                </p>
              </div>
              <label className={`inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-line-strong px-3 text-[13px] font-medium hover:bg-sunken ${!canUpload || busy ? 'pointer-events-none opacity-50' : ''}`}>
                <RefreshCw className="size-3.5" aria-hidden />
                {p.replace}
                <input type="file" accept="application/pdf,.pdf" className="sr-only" disabled={!canUpload || busy} onChange={(e) => onFiles(Array.from(e.target.files ?? []))} />
              </label>
            </div>
          ) : (
            <FileDrop
              accept="application/pdf,.pdf"
              disabled={!canUpload || busy}
              onFiles={onFiles}
              title={p.dropTitle}
              hint={p.limit(LIMITS.pdfBytes / 1024 / 1024)}
              buttonLabel={p.browse}
              icon={<FileText className="size-5" aria-hidden />}
              invalid={Boolean(errors.file)}
            />
          )}
          {busy && <Spinner label={p.uploading} />}
          {(error || errors.file) && <p className="error-text">{error ?? errors.file}</p>}

          {previewSrc && (
            <div className="overflow-hidden rounded-xl border border-line">
              <div className="flex items-center justify-between border-b border-line bg-sunken px-3.5 py-2">
                <span className="text-[13px] font-medium text-ink">{p.preview}</span>
                <a href={value.file?.url ?? previewSrc} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[13px] font-medium text-primary-strong hover:underline">
                  {p.openInNewTab}
                  <ExternalLink className="size-3.5" aria-hidden />
                </a>
              </div>
              <object data={previewSrc} type="application/pdf" className="h-[420px] w-full bg-soft" aria-label={value.file?.name}>
                <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted">
                  <a href={previewSrc} target="_blank" rel="noopener noreferrer" className="font-medium text-primary-strong underline">
                    {p.openInNewTab}
                  </a>
                </div>
              </object>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <Field
            label={p.urlLabel}
            error={errors.url}
            help={normalizedUrl && normalizedUrl !== value.url.trim() ? `${t.url.willOpen}: ${normalizedUrl}` : p.urlHelp}
          >
            <Input
              type="url"
              inputMode="url"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder={p.urlPlaceholder}
              value={value.url}
              onChange={(e) => onChange({ ...value, url: e.target.value })}
              name="pdfUrl"
            />
          </Field>
          {normalizedUrl && !isPdfUrl(normalizedUrl) && <Notice tone="warning">{p.notPdfWarning}</Notice>}
          {normalizedUrl && (
            <Button variant="secondary" size="sm" icon={<ExternalLink className="size-4" />} onClick={() => window.open(normalizedUrl, '_blank', 'noopener,noreferrer')}>
              {p.openInNewTab}
            </Button>
          )}
        </div>
      )}
      <Notice tone="info">{p.qrNote}</Notice>
    </div>
  );
}
