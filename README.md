# QR Studio

**Live:** https://qrstudio-uz.netlify.app

A QR code generator that is ready for real users. It supports seven QR types, a customization studio, high-resolution exports, saved QR codes, hosted public pages, and three languages (Uzbek Latin is the default, plus Russian and English).

**Stack:** React 18 · TypeScript · Vite · Tailwind CSS v4 · React Router · qr-code-styling · Zod · Supabase (Postgres + Auth + Storage) · Lucide icons

---

## Features

| Area | What's included |
|---|---|
| **QR types** | Website URL · vCard 3.0 · PDF (upload or link) · Image gallery · Social media page · Business page · Wi-Fi |
| **Customization** | 6 dot styles, 3 corner styles, foreground/background colors, presets, transparent background, center logo with size control, error-correction level, quiet zone, export size. Shows readability warnings (contrast, inverted colors, logo size, quiet zone) |
| **Export** | PNG, real vector SVG, JPEG and WebP at 512–4096 px. Also print, copy content and reset. The downloaded file uses the same option builder as the live preview |
| **Dashboard** | Search, filter by type or folder, sort, edit, duplicate, move to folder, download, delete (with confirmation). Includes an empty state and lazy-rendered thumbnails |
| **Public pages** | `/p/:slug` (social), `/b/:slug` (business), `/g/:slug` (gallery). No login needed to view them. They are mobile-first, set title/description/OG meta tags, and can be edited without changing the printed QR code |
| **Auth** | Sign up, sign in, sign out, password reset by email, profile, change password. Guests can create and download static QR codes without an account |
| **Security** | Row Level Security on every table. Visitors can't list pages (they only reach a single published page through an RPC). Storage writes are limited to `<user_id>/…`. Uploads are checked by MIME type and magic bytes and have size limits. The browser only ever sees the public anon key |
| **Theme** | Light, dark and system themes (remembered per browser, no flash on load) |
| **i18n** | Uzbek (default), Russian, English. Every label, error, toast and validation message is translated. The chosen language is remembered |

## Project structure

```
qr-studio/
├── index.html
├── netlify.toml / vercel.json / public/_redirects   # SPA routing for hosts
├── supabase/migrations/20261115000000_init.sql     # schema, RLS, storage bucket + policies, RPC
├── src/
│   ├── main.tsx, App.tsx, index.css                # entry, routes (lazy-loaded), design tokens
│   ├── i18n/            uz.ts (source of truth) · ru.ts · en.ts · I18nProvider.tsx
│   ├── auth/            AuthProvider.tsx (Supabase Auth, PKCE)
│   ├── lib/
│   │   ├── types.ts                 # data model for all 7 types + QrStyle
│   │   ├── validation.ts            # Zod schemas (translated messages)
│   │   ├── db.ts                    # Supabase data access: QR codes, pages, storage
│   │   ├── files.ts                 # file checks (MIME + magic bytes), client-side resize/WebP
│   │   ├── errors.ts, supabase.ts, cx.ts
│   │   └── qr/
│   │       ├── payloads.ts          # URL normalisation, vCard, Wi-Fi, social URLs, slugs
│   │       ├── content.ts           # data → QR content, defaults, suggested names
│   │       ├── render.ts            # QrStyle → qr-code-styling options, UTF-8 fix, readability checks
│   │       └── export.ts            # PNG/SVG/JPEG/WebP blobs, download, print
│   ├── components/
│   │   ├── ui/          Button, Form (Field/Input/Select/Segmented/Switch…), Modal + Confirm, Menu, Toast, Notice
│   │   ├── layout/      Header (responsive nav, language, user menu), Layout (footer, RequireAuth)
│   │   ├── qr/          TypeGrid, QrRender, CustomizePanel, PreviewPanel, typeMeta (icons)
│   │   ├── forms/       StaticForms (URL, vCard, Wi-Fi), PdfForm, PageForms (Images, Social, Business), FileDrop, shared
│   │   └── public/      PageViews (Social, Business, Gallery + lightbox)
│   ├── pages/           Home, Create (4-step wizard), Dashboard, Public, Auth pages, Pricing/Help, NotFound
│   └── hooks/           useMediaQuery, useDocumentMeta
├── tests/
│   ├── unit/            payloads, validation (+ translation parity), render/readability, business hours
│   ├── integration/     scan.test.ts (render → rasterise → decode with ZXing-C++), rls.test.ts (migration on Postgres)
│   └── e2e/             run_e2e.py (Playwright + Chrome) and stack/ (local Supabase-compatible backend)
└── docs/TESTING.md      # test report
```

## Getting started

Requirements: Node.js 20+ and npm.

```bash
npm install
cp .env.example .env        # then fill in your Supabase values (see below)
npm run dev                 # http://localhost:5173
```

The app runs without a `.env` too, in **guest mode**. URL, vCard, Wi-Fi and PDF-link QR codes all work and can be downloaded. Saving, uploads and hosted pages show a clear "Backend not connected" message until you configure Supabase.

### Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Type-check (`tsc -b`) and production build into `dist/` |
| `npm run preview` | Serve the production build |
| `npm run typecheck` | TypeScript only |
| `npm test` | Unit and integration tests (Vitest) |
| `npm run test:e2e` | Browser suite (needs the local stack, see `docs/TESTING.md`) |

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `VITE_SUPABASE_URL` | for accounts | `https://<project-ref>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | for accounts | The project's **anon / publishable** key. It is safe to ship because RLS protects the data |
| `VITE_PUBLIC_SITE_URL` | recommended | Public base URL of your deployment. QR codes for pages encode `${VITE_PUBLIC_SITE_URL}/p/<slug>`. Set it to your final domain **before** printing QR codes |

> Never put the `service_role` key in `.env`, in the frontend, or in Git. The app doesn't need it.

## Supabase setup

1. **Create a project** at <https://supabase.com/dashboard>.
2. **Run the migration.** Either:
   - open *SQL Editor*, paste `supabase/migrations/20261115000000_init.sql` and click *Run*, **or**
   - use the CLI: `supabase link --project-ref <ref>` and then `supabase db push`.

   The migration creates `public.pages` and `public.qr_codes`, every RLS policy, the `get_public_page` RPC, the `qr-files` storage bucket (public read, 20 MB limit, PDF/JPEG/PNG/WebP only) and the storage policies. You can run it more than once safely.
3. **Auth → URL Configuration**
   - *Site URL*: your domain, e.g. `https://qr.example.com`
   - *Redirect URLs*: add `https://qr.example.com/update-password` and `https://qr.example.com/dashboard`. For local development also add `http://localhost:5173/**`.
4. **Auth → Providers → Email:** keep it enabled. Decide whether to keep *Confirm email* on (recommended). The sign-up screen handles both cases.
5. **Auth → SMTP (production):** set up your own SMTP provider. Supabase's built-in mailer is rate-limited and meant only for testing. Password-reset and confirmation emails depend on it.
6. **Project Settings → API:** copy the *Project URL* and the *anon public* key into `.env`.

### Data model

- `pages`: `id, user_id, kind (social|business|gallery), slug (unique), title, data jsonb, published, created_at, updated_at`
- `qr_codes`: `id, user_id, type, name, folder, content, data jsonb, style jsonb, page_id → pages, created_at, updated_at`
- Storage: `qr-files/<user_id>/{pdf|images|avatars|logos}/<uuid>.<ext>`

What RLS allows:

- **qr_codes:** each owner can do anything with their own rows. Nobody else can do anything, and anonymous visitors have no access at all.
- **pages:** only owners can use the table directly. Visitors call `get_public_page(kind, slug)`, which returns one published page and no owner id.
- **Storage:** anyone can read through the public URL. Only the owner can insert, update or delete, and only inside their own folder.
- **Linking:** a QR code can only link to a page that belongs to the same user (enforced by a trigger).

## Deployment

The app is a static single-page app. Any static host works as long as every route falls back to `index.html`.

- **Netlify:** `netlify.toml` is included. Set the three `VITE_*` variables under *Site settings → Environment variables*, then deploy.
- **Vercel:** `vercel.json` is included. Use the Vite framework preset and add the same environment variables.
- **Other hosts (nginx, Apache, ISPmanager…):** upload `dist/` and add a rewrite of every path to `/index.html`.

After the first deploy, update Supabase *Site URL* and *Redirect URLs* to the production domain, and set `VITE_PUBLIC_SITE_URL` to that domain.

## Things worth knowing

- **QR codes for hosted pages are dynamic.** Editing a social, business or gallery page changes what visitors see, but the printed QR code stays the same. Deleting the QR code also deletes its page and uploaded files.
- **Static QR codes** (URL, vCard, Wi-Fi) store their data inside the code. Editing them produces a new image.
- **The PDF type** stores a public link to the file, not the file itself. Uploaded files are public to anyone who has the link.
- **Images are resized in the browser** (longest edge 2000 px) and re-encoded as WebP before upload. This removes EXIF and GPS metadata.
- **Social link previews:** the app sets title, description and `og:` tags on the client. Crawlers that don't run JavaScript (Telegram, Facebook) will see the generic tags. Per-page server-side preview cards would need an edge function or SSR.
- **Unsaved uploads:** if someone uploads files and then abandons a draft without saving, those files stay in storage. A scheduled cleanup is optional (see `docs/TESTING.md` → external services).

---

Powered by [AzbekDev](https://t.me/azbekDev)
