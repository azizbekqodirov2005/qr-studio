import { BriefcaseBusiness, Contact, FileText, Globe, Images, Link2, Share2, Wifi, type LucideIcon } from 'lucide-react';
import { siFacebook, siInstagram, siTelegram, siTiktok, siWhatsapp, siX, siYoutube } from 'simple-icons';
import type { QrType, SocialPlatform } from '../../lib/types';
import { cx } from '../../lib/cx';

export const TYPE_ICONS: Record<QrType, LucideIcon> = {
  url: Link2,
  vcard: Contact,
  pdf: FileText,
  images: Images,
  social: Share2,
  business: BriefcaseBusiness,
  wifi: Wifi,
};

export function TypeIcon({ type, className, size = 'md' }: { type: QrType; className?: string; size?: 'sm' | 'md' | 'lg' }) {
  const Icon = TYPE_ICONS[type];
  const box = { sm: 'size-8 rounded-lg', md: 'size-11 rounded-xl', lg: 'size-12 rounded-xl' }[size];
  const icon = { sm: 'size-4', md: 'size-[22px]', lg: 'size-6' }[size];
  return (
    <span className={cx('flex shrink-0 items-center justify-center bg-primary-50 text-primary-strong ring-1 ring-inset ring-primary-100', box, className)}>
      <Icon className={icon} strokeWidth={1.9} aria-hidden />
    </span>
  );
}

const BRAND: Record<Exclude<SocialPlatform, 'website' | 'linkedin'>, { path: string; hex: string }> = {
  instagram: siInstagram,
  telegram: siTelegram,
  facebook: siFacebook,
  youtube: siYoutube,
  tiktok: siTiktok,
  x: siX,
  whatsapp: siWhatsapp,
};

export const BRAND_COLORS: Record<SocialPlatform, string> = {
  instagram: '#E4405F',
  telegram: '#26A5E4',
  facebook: '#0866FF',
  youtube: '#FF0000',
  tiktok: '#000000',
  linkedin: '#0A66C2',
  x: '#000000',
  whatsapp: '#25D366',
  website: '#477BFF',
};

/** Platform glyph (Simple Icons, CC0). LinkedIn is drawn as a plain “in” mark. */
export function SocialGlyph({ platform, className }: { platform: SocialPlatform; className?: string }) {
  if (platform === 'website') return <Globe className={className} aria-hidden />;
  if (platform === 'linkedin') {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor">
        <rect x="2" y="2" width="20" height="20" rx="3" />
        <text x="12" y="17.2" textAnchor="middle" fontSize="13" fontWeight="700" fontFamily="Arial, Helvetica, sans-serif" fill="#fff">
          in
        </text>
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor">
      <path d={BRAND[platform].path} />
    </svg>
  );
}
