import QRCodeStyling from 'qr-code-styling';
import type { QrStyle } from '../types';
import { buildQrOptions, normalizeSvg, type ExportFormat } from './render';

const MIME: Record<ExportFormat, string> = {
  png: 'image/png',
  svg: 'image/svg+xml',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

/**
 * Renders the QR code at export resolution and returns a Blob.
 * SVG output is a true vector document (not a rasterised image).
 */
export async function renderQrBlob(content: string, style: QrStyle, format: ExportFormat, size = style.size): Promise<Blob> {
  const width = Math.round(Math.min(4096, Math.max(128, size)));
  const options = buildQrOptions(content, style, {
    width,
    type: format === 'svg' ? 'svg' : 'canvas',
    forceOpaque: format === 'jpeg',
  });
  const qr = new QRCodeStyling(options);
  const raw = await qr.getRawData(format);
  if (!raw) throw new Error('QR rendering failed');
  if (format === 'svg') {
    const text = raw instanceof Blob ? await raw.text() : String(raw);
    return new Blob([normalizeSvg(text)], { type: MIME.svg });
  }
  const blob = raw as Blob;
  // Some browsers silently fall back to PNG when WebP encoding is unsupported.
  if (blob.type && blob.type !== MIME[format]) {
    throw new Error(`format-unsupported:${format}`);
  }
  return blob;
}

export function safeFileName(name: string): string {
  const cleaned = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return cleaned || 'qr-code';
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export async function downloadQr(content: string, style: QrStyle, format: ExportFormat, name: string): Promise<void> {
  const blob = await renderQrBlob(content, style, format);
  const ext = format === 'jpeg' ? 'jpg' : format;
  downloadBlob(blob, `${safeFileName(name)}.${ext}`);
}

/** Prints the QR code via a hidden iframe (no pop-up blockers involved). */
export async function printQr(content: string, style: QrStyle, title: string): Promise<void> {
  const blob = await renderQrBlob(content, { ...style, transparentBg: false }, 'svg', 1024);
  const svg = await blob.text();
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument;
  if (!doc) {
    iframe.remove();
    throw new Error('print-unavailable');
  }
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);
  doc.open();
  doc.write(`<!doctype html><html><head><title>${esc(title)}</title><style>
    @page{margin:16mm}html,body{margin:0;height:100%}
    body{display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:Inter,system-ui,sans-serif;color:#151923}
    .qr{width:90mm;height:90mm}.qr svg{width:100%;height:100%}p{margin:6mm 0 0;font-size:12pt}
  </style></head><body><div class="qr">${svg.replace(/^<\?xml[^>]*>/, '')}</div>${title ? `<p>${esc(title)}</p>` : ''}</body></html>`);
  doc.close();
  await new Promise((r) => setTimeout(r, 250));
  iframe.contentWindow?.focus();
  iframe.contentWindow?.print();
  setTimeout(() => iframe.remove(), 60_000);
}
