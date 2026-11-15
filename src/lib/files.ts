export const LIMITS = {
  pdfBytes: 20 * 1024 * 1024,
  imageBytes: 15 * 1024 * 1024,
  logoBytes: 5 * 1024 * 1024,
  galleryImages: 30,
  galleryMaxEdge: 2000,
  avatarMaxEdge: 640,
  qrLogoMaxEdge: 512,
} as const;

export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export type FileCheck = { ok: true } | { ok: false; reason: 'type' | 'size' | 'corrupt' };

/** Checks the magic bytes as well as the declared MIME type. */
export async function checkPdf(file: File): Promise<FileCheck> {
  if (file.type && file.type !== 'application/pdf') return { ok: false, reason: 'type' };
  if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') return { ok: false, reason: 'type' };
  if (file.size > LIMITS.pdfBytes) return { ok: false, reason: 'size' };
  const head = new Uint8Array(await file.slice(0, 5).arrayBuffer());
  const magic = String.fromCharCode(...head);
  if (magic !== '%PDF-') return { ok: false, reason: 'corrupt' };
  return { ok: true };
}

export async function checkImage(file: File, maxBytes: number = LIMITS.imageBytes): Promise<FileCheck> {
  if (!(IMAGE_TYPES as readonly string[]).includes(file.type)) return { ok: false, reason: 'type' };
  if (file.size > maxBytes) return { ok: false, reason: 'size' };
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const isJpeg = head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
  const isPng = head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47;
  const isWebp = String.fromCharCode(...head.slice(0, 4)) === 'RIFF' && String.fromCharCode(...head.slice(8, 12)) === 'WEBP';
  if (!isJpeg && !isPng && !isWebp) return { ok: false, reason: 'corrupt' };
  return { ok: true };
}

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('image-decode-failed'));
    };
    img.src = url;
  });
}

let webpSupport: boolean | null = null;
function canEncodeWebp(): boolean {
  if (webpSupport === null) {
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    webpSupport = c.toDataURL('image/webp').startsWith('data:image/webp');
  }
  return webpSupport;
}

export interface ResizedImage {
  blob: Blob;
  width: number;
  height: number;
  ext: 'webp' | 'jpg' | 'png';
}

/**
 * Downscales an image so its longest edge is ≤ maxEdge and re-encodes it
 * (WebP when supported). Strips EXIF metadata (incl. GPS) as a side effect.
 */
export async function resizeImage(file: File, maxEdge: number, opts: { keepAlpha?: boolean; quality?: number } = {}): Promise<ResizedImage> {
  const img = await loadImage(file);
  const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas-unavailable');
  ctx.imageSmoothingQuality = 'high';
  const webp = canEncodeWebp();
  if (!webp && !opts.keepAlpha) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
  }
  ctx.drawImage(img, 0, 0, width, height);
  const type = webp ? 'image/webp' : opts.keepAlpha ? 'image/png' : 'image/jpeg';
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, type, opts.quality ?? 0.86));
  if (!blob) throw new Error('encode-failed');
  return { blob, width, height, ext: webp ? 'webp' : opts.keepAlpha ? 'png' : 'jpg' };
}

/** Resizes a logo for embedding into the QR (data URL, keeps transparency). */
export async function logoToDataUrl(file: File): Promise<string> {
  const img = await loadImage(file);
  const scale = Math.min(1, LIMITS.qrLogoMaxEdge / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas-unavailable');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
