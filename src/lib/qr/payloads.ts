import type { SocialPlatform, VCardData, WifiData } from '../types';

/* ------------------------------- URLs ------------------------------- */

const HAS_SCHEME_RE = /^[a-z][a-z0-9+.-]*:\/\//i;
const NON_WEB_SCHEME_RE = /^(javascript|data|vbscript|file|mailto|tel|sms|ftp|blob|about):/i;

/**
 * Normalises user input into an absolute http(s) URL.
 * Adds https:// when the scheme is missing. Returns null when the input
 * cannot be a valid web address (no dot in host, spaces, other schemes…).
 */
export function normalizeUrl(input: string): string | null {
  let value = input.trim();
  if (!value) return null;
  if (/\s/.test(value)) return null;
  if (value.startsWith('//')) value = 'https:' + value;
  if (NON_WEB_SCHEME_RE.test(value)) return null;
  if (!HAS_SCHEME_RE.test(value)) value = 'https://' + value;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  const host = parsed.hostname;
  const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
  if (!isIp && !/^[^.]+(\.[^.]+)+$/.test(host)) return null;
  const tld = host.split('.').pop() ?? '';
  if (!isIp && !/^(xn--[a-z0-9-]+|[\p{L}]{2,63})$/iu.test(tld)) return null;
  return parsed.toString();
}

export function isPdfUrl(url: string): boolean {
  try {
    return new URL(url).pathname.toLowerCase().endsWith('.pdf');
  } catch {
    return false;
  }
}

/* ------------------------------ vCard ------------------------------ */

/** Escapes a vCard 3.0 text value (RFC 2426 §4). */
export function escapeVCard(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

export function normalizePhone(value: string): string {
  const trimmed = value.trim();
  const plus = trimmed.startsWith('+');
  const digits = trimmed.replace(/[^\d]/g, '');
  return (plus ? '+' : '') + digits;
}

/** Builds a vCard 3.0 payload — the version with the widest phone camera support. */
export function buildVCard(data: VCardData): string {
  const v = (s: string) => escapeVCard(s.trim());
  const first = data.firstName.trim();
  const last = data.lastName.trim();
  const full = [first, last].filter(Boolean).join(' ') || data.company.trim();
  const lines = ['BEGIN:VCARD', 'VERSION:3.0'];
  lines.push(`N:${v(last)};${v(first)};;;`);
  lines.push(`FN:${v(full)}`);
  if (data.company.trim()) lines.push(`ORG:${v(data.company)}`);
  if (data.jobTitle.trim()) lines.push(`TITLE:${v(data.jobTitle)}`);
  if (data.phone.trim()) lines.push(`TEL;TYPE=CELL:${normalizePhone(data.phone)}`);
  if (data.email.trim()) lines.push(`EMAIL;TYPE=INTERNET:${data.email.trim()}`);
  if (data.website.trim()) lines.push(`URL:${normalizeUrl(data.website) ?? data.website.trim()}`);
  if (data.address.trim() || data.city.trim() || data.country.trim()) {
    // ADR: PO box; extended; street; locality; region; postal code; country
    lines.push(`ADR;TYPE=WORK:;;${v(data.address)};${v(data.city)};;;${v(data.country)}`);
  }
  lines.push('END:VCARD');
  return lines.join('\r\n');
}

/* ------------------------------- Wi-Fi ------------------------------- */

/** Escapes special characters for the WIFI: URI scheme (\ ; , : " must be escaped). */
export function escapeWifi(value: string): string {
  return value.replace(/([\\;,:"])/g, '\\$1');
}

export function buildWifi(data: WifiData): string {
  const parts = [`T:${data.security}`, `S:${escapeWifi(data.ssid)}`];
  if (data.security !== 'nopass') parts.push(`P:${escapeWifi(data.password)}`);
  if (data.hidden) parts.push('H:true');
  return `WIFI:${parts.join(';')};;`;
}

/* --------------------------- Social media --------------------------- */

const SOCIAL_BASE: Record<Exclude<SocialPlatform, 'website' | 'whatsapp'>, { base: string; hosts: string[]; at?: boolean }> = {
  instagram: { base: 'https://instagram.com/', hosts: ['instagram.com', 'instagr.am'] },
  telegram: { base: 'https://t.me/', hosts: ['t.me', 'telegram.me', 'telegram.dog'] },
  facebook: { base: 'https://facebook.com/', hosts: ['facebook.com', 'fb.com', 'fb.me', 'm.facebook.com'] },
  youtube: { base: 'https://youtube.com/@', hosts: ['youtube.com', 'youtu.be', 'm.youtube.com'] },
  tiktok: { base: 'https://www.tiktok.com/@', hosts: ['tiktok.com', 'vm.tiktok.com'] },
  linkedin: { base: 'https://www.linkedin.com/in/', hosts: ['linkedin.com', 'lnkd.in'] },
  x: { base: 'https://x.com/', hosts: ['x.com', 'twitter.com', 'mobile.twitter.com'] },
};

function hostMatches(url: string, hosts: string[]): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return hosts.includes(host);
  } catch {
    return false;
  }
}

/**
 * Converts a username / handle / phone / URL entered by the user into the
 * destination URL for that platform. Returns null if the input is unusable.
 */
export function socialUrl(platform: SocialPlatform, rawValue: string): string | null {
  const value = rawValue.trim();
  if (!value) return null;

  if (platform === 'website') return normalizeUrl(value);

  if (platform === 'whatsapp') {
    if (/^(https?:\/\/)?(wa\.me|api\.whatsapp\.com|(www\.)?whatsapp\.com)\//i.test(value)) {
      const url = normalizeUrl(value);
      return url && hostMatches(url, ['wa.me', 'api.whatsapp.com', 'whatsapp.com']) ? url : null;
    }
    const digits = value.replace(/[^\d]/g, '');
    if (digits.length < 7 || digits.length > 15) return null;
    if (/[^\d+\s().-]/.test(value)) return null;
    return `https://wa.me/${digits}`;
  }

  const cfg = SOCIAL_BASE[platform];
  // Full URL (or host-prefixed value) → validate host.
  if (/^https?:\/\//i.test(value) || /^(www\.)?[a-z0-9-]+\.[a-z]{2,}\//i.test(value)) {
    const url = normalizeUrl(value);
    if (!url || !hostMatches(url, cfg.hosts)) return null;
    return url;
  }
  // Username / handle.
  const handle = value.replace(/^@/, '');
  if (!/^[\p{L}\p{N}._-]{1,100}$/u.test(handle)) return null;
  return cfg.base + encodeURIComponent(handle).replace(/%40/g, '@');
}

/* ---------------------------- Public pages ---------------------------- */

export function publicBaseUrl(): string {
  const configured = (import.meta.env?.VITE_PUBLIC_SITE_URL as string | undefined)?.trim();
  const base = configured || (typeof window !== 'undefined' ? window.location.origin : '');
  return base.replace(/\/+$/, '');
}

/* ------------------------------ Slugs ------------------------------ */

const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k',
  л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'x', ц: 'ts',
  ч: 'ch', ш: 'sh', щ: 'sh', ъ: '', ы: 'i', ь: '', э: 'e', ю: 'yu', я: 'ya', ў: 'o', қ: 'q', ғ: 'g', ҳ: 'h',
};

export function slugify(input: string, maxLength = 40): string {
  const lower = input.toLowerCase();
  let out = '';
  for (const ch of lower) out += TRANSLIT[ch] ?? ch;
  out = out
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[ʻʼ'‘’`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (out.length > maxLength) out = out.slice(0, maxLength).replace(/-+$/g, '');
  return out;
}

const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';

export function randomId(length = 6): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let id = '';
  for (const b of bytes) id += ALPHABET[b % ALPHABET.length];
  return id;
}

/** "Coffee House" → "coffee-house-k3x9pa". Always matches the DB slug constraint. */
export function makeSlug(title: string): string {
  const base = slugify(title, 40);
  return base ? `${base}-${randomId(6)}` : `page-${randomId(8)}`;
}

export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])$/;
