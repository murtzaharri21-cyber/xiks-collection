#!/usr/bin/env node
/* ============================================================================
   migrate-to-supabase.js — copy everything from the local JSON files into Supabase.

   Usage (from the project folder):

       SUPABASE_URL=https://xxxx.supabase.co \
       SUPABASE_SERVICE_KEY=eyJhbGciOi... \
       node migrate-to-supabase.js

   • products, orders, settings and admin logins are all moved across
   • safe to run twice: products are upserted, orders are skipped if their
     reference already exists
   • run supabase/schema.sql in the Supabase SQL editor FIRST
   ========================================================================== */
'use strict';
const path = require('path');
const fs = require('fs');

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  console.error(`
  Missing credentials.

  Run it like this:

    SUPABASE_URL=https://your-project.supabase.co \\
    SUPABASE_SERVICE_KEY=your-service-role-key \\
    node migrate-to-supabase.js

  Find both in Supabase → Project Settings → API.
  Use the *service_role* key (server side only — never put it in a web page).
`);
  process.exit(1);
}

const DATA = path.join(__dirname, 'data');
const read = (f, fb) => { try { return JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8')); } catch { return fb; } };

(async () => {
  const URL = process.env.SUPABASE_URL.replace(/\/+$/, '');
  const KEY = process.env.SUPABASE_SERVICE_KEY;
  const H = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };

  const call = async (pathname, opts = {}) => {
    const r = await fetch(URL + '/rest/v1/' + pathname, { ...opts, headers: { ...H, ...(opts.headers || {}) } });
    const t = await r.text();
    if (!r.ok) throw new Error(pathname + ' → ' + r.status + ' ' + t.slice(0, 200));
    return t ? JSON.parse(t) : null;
  };

  console.log('\n  Migrating local data → Supabase');
  console.log('  ' + URL + '\n');

  /* ---------- products ---------- */
  const products = read('products.json', []);
  for (const p of products) {
    await call('products?on_conflict=id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify([{
        id: p.id, name: p.name, cat: p.cat || '', price: Number(p.price) || 0,
        was: p.was ?? null, badge: p.badge || '', note: p.note || '',
        rating: Number(p.rating) || 5, colors: p.colors || [], image: p.image,
        active: p.active !== false, sort: Number(p.sort) || 0,
      }]),
    });
  }
  console.log(`  ✓ products   ${products.length} rows`);

  /* ---------- orders ---------- */
  const orders = read('orders.json', []);
  const existing = (await call('orders?select=ref')) || [];
  const have = new Set(existing.map(o => o.ref));
  let moved = 0;
  for (const o of orders) {
    if (have.has(o.ref)) continue;
    await call('orders', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify([{
        ref: o.ref, created_at: o.createdAt, status: o.status, channel: o.channel,
        customer: o.customer, items: o.items, subtotal: o.subtotal, delivery: o.delivery,
        total: o.total, courier: o.courier || '', tracking_no: o.trackingNo || '',
        history: o.history || [],
      }]),
    });
    moved++;
  }
  console.log(`  ✓ orders     ${moved} moved (${have.size} already there)`);

  /* ---------- settings ---------- */
  const settings = read('settings.json', {});
  if (Object.keys(settings).length) {
    await call('settings?on_conflict=id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify([{ id: 1, data: settings }]),
    });
    console.log('  ✓ settings   saved');
  }

  /* ---------- admin logins ---------- */
  const admins = read('admins.json', {});
  for (const [username, a] of Object.entries(admins)) {
    await call('admins?on_conflict=username', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify([{ username, salt: a.salt, hash: a.hash }]),
    });
  }
  console.log(`  ✓ admins     ${Object.keys(admins).length} login(s) — your existing password still works`);

  console.log(`
  Done. Now start the server with the same two variables:

      SUPABASE_URL=${URL} \\
      SUPABASE_SERVICE_KEY=<your key> \\
      node server.js

  It will print  database  Supabase (…)  on startup — that confirms it is live.
  Your data/ folder stays untouched as a backup.
`);
})();
