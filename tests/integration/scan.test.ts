/**
 * Every QR code below is rendered by the real qr-code-styling library with the
 * app's own option builder, rasterised, and decoded — so these tests prove the
 * generated codes are actually scannable and carry the exact payload.
 */
import { describe, expect, test } from 'vitest';
import { roundTrip, renderSvg } from './qrDecode';
import { buildVCard, buildWifi, normalizeUrl } from '../../src/lib/qr/payloads';
import { CORNER_STYLES, DEFAULT_STYLE, DOT_STYLES, type QrStyle } from '../../src/lib/types';

const style = (patch: Partial<QrStyle> = {}): QrStyle => ({ ...DEFAULT_STYLE, ...patch });

describe('payload round-trips', () => {
  test('website URL', async () => {
    const url = normalizeUrl('agame.uz/games?id=42&ref=qr') as string;
    expect(await roundTrip(url, style())).toBe(url);
  });

  test('vCard with Uzbek and Cyrillic characters', async () => {
    const v = buildVCard({
      firstName: 'Azizbek',
      lastName: 'Qodirov',
      company: 'ООО «Тест», Toshkent',
      jobTitle: 'Dasturchi; muhandis',
      phone: '+998 90 123 45 67',
      email: 'name@example.com',
      website: 'azbek.uz',
      address: 'Amir Temur koʻchasi, 1',
      city: 'Toshkent',
      country: 'Oʻzbekiston',
    });
    expect(await roundTrip(v, style({ errorCorrection: 'Q' }))).toBe(v);
  });

  test('Wi-Fi with escaped characters', async () => {
    const w = buildWifi({ ssid: 'Cafe;Net:5G', password: 'p@ss,"word"\\1', security: 'WPA', hidden: true });
    expect(await roundTrip(w, style())).toBe(w);
  });

  test('long content close to capacity at level L', async () => {
    const long = 'https://example.com/?q=' + 'a'.repeat(1500);
    expect(await roundTrip(long, style({ errorCorrection: 'L' }), 1200)).toBe(long);
  });

  test('content that exceeds QR capacity throws (the UI reports it)', async () => {
    await expect(renderSvg('x'.repeat(5000), style({ errorCorrection: 'H' }))).rejects.toBeDefined();
  });
});

describe('every dot × corner style stays scannable', () => {
  const content = 'https://qrstudio.example/p/coffee-house-k3x9pa';
  for (const dot of DOT_STYLES) {
    for (const corner of CORNER_STYLES) {
      test(`${dot} / ${corner}`, async () => {
        expect(await roundTrip(content, style({ dotStyle: dot, cornerStyle: corner }))).toBe(content);
      });
    }
  }
});

describe('colors, margins and error correction', () => {
  const content = 'https://example.com/menu';
  test.each([
    ['brand blue', { fgColor: '#2f62eb', bgColor: '#ffffff' }],
    ['dark green on tint', { fgColor: '#0b3d2e', bgColor: '#f1f8f4' }],
    ['burgundy on cream', { fgColor: '#6d1d3c', bgColor: '#fff8f3' }],
    ['transparent background', { transparentBg: true }],
    ['no quiet zone', { marginPercent: 0 }],
    ['wide quiet zone', { marginPercent: 12 }],
    ['ECC L', { errorCorrection: 'L' as const }],
    ['ECC H', { errorCorrection: 'H' as const }],
  ])('%s', async (_, patch) => {
    expect(await roundTrip(content, style(patch))).toBe(content);
  });

  test('custom colors are present in the SVG output', async () => {
    const svg = await renderSvg(content, style({ fgColor: '#6d1d3c', bgColor: '#fff8f3' }));
    expect(svg).toContain('#6d1d3c');
    expect(svg).toContain('#fff8f3');
    expect(svg).toMatch(/^<\?xml|^<svg/);
    expect(svg).not.toContain("url('#");
  });
});

describe('independent decoders agree', () => {
  test('ZXing-C++ and jsQR both decode the default style', async () => {
    const { decodeJsQr, decodeZxing, rasterizeSvg } = await import('./qrDecode');
    const content = buildWifi({ ssid: 'Office', password: 'correct horse battery', security: 'WPA', hidden: false });
    const img = rasterizeSvg(await renderSvg(content, style()));
    expect(await decodeZxing(img)).toBe(content);
    expect(decodeJsQr(img)).toBe(content);
  });
});
