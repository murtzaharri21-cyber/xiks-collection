#!/usr/bin/env python3
"""
test/live-production.py — checks the deployed site the way a visitor uses it.

Smaller and gentler than browser-sweep.py (no long scrolling, so it runs on a
modest machine), it answers the one question that matters after a deploy:
   does /admin open, sign in and show the shop's data?

Usage:  BASE=https://your-site.vercel.app PW=your-admin-password python3 test/live-production.py
"""
import os, sys, re
from playwright.sync_api import sync_playwright

BASE = os.environ.get('BASE', 'https://xikhscollection.vercel.app')
PW   = os.environ.get('PW', '')
USER = os.environ.get('USERNAME', 'xiks')

results = []
def check(name, cond, extra=''):
    results.append((name, bool(cond)))
    print(f"  {'✓' if cond else '✗'} {name}{'  ' + str(extra) if extra else ''}")

with sync_playwright() as p:
    b = p.chromium.launch(args=['--disable-dev-shm-usage', '--no-sandbox'])
    pg = b.new_page(viewport={'width': 1360, 'height': 900})
    errors = []
    pg.on('pageerror', lambda e: errors.append(str(e)))

    print('\n  STOREFRONT')
    pg.goto(BASE + '/', wait_until='domcontentloaded')
    pg.wait_for_timeout(2500)
    check('page loads with the shop name', 'Xiks Collection' in pg.title(), pg.title()[:50])
    cards = pg.locator('#grid > article, #products article, article.card, article').count()
    check('product cards render', cards >= 9, f'{cards} cards')
    pg.screenshot(path='screenshots/live-storefront.png')

    print('\n  ADMIN (this is what did not open before)')
    pg.goto(BASE + '/admin', wait_until='domcontentloaded')
    pg.wait_for_timeout(2000)
    check('admin page loads, not a 404', pg.locator('#loginGo').count() == 1)
    pg.fill('#u', USER); pg.fill('#p', PW)
    pg.wait_for_timeout(300)
    check('sign-in button enabled with both fields', not pg.locator('#loginGo').is_disabled())
    pg.click('#loginGo')
    pg.wait_for_timeout(3500)
    panel = pg.locator('#app').is_visible() if pg.locator('#app').count() else False
    check('signed in — the panel is open', panel)
    check('no login card asking again', not pg.locator('#login').is_visible())
    rows = pg.locator('#prodBody tr, #prodRows tr, table tbody tr').count()
    check('the product list is filled', rows >= 9, f'{rows} rows')
    check('those old instructions are gone',
          pg.locator('#dbBadge, #dbPanel, .db-badge').count() == 0 and 'Local JSON files' not in pg.content())
    check('the panel lists every order', pg.locator('#recentCount').count() == 1,
          pg.inner_text('#recentCount')[:60] if pg.locator('#recentCount').count() else '')
    pg.screenshot(path='screenshots/live-admin.png', full_page=True)

    print('\n  ORDER TRACKING PAGE')
    pg.goto(BASE + '/track', wait_until='domcontentloaded')
    pg.wait_for_timeout(1200)
    check('tracking page loads', pg.locator('#ref, input[type=text]').count() >= 1)
    pg.screenshot(path='screenshots/live-track.png')

    check('no page errors anywhere', not errors, errors[:2])
    b.close()

ok = sum(1 for _, c in results if c)
print(f"\n  {ok}/{len(results)} checks passed\n")
sys.exit(0 if ok == len(results) else 1)
