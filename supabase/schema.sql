-- ============================================================================
--  Xiks Collection — Supabase schema
--  Paste this whole file into:  Supabase dashboard → SQL Editor → New query → Run
--  Safe to run more than once.
-- ============================================================================

-- ---------------------------------------------------------------- products --
create table if not exists public.products (
  id          text primary key,
  name        text not null,
  cat         text default '',
  price       numeric not null default 0,
  was         numeric,
  badge       text default '',
  note        text default '',
  rating      numeric default 5,
  colors      jsonb   default '[]'::jsonb,
  image       text,
  active      boolean default true,
  sort        int     default 0,
  created     timestamptz default now(),
  updated     timestamptz
);
create index if not exists products_sort_idx on public.products (sort);

-- ------------------------------------------------------------------ orders --
create table if not exists public.orders (
  ref         text primary key,
  created_at  timestamptz default now(),
  status      text default 'pending',
  channel     text default 'website',
  customer    jsonb default '{}'::jsonb,     -- {name, phone, city, address, notes}
  items       jsonb default '[]'::jsonb,     -- [{id,name,size,price,qty,line,image}]
  subtotal    numeric default 0,
  delivery    numeric default 0,
  total       numeric default 0,
  courier     text default '',
  tracking_no text default '',
  history     jsonb default '[]'::jsonb,     -- [{status, at, note}]
  updated_at  timestamptz default now()
);
create index if not exists orders_created_idx on public.orders (created_at desc);
create index if not exists orders_status_idx  on public.orders (status);

-- ---------------------------------------------------------------- settings --
-- single row (id = 1) holding shop details as JSON
create table if not exists public.settings (
  id   int primary key default 1,
  data jsonb not null default '{}'::jsonb
);
insert into public.settings (id, data)
values (1, '{}'::jsonb)
on conflict (id) do nothing;

-- ------------------------------------------------------------------ admins --
-- password is a scrypt hash + per-user salt, never plain text
create table if not exists public.admins (
  username text primary key,
  salt     text not null,
  hash     text not null,
  created  timestamptz default now(),
  updated  timestamptz
);

-- ============================================================ access rules ==
-- The Node server connects with the *service_role* key and bypasses RLS.
-- These policies only matter if you also read the data from a browser/anon key.
alter table public.products enable row level security;
alter table public.orders   enable row level security;
alter table public.settings enable row level security;
alter table public.admins   enable row level security;

-- public (anon) may read the catalogue and shop settings…
drop policy if exists "products are public" on public.products;
create policy "products are public" on public.products
  for select using (true);

drop policy if exists "settings are public" on public.settings;
create policy "settings are public" on public.settings
  for select using (true);

-- …but NOT orders, and NOT admins. Those stay service-role only.
drop policy if exists "no public order access" on public.orders;
create policy "no public order access" on public.orders
  for select using (false);

drop policy if exists "no public admin access" on public.admins;
create policy "no public admin access" on public.admins
  for select using (false);

-- ================================================================ storage ==
-- Vercel's filesystem is not persistent. Admin-uploaded photos use this public
-- bucket; uploads are authenticated by the server-side service-role key.
insert into storage.buckets (id, name, public)
values ('xiks-uploads', 'xiks-uploads', true)
on conflict (id) do update set public = excluded.public;
