#!/usr/bin/env node
/* ============================================================================
   test/vercel-sim.js — runs the site the way Vercel does.

   Vercel never runs `node server.js`. It calls api/[...path].js per request,
   with the body already parsed, and the path in req.query.path. This script
   reproduces exactly that, so the whole admin + store can be tested before
   deploying — no Vercel account needed.

   Usage:
     # against the fake Supabase (fast, no account):
     node test/fake-supabase.js 54321 &
     SUPABASE_URL=http://localhost:54321 SUPABASE_SERVICE_KEY=test-service-role-key \
     SESSION_SECRET=test-secret PORT=8090 node test/vercel-sim.js &

     # against your real Supabase project:
     SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_KEY=eyJ... \
     node test/vercel-sim.js
   ========================================================================== */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

process.env.VERCEL = '1';                       // make the server behave statelessly
const fn = require(path.join(__dirname, '..', 'api', '[...path].js'));

const PORT = Number(process.env.PORT || 8090);
const PUBLIC = path.join(__dirname, '..', 'deploy');     // what Vercel serves statically
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2' };

/* the same rewrites as vercel.json */
const REWRITES = { '/admin': '/admin.html', '/admin/': '/admin.html', '/track': '/track.html', '/track/': '/track.html' };

function serveStatic(req, res, pathname) {
  let p = REWRITES[pathname] || decodeURIComponent(pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(PUBLIC, path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.end('404 — not found (static file)');
  }
  const ext = path.extname(file).toLowerCase();
  res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
  res.setHeader('Cache-Control', ['.html', '.js', '.css', '.json'].includes(ext)
    ? 'no-store, no-cache, must-revalidate' : 'no-cache');
  res.end(fs.readFileSync(file));
}

http.createServer((req, res) => {
  const [pathname, search] = (req.url || '').split('?');

  /* --- this is what Vercel does before calling the function --- */
  const chunks = [];
  req.on('data', c => chunks.push(c));
  req.on('end', () => {
    if (!pathname.startsWith('/api/')) return serveStatic(req, res, pathname);

    const raw = Buffer.concat(chunks).toString('utf8');
    const ct = req.headers['content-type'] || '';
    // Vercel parses the body; for form posts it becomes an object
    let parsed = raw;
    if (/application\/x-www-form-urlencoded/.test(ct)) parsed = Object.fromEntries(new URLSearchParams(raw));
    else { try { parsed = raw ? JSON.parse(raw) : undefined; } catch { parsed = raw; } }

    const segs = pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
    req.query = { path: segs };
    req.body = parsed;

    Promise.resolve(fn(req, res)).catch(err => {
      if (!res.headersSent) { res.statusCode = 500; res.end(JSON.stringify({ error: err.message })); }
    });
  });
}).listen(PORT, '0.0.0.0', () => {
  console.log(`  Vercel simulator → http://localhost:${PORT}`);
  console.log(`  static files  → deploy/   (rewrites: /admin, /track)`);
  console.log(`  api function  → api/[...path].js   stateless=1   db=${process.env.SUPABASE_URL || '(local files)'}`);
});
