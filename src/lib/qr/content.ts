import { buildVCard, buildWifi, normalizeUrl } from './payloads';
import type { BusinessData, QrDataMap, QrType, WorkingDay } from '../types';

export function defaultHours(): WorkingDay[] {
  return Array.from({ length: 7 }, (_, day) => ({ day, closed: day >= 5, open: '09:00', close: '18:00' }));
}

export function defaultData<T extends QrType>(type: T): QrDataMap[T] {
  const map: QrDataMap = {
    url: { url: '' },
    vcard: { firstName: '', lastName: '', company: '', jobTitle: '', phone: '', email: '', website: '', address: '', city: '', country: '' },
    pdf: { source: 'upload', url: '', file: null },
    images: { title: '', description: '', images: [] },
    social: { name: '', description: '', avatar: null, links: [] },
    business: {
      name: '',
      description: '',
      logo: null,
      phone: '',
      email: '',
      website: '',
      address: '',
      mapsUrl: '',
      hours: defaultHours(),
      links: [],
    } satisfies BusinessData,
    wifi: { ssid: '', password: '', security: 'WPA', hidden: false },
  };
  return structuredClone(map[type]) as QrDataMap[T];
}

/**
 * Builds the string encoded into the QR code for static types.
 * Page-based types (images/social/business) encode their public page URL,
 * which must be supplied once the page has been published.
 * Assumes the data has already passed validation.
 */
export function buildContent<T extends QrType>(type: T, data: QrDataMap[T], pageUrl?: string | null): string | null {
  switch (type) {
    case 'url':
      return normalizeUrl((data as QrDataMap['url']).url);
    case 'vcard':
      return buildVCard(data as QrDataMap['vcard']);
    case 'wifi':
      return buildWifi(data as QrDataMap['wifi']);
    case 'pdf': {
      const d = data as QrDataMap['pdf'];
      return d.source === 'upload' ? (d.file?.url ?? null) : normalizeUrl(d.url);
    }
    default:
      return pageUrl ?? null;
  }
}

/** A sensible default name for a QR code, derived from its data. */
export function suggestName<T extends QrType>(type: T, data: QrDataMap[T], fallback: string): string {
  switch (type) {
    case 'url': {
      const u = normalizeUrl((data as QrDataMap['url']).url);
      return u ? new URL(u).hostname.replace(/^www\./, '') : fallback;
    }
    case 'vcard': {
      const d = data as QrDataMap['vcard'];
      return [d.firstName, d.lastName].map((s) => s.trim()).filter(Boolean).join(' ') || d.company.trim() || fallback;
    }
    case 'wifi':
      return (data as QrDataMap['wifi']).ssid.trim() || fallback;
    case 'pdf': {
      const d = data as QrDataMap['pdf'];
      if (d.source === 'upload' && d.file) return d.file.name.replace(/\.pdf$/i, '');
      const u = normalizeUrl(d.url);
      return u ? decodeURIComponent(new URL(u).pathname.split('/').pop() || '').replace(/\.pdf$/i, '') || fallback : fallback;
    }
    case 'images':
      return (data as QrDataMap['images']).title.trim() || fallback;
    case 'social':
      return (data as QrDataMap['social']).name.trim() || fallback;
    case 'business':
      return (data as QrDataMap['business']).name.trim() || fallback;
    default:
      return fallback;
  }
}
