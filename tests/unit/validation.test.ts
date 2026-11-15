import { describe, expect, test } from 'vitest';
import uz from '../../src/i18n/uz';
import ru from '../../src/i18n/ru';
import en from '../../src/i18n/en';
import { isValidEmail, isValidPhone, makeSchemas, validateData } from '../../src/lib/validation';
import { buildContent, defaultData, suggestName } from '../../src/lib/qr/content';
import type { QrDataMap } from '../../src/lib/types';

const schemas = makeSchemas(en);

describe('field validators', () => {
  test('email', () => {
    expect(isValidEmail('a@b.co')).toBe(true);
    expect(isValidEmail(' name.surname+tag@sub.example.uz ')).toBe(true);
    for (const bad of ['a@b', 'a@b.c', 'a b@c.com', '@c.com', 'a@.com', 'plain']) expect(isValidEmail(bad)).toBe(false);
  });

  test('phone', () => {
    expect(isValidPhone('+998 90 123 45 67')).toBe(true);
    expect(isValidPhone('(90) 123-45-67')).toBe(true);
    for (const bad of ['123', '+998 90 abc 45 67', '1234567890123456']) expect(isValidPhone(bad)).toBe(false);
  });
});

describe('url', () => {
  test('requires a valid address', () => {
    expect(validateData(schemas, 'url', { url: '' })).toEqual({ url: en.validation.required });
    expect(validateData(schemas, 'url', { url: 'not valid' })).toEqual({ url: en.validation.url });
    expect(validateData(schemas, 'url', { url: 'example.com' })).toEqual({});
  });
});

describe('vcard', () => {
  test('requires a name or company; validates optional fields only when filled', () => {
    const empty = defaultData('vcard');
    expect(validateData(schemas, 'vcard', empty)).toEqual({ firstName: en.vcard.nameRequired });
    expect(validateData(schemas, 'vcard', { ...empty, company: 'Acme' })).toEqual({});
    const bad = validateData(schemas, 'vcard', { ...empty, firstName: 'A', email: 'bad', phone: 'x', website: 'nope' });
    expect(bad).toEqual({ email: en.validation.email, phone: en.validation.phone, website: en.validation.url });
  });
});

describe('wifi', () => {
  const base: QrDataMap['wifi'] = { ssid: 'Net', password: '', security: 'WPA', hidden: false };
  test('WPA needs 8–63 chars', () => {
    expect(validateData(schemas, 'wifi', base)).toEqual({ password: en.validation.required });
    expect(validateData(schemas, 'wifi', { ...base, password: 'short' })).toEqual({ password: en.validation.wpaLength });
    expect(validateData(schemas, 'wifi', { ...base, password: 'longenough' })).toEqual({});
  });
  test('WEP accepts 5/13 ASCII or 10/26 hex', () => {
    const wep = { ...base, security: 'WEP' as const };
    expect(validateData(schemas, 'wifi', { ...wep, password: 'abcde' })).toEqual({});
    expect(validateData(schemas, 'wifi', { ...wep, password: '0123456789' })).toEqual({});
    expect(validateData(schemas, 'wifi', { ...wep, password: 'abcdef' })).toEqual({ password: en.validation.wepLength });
  });
  test('open networks need no password; SSID max 32 bytes', () => {
    expect(validateData(schemas, 'wifi', { ...base, security: 'nopass' })).toEqual({});
    expect(validateData(schemas, 'wifi', { ...base, security: 'nopass', ssid: 'ж'.repeat(17) })).toEqual({ ssid: en.validation.maxLength(32) });
  });
});

describe('pdf', () => {
  test('upload mode needs a file; url mode needs a valid URL', () => {
    expect(validateData(schemas, 'pdf', defaultData('pdf'))).toEqual({ file: en.pdf.fileRequired });
    expect(validateData(schemas, 'pdf', { source: 'url', url: 'x', file: null })).toEqual({ url: en.validation.url });
    expect(validateData(schemas, 'pdf', { source: 'url', url: 'example.com/a.pdf', file: null })).toEqual({});
  });
});

describe('page types', () => {
  test('social requires name and at least one valid link', () => {
    const d = defaultData('social');
    expect(validateData(schemas, 'social', d)).toEqual({ name: en.validation.required, links: en.social.atLeastOne });
    const withBad = { ...d, name: 'A', links: [{ id: '1', platform: 'instagram' as const, value: 'https://evil.com/x' }] };
    expect(validateData(schemas, 'social', withBad)).toEqual({ 'links.0.value': en.social.invalidLink });
    expect(validateData(schemas, 'social', { ...withBad, links: [{ id: '1', platform: 'instagram' as const, value: '@ok' }] })).toEqual({});
  });

  test('business validates hours and optional contacts', () => {
    const d = { ...defaultData('business'), name: 'Coffee' };
    expect(validateData(schemas, 'business', d)).toEqual({});
    const hours = d.hours.map((h, i) => (i === 0 ? { ...h, open: '25:00' } : i === 1 ? { ...h, open: '10:00', close: '10:00' } : h));
    expect(validateData(schemas, 'business', { ...d, hours, mapsUrl: 'nope' })).toEqual({
      'hours.0.open': en.validation.time,
      'hours.1.close': en.validation.timeOrder,
      mapsUrl: en.validation.url,
    });
    // Overnight hours are fine.
    const overnight = d.hours.map((h, i) => (i === 4 ? { ...h, closed: false, open: '18:00', close: '02:00' } : h));
    expect(validateData(schemas, 'business', { ...d, hours: overnight })).toEqual({});
  });

  test('images requires title and 1–30 images', () => {
    const d = defaultData('images');
    expect(validateData(schemas, 'images', d)).toEqual({ title: en.validation.required, images: en.images.atLeastOne });
    const img = { id: 'a', path: 'u/images/a.webp', url: 'https://x.supabase.co/storage/v1/object/public/qr-files/u/images/a.webp' };
    expect(validateData(schemas, 'images', { ...d, title: 'G', images: [img] })).toEqual({});
    expect(validateData(schemas, 'images', { ...d, title: 'G', images: Array(31).fill(img) })).toEqual({ images: en.images.tooMany(30) });
  });
});

describe('content', () => {
  test('static payloads', () => {
    expect(buildContent('url', { url: 'agame.uz' })).toBe('https://agame.uz/');
    expect(buildContent('wifi', { ssid: 'A', password: 'p', security: 'nopass', hidden: false })).toBe('WIFI:T:nopass;S:A;;');
    expect(buildContent('pdf', { source: 'url', url: 'x.io/a.pdf', file: null })).toBe('https://x.io/a.pdf');
    expect(buildContent('pdf', { source: 'upload', url: '', file: { path: 'p', url: 'https://s/p.pdf', name: 'a.pdf', size: 1 } })).toBe('https://s/p.pdf');
  });
  test('page types need a published page URL', () => {
    expect(buildContent('social', defaultData('social'))).toBeNull();
    expect(buildContent('social', defaultData('social'), 'https://qr.example/p/abc-123456')).toBe('https://qr.example/p/abc-123456');
  });
  test('suggested names', () => {
    expect(suggestName('url', { url: 'www.agame.uz/play' }, 'X')).toBe('agame.uz');
    expect(suggestName('vcard', { ...defaultData('vcard'), firstName: 'Azizbek', lastName: 'Qodirov' }, 'X')).toBe('Azizbek Qodirov');
    expect(suggestName('pdf', { source: 'url', url: 'x.io/docs/Menu%20Card.pdf', file: null }, 'X')).toBe('Menu Card');
    expect(suggestName('wifi', defaultData('wifi'), 'Wi-Fi')).toBe('Wi-Fi');
  });
});

describe('translations', () => {
  function shape(value: unknown): unknown {
    if (typeof value === 'function') return `fn/${value.length}`;
    if (Array.isArray(value)) return value.map(shape);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shape(v)]));
    return typeof value;
  }

  test('ru and en have exactly the same keys as uz', () => {
    expect(shape(ru)).toEqual(shape(uz));
    expect(shape(en)).toEqual(shape(uz));
  });

  test('no empty strings and no leftover untranslated Uzbek in ru/en', () => {
    const strings = (o: unknown): string[] =>
      typeof o === 'string' ? [o] : Array.isArray(o) ? o.flatMap(strings) : o && typeof o === 'object' ? Object.values(o).flatMap(strings) : [];
    for (const dict of [uz, ru, en]) for (const s of strings(dict)) expect(s.trim().length).toBeGreaterThan(0);
    const uzOnly = /\b(boʻlishi|kerak|uchun|yoki|hisob)\b/;
    for (const dict of [ru, en]) for (const s of strings(dict)) expect(s).not.toMatch(uzOnly);
  });

  test('every language produces translated validation messages', () => {
    for (const dict of [uz, ru, en]) {
      const s = makeSchemas(dict);
      expect(validateData(s, 'url', { url: '' }).url).toBe(dict.validation.required);
    }
  });
});
