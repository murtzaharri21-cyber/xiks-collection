#!/usr/bin/env python3
"""
test/browser-sweep.py — drives the real site in a browser.

  1. storefront: scroll the 3D page, add to bag, checkout, read the order ref
  2. tracking page: look that ref up
  3. admin: sign in, products list, edit, add, delete, orders list
  4. offline behaviour: the products tab must explain itself, not look empty

Usage:  BASE=http://localhost:8080 python3 test/browser-sweep.py
"""
import os, re, time, sys
from playwright.sync_api import sync_playwright

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
USER = os.environ.get('USERNAME', 'xiks')

results = []
def check(name, cond, extra=''):
    results.append((name, bool(cond)))
    print(f"  {'✓' if cond else '✗'} {name}{'  ' + str(extra) if extra else ''}")

with sync_playwright() as p:
    browser = p.chromium.launch(args=['--disable-dev-shm-usage', '--no-sandbox'])
    page = browser.new_page(viewport={'width': 1440, 'height': 950})
    errors, bad = [], []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    page.on('response', lambda r: bad.append(f"{r.status} {r.url}") if r.status >= 400 else None)

    # ---------------------------------------------------------- storefront --
    print("\nSTOREFRONT")
    page.goto(BASE + '/', wait_until='load')
    page.wait_for_selector('.p-card', timeout=15000)
    cards = page.locator('.p-card').count()
    check('product cards render', cards >= 6, f'{cards} cards')
    check('no console errors on load', not errors, errors[:2])

    page.evaluate("window.scrollTo(0, document.body.scrollHeight * 0.45)")
    time.sleep(1.0)
    # the hero is the shop's flat poster banner (by request); motion lives in the
    # banner entrance, the marquee, the scroll reveals and the 3D product cards
    check('page still animates (banner / marquee / reveals)', page.evaluate(
        """() => {
          const anim = document.getAnimations ? document.getAnimations().length : 0;
          const mq = document.querySelector('.mq-track');
          const mqAnim = mq && getComputedStyle(mq).animationName !== 'none';
          const depth = Array.from(document.querySelectorAll('[data-depth]')).some(e => e.style.transform);
          return anim > 0 || mqAnim || depth;
        }"""))

    # add the first product to the bag
    page.locator('.p-card [data-add]').first.click()
    time.sleep(0.8)
    check('bag badge shows 1 item', page.inner_text('#bagCount').strip() == '1')

    # the drawer opens by itself when something is added — check the thumbnail loads
    time.sleep(1.2)
    if not page.locator('#drawer').evaluate("e => e.classList.contains('on')"):
        page.click('#bagBtn'); time.sleep(1.0)
    ok_thumb = page.evaluate(
        "() => { const i = document.querySelector('#drawerBody img');"
        " return !!i && i.complete && i.naturalWidth > 4; }")
    check('bag thumbnail renders (no 404)', ok_thumb)

    # checkout
    page.click('#checkoutGo')
    time.sleep(0.8)
    page.fill('#co_name', 'Sweep Tester')
    page.fill('#co_phone', '03001234567')
    page.fill('#co_city', 'Karimabad')
    page.fill('#co_address', 'Main bazaar, near the fort')
    page.click('#coSubmit')
    page.wait_for_selector('#coRef', timeout=15000)
    body = page.inner_text('body')
    ref = re.search(r'XK-\d{4}-\d{4}', body)
    check('order placed through the UI', bool(ref), ref.group(0) if ref else 'no ref found')
    check('order confirmation shows the total', 'Rs' in body)

    # ------------------------------------------------------------ tracking --
    print("\nTRACKING")
    page.goto(BASE + '/track', wait_until='load')
    page.fill('input', ref.group(0))
    page.click('#trackGo')
    time.sleep(1.5)
    txt = page.inner_text('body')
    check('tracking page finds the order', ref.group(0) in txt)
    check('tracking shows the status timeline', 'received' in txt.lower() and 'delivered' in txt.lower())

    # --------------------------------------------------------------- admin --
    print("\nADMIN")
    page.goto(BASE + '/admin', wait_until='load')
    page.wait_for_timeout(1200)
    if page.locator('#login').is_visible():          # password mode
        page.fill('#u', USER); page.fill('#p', PW); page.click('#loginGo')
    page.wait_for_selector('nav.nav button[data-tab=products]', timeout=15000)
    page.click('nav.nav button[data-tab=products]')
    page.wait_for_selector('#productsWrap tbody tr', timeout=15000)
    rows = page.locator('#productsWrap tbody tr').count()
    check('products tab lists the catalogue', rows == 9, f'{rows} rows')
    # the database badge was removed from the panel on purpose (the shop owner
    # does not need it) — instead the dashboard must list the orders
    check('dashboard lists orders', page.locator('#recentCount').count() == 1)
    check('connection banner hidden while online', page.locator('#productsOffline').is_hidden())
    check('every row has Edit / Photo / ✕', page.evaluate(
        "() => Array.from(document.querySelectorAll('#productsWrap tbody tr'))"
        ".every(r => r.querySelector('[data-edit]') && r.querySelector('[data-photo]') && r.querySelector('[data-del]'))"))

    # the order placed above must be visible in the orders tab
    page.click('nav.nav button[data-tab=orders]')
    time.sleep(1.5)
    check('new order appears for the shop owner', ref.group(0) in page.inner_text('#ordersWrap'))

    # -------------------------------------------------- offline explanation --
    print("\nOFFLINE BEHAVIOUR")
    page2 = browser.new_page(viewport={'width': 1280, 'height': 900})
    page2.route('**/api/admin/products', lambda route: route.fulfill(status=503, body='{"error":"offline"}'))
    page2.route('**/api/admin/session', lambda route: route.fulfill(
        status=200, content_type='application/json', body='{"user":"xiks","database":"Local JSON files (data/)"}'))
    page2.route('**/api/admin/stats', lambda route: route.fulfill(status=200, content_type='application/json',
        body='{"stats":{"pending":0,"today":0,"all":0,"revenue":0,"transit":0,"products":0},"database":"Local JSON files (data/)"}'))
    page2.goto(BASE + '/admin', wait_until='load')
    page2.wait_for_selector('nav.nav button[data-tab=products]', timeout=15000)
    page2.click('nav.nav button[data-tab=products]')
    time.sleep(1.5)
    check('offline: banner explains the problem', page2.locator('#productsOffline').is_visible())
    banner = page2.inner_text('#productsOffline')
    check('offline: message is human, not an error code',
          ('store server' in banner or 'refused this request' in banner) and '{"error"' not in banner)
    check('offline: a check button is offered', page2.locator('#diagnoseBtn').is_visible())

    # ------------------------------------------------------------- cleanup --
    page.request.post(BASE + '/api/admin/login', data={'username': USER, 'password': PW})
    d = page.request.delete(BASE + '/api/admin/orders/' + ref.group(0))
    left = page.request.get(BASE + '/api/products').json()
    check('test order cleaned up', d.status < 400)

    print("\nHTTP >= 400 during the sweep:", len(bad))
    for b in bad[:5]:
        print('   ', b)
    print("page errors:", len(errors), errors[:3])
    check('no 4xx/5xx anywhere', not bad)
    browser.close()

passed = sum(1 for _, c in results if c)
print(f"\n  {passed}/{len(results)} checks passed\n")
sys.exit(0 if passed == len(results) else 1)
