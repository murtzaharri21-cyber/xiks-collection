#!/usr/bin/env node
/* ============================================================================
   test/supa-driver.js — checks the Supabase driver's field mapping with no real
   Supabase project and no service key.

   Why this exists: the panel's Edit drawer once saved changes that never reached
   the database, because the Supabase driver keeps a whitelist of the columns it
   is willing to write and the customer's details were missing from it. The file
   driver used in local development accepted everything, so the bug only showed
   up on the live site. This test speaks PostgREST at a stubbed fetch(), with
   rows in snake_case exactly like the real table, so the mapping is exercised on
   every run.

   Run:   node test/supa-driver.js
   ========================================================================== */
'use strict';

let passed = 0, failed = 0;
function check(label, cond, extra) {
  if (cond) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.log(`  ✗ ${label}${extra !== undefined ? '  → ' + JSON.stringify(extra).slice(0, 300) : ''}`); }
  return cond;
}

/* ---------------------------------------------------------------- fake tables */
const tables = {
  orders: [{
    ref: 'XK-2610-0001', created_at: '2026-10-03T18:50:10.730Z', status: 'pending', channel: 'website',
    customer: { name: 'Murtaza', phone: '03439586026', city: 'Gulmit', address: 'Gulmit, Gojal Hunza', notes: '' },
    items: [{ id: 'p4', qty: 1, price: 7500, line: 7500, name: '2-in-1 Jacket — Grey', image: 'x.webp' }],
    subtotal: 7500, delivery: 0, total: 7500, courier: '', tracking_no: '',
    history: [{ status: 'pending', at: '2026-10-03T18:50:10.730Z', note: 'Order received' }],
    updated_at: '2026-10-03T18:50:10.730Z',
  }],
  products: [], settings: [{ id: 1, data: {} }], admins: [],
};

let patched = [];

/* a tiny PostgREST: enough of it for db.js to run against */
global.fetch = async (url, opts = {}) => {
  const u = new URL(url);
  const m = /^\/rest\/v1\/([^?]+)\??(.*)$/.exec(u.pathname + (u.search ? u.search.replace(/^\?/, '?') : ''));
  const table = decodeURIComponent(m[1]);
  const query = new URLSearchParams(u.search);
  const method = (opts.method || 'GET').toUpperCase();
  const rows = tables[table] || (tables[table] = []);
  const body = opts.body ? JSON.parse(opts.body) : undefined;

  const match = (row) => {
    for (const [key, cond] of query) {
      if (!cond.startsWith('eq.')) continue;
      if (String(row[key]) !== cond.slice(3)) return false;
    }
    return true;
  };

  if (method === 'GET') {
    const found = rows.filter(match);
    if (!query.has('select') || query.get('select') === '*') return reply(200, found);
    const cols = query.get('select').split(',').map(s => s.trim());
    return reply(200, found.map(r => Object.fromEntries(cols.map(c => [c, r[c]]))));
  }
  if (method === 'POST') {
    const incoming = Array.isArray(body) ? body : [body];
    for (const rec of incoming) {
      const i = rows.findIndex(r => r.ref && r.ref === rec.ref);
      if (i >= 0) rows[i] = Object.assign(rows[i], rec); else rows.push(rec);
    }
    return reply(200, incoming);
  }
  if (method === 'PATCH') {
    const hit = rows.filter(match);
    for (const row of hit) { Object.assign(row, body); patched.push(body); }
    return reply(200, hit);
  }
  if (method === 'DELETE') {
    for (const row of rows.filter(match)) rows.splice(rows.indexOf(row), 1);
    return reply(200, []);
  }
  return reply(405, { message: 'method not allowed' });
};
const reply = (status, body) => ({
  ok: status < 400, status,
  text: async () => JSON.stringify(body),
});

/* db.js decides which driver to use from these two variables */
process.env.SUPABASE_URL = 'https://stub.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'stub-key';
const db = require('../db.js');

(async () => {
  console.log('\n  Supabase driver field mapping (stubbed PostgREST)\n');

  check('the Supabase driver is the one under test', db.label.startsWith('Supabase'), db.label);

  /* ---- a plain read comes back in the app's shape ---- */
  const before = (await db.orders())[0];
  check('an order reads back with a camelCase trackingNo', before.trackingNo === '', before.trackingNo);
  check('an order reads back with createdAt', before.createdAt === '2026-10-03T18:50:10.730Z', before.createdAt);
  check('an order reads back with its customer', before.customer.name === 'Murtaza', before.customer);

  /* ---- the fields the Edit drawer writes ---- */
  const saved = await db.updateOrder('XK-2610-0001', {
    status: 'confirmed', courier: 'Leopards', trackingNo: 'LP-445566', delivery: 350, total: 7850,
    history: before.history.concat([{ status: 'confirmed', at: 'now', note: 'Confirmed' }]),
    customer: { name: 'Murtaza Ali', phone: '0343 9586026', city: 'Gulmit', address: 'Gulmit, Gojal Hunza', notes: 'Call first' },
  });

  const row = tables.orders[0];
  check('the status reaches the row', row.status === 'confirmed', row.status);
  check('the courier reaches the row', row.courier === 'Leopards', row.courier);
  check('the tracking number reaches the row', row.tracking_no === 'LP-445566', row.tracking_no);
  check('the delivery charge reaches the row', row.delivery === 350 && row.total === 7850, [row.delivery, row.total]);
  check('the timeline reaches the row', row.history.length === 2, row.history);
  check('the customer’s name reaches the row', row.customer.name === 'Murtaza Ali', row.customer);
  check('the customer’s phone reaches the row', row.customer.phone === '0343 9586026', row.customer);
  check('the customer’s city reaches the row', row.customer.city === 'Gulmit', row.customer);
  check('the customer’s address reaches the row', row.customer.address === 'Gulmit, Gojal Hunza', row.customer);
  check('the customer’s note reaches the row', row.customer.notes === 'Call first', row.customer);

  /* ---- and what the caller gets back is the app's shape, not raw columns ---- */
  check('the patch answers with the app shape (status)', saved.status === 'confirmed', saved.status);
  check('the patch answers with the app shape (trackingNo)', saved.trackingNo === 'LP-445566', saved.trackingNo);
  check('the patch answers with the app shape (createdAt)', saved.createdAt === '2026-10-03T18:50:10.730Z', saved.createdAt);
  check('the patch answers with the corrected customer', saved.customer.name === 'Murtaza Ali', saved.customer);
  check('the raw snake_case column never leaks out', !('tracking_no' in saved) && !('created_at' in saved), Object.keys(saved));

  /* ---- a fresh read sees the same thing ---- */
  const after = (await db.orders())[0];
  check('a later read sees the corrected customer', after.customer.name === 'Murtaza Ali', after.customer);
  check('a later read sees the tracking number', after.trackingNo === 'LP-445566', after.trackingNo);

  /* ---- a new order is inserted and answered in the app's shape ---- */
  const made = await db.placeOrder(() => ({
    ref: 'XK-2610-0002', createdAt: '2026-10-04T00:00:00.000Z', status: 'pending', channel: 'website',
    customer: { name: 'Hoodie', phone: '03111234567', city: 'Gulmit', address: 'KKH road Hussaini' },
    items: [{ id: 'p1', qty: 1, price: 4000, line: 4000 }],
    subtotal: 4000, delivery: 0, total: 4000, courier: '', history: [{ status: 'pending', at: 'now', note: 'Order received' }],
  }));
  check('a new order comes back with its ref', made.ref === 'XK-2610-0002', made.ref);
  check('a new order comes back in the app shape', made.total === 4000 && !('tracking_no' in made), Object.keys(made));
  check('both orders are readable afterwards', (await db.orders()).length === 2);

  /* ---- nothing complains about the columns we never touched ---- */
  check('only the whitelisted columns were ever written', patched.every(p =>
    Object.keys(p).every(k => ['status', 'courier', 'tracking_no', 'delivery', 'total', 'history', 'customer', 'updated_at'].includes(k))),
    patched.map(p => Object.keys(p)));

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('\n  crashed:', e.message, '\n'); process.exit(1); });
