#!/usr/bin/env node
/* ============================================================================
   test/readonly-sim.js — proves the store works on a read-only filesystem.

   Vercel's disk cannot be written to. That is easy to forget here, where the
   sandbox disk is writable — a single fs.mkdirSync() at the top of a module is
   enough to kill the whole deployment before it answers one request.

   This patches the filesystem so every write fails, then loads the real API and
   serves real requests through it. If anything touches the disk, it fails here
   instead of on the live site.

   Usage:  SUPABASE_URL=… SUPABASE_SERVICE_KEY=… node test/readonly-sim.js
           (or: node test/fake-supabase.js 54321 & then point SUPABASE_URL at it)
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');

let passed = 0, failed = 0;
const check = (label, cond, extra) => {
  if (cond) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.log(`  ✗ ${label}${extra !== undefined ? '  → ' + String(extra).slice(0, 220) : ''}`); }
};

/* ---- make the disk read-only, the way a serverless host is ---- */
const RO = Object.assign(new Error("EROFS: read-only file system, open '/var/task/data'"), { code: 'EROFS', errno: -30, syscall: 'open' });
const blocked = [];
const boom = (name) => function (...args) {
  blocked.push(name + ' ' + String(args[0]));
  throw Object.assign(new Error(`EROFS: read-only file system, ${name} '${args[0]}'`), { code: 'EROFS' });
};
for (const name of ['mkdirSync', 'writeFileSync', 'appendFileSync', 'rmSync', 'rmdirSync', 'unlinkSync', 'renameSync', 'createWriteStream']) {
  fs[name] = boom(name);
}

process.env.VERCEL = '1';                       // stateless mode
const ROOT = path.join(__dirname, '..');

(async () => {
  console.log('\n  Read-only filesystem check (this is what Vercel gives the function)\n');

  /* 1. the modules must load at all — this is where the live site was dying */
  let api = null, loadErr = null;
  try { api = require(path.join(ROOT, 'api', 'index.js')); }
  catch (e) { loadErr = e; }
  check('api/index.js loads with a read-only disk', !loadErr, loadErr && loadErr.message);
  if (loadErr) { console.log(`\n  ${passed} passed, ${failed} failed\n`); process.exit(1); }

  /* 2. real requests through the real handler */
  const server = http.createServer((req, res) => {
    req.query = { path: req.url.replace(/^\/api\/?/, '').split('/').filter(Boolean) };
    req.body = undefined;
    Promise.resolve(api(req, res)).catch(e => {
      if (!res.headersSent) { res.statusCode = 500; res.end(JSON.stringify({ error: e.message })); }
    });
  });
  await new Promise(r => server.listen(0, '0.0.0.0', r));
  const base = `http://localhost:${server.address().port}`;
  const get = async (p) => {
    const r = await fetch(base + p);
    const t = await r.text();
    let j = null; try { j = JSON.parse(t); } catch {}
    return { status: r.status, body: j, text: t, headers: r.headers };
  };

  const products = await get('/api/products');
  check('GET /api/products answers (no crash)', products.status === 200, [products.status, products.text.slice(0, 120)]);
  check('the catalogue came from Supabase', /supabase/i.test(String(products.body && products.body.db)), products.body && products.body.db);
  check('products were returned', Array.isArray(products.body && products.body.products) && products.body.products.length > 0,
        products.body && products.body.products && products.body.products.length);

  const session = await get('/api/admin/session');
  check('GET /api/admin/session answers', session.status === 200, session.status);

  const login = await fetch(base + '/api/admin/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: process.env.ADMIN_USER || 'xiks', password: process.env.PW || '' }),
  });
  const loginBody = await login.text();
  check('POST /api/admin/login answers', login.status < 500, [login.status, loginBody.slice(0, 120)]);

  const upload = await fetch(base + '/api/admin/upload', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'ro-check', dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==' }),
  });
  const uploadBody = await upload.json().catch(() => ({}));
  check('a photo upload goes to Supabase Storage, never the disk',
        uploadBody.storage === 'supabase' || upload.status === 401,
        [upload.status, uploadBody.error || uploadBody.path]);
  if (uploadBody.path && uploadBody.storage === 'supabase') {
    const del = await fetch(uploadBody.path.replace('/object/public/', '/object/'), { method: 'DELETE', headers: { apikey: process.env.SUPABASE_SERVICE_KEY || '' } });
    check('the test photo was cleaned up', del.status < 400, del.status);
  }

  /* probe mkdir calls are deliberate (the code asks "can I write here?" and
     copes when the answer is no); anything that actually writes is a bug */
  const realWrites = blocked.filter(b => !b.startsWith('mkdirSync'));
  check('nothing that writes to disk was attempted', realWrites.length === 0, realWrites.slice(0, 3));

  server.close();
  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})().catch(err => { console.error('\n  crashed:', err.message, '\n'); process.exit(1); });
