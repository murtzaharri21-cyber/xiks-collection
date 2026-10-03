# With OPEN_ADMIN=1 the Admin card must drop the owner straight into the panel —
# no password, even in a browser that blocks cookies and storage.
#     BASE=http://localhost:8080 python3 test/card-opens-directly.py
import os
from playwright.sync_api import sync_playwright
import time, tempfile

BASE = os.environ.get('BASE', 'http://localhost:8080')

import json, urllib.request
_s = json.load(urllib.request.urlopen(BASE + '/api/admin/session'))
if not _s.get('open'):
    print('\n  Skipped: this test needs the server started with OPEN_ADMIN=1.')
    print('  Right now credentials are required (open mode off), which is the default.\n')
    raise SystemExit(0)

print('FRESH BROWSER — no cookies, no storage, straight to the storefront')
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width':1440,'height':950})
    ctx.add_init_script("""
      Object.defineProperty(window, 'sessionStorage', { get(){ throw new Error('blocked'); } });
      Object.defineProperty(window, 'localStorage', { get(){ throw new Error('blocked'); } });
    """)
    pg = ctx.new_page()

    pg.goto(f'{BASE}/', wait_until='load'); time.sleep(1.5)
    print('  1. storefront loaded')
    pg.click('#adminBtn'); time.sleep(2.5)
    print('  2. clicked the Admin card →', 'PANEL OPEN, no password' if pg.locator('nav.nav').is_visible() else 'login card ✗')
    print('     warning banner shown  :', pg.locator('#openBar').is_visible())
    pg.click('nav.nav button[data-tab=products]'); time.sleep(1.5)
    rows = pg.locator('#productsWrap tbody tr').count()
    print('  3. products listed      :', rows, 'rows')
    pg.screenshot(path='screenshots/admin-open-mode.png')

    # edit something to prove it is fully usable
    pg.locator('#productsWrap tbody tr').first.locator('[data-edit]').click(); time.sleep(1.2)
    name = pg.locator('#pm_name').input_value()
    pg.locator('#pm_name').fill(name + ' T'); pg.locator('#pmSave').click(); time.sleep(2)
    print('  4. edit + save          :', 'T' in pg.locator('#productsWrap tbody tr').first.inner_text())
    pg.locator('#productsWrap tbody tr').first.locator('[data-edit]').click(); time.sleep(1.2)
    pg.locator('#pm_name').fill(name); pg.locator('#pmSave').click(); time.sleep(2)
    print('     restored             :', name == pg.locator('#productsWrap tbody tr').first.inner_text().split('\n')[0].lstrip('\t'))

    # and via the footer link too
    pg.goto(f'{BASE}/', wait_until='load'); time.sleep(1.5)
    href_ok = pg.locator('#adminLink').get_attribute('href')
    pg.click('#adminLink'); time.sleep(2.5)
    print('  5. footer Admin link    :', 'opens directly' if pg.locator('nav.nav').is_visible() else 'login card ✗')
    b.close()
