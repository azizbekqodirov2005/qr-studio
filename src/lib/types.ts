export const QR_TYPES = ['url', 'vcard', 'pdf', 'images', 'social', 'business', 'wifi'] as const;
export type QrType = (typeof QR_TYPES)[number];

export function isQrType(value: string | undefined): value is QrType {
  return !!value && (QR_TYPES as readonly string[]).includes(value);
}

/** QR types whose content is a hosted public page. */
export type PageQrType = 'images' | 'social' | 'business';
export type PageKind = 'gallery' | 'social' | 'business';

export const PAGE_KIND_BY_TYPE: Record<PageQrType, PageKind> = {
  images: 'gallery',
  social: 'social',
  business: 'business',
};

export const PAGE_ROUTE_PREFIX: Record<PageKind, 'g' | 'p' | 'b'> = {
  gallery: 'g',
  social: 'p',
  business: 'b',
};

export function isPageType(type: QrType): type is PageQrType {
  return type === 'images' || type === 'social' || type === 'business';
}

export interface StoredFile {
  path: string;
  url: string;
}

export interface UrlData {
  url: string;
}

export interface VCardData {
  firstName: string;
  lastName: string;
  company: string;
  jobTitle: string;
  phone: string;
  email: string;
  website: string;
  address: string;
  city: string;
  country: string;
}

export type WifiSecurity = 'WPA' | 'WEP' | 'nopass';

export interface WifiData {
  ssid: string;
  password: string;
  security: WifiSecurity;
  hidden: boolean;
}

export interface PdfData {
  source: 'upload' | 'url';
  url: string;
  file: (StoredFile & { name: string; size: number }) | null;
}

export interface GalleryImage extends StoredFile {
  id: string;
  width?: number;
  height?: number;
}

export interface ImagesData {
  title: string;
  description: string;
  images: GalleryImage[];
}

export const SOCIAL_PLATFORMS = [
  'instagram',
  'telegram',
  'facebook',
  'youtube',
  'tiktok',
  'linkedin',
  'x',
  'whatsapp',
  'website',
] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export interface SocialLink {
  id: string;
  platform: SocialPlatform;
  value: string;
}

export interface SocialData {
  name: string;
  description: string;
  avatar: StoredFile | null;
  links: SocialLink[];
}

export interface WorkingDay {
  /** 0 = Monday … 6 = Sunday */
  day: number;
  closed: boolean;
  open: string;
  close: string;
}

export interface BusinessData {
  name: string;
  description: string;
  logo: StoredFile | null;
  phone: string;
  email: string;
  website: string;
  address: string;
  mapsUrl: string;
  hours: WorkingDay[];
  links: SocialLink[];
}

export interface QrDataMap {
  url: UrlData;
  vcard: VCardData;
  pdf: PdfData;
  images: ImagesData;
  social: SocialData;
  business: BusinessData;
  wifi: WifiData;
}

export type AnyQrData = QrDataMap[QrType];

/* ------------------------------ Styling ------------------------------ */

export const DOT_STYLES = ['square', 'rounded', 'dots', 'extra-rounded', 'classy', 'classy-rounded'] as const;
export type DotStyle = (typeof DOT_STYLES)[number];

export const CORNER_STYLES = ['square', 'rounded', 'extra-rounded'] as const;
export type CornerStyle = (typeof CORNER_STYLES)[number];

export type ErrorCorrection = 'L' | 'M' | 'Q' | 'H';

export interface QrStyle {
  dotStyle: DotStyle;
  cornerStyle: CornerStyle;
  fgColor: string;
  bgColor: string;
  transparentBg: boolean;
  /** Logo as a data URL (resized client-side), or null. */
  logo: string | null;
  /** Logo size as a fraction of the QR width (0.1 – 0.4). */
  logoSize: number;
  errorCorrection: ErrorCorrection;
  /** Quiet zone as a percentage of the image size (0 – 12). */
  marginPercent: number;
  /** Export size in pixels for raster formats. */
  size: number;
}

export const DEFAULT_STYLE: QrStyle = {
  dotStyle: 'square',
  cornerStyle: 'square',
  fgColor: '#151923',
  bgColor: '#ffffff',
  transparentBg: false,
  logo: null,
  logoSize: 0.25,
  errorCorrection: 'M',
  marginPercent: 4,
  size: 1024,
};

/* ------------------------------ Records ------------------------------ */

export interface QrRecord {
  id: string;
  user_id: string;
  type: QrType;
  name: string;
  folder: string | null;
  content: string;
  data: AnyQrData;
  style: QrStyle;
  page_id: string | null;
  created_at: string;
  updated_at: string;
  page?: { slug: string; kind: PageKind } | null;
}

export interface PageRecord<T = unknown> {
  id: string;
  user_id: string;
  kind: PageKind;
  slug: string;
  title: string;
  data: T;
  published: boolean;
  created_at: string;
  updated_at: string;
}
