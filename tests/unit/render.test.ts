import { describe, expect, test } from 'vitest';
import { buildQrOptions, contrastRatio, effectiveErrorCorrection, normalizeSvg, readabilityIssues, toQrBinary } from '../../src/lib/qr/render';
import { DEFAULT_STYLE } from '../../src/lib/types';
import { isOpenNow } from '../../src/components/public/PageViews';
import { defaultHours } from '../../src/lib/qr/content';

describe('buildQrOptions', () => {
  test('maps style to library options and scales the quiet zone', () => {
    const o = buildQrOptions('hello', { ...DEFAULT_STYLE, dotStyle: 'classy-rounded', cornerStyle: 'extra-rounded', marginPercent: 5 }, { width: 1000, type: 'canvas' });
    expect(o.width).toBe(1000);
    expect(o.margin).toBe(50);
    expect(o.dotsOptions?.type).toBe('classy-rounded');
    expect(o.cornersSquareOptions?.type).toBe('extra-rounded');
    expect(o.cornersDotOptions?.type).toBe('dot');
    expect(o.backgroundOptions?.color).toBe('#ffffff');
    expect(o.image).toBeUndefined();
  });

  test('transparent background, but opaque white for JPEG', () => {
    const style = { ...DEFAULT_STYLE, transparentBg: true, bgColor: '#ff0000' };
    expect(buildQrOptions('x', style, { width: 100, type: 'canvas' }).backgroundOptions?.color).toBe('rgba(0,0,0,0)');
    expect(buildQrOptions('x', style, { width: 100, type: 'canvas', forceOpaque: true }).backgroundOptions?.color).toBe('#ffffff');
  });

  test('logo forces at least Q error correction and clamps size', () => {
    const style = { ...DEFAULT_STYLE, logo: 'data:image/png;base64,AA', errorCorrection: 'L' as const, logoSize: 0.9 };
    expect(effectiveErrorCorrection(style)).toBe('Q');
    const o = buildQrOptions('x', style, { width: 100, type: 'svg' });
    expect(o.qrOptions?.errorCorrectionLevel).toBe('Q');
    expect(o.imageOptions?.imageSize).toBe(0.4);
    expect(o.imageOptions?.hideBackgroundDots).toBe(true);
    expect(effectiveErrorCorrection({ ...style, errorCorrection: 'H' })).toBe('H');
  });

  test('UTF-8 pre-encoding', () => {
    expect(toQrBinary('plain ascii')).toBe('plain ascii');
    expect(toQrBinary('Ж')).toBe('Ð\u0096');
    expect(toQrBinary('oʻ')).toBe('oÊ»');
  });

  test('normalizeSvg rewrites quoted url() references', () => {
    expect(normalizeSvg(`<rect clip-path="url('#clip-1')"/>`)).toBe('<rect clip-path="url(#clip-1)"/>');
  });
});

describe('readability', () => {
  test('contrast ratio', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
  });

  test('default style has no issues', () => {
    expect(readabilityIssues(DEFAULT_STYLE)).toEqual([]);
  });

  test('flags low contrast, inversion, logo and quiet zone problems', () => {
    expect(readabilityIssues({ ...DEFAULT_STYLE, fgColor: '#cccccc' })).toContain('veryLowContrast');
    expect(readabilityIssues({ ...DEFAULT_STYLE, fgColor: '#8a8a8a' })).toContain('lowContrast');
    expect(readabilityIssues({ ...DEFAULT_STYLE, fgColor: '#ffffff', bgColor: '#000000' })).toContain('inverted');
    const logo = { ...DEFAULT_STYLE, logo: 'data:', logoSize: 0.38, errorCorrection: 'M' as const };
    expect(readabilityIssues(logo)).toEqual(expect.arrayContaining(['logoTooLarge', 'logoLowCorrection']));
    expect(readabilityIssues({ ...DEFAULT_STYLE, marginPercent: 0 })).toContain('noQuietZone');
    expect(readabilityIssues({ ...DEFAULT_STYLE, transparentBg: true })).toContain('transparent');
  });
});

describe('business hours', () => {
  // 2026-11-16 is a Monday.
  const at = (day: number, hh: number, mm = 0) => new Date(2026, 10, 16 + day, hh, mm);
  test('default Mon–Fri 09:00–18:00', () => {
    const h = defaultHours();
    expect(isOpenNow(h, at(0, 9))).toBe(true);
    expect(isOpenNow(h, at(0, 8, 59))).toBe(false);
    expect(isOpenNow(h, at(4, 17, 59))).toBe(true);
    expect(isOpenNow(h, at(4, 18))).toBe(false);
    expect(isOpenNow(h, at(5, 12))).toBe(false);
  });
  test('overnight hours carry into the next day', () => {
    const h = defaultHours().map((d) => (d.day === 4 ? { ...d, open: '18:00', close: '02:00' } : d));
    expect(isOpenNow(h, at(4, 23))).toBe(true);
    expect(isOpenNow(h, at(5, 1, 30))).toBe(true);
    expect(isOpenNow(h, at(5, 2, 30))).toBe(false);
  });
});
