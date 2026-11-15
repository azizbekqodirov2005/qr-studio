/**
 * Runs the real Supabase migration on an in-process PostgreSQL (PGlite) with a
 * minimal stand-in for Supabase's `auth` and `storage` schemas, then verifies
 * the Row Level Security rules by switching between the `anon` and
 * `authenticated` roles exactly as PostgREST does.
 */
import { describe, test, expect, beforeAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';

const SUPABASE_STUBS = `
create role anon nologin;
create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;

create schema storage;
create table storage.buckets (
  id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id),
  name text not null, owner uuid default auth.uid()
);
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated;
grant select, insert, update, delete on storage.objects to authenticated;
grant usage on schema public to anon, authenticated;
`;

let db: PGlite;

async function as<T>(role: 'anon' | 'authenticated', userId: string | null, fn: () => Promise<T>): Promise<T> {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${userId ?? ''}', false); set role ${role};`);
  try {
    return await fn();
  } finally {
    await db.exec('reset role;');
  }
}

async function insertPage(slug: string, published = true) {
  const r = await db.query<{ id: string }>(
    `insert into public.pages (kind, slug, title, data, published) values ('social', $1, 'Title', '{"name":"x"}', $2) returning id`,
    [slug, published],
  );
  return r.rows[0].id;
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STUBS);
  const dir = join(__dirname, '../../supabase/migrations');
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(join(dir, file), 'utf8'));
  }
  await db.exec(`insert into auth.users (id, email) values ('${ALICE}', 'a@example.com'), ('${BOB}', 'b@example.com');`);
}, 60_000);

describe('migration', () => {
  test('creates bucket with size and mime limits', async () => {
    const r = await db.query<{ public: boolean; file_size_limit: string; allowed_mime_types: string[] }>(
      `select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'qr-files'`,
    );
    expect(r.rows[0].public).toBe(true);
    expect(Number(r.rows[0].file_size_limit)).toBe(20 * 1024 * 1024);
    expect(r.rows[0].allowed_mime_types).toContain('application/pdf');
  });

  test('is idempotent (can be re-run)', async () => {
    const dir = join(__dirname, '../../supabase/migrations');
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
      await expect(db.exec(readFileSync(join(dir, file), 'utf8'))).resolves.toBeDefined();
    }
  });
});

describe('qr_codes RLS', () => {
  let aliceQr: string;

  test('owner can insert and read own QR codes; user_id defaults to auth.uid()', async () => {
    aliceQr = await as('authenticated', ALICE, async () => {
      const r = await db.query<{ id: string; user_id: string }>(
        `insert into public.qr_codes (type, name, content) values ('url', 'Site', 'https://example.com') returning id, user_id`,
      );
      expect(r.rows[0].user_id).toBe(ALICE);
      return r.rows[0].id;
    });
    const rows = await as('authenticated', ALICE, () => db.query(`select id from public.qr_codes`));
    expect(rows.rows).toHaveLength(1);
  });

  test('another user cannot see, update or delete them', async () => {
    await as('authenticated', BOB, async () => {
      expect((await db.query(`select * from public.qr_codes`)).rows).toHaveLength(0);
      const upd = await db.query(`update public.qr_codes set name = 'hacked' where id = $1`, [aliceQr]);
      expect(upd.affectedRows).toBe(0);
      const del = await db.query(`delete from public.qr_codes where id = $1`, [aliceQr]);
      expect(del.affectedRows).toBe(0);
    });
    const r = await as('authenticated', ALICE, () => db.query<{ name: string }>(`select name from public.qr_codes where id = $1`, [aliceQr]));
    expect(r.rows[0].name).toBe('Site');
  });

  test('a user cannot insert a row owned by someone else', async () => {
    await as('authenticated', BOB, async () => {
      await expect(
        db.query(`insert into public.qr_codes (user_id, type, name, content) values ($1, 'url', 'x', 'https://x.io')`, [ALICE]),
      ).rejects.toThrow(/row-level security/);
    });
  });

  test('a user cannot transfer their row to another user', async () => {
    await as('authenticated', ALICE, async () => {
      await expect(db.query(`update public.qr_codes set user_id = $1 where id = $2`, [BOB, aliceQr])).rejects.toThrow();
    });
  });

  test('anonymous visitors have no access to qr_codes', async () => {
    await as('anon', null, async () => {
      await expect(db.query(`select * from public.qr_codes`)).rejects.toThrow(/permission denied/);
    });
  });

  test('check constraints reject invalid data', async () => {
    await as('authenticated', ALICE, async () => {
      await expect(db.query(`insert into public.qr_codes (type, name, content) values ('bogus', 'x', 'y')`)).rejects.toThrow();
      await expect(db.query(`insert into public.qr_codes (type, name, content) values ('url', '   ', 'y')`)).rejects.toThrow();
      await expect(db.query(`insert into public.qr_codes (type, name, content) values ('url', 'x', '')`)).rejects.toThrow();
    });
  });

  test('a QR code cannot link to another user’s page', async () => {
    const bobPage = await as('authenticated', BOB, () => insertPage('bob-page-abc123'));
    await as('authenticated', ALICE, async () => {
      await expect(
        db.query(`insert into public.qr_codes (type, name, content, page_id) values ('social', 'x', 'https://s/p/bob', $1)`, [bobPage]),
      ).rejects.toThrow(/same user/);
    });
  });
});

describe('pages RLS and public lookup', () => {
  test('owner creates pages; slugs must be unique and well-formed', async () => {
    await as('authenticated', ALICE, async () => {
      await insertPage('alice-social-k3x9pa');
      await insertPage('alice-draft-zzzzzz', false);
      await expect(insertPage('alice-social-k3x9pa')).rejects.toThrow(/duplicate key/);
      await expect(insertPage('Bad Slug!')).rejects.toThrow(/check constraint/);
    });
  });

  test('anonymous visitors can open a published page by slug', async () => {
    const r = await as('anon', null, () =>
      db.query<{ slug: string; title: string }>(`select * from public.get_public_page('social', 'alice-social-k3x9pa')`),
    );
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).not.toHaveProperty('user_id');
  });

  test('unpublished pages and wrong kinds are not returned', async () => {
    await as('anon', null, async () => {
      expect((await db.query(`select * from public.get_public_page('social', 'alice-draft-zzzzzz')`)).rows).toHaveLength(0);
      expect((await db.query(`select * from public.get_public_page('business', 'alice-social-k3x9pa')`)).rows).toHaveLength(0);
    });
  });

  test('anonymous visitors cannot list or modify the pages table', async () => {
    await as('anon', null, async () => {
      await expect(db.query(`select * from public.pages`)).rejects.toThrow(/permission denied/);
      await expect(db.query(`insert into public.pages (kind, slug) values ('social', 'anon-page-aaaaaa')`)).rejects.toThrow(/permission denied/);
    });
  });

  test('other users cannot read, edit or delete someone else’s pages', async () => {
    await as('authenticated', BOB, async () => {
      const r = await db.query<{ slug: string }>(`select slug from public.pages`);
      expect(r.rows.map((x) => x.slug)).toEqual(['bob-page-abc123']);
      const upd = await db.query(`update public.pages set title = 'x' where slug = 'alice-social-k3x9pa'`);
      expect(upd.affectedRows).toBe(0);
      const del = await db.query(`delete from public.pages where slug = 'alice-social-k3x9pa'`);
      expect(del.affectedRows).toBe(0);
    });
  });

  test('updated_at is maintained by trigger', async () => {
    await as('authenticated', ALICE, async () => {
      const before = await db.query<{ updated_at: Date }>(`select updated_at from public.pages where slug = 'alice-social-k3x9pa'`);
      await new Promise((r) => setTimeout(r, 15));
      await db.exec(`begin; update public.pages set title = 'New' where slug = 'alice-social-k3x9pa'; commit;`);
      const after = await db.query<{ updated_at: Date }>(`select updated_at from public.pages where slug = 'alice-social-k3x9pa'`);
      expect(new Date(after.rows[0].updated_at).getTime()).toBeGreaterThan(new Date(before.rows[0].updated_at).getTime());
    });
  });
});

describe('storage policies', () => {
  test('users can upload only into their own folder', async () => {
    await as('authenticated', ALICE, async () => {
      await db.query(`insert into storage.objects (bucket_id, name) values ('qr-files', '${ALICE}/pdf/a.pdf')`);
      await expect(
        db.query(`insert into storage.objects (bucket_id, name) values ('qr-files', '${BOB}/pdf/evil.pdf')`),
      ).rejects.toThrow(/row-level security/);
      await expect(db.query(`insert into storage.objects (bucket_id, name) values ('qr-files', 'root.pdf')`)).rejects.toThrow(
        /row-level security/,
      );
    });
  });

  test('users cannot delete other users’ files', async () => {
    await as('authenticated', BOB, async () => {
      const del = await db.query(`delete from storage.objects where name = '${ALICE}/pdf/a.pdf'`);
      expect(del.affectedRows).toBe(0);
    });
  });
});
