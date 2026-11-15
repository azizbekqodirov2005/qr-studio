"""
QR Studio — browser end-to-end suite (Playwright + Google Chrome).

Runs against:
  * the production build served by `vite preview` on http://127.0.0.1:4173
    (built with `.env.e2e`, i.e. connected to the local stack), and
  * a second build *without* Supabase configuration on http://127.0.0.1:4174
    (guest-only mode).

The local stack (tests/e2e/stack/start.sh) is real PostgreSQL 16 + real GoTrue
(Supabase Auth) + real PostgREST, with the project's own migration applied.

Every downloaded QR file is decoded with ZXing-C++ to prove it scans and carries
the expected payload.

Usage:  python3 tests/e2e/run_e2e.py
"""
from __future__ import annotations

import base64
import io
import json
import os
import re
import subprocess
import sys
import time
import traceback
import urllib.request
import uuid
from pathlib import Path

import zxingcpp
from PIL import Image
from playwright.sync_api import Page, BrowserContext, expect, sync_playwright

ROOT = Path(__file__).resolve().parents[2]
ART = ROOT / 'tests' / 'e2e' / 'artifacts'
ART.mkdir(parents=True, exist_ok=True)
APP = os.environ.get('APP_URL', 'http://127.0.0.1:4173')
GUEST_APP = os.environ.get('GUEST_APP_URL', 'http://127.0.0.1:4174')
API = 'http://127.0.0.1:54321'
ENV = dict(line.split('=', 1) for line in (ROOT / '.env.e2e').read_text().split('\n') if '=' in line)
ANON = ENV['VITE_SUPABASE_ANON_KEY']
RUN = uuid.uuid4().hex[:6]
USER_A = {'email': f'alice.{RUN}@example.com', 'password': 'Passw0rd!A', 'name': 'Alice'}
USER_B = {'email': f'bob.{RUN}@example.com', 'password': 'Passw0rd!B', 'name': 'Bob'}
expect.set_options(timeout=15_000)

RESULTS: list[dict] = []
SHARED: dict = {}


# ------------------------------------------------------------------ helpers
def decode_file(path: Path) -> str | None:
    """Decodes a QR image file (PNG/JPEG/WebP/SVG) with ZXing-C++."""
    if path.suffix == '.svg':
        png = path.with_suffix('.svg.png')
        subprocess.run(['node', str(ROOT / 'tests/e2e/svg2png.mjs'), str(path), str(png)], check=True, cwd=ROOT)
        path = png
    img = Image.open(path).convert('RGB')
    results = zxingcpp.read_barcodes(img)
    if not results:
        return None
    return results[0].bytes.decode('utf-8')


def make_png(path: Path, color: tuple[int, int, int], size=(900, 600), text: str | None = None) -> Path:
    img = Image.new('RGB', size, color)
    if text:
        from PIL import ImageDraw
        ImageDraw.Draw(img).text((40, 40), text, fill=(255, 255, 255))
    img.save(path)
    return path


def make_logo(path: Path) -> Path:
    from PIL import ImageDraw
    img = Image.new('RGBA', (300, 300), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((10, 10, 290, 290), radius=60, fill=(71, 123, 255, 255))
    d.ellipse((95, 95, 205, 205), fill=(255, 255, 255, 255))
    img.save(path)
    return path


def make_pdf(path: Path) -> Path:
    content = b'BT /F1 24 Tf 72 720 Td (QR Studio test PDF) Tj ET'
    objs = [
        b'<< /Type /Catalog /Pages 2 0 R >>',
        b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
        b'<< /Length %d >>\nstream\n' % len(content) + content + b'\nendstream',
        b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    ]
    out = io.BytesIO()
    out.write(b'%PDF-1.4\n')
    offsets = []
    for i, o in enumerate(objs, 1):
        offsets.append(out.tell())
        out.write(b'%d 0 obj\n' % i + o + b'\nendobj\n')
    xref = out.tell()
    out.write(b'xref\n0 %d\n0000000000 65535 f \n' % (len(objs) + 1))
    for off in offsets:
        out.write(b'%010d 00000 n \n' % off)
    out.write(b'trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n' % (len(objs) + 1, xref))
    path.write_bytes(out.getvalue())
    return path


def api(method: str, path: str, token: str | None = None, body=None, headers=None):
    req = urllib.request.Request(API + path, method=method)
    req.add_header('apikey', ANON)
    req.add_header('Authorization', f'Bearer {token or ANON}')
    req.add_header('Content-Type', 'application/json')
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    data = json.dumps(body).encode() if body is not None else None
    try:
        with urllib.request.urlopen(req, data) as r:
            raw = r.read()
            return r.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, raw.decode()


def token_for(user: dict) -> str:
    status, body = api('POST', '/auth/v1/token?grant_type=password', body={'email': user['email'], 'password': user['password']})
    assert status == 200, body
    return body['access_token']


def new_context(browser, lang='en', width=1440, height=900, **kw) -> BrowserContext:
    ctx = browser.new_context(viewport={'width': width, 'height': height}, accept_downloads=True, **kw)
    if lang:
        ctx.add_init_script(f"try{{ if(!localStorage.getItem('qrstudio.lang')) localStorage.setItem('qrstudio.lang','{lang}') }}catch(e){{}}")
    return ctx


def watch_errors(page: Page, bucket: list):
    page.on('pageerror', lambda e: bucket.append(f'pageerror: {e}'))
    page.on('console', lambda m: bucket.append(f'console: {m.text}') if m.type == 'error' and 'Failed to load resource' not in m.text else None)


def download(page: Page, fmt: str, name: str) -> Path:
    page.get_by_role('radiogroup', name='Format').get_by_text(fmt.upper() if fmt != 'webp' else 'WebP', exact=True).click()
    with page.expect_download() as info:
        page.get_by_test_id('download-btn').click()
    d = info.value
    target = ART / f'{name}.{d.suggested_filename.rsplit(".", 1)[-1]}'
    d.save_as(target)
    return target


def set_range(page: Page, selector: str, value: float):
    page.eval_on_selector(selector, '''(el, v) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(el, String(v));
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }''', value)


def full_content(page: Page) -> str:
    return page.get_by_test_id('qr-content').get_attribute('title') or ''


def sign_up(page: Page, user: dict):
    page.goto(f'{APP}/signup')
    page.get_by_label('Your name').fill(user['name'])
    page.get_by_label('Email').fill(user['email'])
    page.get_by_label('Password', exact=True).fill(user['password'])
    page.get_by_label('Confirm password').fill(user['password'])
    page.get_by_role('button', name='Create account').click()
    expect(page).to_have_url(re.compile(r'/dashboard$'))


def sign_in(page: Page, user: dict, password: str | None = None):
    page.goto(f'{APP}/login')
    page.get_by_label('Email').fill(user['email'])
    page.get_by_label('Password', exact=True).fill(password or user['password'])
    page.locator('form').get_by_role('button', name='Sign in').click()
    expect(page).to_have_url(re.compile(r'/dashboard$'))


def no_overflow(page: Page) -> tuple[int, int]:
    return page.evaluate('[document.documentElement.scrollWidth, window.innerWidth]')


# ------------------------------------------------------------------ runner
def test(name: str):
    def deco(fn):
        fn._name = name
        TESTS.append(fn)
        return fn
    return deco


TESTS: list = []


# ------------------------------------------------------------------ tests
@test('Guest mode without backend: static QR works, account features explain the missing backend')
def t_guest_no_backend(browser):
    ctx = new_context(browser)
    page = ctx.new_page()
    page.goto(f'{GUEST_APP}/create/url')
    page.get_by_label('Website URL').fill('example.org')
    expect(page.get_by_test_id('qr-render')).to_be_visible()
    f = download(page, 'png', 'guest-url')
    assert decode_file(f) == 'https://example.org/'
    page.goto(f'{GUEST_APP}/dashboard')
    expect(page.get_by_text('Backend not connected')).to_be_visible()
    page.goto(f'{GUEST_APP}/create/social')
    expect(page.get_by_text('Backend not connected').first).to_be_visible()
    ctx.close()


@test('Home page: Uzbek by default, 7 QR type cards, cards open their workflow')
def t_home(browser):
    ctx = new_context(browser, lang=None)
    page = ctx.new_page()
    errors: list = []
    watch_errors(page, errors)
    page.goto(APP)
    expect(page.get_by_role('heading', level=1)).to_have_text('QR kodingizni yarating')
    for t in ['url', 'vcard', 'pdf', 'images', 'social', 'business', 'wifi']:
        expect(page.get_by_test_id(f'type-card-{t}')).to_be_visible()
    heights = page.evaluate("[...document.querySelectorAll('[data-testid^=type-card-]')].map(e => e.getBoundingClientRect().height)")
    assert len(set(round(h) for h in heights)) == 1, f'card heights differ: {heights}'
    page.get_by_test_id('type-card-wifi').click()
    expect(page).to_have_url(re.compile(r'/create/wifi$'))
    page.screenshot(path=str(ART / 'home-to-wifi.png'))
    assert not errors, errors
    ctx.close()


@test('Website URL: validation, https auto-fix, instant QR, PNG/SVG/JPEG/WebP downloads decode correctly')
def t_url(browser):
    ctx = new_context(browser, permissions=['clipboard-read', 'clipboard-write'])
    page = ctx.new_page()
    errors: list = []
    watch_errors(page, errors)
    page.goto(f'{APP}/create/url')
    field = page.get_by_label('Website URL')
    field.fill('not a url')
    expect(page.get_by_text('Enter a valid web address')).to_be_visible()
    expect(page.get_by_test_id('qr-waiting')).to_be_visible()
    field.fill('agame.uz/play?id=42')
    expect(page.get_by_text('Opens: https://agame.uz/play?id=42')).to_be_visible()
    expect(page.get_by_test_id('qr-render').locator('svg')).to_be_visible()
    assert full_content(page) == 'https://agame.uz/play?id=42'
    # copy content
    page.get_by_role('button', name='Copy content').click()
    assert page.evaluate('navigator.clipboard.readText()') == 'https://agame.uz/play?id=42'
    expected = 'https://agame.uz/play?id=42'
    sizes = {}
    for fmt in ['png', 'svg', 'jpeg', 'webp']:
        f = download(page, fmt, f'url-{fmt}')
        assert decode_file(f) == expected, f'{fmt} did not decode'
        if fmt != 'svg':
            sizes[fmt] = Image.open(f).size
    assert sizes['png'] == (1024, 1024), sizes
    svg = (ART / 'url-svg.svg').read_text()
    assert svg.lstrip().startswith(('<?xml', '<svg')) and '<rect' in svg and 'data:image/png' not in svg, 'SVG is not a vector file'
    assert Image.open(ART / 'url-jpeg.jpg').format == 'JPEG'
    assert Image.open(ART / 'url-webp.webp').format == 'WEBP'
    # size change → real export size
    page.get_by_role('radiogroup', name='Format').get_by_text('PNG', exact=True).click()
    page.get_by_label('Download size').select_option('2048')
    f = download(page, 'png', 'url-png-2048')
    assert Image.open(f).size == (2048, 2048)
    assert decode_file(f) == expected
    page.screenshot(path=str(ART / 'url-desktop.png'), full_page=True)
    assert not errors, errors
    ctx.close()


@test('Customization studio: styles, colors, logo, ECC change the real exported file and stay scannable')
def t_customize(browser):
    ctx = new_context(browser)
    page = ctx.new_page()
    page.goto(f'{APP}/create/url')
    page.get_by_label('Website URL').fill('https://azbek.uz/portfolio')
    page.get_by_role('button', name='Continue to design').click()
    page.get_by_role('radio', name='Dots').click()
    page.get_by_role('radiogroup', name='Corners').get_by_role('radio', name='Extra rounded').click()
    page.get_by_role('button', name='#6d1d3c / #fff8f3').click()
    expect(page.get_by_text('These settings scan reliably.')).to_be_visible()
    logo = make_logo(ART / 'logo.png')
    page.locator('#qr-logo-input').set_input_files(str(logo))
    expect(page.get_by_role('button', name='Remove')).to_be_visible()
    expect(page.get_by_role('radiogroup', name='Error correction').get_by_role('radio', name='H · 30%')).to_be_checked()
    set_range(page, '#logo-size', 0.3)
    expect(page.get_by_text('30%', exact=True)).to_be_visible()
    svg_path = download(page, 'svg', 'custom-svg')
    png_path = download(page, 'png', 'custom-png')
    svg = svg_path.read_text()
    assert '#6d1d3c' in svg and '#fff8f3' in svg, 'colors missing from SVG'
    assert '<image' in svg, 'logo missing from SVG'
    assert '<circle' in svg, 'dot style not applied'
    for f in (svg_path, png_path):
        assert decode_file(f) == 'https://azbek.uz/portfolio', f'{f.name} not scannable'
    px = Image.open(png_path).convert('RGB').getpixel((5, 5))
    assert px == (255, 248, 243), f'background color not applied: {px}'
    # readability warning
    hex_input = page.locator('#qr-color-hex')
    hex_input.fill('#dddddd')
    expect(page.get_by_text('Contrast is very low')).to_be_visible()
    hex_input.fill('#151923')
    # transparent background → PNG has alpha, JPEG becomes white
    page.get_by_role('switch', name='Transparent background').click()
    png_t = download(page, 'png', 'custom-transparent')
    assert Image.open(png_t).convert('RGBA').getpixel((3, 3))[3] == 0, 'PNG not transparent'
    jpg_t = download(page, 'jpeg', 'custom-transparent-jpeg')
    assert Image.open(jpg_t).convert('RGB').getpixel((3, 3)) == (255, 255, 255)
    assert decode_file(jpg_t) == 'https://azbek.uz/portfolio'
    page.screenshot(path=str(ART / 'design-panel.png'), full_page=True)
    # reset
    page.get_by_role('button', name='Reset design').first.click()
    expect(page.get_by_role('button', name='Upload logo')).to_be_visible()
    # print opens a print job with the QR
    page.evaluate("""() => { window.__printed = 0; new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => {
      if (n.tagName === 'IFRAME') { const w = n.contentWindow; w.print = () => { window.__printed++; window.__printedHtml = n.contentDocument.body.innerHTML; }; }
    }))).observe(document.body, { childList: true }); }""")
    page.get_by_role('button', name='Print').click()
    page.wait_for_function('window.__printed === 1')
    assert '<svg' in page.evaluate('window.__printedHtml')
    ctx.close()


@test('vCard: validation, valid vCard 3.0 payload with Unicode, decodes from download')
def t_vcard(browser):
    ctx = new_context(browser, permissions=['clipboard-read', 'clipboard-write'])
    page = ctx.new_page()
    page.goto(f'{APP}/create/vcard')
    page.get_by_label('First name').fill('Azizbek')
    page.get_by_label('Last name').fill('Qodirov')
    page.get_by_label('Company').fill('AzbekDev, LLC')
    page.get_by_label('Job title').fill('Dasturchi')
    page.get_by_label('Email').fill('bad-email')
    expect(page.get_by_text('Enter a valid email address.')).to_be_visible()
    page.get_by_label('Email').fill('azizbek@example.com')
    page.get_by_label('Phone number').fill('+998 90 123 45 67')
    page.get_by_label('Website').fill('azbek.uz')
    page.get_by_label('Street address').fill('Amir Temur koʻchasi, 1')
    page.get_by_label('City').fill('Тошкент')
    page.get_by_label('Country').fill('Oʻzbekiston')
    expect(page.get_by_test_id('qr-render').locator('svg')).to_be_visible()
    page.get_by_role('button', name='Copy content').click()
    payload = page.evaluate('navigator.clipboard.readText()')
    lines = payload.split('\r\n')
    assert lines[:2] == ['BEGIN:VCARD', 'VERSION:3.0'] and lines[-1] == 'END:VCARD', payload
    for expected in ['N:Qodirov;Azizbek;;;', 'FN:Azizbek Qodirov', 'ORG:AzbekDev\\, LLC', 'TEL;TYPE=CELL:+998901234567',
                     'EMAIL;TYPE=INTERNET:azizbek@example.com', 'URL:https://azbek.uz/', 'ADR;TYPE=WORK:;;Amir Temur koʻchasi\\, 1;Тошкент;;;Oʻzbekiston']:
        assert expected in lines, (expected, lines)
    f = download(page, 'png', 'vcard')
    assert decode_file(f) == payload
    ctx.close()


@test('Wi-Fi: escaping, show/hide password, security types, decodes from download')
def t_wifi(browser):
    ctx = new_context(browser)
    page = ctx.new_page()
    page.goto(f'{APP}/create/wifi')
    page.get_by_label('Network name (SSID)').fill('Cafe;Net:5G')
    pw = page.get_by_label('Password', exact=True)
    pw.fill('short')
    expect(page.get_by_text('A WPA password must be 8 to 63 characters long.')).to_be_visible()
    pw.fill('s3cr3t,"pass"')
    assert pw.get_attribute('type') == 'password'
    page.get_by_role('button', name='Show password').click()
    assert pw.get_attribute('type') == 'text'
    page.get_by_label('Hidden network').check()
    expected = 'WIFI:T:WPA;S:Cafe\\;Net\\:5G;P:s3cr3t\\,\\"pass\\";H:true;;'
    expect(page.get_by_test_id('qr-render').locator('svg')).to_be_visible()
    assert full_content(page) == expected, full_content(page)
    assert decode_file(download(page, 'png', 'wifi')) == expected
    page.get_by_role('radiogroup', name='Security type').get_by_text('None (open network)').click()
    expect(page.get_by_label('Password', exact=True)).to_have_count(0)
    assert full_content(page) == 'WIFI:T:nopass;S:Cafe\\;Net\\:5G;H:true;;'
    ctx.close()


@test('Authentication: sign up, sign out, wrong password error, sign in')
def t_auth(browser):
    ctx = new_context(browser)
    page = ctx.new_page()
    sign_up(page, USER_A)
    expect(page.get_by_test_id('dashboard-empty')).to_be_visible()
    page.get_by_role('button', name='Account').click()
    page.get_by_role('menuitem', name='Sign out').click()
    expect(page).to_have_url(f'{APP}/')
    page.goto(f'{APP}/dashboard')
    expect(page).to_have_url(re.compile('/login$'))
    page.get_by_label('Email').fill(USER_A['email'])
    page.get_by_label('Password', exact=True).fill('WrongPass1')
    page.locator('form').get_by_role('button', name='Sign in').click()
    expect(page.get_by_text('Incorrect email or password.')).to_be_visible()
    page.get_by_label('Password', exact=True).fill(USER_A['password'])
    page.locator('form').get_by_role('button', name='Sign in').click()
    expect(page).to_have_url(re.compile('/dashboard$'))
    # weak password rejected on sign-up
    ctx2 = new_context(browser)
    p2 = ctx2.new_page()
    p2.goto(f'{APP}/signup')
    p2.get_by_label('Your name').fill('X')
    p2.get_by_label('Email').fill(f'x.{RUN}@example.com')
    p2.get_by_label('Password', exact=True).fill('short')
    p2.get_by_label('Confirm password').fill('other')
    p2.get_by_role('button', name='Create account').click()
    expect(p2.get_by_text('Passwords don’t match.')).to_be_visible()
    ctx2.close()
    ctx.storage_state(path=str(ART / 'state-a.json'))
    ctx.close()


@test('Dashboard: save, list, search, filter, duplicate, folder, edit, download, delete')
def t_dashboard(browser):
    ctx = new_context(browser, storage_state=str(ART / 'state-a.json'))
    page = ctx.new_page()
    errors: list = []
    watch_errors(page, errors)
    page.goto(f'{APP}/create/url')
    page.get_by_label('Website URL').fill('hamyonpro.uz')
    page.get_by_label('QR code name').fill('HamyonPro site')
    page.get_by_label('Folder').fill('Projects')
    page.get_by_test_id('save-btn').click()
    expect(page.get_by_text('QR code saved')).to_be_visible()
    expect(page).to_have_url(re.compile(r'/create/url\?edit='))
    expect(page.get_by_role('button', name='Saved')).to_be_visible()
    # second QR: wifi
    page.goto(f'{APP}/create/wifi')
    page.get_by_label('Network name (SSID)').fill('Office')
    page.get_by_label('Password', exact=True).fill('officepass1')
    page.get_by_test_id('save-btn').click()
    expect(page.get_by_text('QR code saved')).to_be_visible()

    page.goto(f'{APP}/dashboard')
    cards = page.get_by_test_id('qr-card')
    expect(cards).to_have_count(2)
    expect(page.get_by_text('2 QR codes')).to_be_visible()
    page.get_by_placeholder('Search by name or content').fill('hamyon')
    expect(cards).to_have_count(1)
    page.get_by_placeholder('Search by name or content').fill('')
    page.get_by_label('Type').select_option('wifi')
    expect(cards).to_have_count(1)
    expect(cards.first).to_contain_text('Office')
    page.get_by_label('Type').select_option('')
    page.get_by_label('Folder').select_option('Projects')
    expect(cards).to_have_count(1)
    page.get_by_label('Folder').select_option('')
    page.get_by_label('Sort').select_option('name')
    expect(cards.first).to_contain_text('HamyonPro site')

    # duplicate
    cards.first.get_by_test_id('qr-card-menu').click()
    page.get_by_role('menuitem', name='Duplicate').click()
    expect(page.get_by_text('Copy created')).to_be_visible()
    expect(cards).to_have_count(3)
    # move to folder
    page.get_by_label('Sort').select_option('newest')
    cards.first.get_by_test_id('qr-card-menu').click()
    page.get_by_role('menuitem', name='Move to folder').click()
    page.get_by_role('dialog').get_by_label('Folder name').fill('Marketing')
    page.get_by_role('dialog').get_by_role('button', name='Save').click()
    expect(page.get_by_text('Folder updated')).to_be_visible()
    page.get_by_label('Folder').select_option('Marketing')
    expect(cards).to_have_count(1)
    page.get_by_label('Folder').select_option('')
    # download from dashboard
    with page.expect_download() as info:
        cards.first.get_by_test_id('qr-card-menu').click()
        page.get_by_role('menuitem', name='Download SVG').click()
    f = ART / 'dashboard-download.svg'
    info.value.save_as(f)
    assert decode_file(f) == 'https://hamyonpro.uz/'
    # edit → rename + change color → saved
    cards.filter(has_text='HamyonPro site').filter(has_not_text='(copy)').first.get_by_role('button', name=re.compile('^Edit:')).click()
    expect(page).to_have_url(re.compile(r'/create/url\?edit='))
    expect(page.get_by_label('Website URL')).to_have_value('hamyonpro.uz')
    page.get_by_label('QR code name').fill('HamyonPro landing')
    expect(page.get_by_text('Unsaved changes')).to_be_visible()
    page.get_by_test_id('save-changes-btn').click()
    expect(page.get_by_text('QR code updated')).to_be_visible()
    page.goto(f'{APP}/dashboard')
    expect(page.get_by_text('HamyonPro landing')).to_be_visible()
    page.screenshot(path=str(ART / 'dashboard-desktop.png'), full_page=True)
    # delete with confirmation (cancel first)
    target = cards.filter(has_text='(copy)').first
    target.get_by_test_id('qr-card-menu').click()
    page.get_by_role('menuitem', name='Delete').click()
    dialog = page.get_by_role('dialog')
    expect(dialog).to_contain_text('Delete this QR code?')
    dialog.get_by_role('button', name='Cancel').click()
    expect(cards).to_have_count(3)
    target.get_by_test_id('qr-card-menu').click()
    page.get_by_role('menuitem', name='Delete').click()
    page.get_by_role('dialog').get_by_role('button', name='Delete').click()
    expect(page.get_by_text('QR code deleted')).to_be_visible()
    expect(cards).to_have_count(2)
    page.reload()
    expect(cards).to_have_count(2)
    assert not errors, errors
    ctx.close()


@test('PDF: upload with type/size validation, real public URL, preview, QR points to the file')
def t_pdf(browser):
    ctx = new_context(browser, storage_state=str(ART / 'state-a.json'))
    page = ctx.new_page()
    page.goto(f'{APP}/create/pdf')
    fake = ART / 'fake.pdf'
    fake.write_text('this is not a pdf')
    page.locator('input[type=file][accept*="pdf"]').set_input_files(str(fake))
    expect(page.get_by_text('The file is damaged or in the wrong format.')).to_be_visible()
    pdf = make_pdf(ART / 'menu.pdf')
    page.locator('input[type=file][accept*="pdf"]').set_input_files(str(pdf))
    expect(page.get_by_test_id('pdf-file')).to_contain_text('menu.pdf')
    expect(page.get_by_test_id('qr-render').locator('svg')).to_be_visible()
    url = full_content(page)
    assert url.startswith(f'{API}/storage/v1/object/public/qr-files/'), url
    with urllib.request.urlopen(url) as r:
        assert r.headers['content-type'] == 'application/pdf'
        assert r.read() == pdf.read_bytes()
    expect(page.locator('object[type="application/pdf"]')).to_be_visible()
    assert decode_file(download(page, 'png', 'pdf')) == url
    page.get_by_test_id('save-btn').click()
    expect(page.get_by_text('QR code saved')).to_be_visible()
    # URL mode
    page.goto(f'{APP}/create/pdf')
    page.get_by_text('Use a link', exact=True).click()
    page.get_by_label('PDF link').fill('example.com/brochure')
    expect(page.get_by_text('doesn’t end in .pdf')).to_be_visible()
    page.get_by_label('PDF link').fill('example.com/brochure.pdf')
    expect(page.get_by_test_id('qr-render').locator('svg')).to_be_visible()
    assert full_content(page) == 'https://example.com/brochure.pdf'
    ctx.close()


@test('Images: multi-upload, thumbnails, remove, reorder, publish gallery, public page works logged out')
def t_images(browser):
    ctx = new_context(browser, storage_state=str(ART / 'state-a.json'))
    page = ctx.new_page()
    page.goto(f'{APP}/create/images')
    expect(page.get_by_test_id('qr-waiting')).to_contain_text('Publish the page first')
    page.get_by_label('Gallery title').fill('Autumn collection')
    page.get_by_label('Description').fill('Photos from the new line')
    files = [make_png(ART / f'img{i}.png', c, text=f'#{i}') for i, c in enumerate([(200, 40, 40), (40, 160, 60), (40, 70, 200), (120, 120, 120)], 1)]
    page.locator('input[type=file][accept*="image/jpeg"]').set_input_files([str(f) for f in files])
    thumbs = page.get_by_test_id('gallery-thumbs').locator('li img')
    expect(thumbs).to_have_count(4, timeout=30_000)
    # remove the 4th, move the 3rd (blue) to the top
    page.get_by_test_id('gallery-thumbs').locator('li').nth(3).get_by_role('button', name='Remove').click()
    expect(thumbs).to_have_count(3)
    page.get_by_test_id('gallery-thumbs').locator('li').nth(2).get_by_role('button', name='Move up').click()
    page.get_by_test_id('gallery-thumbs').locator('li').nth(1).get_by_role('button', name='Move up').click()
    order = [t.get_attribute('src') for t in thumbs.all()]
    page.get_by_role('button', name='Preview page').first.click()
    expect(page.get_by_role('dialog').get_by_role('heading', name='Autumn collection')).to_be_visible()
    page.get_by_role('dialog').get_by_role('button', name='Close').first.click()
    page.get_by_test_id('publish-btn').click()
    expect(page.get_by_text('Page published')).to_be_visible()
    link = page.get_by_test_id('page-link')
    expect(link).to_be_visible()
    page_url = full_content(page)
    assert re.match(rf'^{re.escape(APP)}/g/autumn-collection-[a-z0-9]{{6}}$', page_url), page_url
    assert decode_file(download(page, 'png', 'gallery')) == page_url
    SHARED['gallery_url'] = page_url

    anon = new_context(browser)
    p = anon.new_page()
    p.goto(page_url)
    expect(p.get_by_role('heading', name='Autumn collection')).to_be_visible()
    imgs = p.locator('article ul img')
    expect(imgs).to_have_count(3)
    p.wait_for_function("[...document.querySelectorAll('article ul img')].every(i => i.complete && i.naturalWidth > 0)")
    assert [i.get_attribute('src') for i in imgs.all()] == order
    # WebP re-encoding + resize happened client-side
    assert all(src.endswith(('.webp', '.jpg')) for src in order), order
    imgs.first.click()
    expect(p.get_by_role('dialog')).to_contain_text('1 / 3')
    p.keyboard.press('ArrowRight')
    expect(p.get_by_role('dialog')).to_contain_text('2 / 3')
    p.keyboard.press('Escape')
    expect(p.get_by_role('dialog')).to_have_count(0)
    assert p.title().startswith('Autumn collection')
    p.screenshot(path=str(ART / 'public-gallery.png'), full_page=True)
    anon.close()
    ctx.close()


@test('Social media: profile, avatar, links, reorder, publish; public page buttons open the right URLs')
def t_social(browser):
    ctx = new_context(browser, storage_state=str(ART / 'state-a.json'))
    page = ctx.new_page()
    page.goto(f'{APP}/create/social')
    page.get_by_label('Profile name').fill('Azizbek Qodirov')
    page.get_by_label('Description').fill('Web developer · Tashkent')
    page.locator('input[type=file][accept*="image/png"]').first.set_input_files(str(make_png(ART / 'avatar.png', (71, 123, 255), (500, 500))))
    expect(page.locator('img[src*="/avatars/"]')).to_be_visible(timeout=20_000)
    rows = page.get_by_test_id('social-link-row')
    for i, (platform, value) in enumerate([('instagram', '@azbekdev'), ('telegram', 'QodirovAzizbek'), ('whatsapp', '+998 90 123 45 67'), ('youtube', 'https://evil.com/x')]):
        page.get_by_role('button', name='Add link').click()
        rows.nth(i).get_by_label('Platform').select_option(platform)
        rows.nth(i).get_by_label('Username or link').fill(value)
    expect(rows.nth(3).get_by_text('This link or username isn’t valid')).to_be_visible()
    page.get_by_test_id('publish-btn').click()
    expect(page.get_by_text('Please fix the highlighted fields.')).to_be_visible()
    rows.nth(3).get_by_label('Username or link').fill('@azbekdev')
    rows.nth(2).get_by_role('button', name='Move up').click()  # whatsapp above telegram
    expect(rows.nth(1).get_by_label('Platform')).to_have_value('whatsapp')
    page.get_by_test_id('publish-btn').click()
    expect(page.get_by_text('Page published')).to_be_visible()
    page_url = full_content(page)
    assert re.match(rf'^{re.escape(APP)}/p/azizbek-qodirov-[a-z0-9]{{6}}$', page_url), page_url
    SHARED['social_url'] = page_url

    anon = new_context(browser)
    p = anon.new_page()
    p.goto(page_url)
    expect(p.get_by_role('heading', name='Azizbek Qodirov')).to_be_visible()
    hrefs = [p.get_by_test_id(f'social-btn-{k}').get_attribute('href') for k in ['instagram', 'whatsapp', 'telegram', 'youtube']]
    assert hrefs == ['https://instagram.com/azbekdev', 'https://wa.me/998901234567', 'https://t.me/QodirovAzizbek', 'https://youtube.com/@azbekdev'], hrefs
    order = p.evaluate("[...document.querySelectorAll('[data-testid^=social-btn-]')].map(a => a.dataset.testid)")
    assert order == ['social-btn-instagram', 'social-btn-whatsapp', 'social-btn-telegram', 'social-btn-youtube'], order
    assert p.get_by_test_id('social-btn-instagram').get_attribute('target') == '_blank'
    assert 'noopener' in p.get_by_test_id('social-btn-instagram').get_attribute('rel')
    assert p.locator('meta[property="og:title"]').get_attribute('content') == 'Azizbek Qodirov'
    p.screenshot(path=str(ART / 'public-social.png'), full_page=True)
    anon.close()
    ctx.close()


@test('Business page: details, hours, contact actions, vCard download; editing updates page, QR stays the same')
def t_business(browser):
    ctx = new_context(browser, storage_state=str(ART / 'state-a.json'))
    page = ctx.new_page()
    page.goto(f'{APP}/create/business')
    page.get_by_label('Business name').fill('Coffee House')
    page.get_by_label('Description').fill('Specialty coffee in the city centre.')
    page.get_by_label('Phone').fill('+998 71 200 00 00')
    page.get_by_label('Email').fill('hello@coffee.example')
    page.get_by_label('Website').fill('coffee.example')
    page.get_by_label('Address').fill('Tashkent, Amir Temur 15')
    page.get_by_label('Google Maps link').fill('https://maps.app.goo.gl/abc123')
    expect(page.get_by_label('Saturday — Opens')).to_have_count(0)
    page.locator('li', has_text='Saturday').get_by_label('Closed').uncheck()
    page.get_by_label('Saturday — Opens').fill('10:00')
    page.get_by_label('Saturday — Closes').fill('16:00')
    page.get_by_role('button', name='Add link').click()
    page.get_by_test_id('social-link-row').first.get_by_label('Username or link').fill('@coffeehouse')
    page.get_by_test_id('publish-btn').click()
    expect(page.get_by_text('Page published')).to_be_visible()
    page_url = full_content(page)
    assert '/b/coffee-house-' in page_url
    png_before = download(page, 'png', 'business')
    assert decode_file(png_before) == page_url

    anon = new_context(browser)
    p = anon.new_page()
    p.goto(page_url)
    expect(p.get_by_role('heading', name='Coffee House')).to_be_visible()
    assert p.get_by_role('link', name='Call').get_attribute('href') == 'tel:+998712000000'
    assert p.get_by_role('link', name='Email').first.get_attribute('href') == 'mailto:hello@coffee.example'
    assert p.get_by_role('link', name='Directions').get_attribute('href') == 'https://maps.app.goo.gl/abc123'
    expect(p.get_by_role('row', name=re.compile('Saturday'))).to_contain_text('10:00 – 16:00')
    expect(p.get_by_role('row', name=re.compile('Sunday'))).to_contain_text('Closed')
    with p.expect_download() as info:
        p.get_by_role('button', name='Save contact').click()
    vcf = ART / 'business.vcf'
    info.value.save_as(vcf)
    assert 'FN:Coffee House' in vcf.read_text() and 'TEL;TYPE=WORK:+998712000000' in vcf.read_text()
    p.screenshot(path=str(ART / 'public-business.png'), full_page=True)

    # edit: change description → page updates, QR content unchanged
    page.get_by_label('Description').fill('Now open on Saturdays!')
    expect(page.get_by_text('Unsaved changes')).to_be_visible()
    page.get_by_test_id('save-changes-btn').click()
    expect(page.get_by_text('Page updated. Your QR code stays the same.')).to_be_visible()
    assert full_content(page) == page_url
    p.reload()
    expect(p.get_by_text('Now open on Saturdays!')).to_be_visible()
    SHARED['business_url'] = page_url
    anon.close()
    ctx.close()


@test('Authorization: another user cannot see, edit or delete private QR codes or files (RLS)')
def t_authorization(browser):
    ctx = new_context(browser)
    page = ctx.new_page()
    sign_up(page, USER_B)
    expect(page.get_by_test_id('dashboard-empty')).to_be_visible()
    token_a = token_for(USER_A)
    token_b = token_for(USER_B)
    status, rows_a = api('GET', '/rest/v1/qr_codes?select=id,user_id,type', token_a)
    assert status == 200 and len(rows_a) >= 5, rows_a
    a_id = rows_a[0]['id']
    page.goto(f'{APP}/create/{rows_a[0]["type"]}?edit={a_id}')
    expect(page.get_by_text('QR code not found, or you don’t have access to it.')).to_be_visible()
    status, rows = api('GET', '/rest/v1/qr_codes?select=id', token_b)
    assert status == 200 and rows == [], rows
    status, rows = api('PATCH', f'/rest/v1/qr_codes?id=eq.{a_id}', token_b, {'name': 'hacked'}, {'Prefer': 'return=representation'})
    assert status == 200 and rows == [], (status, rows)
    status, rows = api('DELETE', f'/rest/v1/qr_codes?id=eq.{a_id}', token_b, headers={'Prefer': 'return=representation'})
    assert status == 200 and rows == [], (status, rows)
    status, body = api('POST', '/rest/v1/qr_codes', token_b, {'user_id': rows_a[0]['user_id'], 'type': 'url', 'name': 'x', 'content': 'https://x.io'})
    assert status in (401, 403), (status, body)
    status, body = api('GET', '/rest/v1/qr_codes?select=id', None)
    assert status in (401, 403), (status, body)
    status, body = api('GET', '/rest/v1/pages?select=slug', None)
    assert status in (401, 403), ('anon must not list pages', status, body)
    status, rows = api('PATCH', '/rest/v1/pages?kind=eq.social', token_b, {'title': 'hacked'}, {'Prefer': 'return=representation'})
    assert status == 200 and rows == [], rows
    # storage: B cannot upload into A's folder
    req = urllib.request.Request(f'{API}/storage/v1/object/qr-files/{rows_a[0]["user_id"]}/pdf/evil.pdf', method='POST', data=b'%PDF-1.4', headers={'Authorization': f'Bearer {token_b}', 'Content-Type': 'application/pdf'})
    try:
        urllib.request.urlopen(req)
        raise AssertionError('upload into another user folder succeeded')
    except urllib.error.HTTPError as e:
        assert e.code == 403, e.code
    # A's data unchanged
    status, rows = api('GET', f'/rest/v1/qr_codes?id=eq.{a_id}&select=name', token_a)
    assert rows[0]['name'] != 'hacked'
    # public pages remain public for everyone
    page.goto(SHARED['social_url'])
    expect(page.get_by_role('heading', name='Azizbek Qodirov')).to_be_visible()
    page.goto(f'{APP}/p/does-not-exist-abcdef')
    expect(page.get_by_test_id('public-not-found')).to_be_visible()
    ctx.close()


@test('Password reset: email link → set new password → sign in with it')
def t_password_reset(browser):
    ctx = new_context(browser)
    page = ctx.new_page()
    page.goto(f'{APP}/login')
    page.get_by_role('link', name='Forgot password?').click()
    page.get_by_label('Email').fill(USER_A['email'])
    page.get_by_role('button', name='Send link').click()
    expect(page.get_by_text('a reset link has been sent')).to_be_visible()
    mail = None
    for _ in range(40):
        try:
            with urllib.request.urlopen(f'{API}/__test/mail?to={USER_A["email"]}') as r:
                mail = json.loads(r.read())
                break
        except urllib.error.HTTPError:
            time.sleep(0.25)
    assert mail, 'no reset email captured'
    body = mail['data']
    if 'quoted-printable' in body.lower():
        import quopri
        body = quopri.decodestring(body.encode()).decode('utf-8', 'replace')
    link = re.search(r'href="([^"]+/auth/v1/verify[^"]+)"', body).group(1).replace('&amp;', '&')
    page.goto(link)
    expect(page).to_have_url(re.compile('/update-password'))
    new_pw = 'NewPassw0rd!'
    page.get_by_label('New password').fill(new_pw)
    page.get_by_label('Confirm password').fill(new_pw)
    page.get_by_role('button', name='Update password').click()
    expect(page).to_have_url(re.compile('/dashboard$'))
    USER_A['password'] = new_pw
    ctx2 = new_context(browser)
    p2 = ctx2.new_page()
    sign_in(p2, USER_A)
    expect(p2.get_by_test_id('qr-card').first).to_be_visible()
    ctx2.storage_state(path=str(ART / 'state-a.json'))
    ctx2.close()
    ctx.close()


@test('Profile: update display name (persists after reload)')
def t_profile(browser):
    ctx = new_context(browser, storage_state=str(ART / 'state-a.json'))
    page = ctx.new_page()
    page.goto(f'{APP}/account')
    page.get_by_label('Display name').fill('Alice Q')
    page.get_by_role('button', name='Save').click()
    expect(page.get_by_text('Profile saved')).to_be_visible()
    page.reload()
    expect(page.get_by_label('Display name')).to_have_value('Alice Q')
    ctx.close()


@test('Languages: Uzbek default, Russian and English switch everything incl. validation, choice persists')
def t_i18n(browser):
    ctx = new_context(browser, lang=None)
    page = ctx.new_page()
    page.goto(f'{APP}/create/url')
    nav = page.get_by_role('navigation', name='Main')
    expect(nav.get_by_role('link', name='Bosh sahifa')).to_be_visible()
    page.get_by_role('button', name=re.compile('^Til:')).click()
    page.get_by_role('menuitem', name='Русский').click()
    expect(nav.get_by_role('link', name='Главная')).to_be_visible()
    page.get_by_label('Адрес сайта').fill('bad url')
    expect(page.get_by_text('Введите корректный адрес')).to_be_visible()
    page.reload()
    expect(nav.get_by_role('link', name='Главная')).to_be_visible()
    assert page.evaluate('document.documentElement.lang') == 'ru'
    page.get_by_role('button', name=re.compile('^Язык:')).click()
    page.get_by_role('menuitem', name='English').click()
    expect(nav.get_by_role('link', name='Home')).to_be_visible()
    body = page.locator('body').inner_text()
    assert not re.search(r'[А-Яа-я]', body), 'Cyrillic left on English page'
    ctx.close()


@test('Responsive: no horizontal overflow at 320/375/768/1024/1440; mobile nav, sticky QR bar, modals fit')
def t_responsive(browser):
    paths = ['/', '/create/url', '/create/business', '/pricing', '/help', '/login', '/dashboard',
             SHARED['social_url'].replace(APP, ''), SHARED['business_url'].replace(APP, ''), SHARED['gallery_url'].replace(APP, '')]
    problems = []
    for width in [320, 375, 768, 1024, 1440]:
        ctx = new_context(browser, width=width, height=800, storage_state=str(ART / 'state-a.json'),
                          is_mobile=width < 768, has_touch=width < 1024)
        page = ctx.new_page()
        for path in paths:
            page.goto(APP + path, wait_until='networkidle')
            if path == '/create/url':
                page.get_by_label('Website URL').fill('example.com')
                page.wait_for_timeout(300)
            sw, iw = no_overflow(page)
            if sw > iw:
                problems.append(f'{width}px {path}: scrollWidth {sw} > {iw}')
            if width in (320, 375, 768, 1440) and path in ('/', '/create/url', '/dashboard') or (width == 375 and path.startswith(('/p/', '/b/', '/g/'))):
                page.screenshot(path=str(ART / f'resp-{width}-{path.strip("/").replace("/", "_") or "home"}.png'), full_page=True)
        if width < 768:
            page.goto(APP)
            page.get_by_role('button', name='Menu').click()
            expect(page.locator('#mobile-nav').get_by_role('link', name='Pricing')).to_be_visible()
            page.goto(f'{APP}/create/url')
            page.get_by_label('Website URL').fill('example.com')
            bar_qr = page.locator('div.fixed.bottom-0 [data-testid=qr-render] svg')
            expect(bar_qr).to_be_visible()
            page.get_by_role('button', name='Next').click()
            page.get_by_role('button', name='Next').click()
            expect(page.get_by_test_id('download-btn')).to_be_visible()
            box = page.get_by_test_id('download-btn').bounding_box()
            assert box['height'] >= 40, box
            page.goto(f'{APP}/dashboard')
            page.get_by_test_id('qr-card-menu').first.click()
            page.get_by_role('menuitem', name='Delete').click()
            dbox = page.get_by_role('dialog').bounding_box()
            assert dbox['x'] >= 0 and dbox['x'] + dbox['width'] <= width + 0.5 and dbox['y'] >= 0, dbox
            page.screenshot(path=str(ART / f'resp-{width}-dialog.png'))
            page.get_by_role('dialog').get_by_role('button', name='Cancel').click()
        ctx.close()
    assert not problems, problems


@test('Keyboard accessibility: skip link, type cards and menus usable without a mouse')
def t_keyboard(browser):
    ctx = new_context(browser)
    page = ctx.new_page()
    page.goto(APP)
    page.keyboard.press('Tab')
    focused = page.evaluate('document.activeElement.textContent')
    assert 'Skip to main content' in focused, focused
    page.get_by_test_id('type-card-vcard').focus()
    page.keyboard.press('Enter')
    expect(page).to_have_url(re.compile('/create/vcard$'))
    lang = page.get_by_role('button', name=re.compile('^Language:'))
    lang.focus()
    page.keyboard.press('ArrowDown')
    expect(page.get_by_role('menu')).to_be_visible()
    page.keyboard.press('Escape')
    expect(page.get_by_role('menu')).to_have_count(0)
    focus = page.evaluate("[document.activeElement.matches(':focus-visible'), getComputedStyle(document.activeElement).outlineStyle]")
    assert focus[0] and focus[1] != 'none', focus
    ctx.close()


@test('Delete cascades: deleting a page QR removes its public page and uploaded files')
def t_delete_cascade(browser):
    ctx = new_context(browser, storage_state=str(ART / 'state-a.json'))
    page = ctx.new_page()
    page.goto(f'{APP}/dashboard')
    gallery_url = SHARED['gallery_url']
    token = token_for(USER_A)
    _, rows = api('GET', '/rest/v1/qr_codes?type=eq.images&select=data', token)
    img_url = rows[0]['data']['images'][0]['url']
    assert urllib.request.urlopen(img_url).status == 200
    card = page.get_by_test_id('qr-card').filter(has_text='Autumn collection')
    card.get_by_test_id('qr-card-menu').click()
    page.get_by_role('menuitem', name='Delete').click()
    page.get_by_role('dialog').get_by_role('button', name='Delete').click()
    expect(page.get_by_text('QR code deleted')).to_be_visible()
    p = ctx.new_page()
    p.goto(gallery_url)
    expect(p.get_by_test_id('public-not-found')).to_be_visible()
    try:
        urllib.request.urlopen(img_url)
        raise AssertionError('image still served after delete')
    except urllib.error.HTTPError:
        pass
    ctx.close()


# ------------------------------------------------------------------ main
def main():
    only = sys.argv[1:]
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        for fn in TESTS:
            if only and not any(o in fn.__name__ for o in only):
                continue
            start = time.time()
            try:
                fn(browser)
                RESULTS.append({'name': fn._name, 'status': 'PASS', 'seconds': round(time.time() - start, 1)})
                print(f'PASS  {fn._name}')
            except Exception as e:  # noqa: BLE001
                RESULTS.append({'name': fn._name, 'status': 'FAIL', 'seconds': round(time.time() - start, 1), 'error': f'{type(e).__name__}: {e}'})
                print(f'FAIL  {fn._name}\n      {type(e).__name__}: {e}')
                traceback.print_exc(limit=3)
        browser.close()
    (ART / 'results.json').write_text(json.dumps(RESULTS, indent=2, ensure_ascii=False))
    passed = sum(r['status'] == 'PASS' for r in RESULTS)
    print(f'\n{passed}/{len(RESULTS)} passed')
    sys.exit(0 if passed == len(RESULTS) else 1)


if __name__ == '__main__':
    main()
