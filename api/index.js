/* ============================================================================
   api/index.js — every /api/… request on Vercel lands here.

   Vercel does not run `node server.js`; it invokes this function per request
   with a Node request/response pair. The store's real work happens in
   ../server.js, which is shared with local hosting — this file only adapts:

     • the body, which Vercel parses for us            → passed through as text
     • the URL, which Vercel may rewrite               → rebuilt below

   Vercel has several ways of telling a function which URL was asked for, and
   which one you get depends on the route it generated. `normaliseUrl()` copes
   with all of them, so the store's router always sees /api/<real path>?<query>.

   Set these in Vercel → Project → Settings → Environment Variables:
     SUPABASE_URL            https://xxxx.supabase.co
     SUPABASE_SERVICE_KEY    (secret key)
     SESSION_SECRET          any long random string   (keeps logins alive)
     SUPABASE_BUCKET         product-photos           (optional, for uploads)
   ========================================================================== */
'use strict';

/* If the store's code cannot even be loaded on this host, say why in the
   response instead of letting the platform return an opaque 500. */
let handleRequest = null, loadError = null;
try { ({ handleRequest } = require('../server.js')); }
catch (e) { loadError = e; }

/* Vercel parses the body for us. Hand the store's parser the text a normal
   server would have seen, so both hosts behave identically. */
function rawBodyFrom(req) {
  const ct = (req.headers && req.headers['content-type']) || '';
  const b = req.body;
  if (b === undefined || b === null) return '';
  if (typeof b === 'string') return b;
  if (Buffer.isBuffer(b)) return b.toString('utf8');
  if (/application\/x-www-form-urlencoded/i.test(ct) && typeof b === 'object') {
    return new URLSearchParams(b).toString();
  }
  try { return JSON.stringify(b); } catch { return ''; }
}

/* The store's router wants /api/<path>?<query>. Depending on the route Vercel
   generated, the function may instead receive:
     • the original URL                     /api/admin/orders?x=1     → use as is
     • the literal function path + ?path=   /api/[...path]?path=admin&x=1
     • a path parameter in req.query.path   "products" or ["admin","orders"]
   All three are turned into the first form. */
function normaliseUrl(req) {
  const raw = req.url || '/';
  const qAt = raw.indexOf('?');
  let path = qAt === -1 ? raw : raw.slice(0, qAt);
  const params = new URLSearchParams(qAt === -1 ? '' : raw.slice(qAt + 1));

  const fromQuery = req.query && req.query.path;
  const bracketPath = path.includes('[') || path === '/api' || path === '/api/';

  if (bracketPath) {
    if (Array.isArray(fromQuery) && fromQuery.length) {
      path = '/api/' + fromQuery.map(s => encodeURIComponent(String(s))).join('/');
    } else if (typeof fromQuery === 'string' && fromQuery) {
      path = '/api/' + fromQuery.split('/').map(s => encodeURIComponent(s)).join('/');
    } else {
      path = '/api';
    }
  } else if (!path.startsWith('/api/')) {
    path = '/api' + (path.startsWith('/') ? path : '/' + path);
  }

  params.delete('path');                    // routing detail, not store input
  const query = params.toString();
  return path + (query ? '?' + query : '');
}

const BUILD = 'vercel-adapter-3';

module.exports = async function handler(req, res) {
  res.setHeader('x-xiks-build', BUILD);
  if (loadError) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify({
      error: 'server.js could not be loaded', build: BUILD,
      message: loadError.message,
      stack: String(loadError.stack || '').split('\n').slice(0, 6),
    }));
  }
  try {
    /* Vercel has no writable disk, so the JSON files cannot be used there.
       Say so plainly instead of failing with a confusing filesystem error. */
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.end(JSON.stringify({
        error: 'Supabase is not configured on this deployment',
        fix: 'In Vercel: Project → Settings → Environment Variables, add SUPABASE_URL and '
           + 'SUPABASE_SERVICE_KEY (Supabase → Project Settings → API), then redeploy. '
           + 'Run supabase/schema.sql in the Supabase SQL editor first.',
      }));
    }

    if (typeof req.__rawBody !== 'string') req.__rawBody = rawBodyFrom(req);
    req.url = normaliseUrl(req);

    await handleRequest(req, res);
  } catch (err) {
    console.error('[api]', err && err.stack || err);
    if (res.headersSent) return;
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({
      error: err && err.message ? err.message : 'Server error',
      hint: 'Check that SUPABASE_URL and SUPABASE_SERVICE_KEY are set in Vercel, and that supabase/schema.sql has been run.',
    }));
  }
};
