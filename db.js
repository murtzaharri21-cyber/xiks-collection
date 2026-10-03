/* ============================================================================
   db.js — storage layer for the Xiks Collection store.

   Two interchangeable drivers behind one API:

     • SUPABASE   — used automatically when SUPABASE_URL + SUPABASE_SERVICE_KEY
                    are set in the environment (recommended: nothing to maintain,
                    data survives restarts and redeploys, visible in a dashboard).
     • LOCAL JSON — the default fallback: data/*.json files. Used for development,
                    demos, or if Supabase is not configured yet.

   Nothing else in the app needs to know which one is active — driver.name tells you.
   Uses only Node core (fetch is built in from Node 18), so no npm installs.
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA = path.join(__dirname, 'data');
fs.mkdirSync(DATA, { recursive: true });
fs.mkdirSync(path.join(DATA, 'uploads'), { recursive: true });

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY || '';
const USE_SUPABASE = Boolean(SUPABASE_URL && SUPABASE_KEY);
const IS_VERCEL = process.env.VERCEL === '1';

if (!USE_SUPABASE && IS_VERCEL)
  throw new Error('Vercel requires SUPABASE_URL and SUPABASE_SERVICE_KEY; local JSON storage is not persistent.');

/* ============================================================ LOCAL DRIVER */
const local = (() => {
  fs.mkdirSync(DATA, { recursive: true });
  fs.mkdirSync(path.join(DATA, 'uploads'), { recursive: true });
  const read = (f, fb) => { try { return JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8')); } catch { return fb; } };
  const write = (f, o) => {
    const tmp = path.join(DATA, f + '.tmp');
    fs.writeFileSync(tmp, JSON.stringify(o, null, 2));
    fs.renameSync(tmp, path.join(DATA, f));
  };
  return {
    name: 'local',
    label: 'Local JSON files (data/)',
    async all() {
      return {
        products: read('products.json', []),
        orders: read('orders.json', []),
        settings: read('settings.json', {}),
        admins: read('admins.json', {}),
      };
    },
    async saveProducts(list) { write('products.json', list); },
    async saveOrders(list) { write('orders.json', list); },
    async saveSettings(s) { write('settings.json', s); },
    async saveAdmins(a) { write('admins.json', a); },
  };
})();

/* ========================================================= SUPABASE DRIVER */
const supa = (() => {
  const bucket = process.env.SUPABASE_BUCKET || 'xiks-uploads';
  const headers = (extra = {}) => Object.assign({
    apikey: SUPABASE_KEY,
    Authorization: 'Bearer ' + SUPABASE_KEY,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }, extra);

  async function req(pathname, { method = 'GET', body, prefer } = {}) {
    const url = SUPABASE_URL + '/rest/v1/' + pathname;
    const res = await fetch(url, {
      method,
      headers: headers(prefer ? { Prefer: prefer } : {}),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) {
      let msg = text;
      try { const j = JSON.parse(text); msg = j.message || j.hint || j.error || text; } catch { /* plain text */ }
      const err = new Error('Supabase: ' + msg + '  [' + res.status + ']');
      err.status = res.status;
      throw err;
    }
    if (!text) return null;
    try { return JSON.parse(text); } catch { return null; }
  }

  /* product row <-> app object (snake_case <-> camelCase for DB friendliness) */
  const toProduct = r => ({
    id: r.id, name: r.name, cat: r.cat, price: Number(r.price) || 0,
    was: r.was === null || r.was === undefined ? null : Number(r.was),
    badge: r.badge || '', note: r.note || '', rating: Number(r.rating) || 5,
    colors: Array.isArray(r.colors) ? r.colors : (r.colors || []),
    image: r.image, active: r.active !== false, sort: Number(r.sort) || 0,
    created: r.created, updated: r.updated,
  });
  const fromProduct = p => ({
    id: p.id, name: p.name, cat: p.cat || '', price: Number(p.price) || 0,
    was: p.was === undefined || p.was === '' ? null : p.was,
    badge: p.badge || '', note: p.note || '', rating: Number(p.rating) || 5,
    colors: p.colors || [], image: p.image, active: p.active !== false, sort: Number(p.sort) || 0,
    updated: new Date().toISOString(),
  });

  const q = v => encodeURIComponent(v);

  return {
    name: 'supabase',
    label: 'Supabase (' + SUPABASE_URL.replace(/^https?:\/\//, '').split('.')[0] + ')',
    async all() {
      const [products, orders, settingsRows, admins] = await Promise.all([
        req('products?select=*&order=sort.asc'),
        req('orders?select=*&order=created_at.desc'),
        req('settings?select=*&id=eq.1'),
        req('admins?select=*'),
      ]);
      return {
        products: (products || []).map(toProduct),
        orders: (orders || []).map(r => ({
          ref: r.ref, createdAt: r.created_at, status: r.status, channel: r.channel,
          items: r.items || [], subtotal: Number(r.subtotal) || 0,
          delivery: Number(r.delivery) || 0, total: Number(r.total) || 0,
          customer: r.customer || {}, courier: r.courier || '', trackingNo: r.tracking_no || '',
          history: r.history || [], updated: r.updated_at,
        })),
        settings: settingsRows && settingsRows[0] ? settingsRows[0].data || {} : {},
        admins: Object.fromEntries((admins || []).map(a => [a.username, {
          salt: a.salt, hash: a.hash, created: a.created, updated: a.updated,
        }])),
      };
    },
    async saveProducts() { throw new Error('saveProducts: the Supabase driver writes per row'); },
    async saveOrders() { throw new Error('saveOrders: the Supabase driver writes per row'); },
    async saveSettings(s) {
      await req('settings?on_conflict=id', {
        method: 'POST', body: [{ id: 1, data: s }],
        prefer: 'resolution=merge-duplicates,return=minimal',
      });
    },
    async saveAdmins() {
      const all = (await req('admins?select=*')) || [];
      /* only used by the one-off migration; per-user writes use upsertAdmin */
      for (const a of all) { /* no-op */ }
    },

    /* ---- row level operations ---- */
    async upsertProduct(p) {
      const rows = await req('products?on_conflict=id', {
        method: 'POST', body: [fromProduct(p)],
        prefer: 'resolution=merge-duplicates,return=representation',
      });
      return toProduct(rows[0]);
    },
    async patchProduct(id, fields) {
      const rows = await req('products?id=eq.' + q(id), {
        method: 'PATCH', body: fields, prefer: 'return=representation',
      });
      return rows && rows[0] ? toProduct(rows[0]) : null;
    },
    async removeProduct(id) {
      await req('products?id=eq.' + q(id), { method: 'DELETE' });
      return true;
    },
    async insertOrder(o) {
      const rows = await req('orders', {
        method: 'POST', prefer: 'return=representation',
        body: [{
          ref: o.ref, created_at: o.createdAt, status: o.status, channel: o.channel,
          customer: o.customer, items: o.items, subtotal: o.subtotal,
          delivery: o.delivery, total: o.total, courier: o.courier || '',
          tracking_no: o.trackingNo || '', history: o.history || [],
        }],
      });
      return rows && rows[0];
    },
    async patchOrder(ref, fields) {
      const map = { status: 'status', courier: 'courier', trackingNo: 'tracking_no',
                    delivery: 'delivery', total: 'total', history: 'history' };
      const body = {};
      for (const [k, v] of Object.entries(fields)) if (map[k]) body[map[k]] = v;
      body.updated_at = new Date().toISOString();
      const rows = await req('orders?ref=eq.' + q(ref), {
        method: 'PATCH', body, prefer: 'return=representation',
      });
      return rows && rows[0];
    },
    async removeOrder(ref) {
      await req('orders?ref=eq.' + q(ref), { method: 'DELETE' });
      return true;
    },
    async upsertAdmin(username, rec) {
      await req('admins?on_conflict=username', {
        method: 'POST',
        body: [{ username, salt: rec.salt, hash: rec.hash, updated: new Date().toISOString() }],
        prefer: 'resolution=merge-duplicates,return=minimal',
      });
    },
    async uploadImage(file, buffer, contentType) {
      const objectPath = encodeURIComponent(file);
      const response = await fetch(`${SUPABASE_URL}/storage/v1/object/${encodeURIComponent(bucket)}/${objectPath}`, {
        method: 'POST',
        headers: headers({ 'Content-Type': contentType, 'x-upsert': 'true' }),
        body: buffer,
      });
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(`Supabase Storage: ${detail || response.statusText} [${response.status}]`);
      }
      return `${SUPABASE_URL}/storage/v1/object/public/${encodeURIComponent(bucket)}/${objectPath}`;
    },
  };
})();

/* ============================================================== PUBLIC API */
const driver = USE_SUPABASE ? supa : local;

let cache = null;                       // small in-process cache; refreshed on write
async function load() {
  if (process.env.VERCEL === '1') return driver.all();
  if (!cache) cache = await driver.all();
  return cache;
}
const bust = () => { cache = null; };

const api = {
  get name() { return driver.name; },
  get label() { return driver.label; },
  get isSupabase() { return driver.name === 'supabase'; },

  async products() { return (await load()).products.slice().sort((a, b) => (a.sort || 0) - (b.sort || 0)); },
  async orders() {
    const list = (await load()).orders.slice();
    list.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return list;
  },
  async settings() { return (await load()).settings || {}; },
  async admins() { return (await load()).admins || {}; },

  /* ---- products ---- */
  async createProduct(p) {
    p.id = p.id || 'p' + crypto.randomBytes(4).toString('hex');
    if (driver.name === 'supabase') { const row = await driver.upsertProduct(p); bust(); return row; }
    const all = await load();
    all.products.push(p);
    await driver.saveProducts(all.products);
    bust();
    return p;
  },
  async updateProduct(id, fields) {
    if (driver.name === 'supabase') {
      const map = { name: 'name', cat: 'cat', badge: 'badge', note: 'note', image: 'image',
                    price: 'price', was: 'was', rating: 'rating', active: 'active',
                    sort: 'sort', colors: 'colors' };
      const body = {};
      for (const [k, v] of Object.entries(fields)) if (map[k]) body[map[k]] = v;
      const row = await driver.patchProduct(id, body);
      bust();
      return row;
    }
    const all = await load();
    const i = all.products.findIndex(x => x.id === id);
    if (i < 0) return null;
    all.products[i] = { ...all.products[i], ...fields, updated: new Date().toISOString() };
    await driver.saveProducts(all.products);
    bust();
    return all.products[i];
  },
  async deleteProduct(id) {
    if (driver.name === 'supabase') { await driver.removeProduct(id); bust(); return true; }
    const all = await load();
    const i = all.products.findIndex(x => x.id === id);
    if (i < 0) return false;
    all.products.splice(i, 1);
    await driver.saveProducts(all.products);
    bust();
    return true;
  },

  /* ---- orders ---- */
  async createOrder(o) {
    if (driver.name === 'supabase') { const r = await driver.insertOrder(o); bust(); return r; }
    const all = await load();
    all.orders.unshift(o);
    await driver.saveOrders(all.orders);
    bust();
    return o;
  },
  async updateOrder(ref, fields) {
    if (driver.name === 'supabase') { const r = await driver.patchOrder(ref, fields); bust(); return r; }
    const all = await load();
    const o = all.orders.find(x => x.ref === ref);
    if (!o) return null;
    Object.assign(o, fields, { updated: new Date().toISOString() });
    await driver.saveOrders(all.orders);
    bust();
    return o;
  },
  async deleteOrder(ref) {
    if (driver.name === 'supabase') { await driver.removeOrder(ref); bust(); return true; }
    const all = await load();
    const i = all.orders.findIndex(x => x.ref === ref);
    if (i < 0) return false;
    all.orders.splice(i, 1);
    await driver.saveOrders(all.orders);
    bust();
    return true;
  },
  async nextRef() {
    const orders = await api.orders();
    const d = new Date();
    const yymm = String(d.getFullYear()).slice(2) + String(d.getMonth() + 1).padStart(2, '0');
    const seq = orders.filter(o => String(o.ref).includes('-' + yymm + '-')).length + 1;
    return `XK-${yymm}-${String(seq).padStart(4, '0')}`;
  },

  /* ---- settings ---- */
  async saveSettings(patch) {
    const next = { ...(await api.settings()), ...patch };
    await driver.saveSettings(next);
    bust();
    return next;
  },

  /* ---- admins ---- */
  async saveAdmin(username, rec) {
    if (driver.name === 'supabase') await driver.upsertAdmin(username, rec);
    else {
      const all = await load();
      all.admins[username] = rec;
      await driver.saveAdmins(all.admins);
    }
    bust();
  },
  async uploadImage(file, buffer, contentType) {
    if (driver.name !== 'supabase') throw new Error('Image storage requires Supabase on this host');
    return supa.uploadImage(file, buffer, contentType);
  },

  /* ---- one-off migration helper ---- */
  async importAll(snapshot) {
    if (driver.name !== 'supabase') throw new Error('importAll is only for the Supabase driver');
    for (const p of snapshot.products) await supa.upsertProduct(p);
    for (const o of snapshot.orders) { try { await supa.insertOrder(o); } catch (e) { console.log('  order skipped:', o.ref, e.message); } }
    if (snapshot.settings && Object.keys(snapshot.settings).length) await supa.saveSettings(snapshot.settings);
    for (const [u, rec] of Object.entries(snapshot.admins || {})) await supa.upsertAdmin(u, rec);
    bust();
    return true;
  },

  /* kept for compatibility with the old server code */
  bust, load,
};

module.exports = api;
