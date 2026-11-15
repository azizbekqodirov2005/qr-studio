/**
 * Test helper: renders a QR code with the real qr-code-styling library (SVG output,
 * in jsdom), rasterises the SVG with resvg, and decodes it with jsQR — the same
 * pipeline a phone camera goes through, minus the camera.
 */
import QRCodeStyling from 'qr-code-styling';
import { JSDOM } from 'jsdom';
import { Resvg } from '@resvg/resvg-js';
import jsQR from 'jsqr';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader';

// Load the ZXing-C++ WebAssembly build from node_modules (no CDN).
const require = createRequire(import.meta.url);
const wasmPath = require.resolve('zxing-wasm/reader').replace(/dist[\\/]cjs[\\/]reader[\\/]index\.js$|dist[\\/]es[\\/]reader[\\/]index\.js$/, 'dist/reader/zxing_reader.wasm');
const ready = prepareZXingModule({
  overrides: { wasmBinary: readFileSync(wasmPath).buffer as ArrayBuffer },
  fireImmediately: true,
});
import { buildQrOptions, normalizeSvg } from '../../src/lib/qr/render';
import type { QrStyle } from '../../src/lib/types';

export async function renderSvg(content: string, style: QrStyle, width = 600): Promise<string> {
  const options = buildQrOptions(content, style, { width, type: 'svg' });
  const qr = new QRCodeStyling({ ...options, jsdom: JSDOM as never });
  const raw = await qr.getRawData('svg');
  if (!raw) throw new Error('No SVG output');
  return normalizeSvg(Buffer.isBuffer(raw) ? raw.toString('utf8') : await (raw as Blob).text());
}

export interface RGBA {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export function rasterizeSvg(svg: string, background = '#ffffff', width = 800): RGBA {
  const png = new Resvg(svg, { background, fitTo: { mode: 'width', value: width } }).render();
  return { data: new Uint8ClampedArray(png.pixels), width: png.width, height: png.height };
}

/**
 * Decodes with ZXing-C++ (the engine used by most Android scanner apps) — the
 * reference decoder. Returns the payload as UTF-8 text.
 */
export async function decodeZxing(img: RGBA): Promise<string | null> {
  await ready;
  const results = await readBarcodes({ data: img.data, width: img.width, height: img.height, colorSpace: 'srgb' } as ImageData, {
    formats: ['QRCode'],
    tryHarder: true,
    textMode: 'Plain',
    characterSet: 'UTF8',
  });
  const r = results.find((x) => x.isValid);
  return r ? new TextDecoder('utf-8').decode(r.bytes) : null;
}

/** Secondary decoder (jsQR). Stricter about finder-pattern shapes than phone cameras. */
export function decodeJsQr(img: RGBA): string | null {
  const result = jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' });
  return result ? Buffer.from(result.binaryData).toString('utf8') : null;
}

export async function decodeSvg(svg: string, background = '#ffffff'): Promise<string | null> {
  return decodeZxing(rasterizeSvg(svg, background));
}

export async function roundTrip(content: string, style: QrStyle, width = 600): Promise<string | null> {
  return decodeSvg(await renderSvg(content, style, width));
}
