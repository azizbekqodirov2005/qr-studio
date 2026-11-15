import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Clock, Globe, Mail, MapPin, Navigation, Phone, UserPlus, X } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider';
import { SocialGlyph, BRAND_COLORS } from '../qr/typeMeta';
import { socialUrl, normalizeUrl, normalizePhone, escapeVCard } from '../../lib/qr/payloads';
import { downloadBlob } from '../../lib/qr/export';
import type { BusinessData, ImagesData, SocialData, SocialLink, WorkingDay } from '../../lib/types';
import { cx } from '../../lib/cx';

export function PublicShell({ children, banner }: { children: React.ReactNode; banner?: React.ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      {banner}
      <div className="mx-auto w-full max-w-[560px] flex-1 px-4 py-8 sm:py-12">{children}</div>
      <footer className="pb-8 text-center">
        <a href="/" className="text-xs font-medium text-subtle hover:text-muted">
          {t.common.madeWith}
        </a>
      </footer>
    </div>
  );
}

function SocialButtons({ links }: { links: SocialLink[] }) {
  const { t } = useI18n();
  return (
    <ul className="space-y-2.5">
      {links.map((link) => {
        const href = socialUrl(link.platform, link.value);
        if (!href) return null;
        return (
          <li key={link.id}>
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3.5 py-3 shadow-card transition-[border-color,box-shadow] hover:border-line-strong hover:shadow-raised"
              data-testid={`social-btn-${link.platform}`}
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg text-white" style={{ background: BRAND_COLORS[link.platform] }}>
                <SocialGlyph platform={link.platform} className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold text-ink">{t.social.platforms[link.platform]}</span>
                <span className="block truncate text-[13px] text-muted">{displayHandle(link)}</span>
              </span>
              <ChevronRight className="size-4 text-subtle" aria-hidden />
            </a>
          </li>
        );
      })}
    </ul>
  );
}

function displayHandle(link: SocialLink): string {
  const v = link.value.trim();
  if (link.platform === 'website') return v.replace(/^https?:\/\//, '').replace(/\/$/, '');
  if (link.platform === 'whatsapp') return /^\+?[\d\s().-]+$/.test(v) ? v : v.replace(/^https?:\/\//, '');
  if (/^https?:\/\//.test(v)) return v.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
  return v.startsWith('@') ? v : `@${v}`;
}

function Initials({ name, className }: { name: string; className?: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join('');
  return <span className={cx('flex items-center justify-center bg-primary-50 font-semibold text-primary-strong', className)}>{initials || '•'}</span>;
}

export function SocialPageView({ data }: { data: SocialData }) {
  return (
    <article>
      <header className="text-center">
        {data.avatar ? (
          <img src={data.avatar.url} alt={data.name} className="mx-auto size-24 rounded-full object-cover ring-4 ring-surface shadow-raised" />
        ) : (
          <Initials name={data.name} className="mx-auto size-24 rounded-full text-2xl ring-4 ring-surface" />
        )}
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-ink">{data.name}</h1>
        {data.description && <p className="mx-auto mt-2 max-w-md whitespace-pre-line text-[15px] leading-relaxed text-muted">{data.description}</p>}
      </header>
      <div className="mt-8">
        <SocialButtons links={data.links} />
      </div>
    </article>
  );
}

/* ------------------------------- Business ------------------------------- */

function minutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/** Monday = 0 … Sunday = 6 (visitor's local time). */
function todayIndex(now = new Date()): number {
  return (now.getDay() + 6) % 7;
}

export function isOpenNow(hours: WorkingDay[], now = new Date()): boolean {
  const today = todayIndex(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const yesterday = (today + 6) % 7;
  const t = hours.find((h) => h.day === today);
  const y = hours.find((h) => h.day === yesterday);
  if (t && !t.closed) {
    const o = minutes(t.open);
    const c = minutes(t.close);
    if (c > o ? nowMin >= o && nowMin < c : nowMin >= o) return true;
  }
  // Overnight hours from yesterday (e.g. 18:00–02:00).
  if (y && !y.closed) {
    const o = minutes(y.open);
    const c = minutes(y.close);
    if (c < o && nowMin < c) return true;
  }
  return false;
}

export function businessVCard(data: BusinessData): string {
  const lines = ['BEGIN:VCARD', 'VERSION:3.0', `FN:${escapeVCard(data.name)}`, `ORG:${escapeVCard(data.name)}`];
  if (data.phone) lines.push(`TEL;TYPE=WORK:${normalizePhone(data.phone)}`);
  if (data.email) lines.push(`EMAIL;TYPE=INTERNET:${data.email.trim()}`);
  const web = data.website ? normalizeUrl(data.website) : null;
  if (web) lines.push(`URL:${web}`);
  if (data.address) lines.push(`ADR;TYPE=WORK:;;${escapeVCard(data.address)};;;;`);
  if (data.description) lines.push(`NOTE:${escapeVCard(data.description.slice(0, 300))}`);
  lines.push('END:VCARD');
  return lines.join('\r\n');
}

export function BusinessPageView({ data }: { data: BusinessData }) {
  const { t } = useI18n();
  const p = t.public;
  const website = data.website ? normalizeUrl(data.website) : null;
  const maps = data.mapsUrl ? normalizeUrl(data.mapsUrl) : data.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(data.address)}` : null;
  const phone = data.phone ? normalizePhone(data.phone) : null;
  const [open, setOpen] = useState(() => isOpenNow(data.hours));
  useEffect(() => {
    const id = setInterval(() => setOpen(isOpenNow(data.hours)), 60_000);
    return () => clearInterval(id);
  }, [data.hours]);
  const today = todayIndex();
  const hasHours = data.hours.some((h) => !h.closed);

  const actions = [
    phone && { key: 'call', href: `tel:${phone}`, label: p.call, icon: Phone },
    data.email && { key: 'email', href: `mailto:${data.email.trim()}`, label: p.email, icon: Mail },
    website && { key: 'web', href: website, label: p.website, icon: Globe, external: true },
    maps && { key: 'map', href: maps, label: p.directions, icon: Navigation, external: true },
  ].filter(Boolean) as { key: string; href: string; label: string; icon: typeof Phone; external?: boolean }[];

  return (
    <article className="space-y-4">
      <header className="card p-6 text-center">
        {data.logo ? (
          <img src={data.logo.url} alt={data.name} className="mx-auto size-20 rounded-2xl border border-line object-contain p-1" />
        ) : (
          <Initials name={data.name} className="mx-auto size-20 rounded-2xl text-xl" />
        )}
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-ink">{data.name}</h1>
        {hasHours && (
          <p className={cx('mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold', open ? 'bg-success-50 text-success' : 'bg-soft text-muted')}>
            <span className={cx('size-1.5 rounded-full', open ? 'bg-success' : 'bg-subtle')} />
            {open ? p.openNow : p.closedNow}
          </p>
        )}
        {data.description && <p className="mx-auto mt-3 max-w-md whitespace-pre-line text-[15px] leading-relaxed text-muted">{data.description}</p>}
        {actions.length > 0 && (
          <div className={cx('mt-6 grid gap-2', actions.length >= 4 ? 'grid-cols-4' : actions.length === 3 ? 'grid-cols-3' : 'grid-cols-2')}>
            {actions.map((a) => (
              <a
                key={a.key}
                href={a.href}
                {...(a.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                className="flex flex-col items-center gap-1.5 rounded-xl border border-line px-2 py-3 text-[12px] font-medium text-ink transition-colors hover:border-primary-200 hover:bg-primary-50"
              >
                <a.icon className="size-5 text-primary-strong" aria-hidden />
                {a.label}
              </a>
            ))}
          </div>
        )}
      </header>

      {(phone || data.email || website || data.address) && (
        <section className="card p-5" aria-labelledby="biz-contact">
          <h2 id="biz-contact" className="text-[13px] font-semibold uppercase tracking-wide text-muted">
            {p.contact}
          </h2>
          <ul className="mt-3 space-y-3 text-[15px]">
            {phone && (
              <li className="flex items-center gap-3">
                <Phone className="size-4 shrink-0 text-muted" aria-hidden />
                <a href={`tel:${phone}`} className="text-ink hover:text-primary-strong">
                  {data.phone}
                </a>
              </li>
            )}
            {data.email && (
              <li className="flex items-center gap-3">
                <Mail className="size-4 shrink-0 text-muted" aria-hidden />
                <a href={`mailto:${data.email.trim()}`} className="break-all text-ink hover:text-primary-strong">
                  {data.email}
                </a>
              </li>
            )}
            {website && (
              <li className="flex items-center gap-3">
                <Globe className="size-4 shrink-0 text-muted" aria-hidden />
                <a href={website} target="_blank" rel="noopener noreferrer" className="break-all text-ink hover:text-primary-strong">
                  {website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
                </a>
              </li>
            )}
            {data.address && (
              <li className="flex items-start gap-3">
                <MapPin className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
                {maps ? (
                  <a href={maps} target="_blank" rel="noopener noreferrer" className="text-ink hover:text-primary-strong">
                    {data.address}
                  </a>
                ) : (
                  <span>{data.address}</span>
                )}
              </li>
            )}
          </ul>
          <button
            type="button"
            onClick={() => downloadBlob(new Blob([businessVCard(data)], { type: 'text/vcard;charset=utf-8' }), `${data.name.replace(/[^\w-]+/g, '-') || 'contact'}.vcf`)}
            className="mt-5 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary-fill text-sm font-medium text-white hover:bg-primary-hover"
          >
            <UserPlus className="size-4" aria-hidden />
            {p.saveContact}
          </button>
        </section>
      )}

      {hasHours && (
        <section className="card p-5" aria-labelledby="biz-hours">
          <h2 id="biz-hours" className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wide text-muted">
            <Clock className="size-4" aria-hidden />
            {p.hours}
          </h2>
          <table className="mt-3 w-full text-[15px]">
            <tbody>
              {data.hours.map((h) => (
                <tr key={h.day} className={cx(h.day === today && 'font-semibold')}>
                  <th scope="row" className={cx('py-1.5 text-left text-ink', h.day === today ? 'font-semibold' : 'font-normal')}>
                    {t.days[h.day]}
                    {h.day === today && <span className="ml-2 text-xs font-medium text-primary-strong">{p.today}</span>}
                  </th>
                  <td className={cx('py-1.5 text-right tabular-nums', h.closed ? 'text-muted' : 'text-ink')}>{h.closed ? t.business.closed : `${h.open} – ${h.close}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {data.links.length > 0 && (
        <section aria-labelledby="biz-social">
          <h2 id="biz-social" className="mb-3 mt-6 text-center text-[13px] font-semibold uppercase tracking-wide text-muted">
            {p.follow}
          </h2>
          <SocialButtons links={data.links} />
        </section>
      )}
    </article>
  );
}

/* ------------------------------- Gallery ------------------------------- */

export function GalleryView({ data }: { data: ImagesData }) {
  const { t } = useI18n();
  const p = t.public;
  const [index, setIndex] = useState<number | null>(null);
  const count = data.images.length;
  const go = useCallback((delta: number) => setIndex((i) => (i === null ? i : (i + delta + count) % count)), [count]);

  useEffect(() => {
    if (index === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIndex(null);
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [index, go]);

  const current = index !== null ? data.images[index] : null;

  return (
    <article>
      <header className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{data.title}</h1>
        {data.description && <p className="mx-auto mt-2 max-w-md whitespace-pre-line text-[15px] leading-relaxed text-muted">{data.description}</p>}
        <p className="mt-2 text-[13px] text-subtle">{p.photos(count)}</p>
      </header>
      <ul className="mt-8 grid grid-cols-2 gap-2 sm:gap-3">
        {data.images.map((img, i) => (
          <li key={img.id} className={cx(count % 2 === 1 && i === 0 && 'col-span-2')}>
            <button
              type="button"
              onClick={() => setIndex(i)}
              className="block w-full overflow-hidden rounded-xl bg-soft-2"
              aria-label={`${t.images.imageAlt(i + 1)} — ${p.imageOf(i + 1, count)}`}
            >
              <img
                src={img.url}
                alt={t.images.imageAlt(i + 1)}
                loading={i < 4 ? 'eager' : 'lazy'}
                decoding="async"
                width={img.width}
                height={img.height}
                className={cx('w-full object-cover transition-transform duration-300 hover:scale-[1.02]', count % 2 === 1 && i === 0 ? 'aspect-[16/10]' : 'aspect-square')}
              />
            </button>
          </li>
        ))}
      </ul>

      {current && index !== null && (
        <div className="fixed inset-0 z-50 flex flex-col bg-[#0b0d12]/95" role="dialog" aria-modal="true" aria-label={p.imageOf(index + 1, count)}>
          <div className="flex items-center justify-between px-4 py-3 text-sm text-white/80">
            <span className="tabular-nums">{p.imageOf(index + 1, count)}</span>
            <button type="button" onClick={() => setIndex(null)} className="rounded-lg p-2 hover:bg-white/10" aria-label={t.common.close} autoFocus>
              <X className="size-5 text-white" />
            </button>
          </div>
          <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 pb-6 sm:px-16">
            <img src={current.url} alt={t.images.imageAlt(index + 1)} className="max-h-full max-w-full rounded-lg object-contain" />
            {count > 1 && (
              <>
                <button type="button" onClick={() => go(-1)} className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2.5 text-white hover:bg-white/20 sm:left-4" aria-label={p.prev}>
                  <ChevronLeft className="size-6" />
                </button>
                <button type="button" onClick={() => go(1)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2.5 text-white hover:bg-white/20 sm:right-4" aria-label={p.next}>
                  <ChevronRight className="size-6" />
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </article>
  );
}
