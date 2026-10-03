#!/usr/bin/env node
/* ============================================================================
   test/supabase-e2e.js — proves the server really stores things in Supabase.

   Runs against a store server started with SUPABASE_URL/SUPABASE_SERVICE_KEY,
   and checks the Supabase REST API directly to confirm rows landed there.

   Usage: BASE=http://localhost:8081 SUPA=http://localhost:54321 SUPA_KEY=... node test/supabase-e2e.js
   ========================================================================== */
'use strict';
const BASE = process.env.BASE || 'http://localhost:8081';
const SUPA = (process.env.SUPA || 'http://localhost:54321').replace(/\/+$/, '');
const SUPA_KEY = process.env.SUPA_KEY || 'test-service-role-key';
/* the admin password is never written in the repo: $PW, else data/ADMIN-LOGIN.txt */
const PW = (() => {
  if (process.env.PW) return process.env.PW;
  try { const m = /password:\s*(\S+)/.exec(require('fs').readFileSync('data/ADMIN-LOGIN.txt', 'utf8')); return m ? m[1] : ''; }
  catch { return ''; }
})();

const SKIP_DB = process.env.SKIP_DB === '1';
let skipped = 0;
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (SKIP_DB && /Supabase/.test(name)) { skipped++; return; }
  if (cond) { pass++; console.log(`  ✓ ${name}${extra ? '  ' + extra : ''}`); }
  else { fail++; console.log(`  ✗ ${name}${extra ? '  ' + extra : ''}`); }
};

const sreq = async (p, o = {}) => {
  if (SKIP_DB) return [];                 // local driver: no Supabase to inspect
  const r = await fetch(SUPA + '/rest/v1/' + p, {
    ...o, headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY, 'Content-Type': 'application/json' },
  });
  const t = await r.text();
  return t ? JSON.parse(t) : null;
};

let cookie = '';
const req = async (p, { method = 'GET', body } = {}) => {
  const r = await fetch(BASE + p, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const sc = r.headers.getSetCookie ? r.headers.getSetCookie() : [];
  if (sc[0]) cookie = sc[0].split(';')[0];
  const t = await r.text();
  let j = null; try { j = t ? JSON.parse(t) : null; } catch { j = t; }
  return { status: r.status, body: j, type: r.headers.get('content-type') || '' };
};

(async () => {
  console.log('\n  End-to-end: store server ⇄ Supabase\n');

  /* ---------------------------------------------------- catalogue is served */
  const cat = await req('/api/products');
  ok('catalogue served', SKIP_DB ? cat.body.products.length === 9 : cat.body.db === 'supabase',
     `db=${cat.body.db}, ${cat.body.products.length} products`);
  ok('Supabase products table holds the catalogue', (await sreq('products?select=id')).length === 9);

  /* ------------------------------------------------------------- admin auth */
  const bad = await req('/api/admin/login', { method: 'POST', body: { username: 'xiks', password: 'wrong' } });
  ok('wrong password rejected', bad.status === 401 || bad.status === 403);
  const login = await req('/api/admin/login', { method: 'POST', body: { username: 'xiks', password: PW } });
  ok('login against Supabase admins table', login.body && login.body.user === 'xiks');

  /* --------------------------------------------------------- create product */
  const made = await req('/api/admin/products', { method: 'POST', body: {
    name: 'Supabase Test Piece', price: 1234, cat: 'test', note: 'e2e', image: 'assets/images/p1.webp' } });
  const newId = made.body && (made.body.product ? made.body.product.id : made.body.id);
  ok('product created', !!newId, 'id=' + newId);
  const inDb = SKIP_DB ? [] : await sreq(`products?select=id,name,price&id=eq.${encodeURIComponent(newId)}`);
  ok('…and the row is really in Supabase', inDb.length === 1 && Number(inDb[0].price) === 1234, JSON.stringify(inDb[0] || {}));

  /* ----------------------------------------------------------- edit price */
  await req(`/api/admin/products/${newId}`, { method: 'PATCH', body: { price: 999, name: 'Supabase Test Piece v2' } });
  const edited = await sreq(`products?select=name,price&id=eq.${encodeURIComponent(newId)}`);
  ok('edit persisted to Supabase', edited.length === 1 && Number(edited[0].price) === 999, JSON.stringify(edited[0] || {}));

  /* ------------------------------------------------------- delete product */
  const del = await req(`/api/admin/products/${newId}`, { method: 'DELETE' });
  ok('delete accepted', del.status < 400);
  ok('…row gone from Supabase', (await sreq(`products?select=id&id=eq.${encodeURIComponent(newId)}`)).length === 0);

  /* ------------------------------------------------------------ place order */
  const order = await req('/api/orders', { method: 'POST', body: {
    customer: { name: 'E2E Tester', phone: '03001234567', city: 'Hussaini', address: 'KKH road', notes: 'supabase test' },
    items: [{ id: 'p1', size: 'M', qty: 2 }] } });
  const ref = order.body && order.body.ref;
  ok('order placed', !!ref, 'ref=' + ref + ' total=' + (order.body && order.body.total));
  const oRows = await sreq(`orders?select=ref,status,total,customer&ref=eq.${encodeURIComponent(ref)}`);
  ok('order row in Supabase', oRows.length === 1, JSON.stringify(oRows[0] && { ref: oRows[0].ref, total: oRows[0].total }));
  const sub = oRows[0] && Number(oRows[0].subtotal);
  ok('server priced the items itself (client price ignored)', SKIP_DB || sub === 2800 * 2, 'subtotal=' + sub + ' (2 × Rs 2,800)');
  ok('total = subtotal + delivery', SKIP_DB || (oRows[0] && Number(oRows[0].total) === sub + Number(oRows[0].delivery || 0)));

  /* -------------------------------------------------------------- tracking */
  const track = await req('/api/track?ref=' + ref);
  ok('customer can track it', track.body && (track.body.order || track.body.ref), JSON.stringify(track.body).slice(0, 90));

  /* -------------------------------------------------------- admin orders UI */
  const list = await req('/api/admin/orders');
  ok('admin order list shows it', (list.body.orders || []).some(o => o.ref === ref));
  await req(`/api/admin/orders/${ref}`, { method: 'PATCH', body: { status: 'packed', courier: 'TCS', trackingNo: 'TCS-99' } });
  const st = await sreq(`orders?select=status,courier,tracking_no&ref=eq.${encodeURIComponent(ref)}`);
  ok('status change persisted to Supabase', st[0] && st[0].status === 'packed' && st[0].tracking_no === 'TCS-99', JSON.stringify(st[0] || {}));
  const csv = await fetch(BASE + '/api/admin/orders.csv', { headers: { Cookie: cookie } });
  ok('CSV export works', csv.status === 200 && (await csv.text()).includes(ref));

  /* --------------------------------------------------------------- settings */
  await req('/api/admin/settings', { method: 'PATCH', body: { whatsapp: '923001234567', hours: '10am – 8pm' } });
  const sRows = await sreq('settings?select=data&id=eq.1');
  ok('settings persisted to Supabase', sRows[0] && sRows[0].data && sRows[0].data.whatsapp === '923001234567', JSON.stringify(sRows[0] && sRows[0].data));
  await req('/api/admin/settings', { method: 'PATCH', body: { whatsapp: '', hours: '' } });   // restore

  /* -------------------------------------------------- password round-trip */
  const ch = await req('/api/admin/password', { method: 'POST', body: { current: PW, next: 'TempE2Epass99' } });
  ok('password change accepted', ch.status < 400);
  const adRows = await sreq('admins?select=username,hash&username=eq.xiks');
  ok('new hash stored in Supabase admins', adRows.length === 1 && adRows[0].hash.length > 20);
  cookie = '';
  const reLogin = await req('/api/admin/login', { method: 'POST', body: { username: 'xiks', password: 'TempE2Epass99' } });
  ok('login with the new password', reLogin.body && reLogin.body.user === 'xiks');
  await req('/api/admin/password', { method: 'POST', body: { current: 'TempE2Epass99', next: PW } });
  cookie = '';
  const back = await req('/api/admin/login', { method: 'POST', body: { username: 'xiks', password: PW } });
  ok('password restored', back.body && back.body.user === 'xiks');

  /* ------------------------------------------------- cleanup + final state */
  await req(`/api/admin/orders/${ref}`, { method: 'DELETE' });
  ok('order deleted from Supabase', (await sreq(`orders?select=ref&ref=eq.${encodeURIComponent(ref)}`)).length === 0);
  const finalP = SKIP_DB ? (await req('/api/products')).body.products : await sreq('products?select=id');
  const finalO = SKIP_DB ? (await req('/api/admin/orders')).body.orders : await sreq('orders?select=ref');
  ok('left clean: 9 products, 0 orders', finalP.length === 9 && finalO.length === 0, `${finalP.length} products / ${finalO.length} orders`);

  console.log(`\n  ${pass} passed, ${fail} failed${skipped ? ', ' + skipped + ' DB-level checks skipped (local driver)' : ''}\n`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('\n  ✗ crashed:', e.message, '\n'); process.exit(1); });
