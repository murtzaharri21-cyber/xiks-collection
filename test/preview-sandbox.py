# Drives the site the way a preview pane does: inside a sandboxed iframe where
# cookies and form submits are blocked. Run against a live server:
#     BASE=http://localhost:8080 python3 test/preview-sandbox.py
import os
from playwright.sync_api import sync_playwright
import time, re

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

WRAP = lambda url: f"""<!doctype html><html><body style="margin:0">
<iframe id="f" sandbox="allow-scripts allow-popups" src="{url}" style="width:1200px;height:900px;border:0"></iframe>
</body></html>"""

with sync_playwright() as p:
    b = p.chromium.launch(args=['--disable-dev-shm-usage', '--no-sandbox'])
    ctx = b.new_context(viewport={'width':1280,'height':950})
    pg = ctx.new_page()
    print('A SANDBOXED FRAME (no cookies, no form submits — like your preview)')

    # ---------- admin ----------
    pg.set_content(WRAP(f'{BASE}/admin')); time.sleep(2)
    fr = pg.frame_locator('#f')
    if fr.locator('#login').is_visible():            # password mode
        fr.locator('#u').fill('xiks'); fr.locator('#p').fill(PW)
        fr.locator('#loginGo').click()
    time.sleep(2.5)
    print('  admin sign-in      :', 'opened' if fr.locator('nav.nav').is_visible() else 'FAILED')
    fr.locator('nav.nav button[data-tab=products]').click(); time.sleep(2)
    print('  products listed    :', fr.locator('#productsWrap tbody tr').count(), 'rows')

    # edit a product through the sandboxed UI (proves Save works without form submit)
    fr.locator('#productsWrap tbody tr').first.locator('[data-edit]').click(); time.sleep(1.2)
    before = fr.locator('#pm_name').input_value()
    fr.locator('#pm_name').fill(before + ' ✦'); fr.locator('#pmSave').click(); time.sleep(2)
    after = fr.locator('#productsWrap tbody tr').first.inner_text()
    print('  edit + save worked :', '✦' in after)
    fr.locator('#productsWrap tbody tr').first.locator('[data-edit]').click(); time.sleep(1.2)
    fr.locator('#pm_name').fill(before); fr.locator('#pmSave').click(); time.sleep(2)
    print('  restored           :', '✦' not in fr.locator('#productsWrap tbody tr').first.inner_text())

    # ---------- storefront checkout ----------
    pg.set_content(WRAP(f'{BASE}/')); time.sleep(2.5)
    fs = pg.frame_locator('#f')
    fs.locator('.p-card [data-add]').first.click(); time.sleep(1.5)
    fs.locator('#checkoutGo').click(); time.sleep(1.5)
    fs.locator('#co_name').fill('Sandbox Buyer')
    fs.locator('#co_phone').fill('03001234567')
    fs.locator('#co_city').fill('Gilgit')
    fs.locator('#co_address').fill('Near the bridge')
    fs.locator('#coSubmit').click(); time.sleep(3)
    ref = re.search(r'XK-\d{4}-\d{4}', fs.locator('body').inner_text())
    print('  order placed       :', ref.group(0) if ref else 'FAILED')

    # ---------- tracking ----------
    pg.set_content(WRAP(f'{BASE}/track')); time.sleep(2)
    ft = pg.frame_locator('#f')
    ft.locator('#ref').fill(ref.group(0)); ft.locator('#trackGo').click(); time.sleep(2.5)
    txt = ft.locator('body').inner_text()
    print('  tracking found it  :', ref.group(0) in txt and 'received' in txt.lower())

    # cleanup
    pg.request.post(f'{BASE}/api/admin/login', data={'username':'xiks','password':PW})
    pg.request.delete(f'{BASE}/api/admin/orders/' + ref.group(0))
    print('  test order removed :', len(pg.request.get(f'{BASE}/api/admin/orders').json()['orders']) == 0)
    b.close()
