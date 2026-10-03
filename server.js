#!/usr/bin/env node
/* ============================================================================
   Xiks Collection — store server
   Zero dependencies (Node 18+ core modules only).

   * serves the storefront from ./deploy
   * REST API for products, orders, settings
   * admin panel with password login (scrypt + HMAC-signed session cookie)
   * public order tracking by reference + phone
   * product CRUD including photo upload (base64 JSON -> /uploads)

   Run:   node server.js            (PORT=8080 by default)
   First run creates data/admins.json and prints the generated password once.
   Override with:  ADMIN_USER=... ADMIN_PASSWORD=... node server.js
   ========================================================================== */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('./db');

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'deploy');
const DATA = path.join(ROOT, 'data');
const UPLOADS = path.join(DATA, 'uploads');
const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '0.0.0.0';
const IS_VERCEL = process.env.VERCEL === '1';

if (!db.isSupabase) for (const d of [DATA, UPLOADS]) fs.mkdirSync(d, { recursive: true });

/* ---------------------------------------------------------------- helpers */
const nowISO = () => new Date().toISOString();
/* all persistence now goes through db.js (Supabase or local JSON) */
const money = n => 'Rs ' + Number(n).toLocaleString('en-US');
const uid = (p = '') => p + crypto.randomBytes(6).toString('hex');

/* ------------------------------------------------------------- seed data */
if (IS_VERCEL && !process.env.SESSION_SECRET)
  throw new Error('Set SESSION_SECRET in Vercel project environment variables to keep admin sessions valid across function instances.');
if (!IS_VERCEL && !fs.existsSync(path.join(DATA, 'secret.txt')))
  fs.writeFileSync(path.join(DATA, 'secret.txt'), crypto.randomBytes(48).toString('hex'));
const SECRET = process.env.SESSION_SECRET || fs.readFileSync(path.join(DATA, 'secret.txt'), 'utf8').trim();

/* OPEN_ADMIN=1  ->  the admin panel never asks for a password (anyone with the
   link can manage the shop). Handy while setting things up on your own machine,
   off by default. Start the server without it to require the password again. */
const OPEN_ADMIN = ['1', 'true', 'yes'].includes(String(process.env.OPEN_ADMIN || '').toLowerCase());

const DEFAULT_PRODUCTS = [
  { id:'p1', name:'Xiks Track Pant — Black',    cat:'Track Pants', price:2800, was:null,  badge:'Bestseller', note:'Unisex fit, contrast side stripe — comfort meets street style', rating:4.9, colors:['#1B1B1B','#F2F2F2','#9AA0A6'], image:'assets/images/p1.webp', active:true, sort:1 },
  { id:'p2', name:'GLNZ Track Set',             cat:'Tracksuits',  price:4900, was:null,  badge:'New',        note:'Full set — zip jacket + trouser, everyday street fit',        rating:4.8, colors:['#171717','#EDEDED','#8E8E8E'], image:'assets/images/p2.webp', active:true, sort:2 },
  { id:'p3', name:'Track Pant — Three Colours', cat:'Track Pants', price:2800, was:null,  badge:'',           note:'Red, white or black — brushed inner, zip pockets',            rating:4.8, colors:['#C0392B','#F5F5F5','#1B1B1B'], image:'assets/images/p3.webp', active:true, sort:3 },
  { id:'p4', name:'2-in-1 Jacket — Grey',       cat:'Jackets',     price:7500, was:null,  badge:'Winter Ready', note:'Two layers: waterproof shell + inner — wear together or alone', rating:4.9, colors:['#6B7280','#2F3B4C'], image:'assets/images/p4.webp', active:true, sort:4 },
  { id:'p5', name:'2-Piece Jacket Set',         cat:'Sets',        price:8900, was:null,  badge:'',           note:'Jacket + trouser set, water-resistant, built for the outdoors', rating:4.9, colors:['#4B5563','#3B6EA5'], image:'assets/images/p5.webp', active:true, sort:5 },
  { id:'p6', name:"Men's Winter Sweater",       cat:'Sweaters',    price:3600, was:null,  badge:'Bestseller', note:'Blue, black or grey — warm enough for a Hunza winter',         rating:4.9, colors:['#2E4A7D','#1B1B1B','#8D8D8D'], image:'assets/images/p6.webp', active:true, sort:6 },
  { id:'p7', name:'Xiks 2-in-1 Jacket — Black', cat:'Jackets',     price:7500, was:null,  badge:'',           note:'Hooded shell, sleeve pocket, windproof — our flagship',       rating:5.0, colors:['#141414','#2F3B4C'], image:'assets/images/p7.webp', active:true, sort:7 },
  { id:'p8', name:'Winter Jacket — 3 Colours',  cat:'Jackets',     price:6900, was:8200,  badge:'Sale',       note:'Black, cream or beige — padded, lightweight, everyday warm',  rating:4.8, colors:['#1B1B1B','#E8DFCB','#D9C7A0'], image:'assets/images/p8.webp', active:true, sort:8 },
  { id:'p9', name:'Heavy 2-in-1 Jacket',        cat:'Jackets',     price:8200, was:null,  badge:'Winter Ready', note:'Two layers, fully waterproof — summer shell, winter coat',   rating:5.0, colors:['#1B1B1B','#232F45','#7A7A7A'], image:'assets/images/p9.webp', active:true, sort:9 },
];

const DEFAULT_SETTINGS = {
  storeName: 'Xiks Collection',
  whatsapp: '',
  facebook: '',
  instagram: 'https://www.instagram.com/xiks.collection',
  address: 'KKH Road, Hussaini, Gojal Hunza, Gilgit-Baltistan',
  deliveryNote: 'Courier across Pakistan in 3–5 days · cash on delivery available',
  freeOver: 0,
  currency: 'PKR',
  categories: ['Jackets', 'Track Pants', 'Tracksuits', 'Sweaters', 'Sets', 'Accessories'],
  statuses: ['pending', 'confirmed', 'packed', 'shipped', 'delivered', 'cancelled'],
};

/* First run: if the active database has no products yet, seed it. */
async function seedIfEmpty() {
  try {
    const products = await db.products();
    if (products.length) return;
    console.log('  seeding ' + db.name + ' with the starter catalogue…');
    for (const p of DEFAULT_PRODUCTS) await db.createProduct({ ...p });
    const s = await db.settings();
    if (!s || !s.storeName) await db.saveSettings(DEFAULT_SETTINGS);
  } catch (err) {
    console.error('  ⚠ could not seed the catalogue:', err.message);
  }
}

/* ------------------------------------------------------------ first admin */
async function ensureAdmin() {
  const admins = await db.admins();
  if (Object.keys(admins).length) return;
  if (IS_VERCEL && !process.env.ADMIN_PASSWORD)
    throw new Error('No admin account exists in Supabase. Set ADMIN_USER and ADMIN_PASSWORD in Vercel environment variables to create the first account.');
  const user = process.env.ADMIN_USER || 'admin';
  const pass = process.env.ADMIN_PASSWORD || crypto.randomBytes(6).toString('base64url');
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pass, salt, 64).toString('hex');
  await db.saveAdmin(user, { salt, hash, created: nowISO() });
  if (!IS_VERCEL) {
    fs.writeFileSync(path.join(DATA, 'ADMIN-LOGIN.txt'),
      `Xiks Collection — admin login\n------------------------------\n  username: ${user}\n  password: ${pass}\n\n` +
      `  sign in at:  /admin\n  database:    ${db.label}\n  created:     ${nowISO()}\n`);
  }
  console.log('\n' + '='.repeat(64));
  console.log(' XIKS ADMIN CREATED');
  console.log('   username: ' + user);
  if (IS_VERCEL) console.log('   password set from ADMIN_PASSWORD environment variable');
  else {
    console.log('   password: ' + pass);
    console.log(' (also saved to data/ADMIN-LOGIN.txt)');
  }
  console.log('='.repeat(64) + '\n');
}

/* ------------------------------------------------------------------ auth */
const sign = (payload) => payload + '.' + crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
function makeSession(user, days = 7) {
  return sign(user + '|' + (Date.now() + days * 864e5));
}
/* Same signed value, three ways in: the cookie, an X-Xiks-Token header, or
   Authorization: Bearer. The header path exists because preview panes and
   sandboxed iframes block cookies entirely — the panel must still work there. */
const readToken = (t) => {
  if (!t) return null;
  t = String(t).trim().replace(/^Bearer\s+/i, '');
  const [payload, sig] = t.split('.');
  if (!payload || !sig) return null;
  const expect = crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
  if (sig.length !== expect.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
  const [user, exp] = payload.split('|');
  if (!user || Date.now() > Number(exp)) return null;
  return user;
};
function readSession(cookieHeader) {
  if (!cookieHeader) return null;
  const m = /(?:^|;\s*)xiks_sid=([^;]+)/.exec(cookieHeader);
  if (!m) return null;
  const [payload, sig] = decodeURIComponent(m[1]).split('.');
  if (!payload || !sig) return null;
  const expect = crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
  if (sig.length !== expect.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
  const [user, exp] = payload.split('|');
  if (!user || Date.now() > Number(exp)) return null;
  return user;
}
async function checkPassword(user, pass) {
  const admins = await db.admins();
  const a = admins[user];
  if (!a) return false;
  const h = crypto.scryptSync(pass, a.salt, 64);
  const stored = Buffer.from(a.hash, 'hex');
  return h.length === stored.length && crypto.timingSafeEqual(h, stored);
}

/* ------------------------------------------------------------------ utils */
function send(res, code, body, headers = {}) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
  res.writeHead(code, Object.assign({
    'Content-Type': Buffer.isBuffer(body) ? 'application/octet-stream' : 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  }, headers));
  res.end(buf);
}
/* The panel may be opened inside a sandboxed frame (opaque origin, no cookies),
   so allow any origin. We never use Access-Control-Allow-Credentials with '*',
   and the session travels in a header there — no ambient authority is granted. */
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Xiks-Token, Authorization, Accept',
  'Access-Control-Max-Age': '86400',
};
const ok = (res, data, headers) => send(res, 200, data, Object.assign({}, CORS, headers));
const bad = (res, code, msg) => send(res, code, { error: msg }, CORS);

function body(req, limit = 12 * 1024 * 1024) {
  if (req.body !== undefined) {
    if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return Promise.resolve(req.body);
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body);
    if (/application\/x-www-form-urlencoded/.test(req.headers['content-type'] || '')) {
      return Promise.resolve(Object.fromEntries(new URLSearchParams(raw)));
    }
    try { return Promise.resolve(raw ? JSON.parse(raw) : {}); }
    catch { return Promise.reject(new Error('invalid JSON')); }
  }
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > limit) { reject(new Error('payload too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      if (/application\/x-www-form-urlencoded/.test(req.headers['content-type'] || '')) {
        const out = {};
        for (const [k, v] of new URLSearchParams(raw)) out[k] = v;
        return resolve(out);
      }
      try { resolve(JSON.parse(raw)); } catch (e) { reject(new Error('invalid JSON')); }
    });
    req.on('error', reject);
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8', '.csv': 'text/csv; charset=utf-8',
};

function serveFile(res, filePath, cache = 'public, max-age=3600') {
  fs.stat(filePath, (err, st) => {
    if (err || !st.isFile()) return bad(res, 404, 'Not found');
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': cache,
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

/* -------------------------------------------------------------- orders */
function nextRef(orders) {
  const d = new Date();
  const yymm = String(d.getFullYear()).slice(2) + String(d.getMonth() + 1).padStart(2, '0');
  const seq = orders.filter(o => o.ref.includes('-' + yymm + '-')).length + 1;
  return `XK-${yymm}-${String(seq).padStart(4, '0')}`;
}

function orderPublicView(o) {
  return {
    ref: o.ref, createdAt: o.createdAt, status: o.status, items: o.items, subtotal: o.subtotal,
    delivery: o.delivery, total: o.total, channel: o.channel, courier: o.courier || '',
    trackingNo: o.trackingNo || '', history: o.history, customerCity: o.customer.city,
    customerName: o.customer.name,
  };
}

/* -------------------------------------------------------------- router */
async function handler(req, res) {
  const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  const p = decodeURIComponent(url.pathname);
  const method = req.method.toUpperCase();
  const user = readSession(req.headers.cookie)
            || readToken(req.headers['x-xiks-token'] || req.headers.authorization)
            || readToken(url.searchParams.get('tok'))       /* last resort: proxies that strip custom headers */
            || (OPEN_ADMIN ? 'xiks' : null);               /* open mode: no password at all */

  try {
    /* ---------- API ---------- */
    if (p.startsWith('/api/')) {
      if (method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
      await initialize();

      /* -- public: products -- */
      if (p === '/api/products' && method === 'GET') {
        const all = await db.products();
        return ok(res, {
          products: all.filter(x => x.active !== false)
            .map(x => ({ ...x, image: absoluteImage(x.image) })),
          settings: await publicSettings(),
          db: db.name,
        });
      }

      /* -- public: place an order -- */
      if (p === '/api/orders' && method === 'POST') {
        const b = await body(req);
        const products = await db.products();
        const settings = { ...DEFAULT_SETTINGS, ...(await db.settings()) };
        const items = [];
        for (const it of (b.items || [])) {
          const prod = products.find(x => x.id === it.id);
          if (!prod || prod.active === false) continue;
          const qty = Math.max(1, Math.min(20, parseInt(it.qty, 10) || 1));
          items.push({ id: prod.id, name: prod.name, cat: prod.cat, size: it.size || null,
                       price: prod.price, qty, image: prod.image, line: prod.price * qty });
        }
        if (!items.length) return bad(res, 400, 'No valid items in the order');
        const c = b.customer || {};
        if (!c.name || !String(c.phone || '').replace(/\D/g, '') || !c.address)
          return bad(res, 400, 'Name, phone and address are required');
        if (String(c.phone).replace(/\D/g, '').length < 10)
          return bad(res, 400, 'Please enter a valid phone number');

        const orders = await db.orders();
        const subtotal = items.reduce((s, i) => s + i.line, 0);
        const freeOver = Number(settings.freeOver || 0);
        const delivery = freeOver > 0 && subtotal >= freeOver ? 0 : Number(b.delivery ?? 0);
        const order = {
          ref: nextRef(orders), createdAt: nowISO(), status: 'pending',
          channel: ['website', 'whatsapp', 'instagram'].includes(b.channel) ? b.channel : 'website',
          items, subtotal, delivery, total: subtotal + delivery,
          customer: { name: String(c.name).slice(0, 80), phone: String(c.phone).slice(0, 30),
                      city: String(c.city || '').slice(0, 60), address: String(c.address).slice(0, 300),
                      notes: String(c.notes || '').slice(0, 300) },
          courier: '', trackingNo: '',
          history: [{ status: 'pending', at: nowISO(), note: 'Order received' }],
        };
        await db.createOrder(order);
        return ok(res, { ref: order.ref, total: order.total, subtotal: order.subtotal,
                         delivery: order.delivery, status: order.status, message: 'Order placed' });
      }

      /* -- public: track an order -- */
      if (p === '/api/track' && method === 'GET') {
        const ref = (url.searchParams.get('ref') || '').trim().toUpperCase();
        const phone = (url.searchParams.get('phone') || '').replace(/\D/g, '');
        if (!ref) return bad(res, 400, 'Enter your order number');
        const o = (await db.orders()).find(x => x.ref.toUpperCase() === ref);
        if (!o) return bad(res, 404, 'No order found with that number');
        if (phone && String(o.customer.phone).replace(/\D/g, '').slice(-4) !== phone.slice(-4))
          return bad(res, 403, 'That phone number does not match this order');
        return ok(res, orderPublicView(o));
      }

      if (p === '/api/admin/session' && method === 'GET')
        /* When the session came from the cookie, also hand back the signed token so a
           page that cannot keep cookies can carry it in its link instead. */
        return ok(res, { user: user || null, database: db.label, open: OPEN_ADMIN, token: user ? makeSession(user) : null });

      /* -- admin: login -- */
      if (p === '/api/admin/login' && method === 'POST') {
        const b = await body(req);
        const u = String(b.username || '').trim(), pw = String(b.password || '');
        if (!(await checkPassword(u, pw))) {
          await new Promise(r => setTimeout(r, 500));           // slow down guessing
          return bad(res, 401, 'Wrong username or password');
        }
        /* "Keep me signed in on this device" — the default. A month of not
           typing a password on the owner's own phone or laptop. */
        const days = b.remember === false || b.remember === 'false' || b.remember === '0' ? 7 : 30;
        const token = makeSession(u, days);
        const cookie = `xiks_sid=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${days * 86400}`;
        return ok(res, { user: u, token, days }, { 'Set-Cookie': cookie });
      }
      if (p === '/api/admin/logout' && method === 'POST') {
        return ok(res, { ok: true }, { 'Set-Cookie': 'xiks_sid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0' });
      }

      /* --------- everything below requires a session --------- */
      if (!user) return bad(res, 401, 'Not signed in');

      /* deliberately 200 (not 401) when signed out: this endpoint is polled by the
         storefront + admin login to show connection state, and a 401 would spam
         the browser console with a scary red error for ordinary visitors. */
      if (p === '/api/admin/password' && method === 'POST') {
        const b = await body(req);
        if (!(await checkPassword(user, String(b.current || '')))) return bad(res, 403, 'Current password is wrong');
        const next = String(b.next || '');
        if (next.length < 8) return bad(res, 400, 'New password must be at least 8 characters');
        const admins = await db.admins();
        const salt = crypto.randomBytes(16).toString('hex');
        await db.saveAdmin(user, { salt, hash: crypto.scryptSync(next, salt, 64).toString('hex'),
                                   created: admins[user]?.created, updated: nowISO() });
        return ok(res, { ok: true });
      }

      if (p === '/api/admin/stats' && method === 'GET') {
        const orders = await db.orders();
        const today = nowISO().slice(0, 10);
        const revenue = orders.filter(o => o.status !== 'cancelled').reduce((s, o) => s + o.total, 0);
        return ok(res, {
          orders: orders.length,
          pending: orders.filter(o => o.status === 'pending').length,
          shipped: orders.filter(o => o.status === 'shipped').length,
          delivered: orders.filter(o => o.status === 'delivered').length,
          today: orders.filter(o => o.createdAt.slice(0, 10) === today).length,
          revenue,
          products: (await db.products()).filter(x => x.active !== false).length,
          database: db.label,
          recent: orders.slice(0, 6).map(o => ({ ref: o.ref, createdAt: o.createdAt, status: o.status,
                         total: o.total, name: o.customer.name, city: o.customer.city })),
        });
      }

      /* products (admin) */
      if (p === '/api/admin/products' && method === 'GET')
        return ok(res, { products: await db.products(), database: db.label });

      if (p === '/api/admin/products' && method === 'POST') {
        const b = await body(req);
        const products = await db.products();
        const prod = {
          id: 'p' + uid(),
          name: String(b.name || 'Untitled piece').slice(0, 120),
          cat: String(b.cat || 'Jackets').slice(0, 40),
          price: Math.max(0, Number(b.price) || 0),
          was: b.was ? Math.max(0, Number(b.was)) : null,
          badge: String(b.badge || '').slice(0, 24),
          note: String(b.note || '').slice(0, 240),
          rating: Math.min(5, Math.max(0, Number(b.rating) || 5)),
          colors: Array.isArray(b.colors) ? b.colors.slice(0, 6) : [],
          image: b.image || 'assets/images/p1.webp',
          active: b.active !== false,
          sort: products.length + 1,
          created: nowISO(),
        };
        await db.createProduct(prod);
        return ok(res, { product: prod });
      }

      const pm = /^\/api\/admin\/products\/([\w-]+)$/.exec(p);
      if (pm && (method === 'PATCH' || method === 'PUT')) {
        const b = await body(req);
        const update = {};
        for (const k of ['name', 'cat', 'badge', 'note', 'image']) if (k in b) update[k] = String(b[k]).slice(0, 300);
        if ('price' in b) update.price = Math.max(0, Number(b.price) || 0);
        if ('was' in b) update.was = b.was ? Math.max(0, Number(b.was)) : null;
        if ('rating' in b) update.rating = Math.min(5, Math.max(0, Number(b.rating) || 5));
        if ('active' in b) update.active = !!b.active;
        if ('sort' in b) update.sort = Number(b.sort) || 0;
        if ('colors' in b && Array.isArray(b.colors)) update.colors = b.colors.slice(0, 6);
        const merged = await db.updateProduct(pm[1], update);
        if (!merged) return bad(res, 404, 'Product not found');
        return ok(res, { product: merged });
      }
      if (pm && method === 'DELETE') {
        const done = await db.deleteProduct(pm[1]);
        if (!done) return bad(res, 404, 'Product not found');
        return ok(res, { deleted: pm[1] });
      }

      /* photo upload */
      if (p === '/api/admin/upload' && method === 'POST') {
        const b = await body(req);
        const m = /^data:(image\/(png|jpeg|jpg|webp));base64,(.+)$/i.exec(String(b.dataUrl || ''));
        if (!m) return bad(res, 400, 'Upload a PNG, JPG or WEBP image');
        const buf = Buffer.from(m[3], 'base64');
        if (buf.length > 8 * 1024 * 1024) return bad(res, 400, 'Image must be under 8 MB');
        const ext = m[2].toLowerCase() === 'jpeg' ? 'jpg' : m[2].toLowerCase();
        const name = (b.name || 'photo').replace(/[^\w.-]/g, '').slice(0, 40) || 'photo';
        const file = `${name}-${uid()}.${ext}`;
        if (db.isSupabase) {
          const contentType = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
          const imageUrl = await db.uploadImage(file, buf, contentType);
          return ok(res, { path: imageUrl, bytes: buf.length });
        }
        fs.writeFileSync(path.join(UPLOADS, file), buf);
        return ok(res, { path: 'uploads/' + file, bytes: buf.length });
      }

      /* orders (admin) */
      if (p === '/api/admin/orders' && method === 'GET') {
        let orders = await db.orders();
        const st = url.searchParams.get('status');
        const q = (url.searchParams.get('q') || '').toLowerCase().trim();
        const from = url.searchParams.get('from'), to = url.searchParams.get('to');
        if (st && st !== 'all') orders = orders.filter(o => o.status === st);
        if (from) orders = orders.filter(o => o.createdAt.slice(0, 10) >= from);
        if (to) orders = orders.filter(o => o.createdAt.slice(0, 10) <= to);
        if (q) orders = orders.filter(o =>
          o.ref.toLowerCase().includes(q) || o.customer.name.toLowerCase().includes(q) ||
          String(o.customer.phone).includes(q) || (o.customer.city || '').toLowerCase().includes(q) ||
          o.items.some(i => i.name.toLowerCase().includes(q)));
        return ok(res, { orders });
      }
      if (p === '/api/admin/orders.csv' && method === 'GET') {
        const orders = await db.orders();
        const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
        const rows = [['Ref', 'Date', 'Status', 'Customer', 'Phone', 'City', 'Address', 'Items', 'Subtotal', 'Delivery', 'Total', 'Channel', 'Courier', 'Tracking']];
        for (const o of orders) rows.push([o.ref, o.createdAt, o.status, o.customer.name, o.customer.phone,
          o.customer.city, o.customer.address, o.items.map(i => `${i.name}${i.size ? ' (' + i.size + ')' : ''} x${i.qty}`).join('; '),
          o.subtotal, o.delivery, o.total, o.channel, o.courier || '', o.trackingNo || '']);
        return send(res, 200, '\uFEFF' + rows.map(r => r.map(esc).join(',')).join('\n'),
          { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="xiks-orders.csv"' });
      }
      const om = /^\/api\/admin\/orders\/([\w-]+)$/.exec(p);
      if (om && method === 'GET') {
        const o = (await db.orders()).find(x => x.ref === om[1]);
        return o ? ok(res, { order: o }) : bad(res, 404, 'Order not found');
      }
      if (om && method === 'PATCH') {
        const b = await body(req);
        const o = (await db.orders()).find(x => x.ref === om[1]);
        if (!o) return bad(res, 404, 'Order not found');
        const settings = { ...DEFAULT_SETTINGS, ...(await db.settings()) };
        const patch = {};
        const history = Array.isArray(o.history) ? o.history.slice() : [];
        if (b.status) {
          if (!settings.statuses.includes(b.status)) return bad(res, 400, 'Unknown status');
          if (b.status !== o.status) {
            patch.status = b.status;
            history.push({ status: b.status, at: nowISO(), note: String(b.note || '').slice(0, 200) });
          } else if (b.note) {
            history.push({ status: o.status, at: nowISO(), note: String(b.note).slice(0, 200) });
          }
        } else if (b.note) {
          history.push({ status: o.status, at: nowISO(), note: String(b.note).slice(0, 200) });
        }
        if (history.length !== (o.history || []).length) patch.history = history;
        if ('courier' in b) patch.courier = String(b.courier || '').slice(0, 60);
        if ('trackingNo' in b) patch.trackingNo = String(b.trackingNo || '').slice(0, 60);
        if ('delivery' in b) {
          patch.delivery = Math.max(0, Number(b.delivery) || 0);
          patch.total = o.subtotal + patch.delivery;
        }
        const merged = await db.updateOrder(om[1], patch);
        return ok(res, { order: merged });
      }
      if (om && method === 'DELETE') {
        const done = await db.deleteOrder(om[1]);
        if (!done) return bad(res, 404, 'Order not found');
        return ok(res, { deleted: om[1] });
      }

      /* settings */
      if (p === '/api/admin/settings' && method === 'GET')
        return ok(res, { settings: { ...DEFAULT_SETTINGS, ...(await db.settings()) }, database: db.label });
      if (p === '/api/admin/settings' && method === 'PATCH') {
        const b = await body(req);
        const next = { ...DEFAULT_SETTINGS, ...(await db.settings()), ...b };
        if (Array.isArray(next.statuses)) next.statuses = next.statuses.map(String).slice(0, 10);
        if (Array.isArray(next.categories)) next.categories = next.categories.map(String).slice(0, 20);
        next.freeOver = Number(next.freeOver) || 0;
        const saved = await db.saveSettings(next);
        return ok(res, { settings: saved });
      }

      return bad(res, 404, 'Unknown API route');
    }

    /* ---------- pages ---------- */
    if (method !== 'GET' && method !== 'HEAD') return bad(res, 405, 'Method not allowed');

    const FRESH = 'no-store, no-cache, must-revalidate';
    if (p === '/' || p === '/index.html') return serveFile(res, path.join(PUBLIC, 'index.html'), FRESH);
    if (p === '/admin' || p === '/admin/') return serveFile(res, path.join(PUBLIC, 'admin.html'), FRESH);
    if (p === '/admin.html') return serveFile(res, path.join(PUBLIC, 'admin.html'), FRESH);
    if (p === '/track' || p === '/track/') return serveFile(res, path.join(PUBLIC, 'track.html'), FRESH);
    if (p === '/track.html') return serveFile(res, path.join(PUBLIC, 'track.html'), FRESH);

    /* uploaded photos live outside deploy/ */
    if (p.startsWith('/uploads/')) {
      const f = path.join(UPLOADS, path.basename(p));
      return serveFile(res, f, 'public, max-age=604800');
    }
    /* anything else: static from deploy/ */
    const safe = path.normalize(p).replace(/^(\.\.[/\\])+/, '');
    const filePath = path.join(PUBLIC, safe);
    if (!filePath.startsWith(PUBLIC)) return bad(res, 403, 'Forbidden');
    const ext = path.extname(filePath).toLowerCase();
    const code = ['.html', '.js', '.css', '.json'].includes(ext);
    return serveFile(res, filePath, code ? 'no-store, no-cache, must-revalidate' : 'no-cache');

  } catch (err) {
    console.error('[error]', err.message);
    return bad(res, 500, err.message || 'Server error');
  }
}

/* image paths: '/assets/...' or absolute URL */
function absoluteImage(img) {
  if (!img) return 'assets/images/p1.webp';
  if (/^https?:\/\//.test(img)) return img;
  return img.replace(/^\/+/, '');
}
async function publicSettings() {
  const s = { ...DEFAULT_SETTINGS, ...(await db.settings()) };
  return { storeName: s.storeName, whatsapp: s.whatsapp, facebook: s.facebook, instagram: s.instagram,
           address: s.address, deliveryNote: s.deliveryNote, freeOver: s.freeOver, currency: s.currency };
}

let initialization;
function initialize() {
  if (!initialization) initialization = (async () => {
    await seedIfEmpty();
    await ensureAdmin();
  })();
  return initialization;
}

const server = http.createServer(handler);

if (require.main === module) (async () => {
  try {
    await initialize();
  } catch (e) {
    console.error(`
  Could not reach the database.

    ${e.message}

  Database: ${db.label}
  ${db.isSupabase
      ? '  • Check SUPABASE_URL and SUPABASE_SERVICE_KEY (Project Settings → API).\n  • Have you run supabase/schema.sql in the Supabase SQL editor?'
      : '  • Check that the data/ folder is writable.'}

  Nothing was changed. Fix the above and start the server again.
`);
    process.exit(1);
  }
  server.listen(PORT, HOST, () => {
    console.log(`\n  Xiks Collection store server`);
    console.log(`  storefront  http://${HOST}:${PORT}/`);
    console.log(`  admin       http://${HOST}:${PORT}/admin`);
    console.log(`  track       http://${HOST}:${PORT}/track`);
    console.log(`  database    ${db.label}${db.isSupabase ? '' : '   (set SUPABASE_URL + SUPABASE_SERVICE_KEY to use Supabase)'}`);
    if (OPEN_ADMIN) {
      console.log('');
      console.log('  !  OPEN ADMIN - the panel opens without a password for anyone who has the link.');
      console.log('     Fine while you are setting things up. Start the server without OPEN_ADMIN=1');
      console.log('     before you put the site on the internet.');
    }
    console.log('');
  });
})();

module.exports = { handler, initialize };
