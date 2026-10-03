# Sign in once, then the Admin card must open the panel directly — even with
# cookies and browser storage both blocked (the harshest preview pane).
#     BASE=http://localhost:8080 python3 test/direct-open.py
import os
from playwright.sync_api import sync_playwright
import time

BASE = os.environ.get('BASE', 'http://localhost:8080')
PW = os.environ.get('PW', 'TestOnly-Xiks-2026')

def strip(route):
    """Simulate the preview: no cookies, and no session storage."""
    req = route.request
    if '/api/' in req.url:
        h = dict(req.headers)
        h.pop('cookie', None)
        route.continue_(headers=h)
    else:
        route.continue_()

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width':1400,'height':950})
    # storage blocked for the whole context
    ctx.add_init_script("""
      Object.defineProperty(window, 'sessionStorage', { get(){ throw new Error('blocked'); } });
      Object.defineProperty(window, 'localStorage', { get(){ throw new Error('blocked'); } });
    """)
    ctx.route('**/*', strip)
    pg = ctx.new_page()

    print('PREVIEW-LIKE: cookies blocked, sessionStorage blocked')
    pg.goto(f'{BASE}/admin', wait_until='load'); time.sleep(1.5)
    print('  1. first visit  → login card:', pg.locator('#login').is_visible())
    if pg.locator('#u').is_visible(): pg.fill('#u','xiks'); pg.fill('#p', PW); pg.click('#loginGo') if pg.locator('#loginGo').is_visible() else None
    pg.wait_for_selector('nav.nav', timeout=15000); time.sleep(1)
    print('  2. after sign-in → panel open:', pg.locator('nav.nav').is_visible())
    print('     address bar now          :', pg.url[:60] + '…?tok=…')

    print('  3. RELOAD (fresh page, storage still blocked)')
    pg.reload(wait_until='load'); time.sleep(2)
    print('     → panel opened directly  :', pg.locator('nav.nav').is_visible())
    print('     → login card shown?      :', pg.locator('#login').is_visible())

    print('  4. click "Open storefront" in the sidebar, then the Admin card there')
    with pg.expect_popup() as pop:
        pg.click('a[data-ext]')
    store = pop.value
    store.wait_for_load_state('load'); time.sleep(1.5)
    href = store.eval_on_selector('[data-admin-link]', 'e => e.getAttribute("href")')
    print('     admin card href          :', href[:44] + '…')
    store.click('[data-admin-link]'); time.sleep(2.5)
    print('     → straight into the panel:', store.locator('nav.nav').is_visible())
    print('     → no password asked      :', not store.locator('#login').is_visible())
    store.click('nav.nav button[data-tab=products]'); time.sleep(2)
    print('     → products listed        :', store.locator('#productsWrap tbody tr').count(), 'rows')
    b.close()
