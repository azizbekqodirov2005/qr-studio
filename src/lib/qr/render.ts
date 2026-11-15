import type { Options } from 'qr-code-styling';
import type { CornerStyle, ErrorCorrection, QrStyle } from '../types';

export type ExportFormat = 'png' | 'svg' | 'jpeg' | 'webp';
export const EXPORT_FORMATS: ExportFormat[] = ['png', 'svg', 'jpeg', 'webp'];

const CORNER_MAP: Record<CornerStyle, { square: 'square' | 'rounded' | 'extra-rounded'; dot: 'square' | 'rounded' | 'dot' }> = {
  square: { square: 'square', dot: 'square' },
  rounded: { square: 'rounded', dot: 'rounded' },
  'extra-rounded': { square: 'extra-rounded', dot: 'dot' },
};

export interface BuildOptions {
  width: number;
  type: 'svg' | 'canvas';
  /** Force an opaque background (JPEG has no alpha channel). */
  forceOpaque?: boolean;
}

/** Translates the app's QrStyle into qr-code-styling options. Pure; used by preview, export and tests. */
export function buildQrOptions(content: string, style: QrStyle, opts: BuildOptions): Partial<Options> {
  const margin = Math.round((opts.width * clamp(style.marginPercent, 0, 12)) / 100);
  const transparent = style.transparentBg && !opts.forceOpaque;
  const bg = transparent ? 'rgba(0,0,0,0)' : style.transparentBg ? '#ffffff' : style.bgColor;
  const corner = CORNER_MAP[style.cornerStyle];
  return {
    type: opts.type,
    width: opts.width,
    height: opts.width,
    margin,
    data: toQrBinary(content),
    image: style.logo ?? undefined,
    qrOptions: {
      typeNumber: 0,
      errorCorrectionLevel: effectiveErrorCorrection(style),
    },
    imageOptions: {
      hideBackgroundDots: true,
      imageSize: clamp(style.logoSize, 0.1, 0.4),
      margin: Math.max(2, Math.round(opts.width / 150)),
      crossOrigin: 'anonymous',
      saveAsBlob: true,
    },
    dotsOptions: { type: style.dotStyle, color: style.fgColor, roundSize: true },
    cornersSquareOptions: { type: corner.square, color: style.fgColor },
    cornersDotOptions: { type: corner.dot, color: style.fgColor },
    backgroundOptions: { color: bg },
  };
}

/**
 * qr-code-styling's bundled encoder maps each UTF-16 code unit to one byte
 * (charCode & 255), which corrupts non-Latin text (Cyrillic, ʻ, emoji…).
 * We pre-encode to UTF-8 and pass one char per byte so the QR carries real UTF-8.
 */
export function toQrBinary(content: string): string {
  if (!/[^\x00-\x7f]/.test(content)) return content;
  const bytes = new TextEncoder().encode(content);
  let out = '';
  for (const b of bytes) out += String.fromCharCode(b);
  return out;
}

/** A centred logo hides modules, so never go below Q when a logo is present. */
export function effectiveErrorCorrection(style: QrStyle): ErrorCorrection {
  if (style.logo && (style.errorCorrection === 'L' || style.errorCorrection === 'M')) return 'Q';
  return style.errorCorrection;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/* ------------------------- Readability checks ------------------------- */

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function relativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export function isValidHex(value: string): boolean {
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim());
}

export type ReadabilityIssue =
  | 'lowContrast'
  | 'veryLowContrast'
  | 'inverted'
  | 'logoTooLarge'
  | 'logoLowCorrection'
  | 'noQuietZone'
  | 'transparent';

export function readabilityIssues(style: QrStyle): ReadabilityIssue[] {
  const issues: ReadabilityIssue[] = [];
  const bg = style.transparentBg ? '#ffffff' : style.bgColor;
  const ratio = contrastRatio(style.fgColor, bg);
  if (ratio < 2.5) issues.push('veryLowContrast');
  else if (ratio < 4) issues.push('lowContrast');
  if (relativeLuminance(style.fgColor) > relativeLuminance(bg)) issues.push('inverted');
  if (style.logo && style.logoSize > 0.33) issues.push('logoTooLarge');
  if (style.logo && (style.errorCorrection === 'L' || style.errorCorrection === 'M')) issues.push('logoLowCorrection');
  if (style.marginPercent < 2) issues.push('noQuietZone');
  if (style.transparentBg) issues.push('transparent');
  return issues;
}

/** Severity used for colouring the warning list. */
export function isBlockingIssue(issue: ReadabilityIssue): boolean {
  return issue === 'veryLowContrast';
}

/**
 * qr-code-styling writes clip-path references as url('#id'). Browsers accept that, but
 * several vector tools (Inkscape, resvg, some print RIPs) only accept url(#id).
 * Normalising makes the exported SVG portable.
 */
export function normalizeSvg(svg: string): string {
  return svg.replace(/url\('#([^']+)'\)/g, 'url(#$1)');
}
