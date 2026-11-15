import { requireSupabase, STORAGE_BUCKET } from './supabase';
import { makeSlug, publicBaseUrl } from './qr/payloads';
import {
  PAGE_ROUTE_PREFIX,
  type AnyQrData,
  type BusinessData,
  type ImagesData,
  type PageKind,
  type PageRecord,
  type PdfData,
  type QrRecord,
  type QrStyle,
  type QrType,
  type SocialData,
  type StoredFile,
} from './types';

/* ------------------------------ Storage ------------------------------ */

function uuid(): string {
  return crypto.randomUUID();
}

export async function uploadFile(blob: Blob, folder: 'pdf' | 'images' | 'avatars' | 'logos', ext: string): Promise<StoredFile> {
  const sb = requireSupabase();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) throw new Error('not-authenticated');
  const path = `${auth.user.id}/${folder}/${uuid()}.${ext}`;
  const { error } = await sb.storage.from(STORAGE_BUCKET).upload(path, blob, {
    cacheControl: '31536000',
    contentType: blob.type || undefined,
    upsert: false,
  });
  if (error) throw error;
  const { data } = sb.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  return { path, url: data.publicUrl };
}

export async function removeFiles(paths: string[]): Promise<void> {
  const unique = [...new Set(paths.filter(Boolean))];
  if (!unique.length) return;
  const sb = requireSupabase();
  const { error } = await sb.storage.from(STORAGE_BUCKET).remove(unique);
  if (error) throw error;
}

/** All storage paths referenced by a QR's data (used for cleanup). */
export function filePathsOf(type: QrType, data: AnyQrData): string[] {
  switch (type) {
    case 'pdf':
      return (data as PdfData).source === 'upload' && (data as PdfData).file ? [(data as PdfData).file!.path] : [];
    case 'images':
      return (data as ImagesData).images.map((i) => i.path);
    case 'social':
      return (data as SocialData).avatar ? [(data as SocialData).avatar!.path] : [];
    case 'business':
      return (data as BusinessData).logo ? [(data as BusinessData).logo!.path] : [];
    default:
      return [];
  }
}

/* ------------------------------- Pages ------------------------------- */

export function pageUrl(kind: PageKind, slug: string): string {
  return `${publicBaseUrl()}/${PAGE_ROUTE_PREFIX[kind]}/${slug}`;
}

export async function createPage<T extends object>(kind: PageKind, title: string, data: T): Promise<PageRecord<T>> {
  const sb = requireSupabase();
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = makeSlug(title);
    const { data: row, error } = await sb
      .from('pages')
      .insert({ kind, slug, title: title.slice(0, 120), data })
      .select()
      .single();
    if (!error) return row as PageRecord<T>;
    if (error.code !== '23505') throw error; // unique violation → retry with a new slug
  }
  throw new Error('slug-generation-failed');
}

export async function updatePage<T extends object>(id: string, title: string, data: T): Promise<PageRecord<T>> {
  const sb = requireSupabase();
  const { data: row, error } = await sb
    .from('pages')
    .update({ title: title.slice(0, 120), data })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return row as PageRecord<T>;
}

export interface PublicPage<T> {
  kind: PageKind;
  slug: string;
  title: string;
  data: T;
  updated_at: string;
}

export async function getPublicPage<T>(kind: PageKind, slug: string): Promise<PublicPage<T> | null> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc('get_public_page', { p_kind: kind, p_slug: slug });
  if (error) throw error;
  const rows = (data ?? []) as PublicPage<T>[];
  return rows[0] ?? null;
}

/* ------------------------------ QR codes ------------------------------ */

const QR_SELECT = 'id,user_id,type,name,folder,content,data,style,page_id,created_at,updated_at,page:pages(slug,kind)';

export async function listQrCodes(): Promise<QrRecord[]> {
  const sb = requireSupabase();
  const { data, error } = await sb.from('qr_codes').select(QR_SELECT).order('created_at', { ascending: false }).limit(1000);
  if (error) throw error;
  return (data ?? []) as unknown as QrRecord[];
}

export async function getQrCode(id: string): Promise<QrRecord | null> {
  const sb = requireSupabase();
  const { data, error } = await sb.from('qr_codes').select(QR_SELECT).eq('id', id).maybeSingle();
  if (error) throw error;
  return (data as unknown as QrRecord) ?? null;
}

export interface QrInput {
  type: QrType;
  name: string;
  folder?: string | null;
  content: string;
  data: AnyQrData;
  style: QrStyle;
  page_id?: string | null;
}

export async function createQrCode(input: QrInput): Promise<QrRecord> {
  const sb = requireSupabase();
  const { data, error } = await sb.from('qr_codes').insert(input).select(QR_SELECT).single();
  if (error) throw error;
  return data as unknown as QrRecord;
}

export async function updateQrCode(id: string, patch: Partial<QrInput>): Promise<QrRecord> {
  const sb = requireSupabase();
  const { data, error } = await sb.from('qr_codes').update(patch).eq('id', id).select(QR_SELECT).single();
  if (error) throw error;
  return data as unknown as QrRecord;
}

/** Deletes a QR code, its hosted page, and its uploaded files. */
export async function deleteQrCode(record: QrRecord): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from('qr_codes').delete().eq('id', record.id);
  if (error) throw error;
  if (record.page_id) {
    const { error: pageError } = await sb.from('pages').delete().eq('id', record.page_id);
    if (pageError) throw pageError;
  }
  // Duplicated QR codes may share files; only remove files no other record uses.
  const paths = filePathsOf(record.type, record.data);
  if (paths.length) {
    const { data: others } = await sb.from('qr_codes').select('type,data').eq('type', record.type);
    const stillUsed = new Set((others ?? []).flatMap((o) => filePathsOf(o.type as QrType, o.data as AnyQrData)));
    await removeFiles(paths.filter((p) => !stillUsed.has(p))).catch(() => undefined);
  }
}

/** Creates an independent copy. Page-based QR codes get their own new page (new URL). */
export async function duplicateQrCode(record: QrRecord, copySuffix: string): Promise<QrRecord> {
  const name = `${record.name} ${copySuffix}`.slice(0, 120);
  let pageId: string | null = null;
  let content = record.content;
  if (record.page_id && record.page) {
    const page = await createPage(record.page.kind, name, record.data as object);
    pageId = page.id;
    content = pageUrl(page.kind, page.slug);
  }
  return createQrCode({
    type: record.type,
    name,
    folder: record.folder,
    content,
    data: record.data,
    style: record.style,
    page_id: pageId,
  });
}

/** After an edit, removes uploaded files that are no longer referenced by this or any other QR code. */
export async function cleanupRemovedFiles(type: QrType, before: AnyQrData, after: AnyQrData): Promise<void> {
  const keep = new Set(filePathsOf(type, after));
  const removed = filePathsOf(type, before).filter((p) => !keep.has(p));
  if (!removed.length) return;
  const sb = requireSupabase();
  const { data: others } = await sb.from('qr_codes').select('type,data').eq('type', type);
  const stillUsed = new Set((others ?? []).flatMap((o) => filePathsOf(o.type as QrType, o.data as AnyQrData)));
  await removeFiles(removed.filter((p) => !stillUsed.has(p)));
}

export async function deletePage(id: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from('pages').delete().eq('id', id);
  if (error) throw error;
}
