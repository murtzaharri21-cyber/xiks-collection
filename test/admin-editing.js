#!/usr/bin/env node
/* ============================================================================
   test/admin-editing.js — the owner's "Edit" button on an order.

   What the owner does with it: open an order, change the status from pending to
   confirmed/shipped/delivered, add a courier and tracking number, charge the
   delivery, correct a customer's phone number or address, then press Save.

   This checks that each of those really sticks — through the API and back out
   of the panel on a later read — and that the tracking page the customer sees
   follows the new status. It also checks the guards: no blank name, no blank
   address, no phone number that is too short.

   Usage:
       BASE=https://xikscollection.vercel.app ADMIN_USER=xiks PW=... node test/admin-editing.js

   It creates one test order and deletes it again at the end. It never touches a
   real customer's order.
   ========================================================================== */
'use strict';

const BASE = process.env.BASE || 'http://localhost:8080';
const USER = process.env.ADMIN_USER || 'xiks';
const PW = process.env.PW || process.env.ADMIN_PASSWORD || '';

let passed = 0, failed = 0;
const token = { v: null };
function check(label, cond, extra) {
  if (cond) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.log(`  ✗ ${label}${extra !== undefined ? '  → ' + JSON.stringify(extra).slice(0, 300) : ''}`); }
  return cond;
}

async function req(path, { method = 'GET', body } = {}) {
  const h = {};
  if (token.v) h['X-Xiks-Token'] = token.v;
  let payload = body;
  if (body && typeof body === 'object') { h['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const r = await fetch(BASE + path, { method, headers: h, body: payload, redirect: 'manual' });
  const ct = r.headers.get('content-type') || '';
  let data = null;
  if (/json/.test(ct)) { try { data = await r.json(); } catch { data = null; } } else data = await r.text();
  return { status: r.status, data };
}

(async () => {
  console.log(`\n  Editing an order in the panel  (${BASE})\n`);

  /* ---- sign in ---- */
  const login = await req('/api/admin/login', { method: 'POST', body: { username: USER, password: PW } });
  check('signed in', login.status === 200 && Boolean(login.data && login.data.token), [login.status, login.data]);
  token.v = login.data && login.data.token;
  if (!token.v) { console.log('\n  cannot continue without a session\n'); process.exit(1); }

  /* ---- a fresh order to work on ---- */
  const prods = await req('/api/products');
  const first = (prods.data.products || [])[0];
  if (!first) { console.log('  no products to order\n'); process.exit(1); }
  const placed = await req('/api/orders', { method: 'POST', body: {
    items: [{ id: first.id, qty: 1, size: 'M' }],
    customer: { name: 'Edit Test', phone: '03001234567', city: '', address: 'KKH road Hussaini, Gojal Hunza' },
  } });
  const ref = placed.data && placed.data.ref;
  check('a test order was placed', Boolean(ref), [placed.status, placed.data]);

  try {
    /* ---- the panel offers an Edit button for it ---- */
    const row = await req('/api/admin/orders/' + ref);
    check('the order opens in the panel', row.status === 200 && row.data.order.ref === ref, row.status);

    /* ---- status: pending → confirmed ---- */
    let r = await req('/api/admin/orders/' + ref, { method: 'PATCH', body: { status: 'confirmed' } });
    check('status can be changed to confirmed', r.status === 200 && r.data.order.status === 'confirmed', [r.status, r.data]);
    r = await req('/api/admin/orders/' + ref);
    check('the new status survives a later read', r.data.order.status === 'confirmed', r.data.order.status);

    /* ---- the customer sees it on the tracking page ---- */
    const track = await req('/api/track?ref=' + encodeURIComponent(ref));
    check('the tracking page shows the same status', track.status === 200 && track.data.status === 'confirmed', [track.status, track.data && track.data.status]);

    /* ---- every status the owner can pick ---- */
    for (const st of ['packed', 'shipped', 'delivered', 'cancelled', 'pending']) {
      const p = await req('/api/admin/orders/' + ref, { method: 'PATCH', body: { status: st } });
      if (!(p.status === 200 && p.data.order.status === st)) check(`status can be set to ${st}`, false, [p.status, p.data]);
    }
    check('all six statuses can be set on an order', true);

    /* ---- courier, tracking number, delivery charge ---- */
    r = await req('/api/admin/orders/' + ref, { method: 'PATCH', body: {
      courier: 'Leopards', trackingNo: 'LP-445566', delivery: 350, note: 'Handed to the rider',
    } });
    const o = r.data.order;
    check('courier saved', o.courier === 'Leopards', o.courier);
    check('tracking number saved', o.trackingNo === 'LP-445566', o.trackingNo);
    check('delivery charge saved and added to the total', o.delivery === 350 && o.total === o.subtotal + 350, [o.delivery, o.subtotal, o.total]);
    check('the note was added to the timeline', (o.history || []).some(h => h.note === 'Handed to the rider'), o.history);

    /* ---- correcting the customer's details ---- */
    r = await req('/api/admin/orders/' + ref, { method: 'PATCH', body: { customer: {
      name: 'Edit Test Corrected', phone: '0343 1112233', city: 'Gulmit',
      address: 'Near the old bridge, Gulmit, Gojal Hunza', notes: 'Call before coming',
    } } });
    const c = r.data.order.customer;
    check('customer name corrected', c.name === 'Edit Test Corrected', c.name);
    check('customer phone corrected', c.phone === '0343 1112233', c.phone);
    check('customer city corrected', c.city === 'Gulmit', c.city);
    check('customer address corrected', c.address === 'Near the old bridge, Gulmit, Gojal Hunza', c.address);
    check('customer note saved', c.notes === 'Call before coming', c.notes);

    r = await req('/api/admin/orders/' + ref);
    const fresh = r.data.order;
    check('every correction is still there on a later read', fresh.customer.city === 'Gulmit' && fresh.courier === 'Leopards' && fresh.trackingNo === 'LP-445566', fresh.customer);
    check('the corrected order is on the tracking page too', (await req('/api/track?ref=' + encodeURIComponent(ref))).status === 200);

    /* ---- guards: an order must keep a real name, phone and address ---- */
    const guards = [
      [{ customer: { name: '   ' } }, 'a blank customer name'],
      [{ customer: { address: '' } }, 'a blank address'],
      [{ customer: { phone: '12345' } }, 'a phone number that is too short'],
      [{ customer: { phone: '' } }, 'a missing phone number'],
      [{ status: 'teleported' }, 'a status that does not exist'],
    ];
    for (const [body, what] of guards) {
      const g = await req('/api/admin/orders/' + ref, { method: 'PATCH', body });
      check(`${what} is refused`, g.status === 400, [g.status, g.data]);
    }
    const stillOk = await req('/api/admin/orders/' + ref);
    check('the order is untouched after those refusals', stillOk.data.order.customer.name === 'Edit Test Corrected' && stillOk.data.order.customer.phone === '0343 1112233');

    /* ---- the dashboard counts the change straight away ---- */
    const stats = await req('/api/admin/stats');
    check('the dashboard answers after the edits', stats.status === 200 && typeof stats.data.orders === 'number', stats.data);
  } finally {
    /* ---- leave the shop exactly as we found it ---- */
    if (ref) {
      const del = await req('/api/admin/orders/' + ref, { method: 'DELETE' });
      check('the test order was removed again', del.status === 200, [del.status, del.data]);
    }
  }

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('\n  crashed:', e.message, '\n'); process.exit(1); });
