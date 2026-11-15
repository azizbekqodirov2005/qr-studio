import { useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Copy, ImagePlus, Trash } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider';
import { Checkbox, Field, Input, Textarea } from '../ui/Form';
import { Button, IconButton } from '../ui/Button';
import { Spinner } from '../ui/Notice';
import { FileDrop } from './FileDrop';
import { AuthRequired, FormSection, ImageUploadField, SocialLinksEditor, move, type FormProps } from './shared';
import { checkImage, LIMITS, resizeImage } from '../../lib/files';
import { uploadFile } from '../../lib/db';
import { errorMessage } from '../../lib/errors';
import { randomId } from '../../lib/qr/payloads';
import type { BusinessData, GalleryImage, ImagesData, SocialData, WorkingDay } from '../../lib/types';
import { cx } from '../../lib/cx';

/* ------------------------------- Images ------------------------------- */

async function runLimited<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const item = items[i++];
      await fn(item);
    }
  });
  await Promise.all(workers);
}

export function ImagesForm({ value, onChange, errors, canUpload }: FormProps<ImagesData>) {
  const { t } = useI18n();
  const g = t.images;
  const [pending, setPending] = useState(0);
  const [fileErrors, setFileErrors] = useState<string[]>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  // Latest images, so concurrent uploads append instead of overwriting each other.
  const latest = useRef(value);
  latest.current = value;
  const max = LIMITS.galleryImages;

  async function onFiles(files: File[]) {
    setFileErrors([]);
    const room = max - value.images.length;
    const accepted = files.slice(0, room);
    const errs: string[] = [];
    if (files.length > room) errs.push(g.tooMany(max));
    setPending((n) => n + accepted.length);
    await runLimited(accepted, 3, async (file) => {
      try {
        const check = await checkImage(file);
        if (!check.ok) {
          errs.push(`${file.name}: ${check.reason === 'size' ? t.files.tooLarge(LIMITS.imageBytes / 1024 / 1024) : check.reason === 'type' ? t.files.invalidType : t.files.corrupt}`);
          return;
        }
        const resized = await resizeImage(file, LIMITS.galleryMaxEdge);
        const stored = await uploadFile(resized.blob, 'images', resized.ext);
        const image: GalleryImage = { id: randomId(8), ...stored, width: resized.width, height: resized.height };
        const current = latest.current;
        latest.current = { ...current, images: [...current.images, image] };
        onChange(latest.current);
      } catch (e) {
        errs.push(`${file.name}: ${errorMessage(e, t) === t.common.errorGeneric ? t.files.uploadFailed : errorMessage(e, t)}`);
      } finally {
        setPending((n) => n - 1);
      }
    });
    setFileErrors(errs);
  }

  const setImages = (images: GalleryImage[]) => onChange({ ...value, images });

  return (
    <div className="space-y-6">
      {!canUpload && <AuthRequired />}
      <Field label={g.titleLabel} error={errors.title}>
        <Input placeholder={g.titlePlaceholder} value={value.title} maxLength={120} onChange={(e) => onChange({ ...value, title: e.target.value })} name="title" />
      </Field>
      <Field label={g.descLabel} optional error={errors.description}>
        <Textarea placeholder={g.descPlaceholder} value={value.description} maxLength={500} onChange={(e) => onChange({ ...value, description: e.target.value })} />
      </Field>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="label mb-0">{g.photos}</p>
          <span className="text-[13px] tabular-nums text-muted">{g.count(value.images.length, max)}</span>
        </div>
        {value.images.length > 0 && (
          <>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3" data-testid="gallery-thumbs">
              {value.images.map((img, index) => (
                <li
                  key={img.id}
                  draggable
                  onDragStart={() => setDragIndex(index)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragIndex !== null && dragIndex !== index) setImages(move(value.images, dragIndex, index));
                    setDragIndex(null);
                  }}
                  onDragEnd={() => setDragIndex(null)}
                  className={cx('group overflow-hidden rounded-xl border bg-surface', dragIndex === index ? 'border-primary opacity-60' : 'border-line')}
                >
                  <div className="relative aspect-[4/3] bg-soft">
                    <img src={img.url} alt={g.imageAlt(index + 1)} loading="lazy" className="size-full object-cover" />
                    <span className="absolute left-2 top-2 rounded-md bg-[#151923]/70 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-white">{index + 1}</span>
                  </div>
                  <div className="flex justify-end gap-0.5 p-1.5">
                    <IconButton size="sm" label={t.common.moveUp} disabled={index === 0} onClick={() => setImages(move(value.images, index, index - 1))}>
                      <ArrowUp className="size-4" />
                    </IconButton>
                    <IconButton size="sm" label={t.common.moveDown} disabled={index === value.images.length - 1} onClick={() => setImages(move(value.images, index, index + 1))}>
                      <ArrowDown className="size-4" />
                    </IconButton>
                    <IconButton size="sm" tone="danger" label={t.common.remove} onClick={() => setImages(value.images.filter((i) => i.id !== img.id))}>
                      <Trash className="size-4" />
                    </IconButton>
                  </div>
                </li>
              ))}
              {Array.from({ length: pending }, (_, i) => (
                <li key={`p${i}`} className="aspect-[4/3] rounded-xl skeleton" aria-hidden />
              ))}
            </ul>
            <p className="help">{g.reorderHint}</p>
          </>
        )}
        {value.images.length < max && (
          <FileDrop
            className={value.images.length ? 'mt-4 py-6' : ''}
            accept="image/jpeg,image/png,image/webp"
            multiple
            disabled={!canUpload}
            onFiles={onFiles}
            title={g.dropTitle}
            hint={g.limit(max, LIMITS.imageBytes / 1024 / 1024)}
            buttonLabel={g.browse}
            icon={<ImagePlus className="size-5" aria-hidden />}
            invalid={Boolean(errors.images)}
          />
        )}
        {pending > 0 && <Spinner className="mt-3" label={g.uploadingN(pending)} />}
        {errors.images && <p className="error-text">{errors.images}</p>}
        {fileErrors.map((e) => (
          <p key={e} className="error-text">
            {e}
          </p>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------- Social ------------------------------- */

export function SocialForm({ value, onChange, errors, canUpload }: FormProps<SocialData>) {
  const { t } = useI18n();
  const s = t.social;
  return (
    <div className="space-y-8">
      {!canUpload && <AuthRequired />}
      <FormSection title={s.profile}>
        <ImageUploadField
          label={s.avatar}
          value={value.avatar}
          onChange={(avatar) => onChange({ ...value, avatar })}
          canUpload={canUpload}
          folder="avatars"
          uploadLabel={s.uploadAvatar}
          changeLabel={s.changeAvatar}
          rounded
        />
        <Field label={s.nameLabel} error={errors.name}>
          <Input placeholder={s.namePlaceholder} value={value.name} maxLength={80} onChange={(e) => onChange({ ...value, name: e.target.value })} name="name" />
        </Field>
        <Field label={s.descLabel} optional error={errors.description}>
          <Textarea placeholder={s.descPlaceholder} value={value.description} maxLength={300} onChange={(e) => onChange({ ...value, description: e.target.value })} />
        </Field>
      </FormSection>
      <FormSection title={s.linksTitle}>
        <SocialLinksEditor links={value.links} onChange={(links) => onChange({ ...value, links })} errors={errors} required />
      </FormSection>
    </div>
  );
}

/* ------------------------------- Business ------------------------------- */

function HoursEditor({ hours, onChange, errors }: { hours: WorkingDay[]; onChange: (h: WorkingDay[]) => void; errors: Record<string, string> }) {
  const { t } = useI18n();
  const b = t.business;
  const update = (i: number, patch: Partial<WorkingDay>) => onChange(hours.map((h, idx) => (idx === i ? { ...h, ...patch } : h)));
  const copyToWeekdays = () => {
    const first = hours[0];
    onChange(hours.map((h) => (h.day < 5 ? { ...h, closed: first.closed, open: first.open, close: first.close } : h)));
  };
  return (
    <div>
      <ul className="divide-y divide-line rounded-xl border border-line">
        {hours.map((h, i) => {
          const errOpen = errors[`hours.${i}.open`];
          const errClose = errors[`hours.${i}.close`];
          return (
            <li key={h.day} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3.5 py-3">
              <span className="w-24 text-sm font-medium text-ink">{t.days[h.day]}</span>
              <Checkbox label={b.closed} checked={h.closed} onChange={(e) => update(i, { closed: e.target.checked })} className="w-32" />
              {!h.closed && (
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    aria-label={`${t.days[h.day]} — ${b.opens}`}
                    className="input w-[120px] py-2"
                    value={h.open}
                    aria-invalid={errOpen ? true : undefined}
                    onChange={(e) => update(i, { open: e.target.value })}
                  />
                  <span className="text-muted" aria-hidden>
                    –
                  </span>
                  <input
                    type="time"
                    aria-label={`${t.days[h.day]} — ${b.closes}`}
                    className="input w-[120px] py-2"
                    value={h.close}
                    aria-invalid={errClose ? true : undefined}
                    onChange={(e) => update(i, { close: e.target.value })}
                  />
                </div>
              )}
              {(errOpen || errClose) && <p className="error-text mt-0 w-full">{errOpen ?? errClose}</p>}
            </li>
          );
        })}
      </ul>
      <Button variant="ghost" size="sm" className="mt-2" icon={<Copy className="size-4" />} onClick={copyToWeekdays}>
        {b.copyToAll}
      </Button>
    </div>
  );
}

export function BusinessForm({ value, onChange, errors, canUpload }: FormProps<BusinessData>) {
  const { t } = useI18n();
  const b = t.business;
  const set = (key: keyof BusinessData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange({ ...value, [key]: e.target.value });
  return (
    <div className="space-y-8">
      {!canUpload && <AuthRequired />}
      <FormSection title={b.basics}>
        <ImageUploadField
          label={b.logo}
          value={value.logo}
          onChange={(logo) => onChange({ ...value, logo })}
          canUpload={canUpload}
          folder="logos"
          uploadLabel={b.uploadLogo}
          changeLabel={b.changeLogo}
        />
        <Field label={b.nameLabel} error={errors.name}>
          <Input placeholder={b.namePlaceholder} value={value.name} maxLength={100} onChange={set('name')} name="name" />
        </Field>
        <Field label={b.descLabel} optional error={errors.description}>
          <Textarea placeholder={b.descPlaceholder} value={value.description} maxLength={600} onChange={set('description')} />
        </Field>
      </FormSection>
      <FormSection title={b.contact}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={b.phone} optional error={errors.phone}>
            <Input type="tel" inputMode="tel" autoComplete="tel" placeholder={t.vcard.phonePh} value={value.phone} onChange={set('phone')} name="phone" />
          </Field>
          <Field label={b.email} optional error={errors.email}>
            <Input type="email" inputMode="email" autoComplete="email" placeholder={t.vcard.emailPh} value={value.email} onChange={set('email')} name="email" />
          </Field>
          <Field label={b.website} optional error={errors.website} className="sm:col-span-2">
            <Input type="url" inputMode="url" autoCapitalize="off" placeholder={t.vcard.websitePh} value={value.website} onChange={set('website')} name="website" />
          </Field>
          <Field label={b.address} optional error={errors.address} className="sm:col-span-2">
            <Input autoComplete="street-address" placeholder={b.addressPh} value={value.address} onChange={set('address')} name="address" />
          </Field>
          <Field label={b.mapsUrl} optional error={errors.mapsUrl} help={b.mapsHelp} className="sm:col-span-2">
            <Input type="url" inputMode="url" autoCapitalize="off" placeholder={b.mapsPh} value={value.mapsUrl} onChange={set('mapsUrl')} name="mapsUrl" />
          </Field>
        </div>
      </FormSection>
      <FormSection title={b.hours}>
        <HoursEditor hours={value.hours} onChange={(hours) => onChange({ ...value, hours })} errors={errors} />
      </FormSection>
      <FormSection title={b.social}>
        <SocialLinksEditor links={value.links} onChange={(links) => onChange({ ...value, links })} errors={errors} />
      </FormSection>
    </div>
  );
}
