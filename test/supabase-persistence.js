#!/usr/bin/env node
/* ============================================================================
   test/supabase-persistence.js — proves every change really reaches Supabase.

   The admin panel could look like it saved something while the change only
   lived in memory. This checks the opposite way round: it makes a change
   through the API, then reads Supabase's REST API DIRECTLY (a different route
   from the one the app used) to confirm the new value is sitting in the table.
   Everything is restored afterwards.

   Usage:
     BASE=http://localhost:8080 \
     SUPA=https://xxxx.supabase.co SUPA_KEY=<secret key> \
     node test/supabase-persistence.js
   ========================================================================== */
'use strict';

const BASE = (process.env.BASE || 'http://localhost:8080').replace(/\/+$/, '');
const SUPA = (process.env.SUPA || '').replace(/\/+$/, '');
const KEY = process.env.SUPA_KEY || '';
const USER = process.env.ADMIN_USER || 'xiks';
const PW = process.env.PW || '';

if (!SUPA || !KEY) {
  console.log('\n  needs SUPA + SUPA_KEY (the Supabase project and its secret key)\n');
  process.exit(2);
}

let pass = 0, fail = 0;
const check = (label, cond, extra) => {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}${extra !== undefined ? '  → ' + JSON.stringify(extra).slice(0, 250) : ''}`); }
  return cond;
};

/* --- talk to Supabase directly, not through the store --- */
const supa = async (path, opts = {}) => {
  const r = await fetch(`${SUPA}/rest/v1/${path}`, {
    ...opts,
    headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json',
               Prefer: 'return=representation', ...(opts.headers || {}) },
  });
  const t = await r.text();
  return { status: r.status, body: t ? JSON.parse(t) : null };
};

/* --- talk to the store the way the admin panel does --- */
let token = null;
const store = async (path, opts = {}) => {
  const r = await fetch(BASE + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Xiks-Token': token } : {}), ...(opts.headers || {}) },
  });
  const t = await r.text();
  let body = null; try { body = JSON.parse(t); } catch { body = t; }
  return { status: r.status, body };
};

(async () => {
  console.log(`\n  Does every change reach Supabase?  (store ${BASE} → ${SUPA})\n`);

  /* ---- sign in ---- */
  const login = await store('/api/admin/login', { method: 'POST', body: JSON.stringify({ username: USER, password: PW }) });
  token = login.body && login.body.token;
  check('signed in to the panel', login.status === 200 && Boolean(token), [login.status, login.body]);

  /* ---- 1. a product change lands in the products table ---- */
  console.log('\n  product');
  const before = (await supa('products?select=*&order=sort.asc&limit=1')).body[0];
  const marker = 'Persist check ' + Date.now();
  const patched = await store('/api/admin/products/' + before.id, {
    method: 'PATCH', body: JSON.stringify({ note: marker }),
  });
  check('the panel accepted the change', patched.status < 400, [patched.status, patched.body]);
  const rowAfter = (await supa(`products?select=note,updated&id=eq.${encodeURIComponent(before.id)}`)).body[0];
  check('the new value is IN THE TABLE (read straight from Supabase)', rowAfter && rowAfter.note === marker, rowAfter);
  const back = await store('/api/admin/products/' + before.id, {
    method: 'PATCH', body: JSON.stringify({ note: before.note || '' }),
  });
  const restored = (await supa(`products?select=note&id=eq.${encodeURIComponent(before.id)}`)).body[0];
  check('and the original value was restored in the table', restored && (restored.note || '') === (before.note || ''),
        [back.status, restored]);

  /* ---- 2. a new product appears as a row ---- */
  const made = await store('/api/admin/products', { method: 'POST', body: JSON.stringify({
    name: 'Persist check product', cat: 'Test', price: 1234, image: 'https://example.com/x.webp', active: false,
  }) });
  const newId = made.body && (made.body.product?.id || made.body.id);
  const newRow = newId ? (await supa(`products?select=id,name,price&id=eq.${encodeURIComponent(newId)}`)).body[0] : null;
  check('a new product is a real row in Supabase', Boolean(newRow) && Number(newRow.price) === 1234, newRow);
  if (newId) {
    await store('/api/admin/products/' + newId, { method: 'DELETE' });
    const gone = await supa(`products?select=id&id=eq.${encodeURIComponent(newId)}`);
    check('deleting it removes the row from Supabase', Array.isArray(gone.body) && gone.body.length === 0, gone.body);
  }

  /* ---- 3. an order is stored, and can be found in the table ---- */
  console.log('\n  order');
  const product = (await supa('products?select=id,name,price&limit=1')).body[0];
  const placed = await store('/api/orders', { method: 'POST', body: JSON.stringify({
    items: [{ id: product.id, qty: 2, size: 'L' }],
    customer: { name: 'Persistence Check', phone: '03001234567', address: 'KKH road Hussaini', city: 'Hunza' },
  }) });
  const ref = placed.body && placed.body.ref;
  check('an order can be placed', placed.status === 200 && Boolean(ref), [placed.status, placed.body]);
  const orderRow = ref ? (await supa(`orders?select=ref,customer,items,total,status&ref=eq.${encodeURIComponent(ref)}`)).body[0] : null;
  check('the order is IN THE orders TABLE', Boolean(orderRow), orderRow);
  check('its customer and total were stored too',
        orderRow && orderRow.customer && orderRow.customer.name === 'Persistence Check' && Number(orderRow.total) === Number(placed.body.total),
        orderRow && { customer: orderRow.customer, total: orderRow.total });

  /* ---- 4. changing its status updates the row (the shop owner's main job) ---- */
  await store('/api/admin/orders/' + ref, { method: 'PATCH', body: JSON.stringify({ status: 'packed', courier: 'TCS', trackingNo: 'TC-123' }) });
  const updated = (await supa(`orders?select=status,courier,tracking_no&ref=eq.${encodeURIComponent(ref)}`)).body[0];
  check('marking it packed is saved in Supabase', updated && updated.status === 'packed', updated);
  check('the courier and tracking number are saved', updated && updated.courier === 'TCS' && updated.tracking_no === 'TC-123', updated);

  /* ---- 5. every order shows up in the panel's list ---- */
  const stats = await store('/api/admin/stats');
  const listed = (stats.body.recent || []).some(o => o.ref === ref);
  check('the order appears in the dashboard list', listed, (stats.body.recent || []).length + ' listed');
  const all = await store('/api/admin/orders');
  check('and in the Orders tab list', (all.body.orders || []).some(o => o.ref === ref));

  /* ---- 6. shop settings are saved as a row ---- */
  console.log('\n  settings');
  const current = await store('/api/admin/settings');
  const oldAddress = (current.body.settings || {}).address || '';
  const newAddress = 'KKH Road, Hussaini (persist check)';
  await store('/api/admin/settings', { method: 'PATCH', body: JSON.stringify({ address: newAddress }) });
  const settingsRow = (await supa('settings?select=data&id=eq.1')).body[0];
  check('a settings change is saved in Supabase', settingsRow && settingsRow.data && settingsRow.data.address === newAddress, settingsRow && settingsRow.data);
  await store('/api/admin/settings', { method: 'PATCH', body: JSON.stringify({ address: oldAddress }) });

  /* ---- cleanup: the test order must not stay in the shop ---- */
  await store('/api/admin/orders/' + ref, { method: 'DELETE' });
  const orderGone = await supa(`orders?select=ref&ref=eq.${encodeURIComponent(ref)}`);
  check('the test order was removed from Supabase', Array.isArray(orderGone.body) && orderGone.body.length === 0);

  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})().catch(err => { console.error('\n  crashed:', err.message, '\n'); process.exit(1); });
