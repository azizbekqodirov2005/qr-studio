-- QR Studio — initial schema
-- Tables: public.pages (hosted public pages), public.qr_codes (saved QR codes)
-- Storage: bucket "qr-files" (PDFs and images), owner-scoped folders: <user_id>/...
-- Every table has Row Level Security enabled. The anon key alone can only read
-- published public pages; everything else requires an authenticated owner.

-- gen_random_uuid() is built into PostgreSQL 13+ (no extension needed).

-- ---------------------------------------------------------------------------
-- updated_at helper
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- pages: public landing pages (social profile, business profile, image gallery)
-- ---------------------------------------------------------------------------
create table if not exists public.pages (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind        text not null check (kind in ('social', 'business', 'gallery')),
  slug        text not null unique
              check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])$'),
  title       text not null default '' check (char_length(title) <= 120),
  data        jsonb not null default '{}'::jsonb
              check (jsonb_typeof(data) = 'object' and pg_column_size(data) <= 100000),
  published   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists pages_user_id_idx on public.pages (user_id);

drop trigger if exists pages_set_updated_at on public.pages;
create trigger pages_set_updated_at
  before update on public.pages
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- qr_codes: saved QR codes (private to their owner)
-- ---------------------------------------------------------------------------
create table if not exists public.qr_codes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type        text not null check (type in ('url', 'vcard', 'pdf', 'images', 'social', 'business', 'wifi')),
  name        text not null check (char_length(btrim(name)) between 1 and 120),
  folder      text check (folder is null or char_length(folder) between 1 and 60),
  content     text not null check (char_length(content) between 1 and 4000),
  data        jsonb not null default '{}'::jsonb
              check (jsonb_typeof(data) = 'object' and pg_column_size(data) <= 100000),
  style       jsonb not null default '{}'::jsonb
              check (jsonb_typeof(style) = 'object' and pg_column_size(style) <= 400000),
  page_id     uuid references public.pages (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- only page-based types may reference a page
  constraint qr_codes_page_only_for_page_types check (
    page_id is null or type in ('images', 'social', 'business')
  )
);

create index if not exists qr_codes_user_created_idx on public.qr_codes (user_id, created_at desc);
create index if not exists qr_codes_page_id_idx on public.qr_codes (page_id);

drop trigger if exists qr_codes_set_updated_at on public.qr_codes;
create trigger qr_codes_set_updated_at
  before update on public.qr_codes
  for each row execute function public.set_updated_at();

-- A QR code may only link to a page owned by the same user.
create or replace function public.qr_codes_check_page_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.page_id is not null and not exists (
    select 1 from public.pages p where p.id = new.page_id and p.user_id = new.user_id
  ) then
    raise exception 'page_id must reference a page owned by the same user'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists qr_codes_check_page_owner on public.qr_codes;
create trigger qr_codes_check_page_owner
  before insert or update of page_id, user_id on public.qr_codes
  for each row execute function public.qr_codes_check_page_owner();

-- Trigger functions must not be callable through the REST API (/rpc).
revoke all on function public.qr_codes_check_page_owner() from public, anon, authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.pages enable row level security;
alter table public.qr_codes enable row level security;

-- pages: owners can read, create, update and delete their own pages.
-- Visitors never query the table directly (that would allow listing every page);
-- they call public.get_public_page(kind, slug) below, which returns one published page.
drop policy if exists "pages_owner_select" on public.pages;
create policy "pages_owner_select" on public.pages
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "pages_owner_insert" on public.pages;
create policy "pages_owner_insert" on public.pages
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "pages_owner_update" on public.pages;
create policy "pages_owner_update" on public.pages
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "pages_owner_delete" on public.pages;
create policy "pages_owner_delete" on public.pages
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- qr_codes: strictly owner-only.
drop policy if exists "qr_owner_select" on public.qr_codes;
create policy "qr_owner_select" on public.qr_codes
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "qr_owner_insert" on public.qr_codes;
create policy "qr_owner_insert" on public.qr_codes
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "qr_owner_update" on public.qr_codes;
create policy "qr_owner_update" on public.qr_codes
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "qr_owner_delete" on public.qr_codes;
create policy "qr_owner_delete" on public.qr_codes
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Table privileges (RLS still applies on top of these).
revoke all on public.qr_codes, public.pages from anon;
grant select, insert, update, delete on public.pages, public.qr_codes to authenticated;

-- ---------------------------------------------------------------------------
-- Public page lookup (no login required). Returns a single *published* page
-- by kind + slug and never exposes the owner's user id.
-- ---------------------------------------------------------------------------
create or replace function public.get_public_page(p_kind text, p_slug text)
returns table (kind text, slug text, title text, data jsonb, updated_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select p.kind, p.slug, p.title, p.data, p.updated_at
  from public.pages p
  where p.kind = p_kind and p.slug = p_slug and p.published = true
  limit 1;
$$;

revoke all on function public.get_public_page(text, text) from public;
grant execute on function public.get_public_page(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Storage: public-read bucket, owner-only writes inside "<user_id>/..."
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'qr-files',
  'qr-files',
  true,
  20971520, -- 20 MB
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "qr_files_owner_read" on storage.objects;
create policy "qr_files_owner_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'qr-files' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "qr_files_owner_insert" on storage.objects;
create policy "qr_files_owner_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'qr-files' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "qr_files_owner_update" on storage.objects;
create policy "qr_files_owner_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'qr-files' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'qr-files' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "qr_files_owner_delete" on storage.objects;
create policy "qr_files_owner_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'qr-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
