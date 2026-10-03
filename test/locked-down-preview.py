# Worst-case environment: a proxy that strips our custom header and a browser
# that never sends cookies. The panel must still sign in and edit products.
#     BASE=http://localhost:8080 python3 test/locked-down-preview.py
import os
from playwright.sync_api import sync_playwright
import time, json

BASE = os.environ.get('BASE', 'http://localhost:8080')
def find_pw():
    """The admin password, without hard-coding it in the repository:
       $PW wins, otherwise it is read from the local data/ADMIN-LOGIN.txt."""
    import os, re
    if os.environ.get('PW'):
        return os.environ['PW']
    try:
        m = re.search(r'password:\s*(\S+)', open('data/ADMIN-LOGIN.txt', encoding='utf-8').read())
        return m.group(1) if m else ''
    except OSError:
        return ''
PW = find_pw()

with sync_playwright() as p:
    b = p.chromium.launch(args=['--disable-dev-shm-usage', '--no-sandbox'])
    ctx = b.new_context(viewport={'width':1400,'height':950})
    pg = ctx.new_page()
    calls = []
    def strip(route):
        req = route.request
        if '/api/' in req.url:
            calls.append((req.method, req.url.split(BASE.split('//')[-1])[-1][:60]))
            h = dict(req.headers); h.pop('x-xiks-token', None); h.pop('cookie', None)
            route.continue_(headers=h)
        else:
            route.continue_()
    ctx.route('**/*', strip)

    pg.goto(f'{BASE}/admin', wait_until='load'); time.sleep(1.5)
    if pg.locator('#u').is_visible(): pg.fill('#u','xiks'); pg.fill('#p', PW); pg.click('#loginGo') if pg.locator('#loginGo').is_visible() else None
    pg.wait_for_selector('nav.nav', timeout=15000)
    pg.click('nav.nav button[data-tab=products]')
    pg.wait_for_selector('#productsWrap tbody tr', timeout=15000); time.sleep(1)

    before = pg.locator('#productsWrap tbody tr').first.inner_text().split('\n')[0]
    pg.locator('#productsWrap tbody tr').first.locator('[data-edit]').click(); time.sleep(1.2)
    name = pg.locator('#pm_name').input_value()
    pg.locator('#pm_name').fill(name + ' ABC')
    pg.locator('#pmSave').click()
    # poll the API until the change shows up (or 10s)
    ok = False
    for _ in range(20):
        time.sleep(0.5)
        got = pg.evaluate("(u) => fetch(u).then(r=>r.json()).then(d=>d.products[0].name)", BASE + '/api/products')
        if 'ABC' in got: ok = True; break
    print('  PATCH persisted (server-side) :', ok)
    print('  row in the table              :', pg.locator('#productsWrap tbody tr').first.inner_text().split('\n')[0])
    print('  toast                         :', pg.inner_text('#toast') or '(none)')

    # put it back
    pg.locator('#productsWrap tbody tr').first.locator('[data-edit]').click(); time.sleep(1.2)
    pg.locator('#pm_name').fill(name); pg.locator('#pmSave').click(); time.sleep(2.5)
    restored = pg.evaluate("(u) => fetch(u).then(r=>r.json()).then(d=>d.products[0].name)", BASE + '/api/products')
    print('  restored on the server        :', restored)
    print('  api calls made                :', len(calls))
    print('  sample                        :', calls[-3:])
    b.close()
