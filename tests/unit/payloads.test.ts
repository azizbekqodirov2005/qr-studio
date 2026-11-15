import { describe, expect, test } from 'vitest';
import {
  buildVCard,
  buildWifi,
  escapeVCard,
  escapeWifi,
  isPdfUrl,
  makeSlug,
  normalizePhone,
  normalizeUrl,
  slugify,
  socialUrl,
  SLUG_RE,
} from '../../src/lib/qr/payloads';
import type { VCardData } from '../../src/lib/types';

describe('normalizeUrl', () => {
  test.each([
    ['example.com', 'https://example.com/'],
    ['  example.com/path?q=1  ', 'https://example.com/path?q=1'],
    ['http://example.com', 'http://example.com/'],
    ['HTTPS://Example.COM/A', 'https://example.com/A'],
    ['www.agame.uz', 'https://www.agame.uz/'],
    ['//cdn.example.org/x', 'https://cdn.example.org/x'],
    ['sub.domain.co.uk:8080/a#b', 'https://sub.domain.co.uk:8080/a#b'],
    ['192.168.1.10/admin', 'https://192.168.1.10/admin'],
    ['пример.рф', 'https://xn--e1afmkfd.xn--p1ai/'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeUrl(input)).toBe(expected);
  });

  test.each(['', '   ', 'example', 'exa mple.com', 'ftp://example.com', 'javascript:alert(1)', 'mailto:a@b.co', 'http://', 'https://.com', 'example.c'])(
    'rejects %j',
    (input) => {
      expect(normalizeUrl(input)).toBeNull();
    },
  );

  test('isPdfUrl', () => {
    expect(isPdfUrl('https://x.io/docs/menu.PDF')).toBe(true);
    expect(isPdfUrl('https://x.io/docs/menu.pdf?download=1')).toBe(true);
    expect(isPdfUrl('https://x.io/docs/menu')).toBe(false);
  });
});

const card: VCardData = {
  firstName: 'Azizbek',
  lastName: 'Qodirov',
  company: 'AzbekDev, LLC',
  jobTitle: 'Full-stack; developer',
  phone: '+998 (90) 123-45-67',
  email: 'name@example.com',
  website: 'azbek.uz',
  address: 'Amir Temur 1\nFloor 2',
  city: 'Toshkent',
  country: 'Oʻzbekiston',
};

describe('vCard', () => {
  test('escapes special characters per RFC 2426', () => {
    expect(escapeVCard('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne');
  });

  test('normalizes phone numbers', () => {
    expect(normalizePhone('+998 (90) 123-45-67')).toBe('+998901234567');
    expect(normalizePhone('90 123 45 67')).toBe('901234567');
  });

  test('builds a complete vCard 3.0 with CRLF line endings', () => {
    const v = buildVCard(card);
    const lines = v.split('\r\n');
    expect(lines[0]).toBe('BEGIN:VCARD');
    expect(lines[1]).toBe('VERSION:3.0');
    expect(lines).toContain('N:Qodirov;Azizbek;;;');
    expect(lines).toContain('FN:Azizbek Qodirov');
    expect(lines).toContain('ORG:AzbekDev\\, LLC');
    expect(lines).toContain('TITLE:Full-stack\\; developer');
    expect(lines).toContain('TEL;TYPE=CELL:+998901234567');
    expect(lines).toContain('EMAIL;TYPE=INTERNET:name@example.com');
    expect(lines).toContain('URL:https://azbek.uz/');
    expect(lines).toContain('ADR;TYPE=WORK:;;Amir Temur 1\\nFloor 2;Toshkent;;;Oʻzbekiston');
    expect(lines.at(-1)).toBe('END:VCARD');
    expect(v).not.toMatch(/[^\r]\n/);
  });

  test('omits empty optional fields and falls back to company for FN', () => {
    const v = buildVCard({ ...card, firstName: '', lastName: '', jobTitle: '', phone: '', email: '', website: '', address: '', city: '', country: '' });
    expect(v).toBe(['BEGIN:VCARD', 'VERSION:3.0', 'N:;;;;', 'FN:AzbekDev\\, LLC', 'ORG:AzbekDev\\, LLC', 'END:VCARD'].join('\r\n'));
  });
});

describe('Wi-Fi', () => {
  test('escapes \\ ; , : and "', () => {
    expect(escapeWifi('a\\b;c,d:e"f')).toBe('a\\\\b\\;c\\,d\\:e\\"f');
  });

  test('WPA network', () => {
    expect(buildWifi({ ssid: 'Cafe WiFi', password: 'secret123', security: 'WPA', hidden: false })).toBe('WIFI:T:WPA;S:Cafe WiFi;P:secret123;;');
  });

  test('hidden WEP network with special characters', () => {
    expect(buildWifi({ ssid: 'My;Net', password: 'ab:cd', security: 'WEP', hidden: true })).toBe('WIFI:T:WEP;S:My\\;Net;P:ab\\:cd;H:true;;');
  });

  test('open network has no password field', () => {
    expect(buildWifi({ ssid: 'Guest', password: 'ignored', security: 'nopass', hidden: false })).toBe('WIFI:T:nopass;S:Guest;;');
  });
});

describe('socialUrl', () => {
  test.each([
    ['instagram', '@azbekdev', 'https://instagram.com/azbekdev'],
    ['instagram', 'https://www.instagram.com/azbekdev/', 'https://www.instagram.com/azbekdev/'],
    ['telegram', '@QodirovAzizbek', 'https://t.me/QodirovAzizbek'],
    ['telegram', 't.me/QodirovAzizbek', 'https://t.me/QodirovAzizbek'],
    ['facebook', 'zuck', 'https://facebook.com/zuck'],
    ['youtube', '@azbekdev', 'https://youtube.com/@azbekdev'],
    ['youtube', 'https://youtu.be/dQw4w9WgXcQ', 'https://youtu.be/dQw4w9WgXcQ'],
    ['tiktok', '@user.name', 'https://www.tiktok.com/@user.name'],
    ['linkedin', 'john-doe', 'https://www.linkedin.com/in/john-doe'],
    ['x', '@jack', 'https://x.com/jack'],
    ['x', 'https://twitter.com/jack', 'https://twitter.com/jack'],
    ['whatsapp', '+998 90 123 45 67', 'https://wa.me/998901234567'],
    ['whatsapp', 'https://wa.me/998901234567', 'https://wa.me/998901234567'],
    ['website', 'azbek.uz', 'https://azbek.uz/'],
  ] as const)('%s %s', (platform, value, expected) => {
    expect(socialUrl(platform, value)).toBe(expected);
  });

  test.each([
    ['instagram', 'https://evil.com/azbekdev'],
    ['telegram', 'has space'],
    ['whatsapp', '12'],
    ['whatsapp', 'call me'],
    ['website', 'not a url'],
    ['x', ''],
  ] as const)('rejects %s %j', (platform, value) => {
    expect(socialUrl(platform, value)).toBeNull();
  });
});

describe('slugs', () => {
  test('slugify transliterates and cleans', () => {
    expect(slugify('Coffee House!')).toBe('coffee-house');
    expect(slugify('Тошкент кафе')).toBe('toshkent-kafe');
    expect(slugify("Oʻzbekiston gʻalaba")).toBe('ozbekiston-galaba');
    expect(slugify('Ünïcödé — test')).toBe('unicode-test');
    expect(slugify('***')).toBe('');
  });

  test('makeSlug always matches the database constraint and is unique', () => {
    const inputs = ['Coffee House', '', '!!!', 'a', 'x'.repeat(200), 'Тошкент', 'Azizbek Social'];
    const seen = new Set<string>();
    for (const input of inputs) {
      for (let i = 0; i < 50; i++) {
        const slug = makeSlug(input);
        expect(slug).toMatch(SLUG_RE);
        seen.add(slug);
      }
    }
    expect(seen.size).toBe(inputs.length * 50);
  });
});
