import { useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowDown, ArrowUp, ImagePlus, LogIn, Plus, Trash } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider';
import { Button, IconButton } from '../ui/Button';
import { Field, Input, Select } from '../ui/Form';
import { Notice } from '../ui/Notice';
import { SocialGlyph, BRAND_COLORS } from '../qr/typeMeta';
import { SOCIAL_PLATFORMS, type SocialLink, type SocialPlatform, type StoredFile } from '../../lib/types';
import { socialUrl, randomId } from '../../lib/qr/payloads';
import { checkImage, LIMITS, resizeImage } from '../../lib/files';
import { uploadFile } from '../../lib/db';
import { errorMessage } from '../../lib/errors';
import { isSupabaseConfigured } from '../../lib/supabase';
import type { FieldErrors } from '../../lib/validation';

export interface FormProps<T> {
  value: T;
  onChange: (value: T) => void;
  errors: FieldErrors;
  /** Signed in and backend configured → uploads allowed. */
  canUpload: boolean;
}

export function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const next = list.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** Shown where an action needs an account (uploads, hosted pages). */
export function AuthRequired({ title }: { title?: string }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  if (!isSupabaseConfigured) {
    return (
      <Notice tone="warning" title={t.common.backendMissingTitle}>
        {t.common.backendMissingText}
      </Notice>
    );
  }
  return (
    <Notice
      tone="info"
      title={title ?? t.create.signInToPublish}
      action={
        <Button size="sm" icon={<LogIn className="size-4" />} onClick={() => navigate('/login', { state: { from: location.pathname + location.search } })}>
          {t.common.signIn}
        </Button>
      }
    >
      {t.create.authRequiredText}
    </Notice>
  );
}

export function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-4">
      <legend className="mb-4 text-[13px] font-semibold uppercase tracking-wide text-muted">{title}</legend>
      {children}
    </fieldset>
  );
}

/* ---------------------------- Social links ---------------------------- */

export function SocialLinksEditor({
  links,
  onChange,
  errors,
  errorPrefix = 'links',
  required,
}: {
  links: SocialLink[];
  onChange: (links: SocialLink[]) => void;
  errors: FieldErrors;
  errorPrefix?: string;
  required?: boolean;
}) {
  const { t } = useI18n();
  const s = t.social;

  const add = () => {
    const used = new Set(links.map((l) => l.platform));
    const platform = SOCIAL_PLATFORMS.find((p) => !used.has(p)) ?? 'website';
    onChange([...links, { id: randomId(8), platform, value: '' }]);
  };
  const update = (index: number, patch: Partial<SocialLink>) => onChange(links.map((l, i) => (i === index ? { ...l, ...patch } : l)));

  return (
    <div>
      {links.length === 0 && (
        <p className={required && errors[errorPrefix] ? 'error-text mb-3' : 'mb-3 text-sm text-muted'}>
          {required && errors[errorPrefix] ? errors[errorPrefix] : s.noLinks}
        </p>
      )}
      <ol className="space-y-3">
        {links.map((link, index) => {
          const err = errors[`${errorPrefix}.${index}.value`];
          const resolved = !err && link.value.trim() ? socialUrl(link.platform, link.value) : null;
          return (
            <li key={link.id} className="rounded-xl border border-line bg-surface p-3 sm:p-4" data-testid="social-link-row">
              <div className="flex items-start gap-3">
                <span
                  className="mt-[26px] flex size-10 shrink-0 items-center justify-center rounded-lg text-white"
                  style={{ background: BRAND_COLORS[link.platform] }}
                  aria-hidden
                >
                  <SocialGlyph platform={link.platform} className="size-[18px]" />
                </span>
                <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-[170px_1fr]">
                  <Field label={s.platform}>
                    <Select value={link.platform} onChange={(e) => update(index, { platform: e.target.value as SocialPlatform })}>
                      {SOCIAL_PLATFORMS.map((p) => (
                        <option key={p} value={p}>
                          {s.platforms[p]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label={s.value} error={err} help={resolved ? `${s.opens} ${resolved}` : undefined}>
                    <Input
                      value={link.value}
                      placeholder={s.placeholders[link.platform]}
                      onChange={(e) => update(index, { value: e.target.value })}
                      autoCapitalize="off"
                      autoCorrect="off"
                      spellCheck={false}
                      inputMode={link.platform === 'whatsapp' ? 'tel' : 'url'}
                    />
                  </Field>
                </div>
              </div>
              <div className="mt-2 flex justify-end gap-1 border-t border-line pt-2">
                <IconButton size="sm" label={t.common.moveUp} disabled={index === 0} onClick={() => onChange(move(links, index, index - 1))}>
                  <ArrowUp className="size-4" />
                </IconButton>
                <IconButton
                  size="sm"
                  label={t.common.moveDown}
                  disabled={index === links.length - 1}
                  onClick={() => onChange(move(links, index, index + 1))}
                >
                  <ArrowDown className="size-4" />
                </IconButton>
                <IconButton size="sm" tone="danger" label={t.common.remove} onClick={() => onChange(links.filter((_, i) => i !== index))}>
                  <Trash className="size-4" />
                </IconButton>
              </div>
            </li>
          );
        })}
      </ol>
      <Button variant="secondary" className="mt-3" icon={<Plus className="size-4" />} onClick={add} disabled={links.length >= 20}>
        {s.addLink}
      </Button>
    </div>
  );
}

/* ---------------------------- Single image upload ---------------------------- */

export function ImageUploadField({
  label,
  value,
  onChange,
  canUpload,
  folder,
  uploadLabel,
  changeLabel,
  rounded,
}: {
  label: string;
  value: StoredFile | null;
  onChange: (file: StoredFile | null) => void;
  canUpload: boolean;
  folder: 'avatars' | 'logos';
  uploadLabel: string;
  changeLabel: string;
  rounded?: boolean;
}) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    const check = await checkImage(file, LIMITS.logoBytes);
    if (!check.ok) {
      setError(check.reason === 'size' ? t.files.tooLarge(5) : check.reason === 'type' ? t.files.invalidType : t.files.corrupt);
      return;
    }
    setBusy(true);
    try {
      const resized = await resizeImage(file, LIMITS.avatarMaxEdge, { keepAlpha: true });
      onChange(await uploadFile(resized.blob, folder, resized.ext));
    } catch (e) {
      setError(errorMessage(e, t) === t.common.errorGeneric ? t.files.uploadFailed : errorMessage(e, t));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div>
      <p className="label">{label}</p>
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={`flex size-16 shrink-0 items-center justify-center overflow-hidden border border-line bg-soft text-subtle ${rounded ? 'rounded-full' : 'rounded-xl'}`}
        >
          {value ? <img src={value.url} alt="" className="size-full object-cover" /> : <ImagePlus className="size-6" aria-hidden />}
        </span>
        <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
        <Button variant="secondary" size="sm" loading={busy} disabled={!canUpload} onClick={() => inputRef.current?.click()}>
          {value ? changeLabel : uploadLabel}
        </Button>
        {value && (
          <Button variant="ghost" size="sm" onClick={() => onChange(null)}>
            {t.common.remove}
          </Button>
        )}
      </div>
      {error ? <p className="error-text">{error}</p> : <p className="help">JPG, PNG, WebP · 5 MB</p>}
    </div>
  );
}
