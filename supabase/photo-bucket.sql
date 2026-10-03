-- ============================================================================
--  Creates the public Storage bucket that admin photo uploads use.
--  Paste into: Supabase dashboard → SQL Editor → New query → Run
--
--  Only needed if you ran an older schema.sql before this bucket was added.
--  Safe to run any number of times.
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('product-photos', 'product-photos', true)
on conflict (id) do nothing;

-- anyone may look at the photos (they are shown on the storefront)…
drop policy if exists "product photos are public" on storage.objects;
create policy "product photos are public" on storage.objects
  for select using (bucket_id = 'product-photos');

-- …but only the server (the secret key, which bypasses these rules) may add or remove them.
