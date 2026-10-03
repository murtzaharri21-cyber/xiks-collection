# Deploying Xiks Collection on Vercel + Supabase

The store runs as **one static site (`deploy/`) + one serverless function (`api/`)**,
with **all data and photos in Supabase**. Nothing is stored on the server's disk.

---

## Why the admin page did not open

The old code was written for a computer that runs it permanently, like your laptop:

| what the code did                                        | what Vercel does                                              |
| -------------------------------------------------------- | ------------------------------------------------------------- |
| `node server.js` runs forever and answers every request   | no permanent process — each request calls a function that then ends |
| writes `data/`, `data/secret.txt`, `data/ADMIN-LOGIN.txt` | the disk is **read-only** and wiped after every request        |
| saves uploaded photos into `data/uploads/`                | uploads would disappear on the next request                    |

So the server crashed before it could answer anything, and `/admin` had no API behind it.
The fix in this folder:

* `api/[...path].js` — one function that handles **every** `/api/…` request (this is what
  Vercel actually runs; it reuses the same code as `server.js`).
* `vercel.json` — tells Vercel to serve `deploy/` as the website and to open
  `/admin` → `admin.html`, `/track` → `track.html`.
* All data (products, orders, admin login) and all uploaded photos live in **Supabase**,
  so they survive redeploys.
* Every disk write is now optional: with Supabase configured it is never touched.

---

## Step 1 · Create the Supabase project

1. Go to **supabase.com** → *New project*.
   Name it `xiks-collection`, pick a region close to Pakistan (Singapore or Mumbai),
   set a database password and create it. Wait ~2 minutes.
2. Open **SQL Editor → New query**, paste the **whole** contents of
   `supabase/schema.sql`, and press **Run**.
   This creates the tables *and* the `product-photos` storage bucket that admin
   photo uploads use.
3. Open **Project Settings → API** and copy two values:
   * **Project URL** → e.g. `https://abcdefgh.supabase.co` → this is `SUPABASE_URL`
   * the **secret** key → this is `SUPABASE_SERVICE_KEY`

   > The secret key can read and write everything. Keep it private — it belongs in
   > Vercel's settings only, never in a web page or a screenshot.

### ⚠️ Publishable or secret? Use the right one

Supabase shows two kinds of key and they are not interchangeable:

| Key | Starts with | Safe in a browser? | What it can do |
| --- | --- | --- | --- |
| **Publishable** (old name: `anon`) | `sb_publishable_…` | yes — it is public | **read the catalogue only.** Every write is rejected: `new row violates row-level security policy` |
| **Secret** (old name: `service_role`) | `sb_secret_…` / `eyJ…` | **never** | full read + write, bypasses the rules — this is the one the store uses |

If `SUPABASE_SERVICE_KEY` is set to a *publishable* key, the storefront will still display
products, but signing in, saving products, placing orders and uploading photos will all
fail. The site prints `Supabase is not configured on this deployment` or a row-level
security error instead. Fix: Supabase → **Settings → API Keys → Secret keys** → copy (or
create) the secret key → paste it into Vercel as `SUPABASE_SERVICE_KEY` → **redeploy**.

### Doing the same thing with the Supabase CLI

If you prefer the terminal, this project is already set up for it — `supabase/config.toml`
holds your project ref and `supabase/migrations/0001_initial_schema.sql` is the same SQL as
`schema.sql`, so these four commands do exactly what Step 1.2 does:

```bash
supabase login                                    # opens the browser / asks for a
                                                  # token from supabase.com/dashboard/account/tokens
supabase link --project-ref dafxhhrwiwuumjydamqy   # asks for your database password
                                                  # (Settings → Database → Reset if you lost it)
supabase db push                                   # creates the tables + the photo bucket
```

`supabase init` is not needed — `supabase/config.toml` is already in the repo.

**Already ran the schema before the photo bucket existed?** Run
`supabase/photo-bucket.sql` (six lines, also safe to repeat) — or just run the whole
`schema.sql` again, it never deletes data.

`supabase link` and `supabase db push` need your **database password**, not an API key.
If the CLI is more trouble than it is worth, the SQL Editor route (paste `schema.sql`,
press Run) is identical and takes ten seconds — the file is safe to run again at any
time, it never deletes data.

---

## Step 2 · Put these files in your repo

Everything in this folder is ready. The parts Vercel needs:

```
vercel.json                 ← Vercel configuration
package.json                ← tells Vercel this is a Node project
api/[...path].js            ← the function that answers /api/…
server.js  db.js            ← shared logic (used by both Vercel and your laptop)
deploy/                     ← the website that gets published (admin + track + assets)
supabase/schema.sql         ← run once in Supabase (Step 1)
```

`data/`, `assets/`, `photos/`, `real/`, `test/`, `src/` and the build scripts are not
needed by Vercel, but keeping them in the repo is harmless and useful for you.

If you changed anything in `src/`, rebuild before committing:

```bash
python3 build.py        # rewrites deploy/ and the single-file index.html
```

---

## Step 3 · Create the Vercel project

1. Vercel → **Add New → Project** → import your repository.
2. Settings on the import screen:
   * **Framework Preset:** `Other`
   * **Root Directory:** the folder containing `vercel.json` (usually the repo root)
   * **Build Command:** leave empty
   * **Output Directory:** `deploy`
     *(already set inside `vercel.json` — Vercel fills this in for you)*
3. Open **Environment Variables** and add these (apply to Production **and** Preview):

| Name                  | Value                                    | Why |
| --------------------- | ---------------------------------------- | --- |
| `SUPABASE_URL`        | `https://xxxx.supabase.co`               | **required** — where the data lives |
| `SUPABASE_SERVICE_KEY`| the `service_role` key                   | **required** — the password to it |
| `SESSION_SECRET`      | any long random text, 40+ characters     | keeps you signed in across deploys/restarts |
| `ADMIN_USER`          | `xiks`                                   | your admin username |
| `ADMIN_PASSWORD`      | your admin password     | used once, when the admin account is first created |
| `SUPABASE_BUCKET`     | `product-photos`                         | optional; this is the default |

4. Press **Deploy**. It takes about a minute.

   *Optional, for a faster site in Hunza:* the API runs in one region. Adding

   ```json
   "regions": ["sin1"]
   ```

   to `vercel.json` puts it in Singapore — the closest region to Pakistan, and the
   one to pick when creating the Supabase project (Mumbai `ap-south-1` is equally good).

> Environment variables only apply to **new** deployments — after changing one,
> redeploy (Deployments → ⋯ → Redeploy).

---

## Step 4 · Check that everything works

* `https://your-site.vercel.app` → the storefront with all products
* `https://your-site.vercel.app/admin` → the sign-in card → `xiks` + your password
* In the admin panel: **Products → + Add product**, attach a photo → it appears on
  the storefront and the photo URL starts with `https://….supabase.co/storage/…`
* `https://your-site.vercel.app/track` → place a test order and track it
* If the store was empty, Supabase was seeded with the 9 starter products and your
  admin account on the first request.

---

## Running it on your own computer

```bash
node server.js          # http://localhost:8080
```

With no Supabase variables set it uses the `data/*.json` files and saves uploads to
`data/uploads/` — handy for editing the design offline.

To manage the **live** shop from your laptop, open the `.env` file in the project root,
remove the `#` in front of `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`, paste the same values
you put in Vercel, and run `node server.js` again. Products you add then appear on the real
site immediately. (`.env` is in `.gitignore` — it never reaches GitHub.)

---

## If something looks wrong

| Symptom | Fix |
| --- | --- |
| JSON: *"Supabase is not configured on this deployment"* | `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` are missing → add them, then **redeploy** |
| *"Storage bucket product-photos not found"* when uploading | run `supabase/schema.sql` in Supabase (Step 1.2), or set `SUPABASE_BUCKET` to your bucket's name |
| `/admin` shows a 404 page | `vercel.json` + `api/` are not in the repo root, or Output Directory is not `deploy` |
| Store displays products but *nothing* can be saved | `SUPABASE_SERVICE_KEY` holds a **publishable** key. Replace it with the **secret** key and redeploy (see the table in Step 1) |
| Wrong username or password | on the first request the admin is created from `ADMIN_USER`/`ADMIN_PASSWORD`. To change it later use the admin panel's **Settings → Change password** |
| Signed out after every deploy | `SESSION_SECRET` is not set |
| First visit after a quiet period is slow | normal for serverless: the function starts on demand (a second or two) |

---

## How the pieces fit together

```
visitor ──► Vercel CDN ──► deploy/index.html, admin.html, track.html, assets/
                      │
                      └──► /api/…  ──► api/[...path].js ──► server.js (router)
                                                              │
                                                              └──► db.js ──► Supabase (tables)
                                                                          └► Supabase Storage (photos)
```

The same `server.js` also runs directly (`node server.js`) for local work, so the
site behaves identically in both places.
