# XIKS COLLECTION — 3D motion storefront

Men's premium outdoor wear from **KKH Road, Hussaini, Gojal Hunza, Gilgit-Baltistan** —
*Premium Quality · Winter Ready · Built to Last.*

Built with real product photography pulled from [@xiks.collection](https://www.instagram.com/xiks.collection),
with real 3D depth, scroll-linked camera motion, drag-to-spin carousels and a working bag.
Vanilla HTML/CSS/JS — no frameworks, no CDN.

---

## Files

| Path | What it is |
|---|---|
| **`index.html`** | **The deliverable.** One self-contained file — CSS, JS and all photos inlined. Works offline, e-mails, or drops onto any host. |
| `deploy/` | Same site as separate files — fastest to upload to a real host. |
| `src/` | Editable source: `index.html`, `styles.css`, `app.js`. |
| `assets/images/` | The real product photos (`.webp` for the site, `.jpg` masters). |
| `real/raw/` | The original files exactly as downloaded from Instagram's CDN. |
| `build.py` | Rebuilds `index.html` + `deploy/` from `src/`. |
| `add-photos.py` | Swap in new photos later (see below). |
| `server.js` | The backend: catalogue, orders, admin API, tracking. |
| `db.js` | Storage layer — **Supabase** if you set the env vars, otherwise local JSON files. |
| `supabase/schema.sql` | The Supabase tables + security rules. Paste it into the SQL editor. |
| `migrate-to-supabase.js` | Copies your current `data/*.json` into Supabase (run once). |
| `.env.example` | The two variables Supabase needs. |
| `test/` | Test scripts (a fake Supabase + an end-to-end check). |

Rebuild after any edit:
```bash
python3 build.py
```

---

## Where the photos came from

Instagram blocks server-side access, so the **`/embed/` endpoint** was rendered in a real browser
session, which returned the profile payload (Xiks_collection · 34 followers · 13 posts) including
10 media URLs on Instagram's CDN. Those were downloaded at full resolution (750–1080 px) and
matched to the catalogue by reading the artwork.

The download is reproducible — `real/raw/` keeps the originals, and the slot mapping lives at the
top of the image-processing step. Photos currently on the site:

| Slot | Post | Product |
|---|---|---|
| `hero` | **the Xiks men's winter jacket poster** (square, kept uncropped) | front-page hero — tap it to open full size |
| `p1` | black track pant, white stripe | Xiks Track Pant — Black · Rs 2,800 |
| `p2` | GLNZ track set | GLNZ Track Set · Rs 4,900 |
| `p3` | three-colour track pant | Track Pant — Three Colours · Rs 2,800 |
| `p4` | "2 in 1 Jacket" 3-colour board | 2-in-1 Jacket — Grey · Rs 7,500 |
| `p5` | 2-piece jacket set | 2-Piece Jacket Set · Rs 8,900 |
| `p6` | "Men's Sweater" blue/black/grey | Men's Winter Sweater · Rs 3,600 |
| `p7` | plain black jacket, side view | Xiks 2-in-1 Jacket — Black · Rs 7,500 |
| `p8` | "Men's Winter Jacket" 3 colours | Winter Jacket — 3 Colours · Rs 6,900 (sale) |
| `p9` | "Men's 2 in 1 Jacket" 2 layers | Heavy 2-in-1 Jacket · Rs 8,200 |

### The hero poster

The front page opens with the shop's own winter-jacket poster as a **full-width banner** —
edge to edge, like a shop sign — with the headline, buttons and shop stats centred
underneath it.

* The poster is kept **square and uncropped** (a 4:5 crop would cut its colour panels and
  side text). A blurred copy of the same artwork fills the sides so the band reaches both
  edges of any screen.
* **Tap it (or press Enter) to read it full size** — Escape or a click closes it. The
  feature icons and colour names are unreadable at banner size, so this matters.
* It fades/drifts in gently on load and is marked `prefers-reduced-motion` friendly.
* File: `assets/images/hero-poster.webp` (1080×1080). The name is versioned on purpose so a
  browser cache can never serve an older hero.

To use a different picture, replace `hero-poster.webp` (and `hero-poster.jpg`) with a new
name — e.g. `hero-winter2.webp` — and update the three references in `src/index.html`.

## Real details used on the page (read from their own post artwork)
* **Address** — KKH Road, Hussaini, Gojal Hunza, Gilgit-Baltistan
* **Instagram** — [@xiks.collection](https://www.instagram.com/xiks.collection) (their posts sign off `@xiks_collection`)
* **Brand values** — Premium Quality · Winter Ready · Built to Last
* **Product claims** — waterproof, windproof, thermal, lightweight, 2-in-1 layers, 3 colours available
* **Call to action** — "DM to order" (the bag's primary button does exactly that)

## Still to confirm (2 minutes, 2 files)
0. **Hero image** — replace `assets/images/hero.webp` (see "The hero poster" above).
1. **WhatsApp number** — `src/app.js`, top: `const WHATSAPP = '923xxxxxxxxx';` → activates the
   WhatsApp order button in the bag (until then it falls back to Instagram DM).
2. **Facebook page URL** — same block: `const FACEBOOK = 'https://facebook.com/...';`
3. **Prices** — `CATALOG` in `src/app.js`. The Rs figures above are placeholders.
4. **Opening hours** — `src/index.html`, search `Monday – Saturday`.

---

# 🛒 The store system (orders + admin)

This is no longer just a static page — there is a small Node server with a real backend.
No npm installs, no database to configure: everything is core Node + JSON files.

## Start it

```bash
cd xiks-collection
node server.js          # PORT=8080 by default, use PORT=3000 node server.js to change
```

For a loopback-only local server in PowerShell, run `$env:HOST='127.0.0.1'; node server.js`.
The default host is `0.0.0.0`, which listens on all network interfaces.

Then open:

| URL | What it is |
|---|---|
| `http://localhost:8080/` | the storefront |
| `http://localhost:8080/admin` | **the admin panel** |
| `http://localhost:8080/track` | customer order tracking |

> **Deploying to Vercel?** The repository includes Vercel routing and a serverless API
> adapter. Configure Supabase and the required Vercel environment variables below before
> deploying. Do not deploy only the `deploy/` folder: the storefront and admin require the
> `/api/*` function.
>
> Other Node hosts can still run the app with `node server.js` behind nginx or their TLS
> proxy. The `deploy/` folder alone gives you only the static storefront.

## Your admin login

On first run, the server creates the admin account and generates a one-time password.
It prints the password and saves it to the local-only `data/ADMIN-LOGIN.txt` file. To
choose credentials yourself, set `ADMIN_USER` and `ADMIN_PASSWORD` before first start.

Sign in at **`/admin`** — there is also an *Admin* button at the bottom of the storefront
and in the footer, so you never have to remember the URL.

Change the password any time in **Admin → Settings → Change password**, or from the
terminal (works with Supabase too):

```bash
node reset-password.js 'a-new-strong-password' xiks     # omit both to generate one
```

Logins are stored as a scrypt hash + per-user salt — never in plain text. Sessions are
HMAC-signed httpOnly cookies that expire after 7 days.

The panel also works inside an embedded preview pane: those frames block cookies and form
submits, so the sign-in button skips the form and the session travels as a signed token
header (with permissive CORS on `/api/*`). On a normal host the cookie is used as before.
The session is carried three ways — cookie, `X-Xiks-Token` header, and a plain `?tok=`
query fallback — and the login also accepts a form-encoded body, so a proxy that strips
custom headers or a browser that blocks cookies cannot lock the shop owner out.

### Signing in

**The username and password are always required.** The Sign in button stays disabled until
both fields are filled, an empty field says which one is missing, and the API refuses every
admin request (401) without a valid session. On first run, the default username is `admin`;
the password is generated randomly unless you set `ADMIN_PASSWORD` before startup.

After a successful sign-in the device is remembered for 30 days (the **Keep me signed in on
this device** box, ticked by default), so clicking the Admin card opens the panel directly
from then on. Untick it if you would rather sign in every time, or press **Sign out**.

### Open mode (off by default — for setup only)

If you ever want the panel to open with no password at all (handy while setting the shop up
on your own machine):

```bash
OPEN_ADMIN=1 node server.js
```

Anyone with the link can then manage the shop — prices, photos, orders, customer phone
numbers — so the server prints a warning at startup and the panel shows a red bar the whole
time it is on. Start the server without `OPEN_ADMIN` before the site goes on the internet.

**Sign in once and clicking Admin opens the panel directly.** Where a browser allows
cookies or session storage the session simply persists; where both are blocked (embedded
preview panes) the panel puts the signed session into its own address — `…/admin?tok=…` —
so reloads, the storefront's Admin card and back/forward all stay signed in.

Under **Settings → Database** there is a **Direct sign-in link**: copy it to your phone's
home screen and opening it goes straight into the panel for 7 days, no password. Treat it
like a key — anyone with that link is signed in.

`test/direct-open.py`, `test/preview-sandbox.py` and `test/locked-down-preview.py` re-check
all of these worst cases any time; if something ever fails, the sign-in card's **Run a
check** prints exactly which request failed and why.

## Tracking orders — two sides

**The customer** opens `/track`, types the order number (`XK-2610-0007`) and sees a
5-step progress bar (Received → Confirmed → Packed → Shipped → Delivered), the items,
the totals, the courier + tracking number and a full timeline. Phone number is optional —
if they add it, the last 4 digits must match.

**You** open `/admin` → **Orders**: search by ref / name / phone / city / product,
filter by status and date, open any order to see the address, the items and the customer's
note, then set the status, courier and tracking number. Every change is stamped on the
order's timeline — which the customer sees instantly on the tracking page.

Order numbers are generated automatically: `XK-` + year/month + a running number,
e.g. `XK-2610-0003` (3rd order of October 2026).

## Managing the store — the four things you asked for

| Task | How |
|---|---|
| **Change a product name** | Admin → Products → **Edit** → change the name → Save |
| **Change a price** | Admin → Products → **Edit** → price (and "Was price" for a sale strikethrough) |
| **Change a photo** | Admin → Products → **Photo** → pick a file (or drag it in). Cropped/converted automatically |
| **Add a new product** | Admin → **+ New product** → name, category, price, photo, description → Save |

The **Products** tab lists your whole catalogue — photo, name, ID, category, price, was-price,
badge and a **Live** switch — with **Edit**, **Photo** and **✕** on every row (✕ deletes, and
asks first; untick **Live** instead if you only want to hide something). Under the sign-in
name in the sidebar you always see which database is in use, e.g. `database: Supabase (xyz)`
or `database: Local JSON files (data/)`. If the panel ever can't reach the server it says so
in plain words instead of showing an empty list.

Everything else you can edit on the same screens: category, badge (`New`, `Sale`,
`Winter Ready`…), rating, colour swatches, short description, and a **Live** switch to hide
a product without deleting it. The storefront reads all of it from the API, so changes
appear on the next page load — no rebuild, no upload.

Also on the dashboard: orders today, pending count, revenue, in-transit count, live product
count, and the latest orders. **Export CSV** downloads every order for Excel or your
accounts. Settings holds your shop name, address, delivery line, WhatsApp / Facebook /
Instagram links and the free-delivery threshold.

## Where the data lives

Two options — the server picks one automatically at startup and prints it:

| Mode | When | Where the data is |
|---|---|---|
| **Local JSON** | default (nothing to set up) | the `data/` folder on the server |
| **Supabase** | when `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` are set | your Supabase Postgres project |

```
data/
  products.json    your catalogue (name, price, photo, colours, live/hidden)
  orders.json      every order with its status history
  settings.json    shop details and links
  admins.json      your login (scrypt hash — not readable)
  secret.txt       session signing key — keep private
  uploads/         photos you upload from the admin panel
  ADMIN-LOGIN.txt  your current username + password (server-side only)
```

Local mode is perfect on your own machine, but **free hosts often wipe the filesystem on
redeploy** — every order would disappear. Supabase keeps the data in a real database, so
the server becomes stateless and safe to redeploy anywhere.

## Using Supabase (recommended for the live site)

**1 · Create the project.** Sign up at [supabase.com](https://supabase.com) → *New project*
(free tier is plenty) → pick a region close to you and save the database password.

**2 · Create the tables.** In the project: **SQL Editor → New query**, paste the whole of
`supabase/schema.sql` and press **Run**. It creates `products`, `orders`, `settings` and
`admins`, plus security rules that keep orders and logins private and the public
`xiks-uploads` bucket used for product photos.

**3 · Give the server the keys.** Project Settings → **API** → copy the *Project URL* and the
*service_role* key (the secret one — server-side only, never in a web page):

```bash
SUPABASE_URL=https://xxxxxxxx.supabase.co \
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6... \
node server.js
```

On a host, add those as environment variables instead. With no products there yet, the
starter catalogue is seeded automatically on first run.

### Vercel deployment

Import the **repository root** into Vercel (not the `deploy/` subfolder). The included
`vercel.json` serves the storefront/admin pages from `deploy/` and sends `/api/*` requests
to the serverless function in `api/[...path].js`.

In **Vercel → Project → Settings → Environment Variables**, add these for Production (and
Preview too, if you use preview deployments):

| Variable | Value |
|---|---|
| `SUPABASE_URL` | Supabase Project URL |
| `SUPABASE_SERVICE_KEY` | Supabase **service_role** key (server-side secret) |
| `SESSION_SECRET` | A long random secret, kept the same across deployments |
| `ADMIN_USER` | Initial admin username, e.g. `admin` |
| `ADMIN_PASSWORD` | Strong initial password (at least 8 characters) |

Generate a session secret locally with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.
Set it in Vercel; do not commit it or change it between deployments, or existing sign-in
sessions will be invalidated. Redeploy after setting the variables.

If the admin account already exists in Supabase, its existing username/password remain in
effect; the admin environment variables are only used to create the first account. To
transfer local products and settings, follow “Move your existing data across” below before
deploying. Vercel does not persist local JSON files, session secrets, or uploaded files;
the app stores data in Supabase and uploaded photos in the `xiks-uploads` Storage bucket.

**4 · Move your existing data across** (once):

```bash
SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node migrate-to-supabase.js
```

Products, orders, shop settings and your admin login are copied over — your password keeps
working. Safe to run twice; it skips anything already there. `data/` stays untouched as a
backup, and if you ever start the server *without* the variables it simply goes back to
using those files.

`.env.example` in the project root lists the two variables with explanations.

## Backups

* **Local mode** — copy the `data/` folder. That is the whole database.
* **Supabase** — Dashboard → Table Editor (or Database → Backups on paid plans). The
  **Export CSV** button in the admin panel gives you orders for Excel either way.

Nothing is sent anywhere else — the site has no third-party trackers, and the browser never
talks to Supabase directly (only the server does, with the service-role key).

## API (if you want to connect something else)

| Method | Endpoint | Who |
|---|---|---|
| POST | `/api/orders` | public — place an order |
| GET | `/api/track?ref=&phone=` | public — track |
| GET | `/api/products` | public — catalogue + settings |
| POST | `/api/admin/login` / `logout` | admin |
| GET | `/api/admin/stats` | admin |
| GET / POST | `/api/admin/orders` | admin — list / none |
| GET / PATCH / DELETE | `/api/admin/orders/:ref` | admin |
| GET | `/api/admin/orders.csv` | admin — CSV export |
| GET / POST | `/api/admin/products` | admin |
| PATCH / DELETE | `/api/admin/products/:id` | admin |
| POST | `/api/admin/upload` | admin — photo upload |
| GET / PATCH | `/api/admin/settings` | admin |
| POST | `/api/admin/password` | admin — change password |
| GET | `/api/admin/session` | admin — who is signed in (`{user:null}` when not) + which database |

Every response from `/api/products`, `/api/admin/session` and `/api/admin/stats` includes
the active database label, which is what the sidebar badge shows.

Security on the admin routes: password check is scrypt with a per-user salt, sessions are
HMAC-signed httpOnly cookies, all admin endpoints 401 without a session, and every price is
re-read from the server's own catalogue when an order arrives — so a tampered browser
cannot change what something costs.

---

## Testing it yourself

```bash
node test/supabase-e2e.js          # full order + admin round-trip against the running server
```

The same script verifies a Supabase setup row-by-row when you point it at your project
(`BASE=… SUPA=… SUPA_KEY=… node test/supabase-e2e.js`), and `node test/fake-supabase.js`
starts a throwaway REST stub if you want to try the Supabase path before creating a real
project.

## Publishing (static-only version)
Any static host works — no build step on the server.
* **Netlify / Vercel / Cloudflare Pages** — drag the `deploy/` folder onto the dashboard
* **GitHub Pages** — push `deploy/` to a `gh-pages` branch
* **Pakistani hosts / cPanel** — upload the contents of `deploy/` to `public_html`
* **Easiest** — send `index.html` on its own; everything including the images is inside that file

A `.pk` domain or any standard domain works; point an A/CNAME record at your host and turn on SSL.
---

## Putting your real Instagram photos in

Instagram blocks automated downloads (login wall + Cloudflare), so the imagery shipped here is
AI-generated in the brand's palette as a stand-in. Swapping in your own photos takes one command:

1. Save your photos from the Instagram app (post → ⋯ → Save / Share → Save image), or use the
   originals from your phone.
2. Drop them into `photos/` and name them for the slot they belong in:
   `hero.jpg`, `p1.jpg` … `p9.jpg` (see the header of `add-photos.py` for the full map).
   Un-named files are assigned in filename order starting at `p1`.
3. Run:
   ```bash
   python3 add-photos.py
   ```
   Each photo is centre-cropped to a 4:5 portrait, converted to fast WEBP and rebuilt into
   `index.html` and `deploy/`.

### Which slot is which
| Slot | Product |
|---|---|
| `hero` | Signature Drape Gown (large hero card) |
| `p1` | Amalfi Linen Midi — €89 |
| `p2` | Blush Silk Drape Blouse — €64 |
| `p3` | Camel Longline Wool Coat — €149 (was €189) |
| `p4` | Oat Cable Knit Sweater — €72 |
| `p5` | Sand Wide-Leg Trousers — €58 |
| `p6` | Rosé Satin Evening Gown — €179 |
| `p7` | Structured Leather Tote — €119 |
| `p8` | Pearl Drop Earrings — €34 |
| `p9` | Handwoven Wool Shawl — €54 |

Prices, names, categories, colours and ratings live in one array at the top of
`src/app.js` → `const CATALOG = [...]`. The 3D lookbook carousel and the review carousel
are just below it (`LOOKS`, `QUOTES`).

---

## The 3D & motion layer

* **Hero** — a real `perspective: 1500px` stage. Pointer movement rotates the camera
  (`rotateY` ±22°, `rotateX` ±16°); scrolling flies the camera *backwards into depth*
  (`translate3d z: -320px`) while the card scales down and dims. Satellite cards, the price
  chip and the glass plate float on separate `translateZ` layers with `data-depth` parallax.
* **Product cards** — pointer-tracked `rotateX/rotateY` tilt per card, image lifted on
  `translateZ(46px)` with a cursor-following light sweep, price/badge floating above the frame.
* **Lookbook** — a true 3D carousel: 8 panels on a 360° ring (`rotateY` + `translateZ(radius)`),
  drag-to-spin, snap-to-step, arrows, auto-rotate and a live caption.
* **Reviews** — a second ring, 4 cards at 90° apart, auto-advancing with a dot rail.
* **Type** — headings split into words that rise out of a 3D fold (`rotateX(-72deg)` → `0`)
  on a stagger; sections reveal from `translateZ(-90px)`.
* **Ambient** — three drifting gradient blobs (blush/sand/lilac) behind everything, a film-grain
  overlay, and a custom two-part cursor that swells over interactive elements.
* Everything is GPU-composited (`transform`/`opacity` only) and driven by **one** rAF loop,
  so it stays smooth. `prefers-reduced-motion` disables the whole layer.

## The shop layer

* 9 products, 9 category filters, quick-view modal with size selector, colour dots, ratings.
* Working bag: add / remove / quantity, subtotal in €, saved to `localStorage`.
* **"Order via Instagram DM"** copies the whole order as a formatted message to the clipboard
  and opens `instagram.com/xiks.collection` — a real checkout-free flow for a boutique that
  sells through DMs. There's also a tap-to-call fallback.
* Illustrated SVG map of Paola with a pulsing boutique marker, opening hours, phone, e-mail.
* Newsletter capture (client-side demo — wire it to Mailchimp/Formspree when you go live).

## How to fill in the last few details (2 files, 5 minutes)

The site ships with clearly-marked placeholders for the things only you know. Nothing else
needs touching.

### 1. Your shop address — `src/index.html`
Search for `Exact shop address` and replace that line with your real address, e.g.
`Main Bazaar, Karimabad, Hunza` or `Aliabad, near the KKH`. The map pin label is already set to Hunza.

### 2. Your WhatsApp + Facebook — `src/app.js` (top of the file)
```js
const WHATSAPP  = '';   // e.g. '923001234567'  — country code, digits only, no + or spaces
const FACEBOOK  = '';   // e.g. 'https://www.facebook.com/your.page'
const INSTAGRAM = 'https://www.instagram.com/xiks.collection';
```
Fill those two in and the **Order on WhatsApp** button in the bag opens a pre-written order
message straight to your WhatsApp, and the Facebook icon in the footer goes to your page.
Until then they politely fall back to Instagram.

### 3. Prices — `src/app.js` → `CATALOG`
The nine pieces are priced as a sensible starting point in PKR and they are **placeholders**:

| Piece | Placeholder price |
|---|---|
| Apricot Blossom Linen Dress | Rs 6,800 |
| Blush Silk Drape Blouse | Rs 4,200 |
| Valley Wool Longline Coat | Rs 14,500 (was 18,000) |
| Hand-knit Oat Sweater | Rs 5,900 |
| Sand Wide-Leg Trousers | Rs 4,800 |
| Rosé Satin Evening Gown | Rs 16,500 |
| Structured Leather Tote | Rs 9,200 |
| Pearl Drop Earrings | Rs 2,400 |
| Handwoven Hunza Wool Shawl | Rs 5,500 |

Also still placeholder: opening hours, the customer reviews (`QUOTES`), the 4.9★ rating and the
"9 pieces" count. Change them in the same two files.

## What IS real (researched)
* Hunza Valley, Gilgit-Baltistan, Pakistan — as you confirmed
* Instagram [@xiks.collection](https://www.instagram.com/xiks.collection) — wired into the header,
  every product card, the Instagram band and the "Order via Instagram DM" button
* Seasonal reality of the valley: apricot blossom in spring, cold mountain evenings,
  Hunza wool / pashmina, hand embroidery, the Karakoram Highway, Baltit Fort, Rakaposhi,
  Aliabad, Karimabad and Altit — all used in the copy and hand-drawn into the map
* A practical checkout-free flow for a Pakistani boutique: WhatsApp order + cash on delivery

## Images
Instagram blocks server-side access (HTTP 429 / login wall on this network) and every mirror
service is behind Cloudflare, so the imagery shipped is **AI-generated in your brand palette**
as a stand-in — it is not your products. Run `add-photos.py` to swap your real photos in:
drop your images into `photos/`, name them `hero.jpg`, `p1.jpg` … `p9.jpg`, then run
`python3 add-photos.py`. It crops to 4:5, converts to WEBP and rebuilds everything.

**Fastest way:** save the photos from the Instagram app (post → ⋯ → Save) and send them to me
here — I'll install them and rebuild in one go.

---
#   x i k s - c o l l e c t i o n  
 