#!/usr/bin/env node
/* ============================================================================
   test/fake-supabase.js — a tiny stand-in for the Supabase REST (PostgREST)
   API, so the Supabase driver can be tested without a real project.

   Supports the subset db.js uses:
     GET    /rest/v1/<table>?select=*[&order=col.dir][&id=eq.x][&ref=eq.x][&username=...]
     POST   /rest/v1/<table>?on_conflict=<col>     Prefer: resolution=merge-duplicates
     PATCH  /rest/v1/<table>?<col>=eq.<v>
     DELETE /rest/v1/<table>?<col>=eq.<v>

   Run:  node test/fake-supabase.js 54321
   ========================================================================== */
'use strict';
const http = require('http');

const PORT = Number(process.argv[2] || 54321);
const KEY = 'test-service-role-key';

const tables = { products: [], orders: [], settings: [{ id: 1, data: {} }], admins: [] };
let calls = 0;

const fail = (res, code, message) => { res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ message, code })); };

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const table = url.pathname.split('/')[3];       // /rest/v1/products
  if (!url.pathname.startsWith('/rest/v1/')) return fail(res, 404, 'not a REST path');
  if (req.headers.apikey !== KEY) return fail(res, 401, 'bad api key — send the service_role key');
  if (!tables[table]) return fail(res, 404, `relation "public.${table}" does not exist`);
  calls++;

  let raw = '';
  req.on('data', c => raw += c);
  req.on('end', () => {
    let body = null;
    if (raw) { try { body = JSON.parse(raw); } catch { return fail(res, 400, 'invalid JSON body'); } }

    const rows = tables[table];
    const match = (row) => {
      for (const [k, v] of url.searchParams) {
        if (k === 'select' || k === 'order' || k === 'on_conflict' || k === 'limit') continue;
        const m = /^eq\.(.*)$/.exec(v);
        if (!m) continue;
        if (k === 'id' && String(row.id) !== m[1]) return false;
        if (k !== 'id' && String(row[k]) !== m[1]) return false;
      }
      return true;
    };

    if (req.method === 'GET') {
      let out = rows.filter(match);
      const order = url.searchParams.get('order');
      if (order) {
        const [col, dir] = order.split('.');
        out = out.slice().sort((a, b) => {
          const av = a[col], bv = b[col];
          const r = (av === bv) ? 0 : ((av ?? '') > (bv ?? '') ? 1 : -1);
          return dir === 'desc' ? -r : r;
        });
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(out));
    }

    if (req.method === 'POST') {
      const list = Array.isArray(body) ? body : [body];
      const conflict = url.searchParams.get('on_conflict');
      const merge = /merge-duplicates/.test(req.headers.prefer || '');
      for (const item of list) {
        const key = conflict || (table === 'products' ? 'id' : table === 'orders' ? 'ref' : table === 'admins' ? 'username' : 'id');
        const i = rows.findIndex(r => String(r[key]) === String(item[key]));
        if (i >= 0 && merge) rows[i] = { ...rows[i], ...item };
        else if (i >= 0) return fail(res, 409, `duplicate key value violates unique constraint (${key})`);
        else rows.push({ ...item, created: item.created || new Date().toISOString() });
      }
      res.writeHead(201, { 'Content-Type': 'application/json', Prefer: 'return=representation' });
      return res.end(JSON.stringify(/return=representation/.test(req.headers.prefer || '') ? list : null));
    }

    if (req.method === 'PATCH') {
      const hits = rows.filter(match);
      hits.forEach(r => Object.assign(r, body));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(/return=representation/.test(req.headers.prefer || '') ? hits : null));
    }

    if (req.method === 'DELETE') {
      const keep = rows.filter(r => !match(r));
      const removed = rows.length - keep.length;
      tables[table] = keep;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(null));
    }

    return fail(res, 405, 'method not allowed');
  });
}).listen(PORT, '0.0.0.0', () => {
  console.log(`  fake Supabase listening on http://localhost:${PORT}  (key: ${KEY})`);
});

process.on('SIGTERM', () => {
  console.log(`  fake Supabase: ${calls} API calls served`);
  process.exit(0);
});
