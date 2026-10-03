#!/usr/bin/env node
/* ============================================================================
   test/vercel-e2e.js — end-to-end check of the Vercel deployment path.

   Start the simulator first (see test/vercel-sim.js), then:
       BASE=http://localhost:8090 node test/vercel-e2e.js

   It exercises the things that only break in production:
     • the /admin and /track rewrites (what the user reported as "not opening")
     • the API through api/[...path].js with Vercel-parsed bodies
     • a cold-start request against an empty Supabase
     • admin login → orders → upload to Supabase Storage → product round-trip
   ========================================================================== */
'use strict';

const BASE = process.env.BASE || 'http://localhost:8090';
const USER = process.env.ADMIN_USER || 'admin';
const PW = process.env.ADMIN_PASSWORD || (process.env.ADMIN_PW || '');

let passed = 0, failed = 0;
const tokenStore = { token: null };
function check(label, cond, extra) {
  if (cond) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.log(`  ✗ ${label}${extra !== undefined ? '  → ' + JSON.stringify(extra).slice(0, 300) : ''}`); }
  return cond;
}

async function req(path, { method = 'GET', body, headers = {} } = {}) {
  const h = { ...headers };
  if (tokenStore.token) h['X-Xiks-Token'] = tokenStore.token;
  let payload = body;
  if (body && typeof body === 'object') { h['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const r = await fetch(BASE + path, { method, headers: h, body: payload, redirect: 'manual' });
  const ct = r.headers.get('content-type') || '';
  let data = null;
  if (/json/.test(ct)) { try { data = await r.json(); } catch { data = null; } }
  else data = await r.text();
  return { status: r.status, data, ct, headers: r.headers };
}

/* a 1×1 transparent PNG — stands in for a photo chosen in the admin panel */
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==';

(async () => {
  console.log(`\n  Vercel deployment check → ${BASE}\n`);

  /* ---- 1. the pages themselves (the reported bug) ---- */
  console.log('  pages');
  const home = await req('/');
  check('GET / is the storefront', home.status === 200 && /Xiks/.test(String(home.data)), home.status);
  const admin = await req('/admin');
  check('GET /admin opens the admin page (rewrite)', admin.status === 200 && /login|sign in/i.test(String(admin.data)), admin.status);
  /* Vercel serves static HTML with "max-age=0, must-revalidate", which still
     revalidates on every visit — that is its equivalent of no-store. */
  const cc = admin.headers.get('cache-control') || '';
  check('admin page is never served stale', /no-store|max-age=0/.test(cc), cc);
  const track = await req('/track');
  check('GET /track opens the tracking page', track.status === 200, track.status);
  const hero = await req('/assets/images/hero-poster.webp');
  check('hero image is served', hero.status === 200 && /image/.test(hero.ct), [hero.status, hero.ct]);

  /* ---- 2. API through the catch-all function ---- */
  console.log('\n  api');
  const prods = await req('/api/products');
  check('GET /api/products works', prods.status === 200 && Array.isArray(prods.data.products), prods.status);
  check('data comes from Supabase', /supabase/i.test(String(prods.data.db)), prods.data.db);
  check('products were seeded on cold start', prods.data.products.length >= 9, prods.data.products.length);
  check('store settings ride along with the products',
    prods.data.settings && prods.data.settings.whatsapp !== undefined, prods.data.settings);

  /* ---- 3. auth is still enforced ---- */
  console.log('\n  auth');
  const noAuth = await req('/api/admin/orders');
  check('admin API refuses a stranger (401)', noAuth.status === 401, noAuth.status);
  const login = await req('/api/admin/login', { method: 'POST', body: { username: USER, password: PW } });
  check('login works with a parsed JSON body', login.status === 200 && login.data && login.data.ok !== false, [login.status, login.data]);
  tokenStore.token = (login.data && (login.data.token || login.data.session?.token)) || null;
  check('login returns a session token', Boolean(tokenStore.token));
  const orders = await req('/api/admin/orders');
  check('admin orders open with the token', orders.status === 200 && Array.isArray(orders.data.orders), [orders.status, orders.data]);
  const stats = await req('/api/admin/stats');
  check('admin stats open', stats.status === 200, stats.status);

  /* ---- 4. a real order, placed and found ---- */
  console.log('\n  ordering');
  const first = prods.data.products[0];
  const placed = await req('/api/orders', { method: 'POST', body: {
    items: [{ id: first.id, qty: 1, size: 'M' }],
    customer: { name: 'Vercel Test', phone: '03001234567', address: 'KKH road Hussaini, Gojal Hunza', note: '' },
  } });
  const ref = placed.data && placed.data.ref;
  check('an order can be placed', placed.status === 200 && Boolean(ref), [placed.status, placed.data]);
  const found = await req('/api/track?ref=' + encodeURIComponent(ref || 'X'));
  check('the order can be tracked', found.status === 200 && found.data && found.data.ref === ref, [found.status, found.data]);
  const list = await req('/api/admin/orders');
  check('the order reaches the admin panel', (list.data.orders || []).some(o => o.ref === ref), (list.data.orders || []).map(o => o.ref));

  /* ---- 5. photo upload → Supabase Storage ---- */
  console.log('\n  uploads');
  const up = await req('/api/admin/upload', { method: 'POST', body: {
    name: 'vercel-test', dataUrl: 'data:image/png;base64,' + PNG,
  } });
  const upPath = up.data && (up.data.path || up.data.url);
  check('upload accepted', up.status === 200 && Boolean(upPath), [up.status, up.data]);
  check('stored in Supabase Storage, not on disk', up.data && up.data.storage === 'supabase', up.data);
  check('the returned address is a full URL', /^https?:\/\/.+\/storage\/v1\/object\/public\//.test(String(upPath)), upPath);
  if (upPath && /^https?:/.test(upPath)) {
    const img = await fetch(upPath);
    check('the uploaded photo is publicly readable', img.status === 200 && /image/.test(img.headers.get('content-type') || ''), img.status);
  }

  /* ---- 6. product created with that photo survives a reload ---- */
  console.log('\n  products');
  const made = await req('/api/admin/products', { method: 'POST', body: {
    name: 'Vercel Test Product', cat: 'Test', price: 1000, oldPrice: 1500,
    image: upPath || 'https://example.com/x.webp', active: true, sizes: [], blurb: 'temporary',
  } });
  const pid = made.data && (made.data.product?.id || made.data.id);
  check('a product can be created', made.status === 200 && Boolean(pid), [made.status, made.data]);
  const again = await req('/api/products');
  check('it comes back from Supabase on a later request', (again.data.products || []).some(p => p.id === pid));
  if (pid) {
    const del = await req('/api/admin/products/' + pid, { method: 'DELETE' });
    check('and can be removed', del.status < 400, del.status);
  }
  if (ref) await req('/api/admin/orders/' + ref, { method: 'DELETE' });

  /* ---- 7. a signed-in admin link works ---- */
  console.log('\n  admin link');
  const direct = await req('/admin?tok=' + encodeURIComponent(tokenStore.token || 'x'));
  check('the admin page opens with ?tok=', direct.status === 200, direct.status);

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})().catch(err => { console.error('\n  crashed:', err.message, '\n'); process.exit(1); });
