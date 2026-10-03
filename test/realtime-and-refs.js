#!/usr/bin/env node
/* ============================================================================
   test/realtime-and-refs.js — the two faults that hid real orders.

   1. STALENESS. The store used to keep the whole database in the server's
      memory. On Vercel every warm instance has its own copy, so one instance
      could answer "no orders" long after a customer ordered, and edits looked
      like they had not saved. This checks that a change is visible on EVERY
      following read, not just the first.

   2. REFERENCE COLLISIONS. Order numbers were counted from that stale list, so
      a new order could be given a number that already existed and be rejected
      ("duplicate key value violates unique constraint orders_pkey"). This
      places several orders at the same moment and insists that all succeed with
      distinct numbers.

   Usage: BASE=http://localhost:8080 PW=<admin password> node test/realtime-and-refs.js
          (add SUPA + SUPA_KEY to also verify the rows straight from Supabase)
   ========================================================================== */
'use strict';

const BASE = (process.env.BASE || 'http://localhost:8080').replace(/\/+$/, '');
const USER = process.env.ADMIN_USER || 'xiks';
const PW = process.env.PW || '';
const SUPA = (process.env.SUPA || '').replace(/\/+$/, '');
const KEY = process.env.SUPA_KEY || '';

let pass = 0, fail = 0;
const check = (label, cond, extra) => {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}${extra !== undefined ? '  → ' + String(extra).slice(0, 200) : ''}`); }
  return cond;
};

let token = null;
const req = async (path, opts = {}) => {
  const r = await fetch(BASE + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Xiks-Token': token } : {}), ...(opts.headers || {}) },
  });
  const t = await r.text();
  let body = null; try { body = JSON.parse(t); } catch { body = t; }
  return { status: r.status, body };
};

/* a cache-buster makes sure we are not measuring the CDN or the browser */
const bust = (p) => p + (p.includes('?') ? '&' : '?') + 'cb=' + Math.random().toString(36).slice(2);

(async () => {
  console.log(`\n  Real-time changes and order numbers  (${BASE})\n`);

  const login = await req('/api/admin/login', { method: 'POST', body: JSON.stringify({ username: USER, password: PW }) });
  token = login.body && login.body.token;
  check('signed in', login.status === 200 && Boolean(token), [login.status, login.body]);
  if (!token) process.exit(1);

  /* ---------------- 1. an edit must show on every later read ---------------- */
  console.log('\n  a change is visible immediately, every time');
  const list = await req(bust('/api/products'));
  const first = list.body.products[0];
  const marker = 'Realtime check ' + Date.now();
  await req('/api/admin/products/' + first.id, { method: 'PATCH', body: JSON.stringify({ name: marker }) });

  let stale = 0;
  for (let i = 0; i < 10; i++) {
    const r = await req(bust('/api/products'));
    const p = (r.body.products || []).find(x => x.id === first.id);
    if (!p || p.name !== marker) stale++;
  }
  check('the new name shows on all 10 reads (nothing served from a stale copy)', stale === 0, `${stale} stale read(s)`);
  await req('/api/admin/products/' + first.id, { method: 'PATCH', body: JSON.stringify({ name: first.name }) });
  const restored = await req(bust('/api/products'));
  check('and the original name comes back immediately',
        (restored.body.products || []).find(x => x.id === first.id).name === first.name);

  /* ---------------- 2. settings too ---------------- */
  const settings = await req('/api/admin/settings');
  const oldAddress = (settings.body.settings || {}).address || '';
  const newAddress = 'Realtime address ' + Date.now();
  await req('/api/admin/settings', { method: 'PATCH', body: JSON.stringify({ address: newAddress }) });
  let staleSettings = 0;
  for (let i = 0; i < 5; i++) {
    const r = await req(bust('/api/products'));
    if ((r.body.settings || {}).address !== newAddress) staleSettings++;
  }
  check('a shop-settings change shows on all 5 reads', staleSettings === 0, `${staleSettings} stale`);
  await req('/api/admin/settings', { method: 'PATCH', body: JSON.stringify({ address: oldAddress }) });

  /* ---------------- 3. orders at the same moment ---------------- */
  console.log('\n  several orders placed at once');
  const makeOrder = (n) => req('/api/orders', { method: 'POST', body: JSON.stringify({
    items: [{ id: first.id, qty: 1 }],
    customer: { name: 'Realtime burst ' + n, phone: '0300123456' + (n % 10), address: 'KKH Hussaini', city: 'Hunza' },
  }) });

  const results = await Promise.all([1, 2, 3, 4, 5, 6].map(makeOrder));
  const refs = results.map(r => r.body && r.body.ref).filter(Boolean);
  const errors = results.filter(r => !r.body || !r.body.ref).map(r => (r.body && r.body.error) || r.status);
  check('all 6 orders were accepted', refs.length === 6, errors);
  check('every one got its own reference number', new Set(refs).size === refs.length, refs);

  /* ---------------- 4. and they are all visible at once ---------------- */
  const panel = await req(bust('/api/admin/orders'));
  const mine = (panel.body.orders || []).filter(o => refs.includes(o.ref));
  check('all 6 appear in the panel straight away', mine.length === 6, `${mine.length} of 6`);

  const stats = await req(bust('/api/admin/stats'));
  const onDash = (stats.body.recent || []).filter(o => refs.includes(o.ref));
  check('all 6 appear on the dashboard too', onDash.length === 6, `${onDash.length} of 6`);
  check('the dashboard counter counts them',
        Number(stats.body.orders) >= refs.length, stats.body.orders);

  /* ---------------- 5. straight from Supabase, if configured ---------------- */
  if (SUPA && KEY) {
    const r = await fetch(`${SUPA}/rest/v1/orders?select=ref&ref=in.(${refs.join(',')})`, {
      headers: { apikey: KEY, Authorization: 'Bearer ' + KEY },
    });
    const rows = await r.json();
    check('the rows are really in the orders table', Array.isArray(rows) && rows.length === 6, rows);
  }

  /* ---------------- cleanup: only the orders this test placed ---------------- */
  for (const ref of refs) await req('/api/admin/orders/' + ref, { method: 'DELETE' });
  const after = await req(bust('/api/admin/orders'));
  const left = (after.body.orders || []).filter(o => refs.includes(o.ref));
  check('the test orders were removed again', left.length === 0, left.map(o => o.ref));

  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})().catch(err => { console.error('\n  crashed:', err.message, '\n'); process.exit(1); });
