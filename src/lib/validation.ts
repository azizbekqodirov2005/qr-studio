import { z } from 'zod';
import type { Dict } from '../i18n/uz';
import { normalizeUrl, socialUrl } from './qr/payloads';
import { LIMITS } from './files';
import { SOCIAL_PLATFORMS, type QrDataMap, type QrType } from './types';

export type FieldErrors = Record<string, string>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@.]{2,}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isValidEmail(v: string): boolean {
  return EMAIL_RE.test(v.trim());
}

export function isValidPhone(v: string): boolean {
  const s = v.trim();
  if (!/^\+?[\d\s().-]+$/.test(s)) return false;
  const digits = s.replace(/\D/g, '').length;
  return digits >= 7 && digits <= 15;
}

function utf8Length(s: string): number {
  return new TextEncoder().encode(s).length;
}

export function makeSchemas(t: Dict) {
  const v = t.validation;
  const optionalText = (max: number) => z.string().max(max, v.maxLength(max));
  const requiredText = (max: number, msg = v.required) => z.string().trim().min(1, msg).max(max, v.maxLength(max));
  const optionalUrl = z
    .string()
    .max(2000, v.maxLength(2000))
    .refine((s) => !s.trim() || normalizeUrl(s) !== null, v.url);
  const optionalEmail = z
    .string()
    .max(254, v.maxLength(254))
    .refine((s) => !s.trim() || isValidEmail(s), v.email);
  const optionalPhone = z
    .string()
    .max(30, v.maxLength(30))
    .refine((s) => !s.trim() || isValidPhone(s), v.phone);

  const storedFile = z.object({ path: z.string().min(1), url: z.string().url() });

  const socialLink = z
    .object({ id: z.string(), platform: z.enum(SOCIAL_PLATFORMS), value: z.string().max(300, v.maxLength(300)) })
    .superRefine((link, ctx) => {
      if (!link.value.trim()) ctx.addIssue({ code: 'custom', path: ['value'], message: v.required });
      else if (!socialUrl(link.platform, link.value)) ctx.addIssue({ code: 'custom', path: ['value'], message: t.social.invalidLink });
    });

  const url = z.object({
    url: z
      .string()
      .trim()
      .min(1, v.required)
      .max(2000, v.maxLength(2000))
      .refine((s) => normalizeUrl(s) !== null, v.url),
  });

  const vcard = z
    .object({
      firstName: optionalText(60),
      lastName: optionalText(60),
      company: optionalText(100),
      jobTitle: optionalText(100),
      phone: optionalPhone,
      email: optionalEmail,
      website: optionalUrl,
      address: optionalText(150),
      city: optionalText(80),
      country: optionalText(80),
    })
    .superRefine((d, ctx) => {
      if (!d.firstName.trim() && !d.lastName.trim() && !d.company.trim()) {
        ctx.addIssue({ code: 'custom', path: ['firstName'], message: t.vcard.nameRequired });
      }
    });

  const wifi = z
    .object({
      ssid: z
        .string()
        .min(1, v.required)
        .refine((s) => utf8Length(s) <= 32, v.maxLength(32)),
      password: z.string().max(63, v.maxLength(63)),
      security: z.enum(['WPA', 'WEP', 'nopass']),
      hidden: z.boolean(),
    })
    .superRefine((d, ctx) => {
      if (d.security === 'WPA') {
        if (!d.password) ctx.addIssue({ code: 'custom', path: ['password'], message: v.required });
        else if (d.password.length < 8 || d.password.length > 63) ctx.addIssue({ code: 'custom', path: ['password'], message: v.wpaLength });
      } else if (d.security === 'WEP') {
        const p = d.password;
        const ok = p.length === 5 || p.length === 13 || (/^[0-9a-f]+$/i.test(p) && (p.length === 10 || p.length === 26));
        if (!p) ctx.addIssue({ code: 'custom', path: ['password'], message: v.required });
        else if (!ok) ctx.addIssue({ code: 'custom', path: ['password'], message: v.wepLength });
      }
    });

  const pdf = z
    .object({
      source: z.enum(['upload', 'url']),
      url: z.string().max(2000, v.maxLength(2000)),
      file: storedFile.extend({ name: z.string(), size: z.number() }).nullable(),
    })
    .superRefine((d, ctx) => {
      if (d.source === 'upload') {
        if (!d.file) ctx.addIssue({ code: 'custom', path: ['file'], message: t.pdf.fileRequired });
      } else if (!d.url.trim()) {
        ctx.addIssue({ code: 'custom', path: ['url'], message: v.required });
      } else if (!normalizeUrl(d.url)) {
        ctx.addIssue({ code: 'custom', path: ['url'], message: v.url });
      }
    });

  const images = z.object({
    title: requiredText(120),
    description: optionalText(500),
    images: z
      .array(storedFile.extend({ id: z.string(), width: z.number().optional(), height: z.number().optional() }))
      .min(1, t.images.atLeastOne)
      .max(LIMITS.galleryImages, t.images.tooMany(LIMITS.galleryImages)),
  });

  const social = z.object({
    name: requiredText(80),
    description: optionalText(300),
    avatar: storedFile.nullable(),
    links: z.array(socialLink).min(1, t.social.atLeastOne).max(20),
  });

  const workingDay = z
    .object({ day: z.number().int().min(0).max(6), closed: z.boolean(), open: z.string(), close: z.string() })
    .superRefine((d, ctx) => {
      if (d.closed) return;
      if (!TIME_RE.test(d.open)) ctx.addIssue({ code: 'custom', path: ['open'], message: v.time });
      if (!TIME_RE.test(d.close)) ctx.addIssue({ code: 'custom', path: ['close'], message: v.time });
      // Overnight hours (e.g. 18:00–02:00) are allowed; identical times are not.
      if (TIME_RE.test(d.open) && TIME_RE.test(d.close) && d.open === d.close) {
        ctx.addIssue({ code: 'custom', path: ['close'], message: v.timeOrder });
      }
    });

  const business = z.object({
    name: requiredText(100, t.business.nameRequired),
    description: optionalText(600),
    logo: storedFile.nullable(),
    phone: optionalPhone,
    email: optionalEmail,
    website: optionalUrl,
    address: optionalText(200),
    mapsUrl: optionalUrl,
    hours: z.array(workingDay).length(7),
    links: z.array(socialLink).max(20),
  });

  return { url, vcard, wifi, pdf, images, social, business } satisfies Record<QrType, z.ZodType>;
}

export type Schemas = ReturnType<typeof makeSchemas>;

export function validateData<T extends QrType>(schemas: Schemas, type: T, data: QrDataMap[T]): FieldErrors {
  const result = (schemas[type] as z.ZodType).safeParse(data);
  if (result.success) return {};
  const errors: FieldErrors = {};
  for (const issue of result.error.issues) {
    const key = issue.path.map(String).join('.') || '_';
    if (!errors[key]) errors[key] = issue.message;
  }
  return errors;
}
