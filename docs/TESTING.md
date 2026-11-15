# Testing report — QR Studio

Test date: 15 November 2026. Everything below was **run**, not just written. Every result comes from a clean run on a fresh database.

| Check | Command | Result |
|---|---|---|
| TypeScript (strict) | `npm run typecheck` | ✅ 0 errors |
| Production build | `npm run build` | ✅ built; routes are code-split (initial JS ≈ 90 kB gzip + ≈ 55 kB for the Supabase client) |
| Unit + integration tests | `npm test` | ✅ **127 / 127** passed |
| Browser end-to-end | `npm run test:e2e` | ✅ **19 / 19** scenarios passed (Chrome) |

## 1. Unit tests (`tests/unit`)

- **Payloads:** URL normalisation (adds https://, punycode, ports, IPs; rejects `javascript:`, `mailto:`, hosts without a TLD). vCard 3.0 escaping per RFC 2426 with CRLF line endings. Wi-Fi escaping of `\ ; , : "`. Open, WEP and hidden networks. Social URL builders for all 9 platforms, rejecting foreign hosts. Slug generation always matches the database constraint and produced 350/350 unique slugs.
- **Validation:** every Zod schema (URL, vCard, Wi-Fi WPA/WEP rules, PDF, images 1–30, social links, business hours including overnight hours). Translated messages in all 3 languages.
- **Translations:** `ru` and `en` have exactly the same keys and function signatures as `uz`. No empty strings and no Uzbek left in the other languages.
- **Rendering and readability:** style → library options, transparent vs JPEG background, a logo forces at least ECC Q, UTF-8 pre-encoding, SVG normalisation, contrast/inversion/logo/quiet-zone warnings, and the business "open now" logic including overnight hours.

## 2. QR scan tests (`tests/integration/scan.test.ts`)

Each QR is rendered by the real `qr-code-styling` library through the app's option builder, rasterised with resvg, and decoded with **ZXing-C++** (WebAssembly build of the engine most Android scanners use). Covered:

- URL, a vCard with Uzbek and Cyrillic text, a Wi-Fi payload with escaped characters, and a 1,500-character payload. Over-capacity content correctly throws, and the UI shows a message.
- **All 18 combinations** of the 6 dot styles × 3 corner styles.
- Brand and preset colors, transparent background, quiet zone 0% and 12%, ECC L and H.
- A cross-check where two independent decoders (ZXing-C++ and jsQR) agree.

**Bugs these tests found and fixed:**

1. The bundled encoder wrote non-Latin characters as single bytes, which corrupted Cyrillic and Uzbek text in vCards. Content is now pre-encoded as UTF-8.
2. Exported SVGs used `url('#id')` clip references, which some vector tools and print RIPs can't read. They are now normalised to `url(#id)`.
3. The URL parser treated `host:port` as a URL scheme. Fixed.

## 3. Database and RLS tests (`tests/integration/rls.test.ts`)

These run the real migration on PostgreSQL (PGlite) with stand-ins for Supabase's `auth` and `storage` schemas, then switch between the `anon` and `authenticated` roles the way PostgREST does. 17 checks:

- Owners can create and read their own QR codes. Another user can't select, update, delete, insert-as-someone-else, or transfer ownership.
- Anonymous visitors are refused on `qr_codes` and on listing `pages`, but `get_public_page` returns published pages (and never `user_id`).
- Unpublished pages and pages requested with the wrong `kind` are not returned.
- Slug uniqueness and format, check constraints, the `updated_at` trigger, and the rule that a QR can't link to another user's page.
- Storage: uploads are allowed only inside the user's own folder, and other users' files can't be deleted.
- The migration is idempotent (it runs twice without errors).

## 4. Browser end-to-end tests (`tests/e2e/run_e2e.py`)

### Environment

- **Backend:** PostgreSQL 16 with the **real Supabase Auth server (GoTrue v2.180.0)** and the **real PostgREST v12.2.3**, plus the project's own migration. A small test gateway (`tests/e2e/stack/gateway.mjs`) stands in for Kong and the Storage API. It writes `storage.objects` rows *as the signed-in user*, so the storage RLS policies are enforced by Postgres. It also applies bucket size and MIME limits and captures outgoing email over SMTP.
- **Frontend:** the production build (`vite build`), served by `vite preview`, tested in Google Chrome through Playwright. A second build with no Supabase configuration tests guest mode.
- **Checking downloads:** every downloaded QR file (PNG, SVG, JPEG, WebP) is decoded with ZXing-C++ and compared with the expected payload.

### Scenarios (all passed)

| # | Scenario | What it verifies |
|---|---|---|
| 1 | Guest mode, no backend | Static QR is generated and downloaded and decodes. The dashboard and page types explain that the backend is missing |
| 2 | Home page | Uzbek by default, 7 type cards of equal height, card opens its workflow, no console errors |
| 3 | Website URL | Inline validation, https auto-fix, instant QR, copy to clipboard. **PNG, SVG, JPEG and WebP all decode.** SVG is a true vector. PNG is 1024 px, and 2048 px when that size is chosen |
| 4 | Customization | Dots style, extra-rounded corners, color preset and logo (auto ECC H) all change the **exported file** (colors, `<circle>`, `<image>` present in the SVG; PNG background pixel matches) and it still decodes. Low-contrast warning appears. Transparent PNG has alpha, and JPEG gets a white background and still decodes. Reset works. Print renders the QR into the print document |
| 5 | vCard | Email validation; vCard 3.0 lines checked one by one, including Unicode; the downloaded PNG decodes to the exact payload |
| 6 | Wi-Fi | WPA length rule, show/hide password, escaping, hidden flag, open network; the download decodes |
| 7 | Authentication | Sign up, protected-route redirect, sign out, wrong-password message, sign in, password-mismatch message |
| 8 | Dashboard | Save, edit URL, list, search, filters by type and folder, sort, duplicate, move to folder, download SVG (decodes), edit and save changes, delete with cancel and confirm, persists after reload |
| 9 | PDF | Fake `.pdf` rejected by magic-byte check; real upload stored at a public URL that serves `application/pdf` with identical bytes; inline preview; QR decodes to the URL; link mode with a non-`.pdf` warning |
| 10 | Images | Upload 4 images, remove one, reorder, page preview, publish. A logged-out visitor sees the images in the same order, re-encoded as WebP; lightbox with keyboard navigation; page title metadata |
| 11 | Social media | Avatar upload; an invalid link blocks publishing; reorder; logged-out page shows the correct `href` for Instagram, WhatsApp, Telegram and YouTube, in order, with `target=_blank rel=noopener`; `og:title` set |
| 12 | Business page | `tel:`, `mailto:` and Maps links, opening hours table, *Save contact* downloads a valid `.vcf`. After an edit the page updates while the **QR content stays identical** |
| 13 | Authorization | A second user's dashboard is empty, and opening another user's `?edit=` link shows "not found". REST select, update, delete and insert-as-other are all refused, anonymous REST is refused, uploading into another user's folder returns 403, and data stays unchanged. Public pages remain public |
| 14 | Password reset | Reset email captured over SMTP, link opened (PKCE), new password set, then signing in with it works |
| 15 | Profile | Display name saved and still there after reload |
| 16 | Languages | Uzbek → Russian (including validation messages) → reload keeps Russian → English with no Cyrillic left on the page |
| 17 | Responsive | 10 routes (including the three public pages and the dashboard) at **320, 375, 768, 1024 and 1440 px**, with no horizontal overflow. Mobile menu works; on mobile the QR thumbnail stays visible in the sticky bottom bar; the download button is touch-sized; the confirm dialog fits a 320 px screen |
| 18 | Keyboard | Skip link comes first, type cards open with Enter, menus work with ArrowDown and Escape, and focus is visible |
| 19 | Delete cascade | Deleting a gallery QR removes its public page and the uploaded image files |

Screenshots from the run are written to `tests/e2e/artifacts/` (they are not committed).

### Running it yourself

```bash
# 1. local backend (Linux; needs PostgreSQL 16 installed; downloads GoTrue + PostgREST binaries)
sudo tests/e2e/stack/start.sh          # writes .env.e2e
# 2. builds
npx vite build --mode e2e && npx vite preview --host 127.0.0.1 --port 4173 &
npx vite build --outDir /tmp/dist-guest && npx vite preview --outDir /tmp/dist-guest --host 127.0.0.1 --port 4174 &
# 3. tests (Python: playwright, zxing-cpp, pillow)
pip install playwright zxing-cpp pillow && python3 tests/e2e/run_e2e.py
```

## What was *not* verified, and needs your setup

- **Hosted Supabase project:** the tests used the same open-source Auth and PostgREST servers that Supabase runs, but not your hosted project. Apply the migration and click through once after you configure it.
- **Supabase Storage server:** the e2e tests used a stand-in that enforces the same RLS policies and bucket limits. The hosted Storage API is the production equivalent.
- **Real phone cameras:** scannability was checked with ZXing-C++ and jsQR, not on physical iPhone or Android devices. Before printing, scan one vCard and one Wi-Fi code on a real phone to confirm the "save contact" and "join network" prompts.
- **Email delivery:** the reset and confirmation flows were checked with a captured SMTP message. Production needs your own SMTP provider configured in Supabase.
- **Browsers:** automated tests ran in Chrome only. Safari and Firefox weren't automated (no browser-specific APIs are used apart from WebP encoding, which falls back to JPEG automatically).

## External services that still need configuration

1. **Supabase project:** apply the migration and set the URL and anon key in `.env`.
2. **Supabase Auth URL settings:** Site URL and Redirect URLs for your domain.
3. **SMTP provider** for confirmation and reset emails (Supabase → Auth → SMTP).
4. **Hosting** (Netlify, Vercel or any static host) with the three `VITE_*` variables. `VITE_PUBLIC_SITE_URL` must be set to the final domain before QR codes are printed.
5. *(Optional)* a scheduled cleanup of storage files that no QR code references, left over from abandoned drafts.
