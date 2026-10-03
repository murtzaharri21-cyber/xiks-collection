#!/usr/bin/env python3
"""Copy supabase/schema.sql into the CLI's migrations folder.

schema.sql is the file you paste into the Supabase SQL Editor.
Supabase CLI users need the identical SQL as a timestamped migration so that
`supabase db push` applies it. Run this after every edit to schema.sql:

    python3 supabase/make-migration.py
"""
import pathlib, sys

here = pathlib.Path(__file__).resolve().parent
src = here / 'schema.sql'
dst = here / 'migrations' / '0001_initial_schema.sql'
dst.parent.mkdir(exist_ok=True)
dst.write_text(src.read_text(encoding='utf-8'), encoding='utf-8')
print(f'copied {src.name} → {dst.relative_to(here.parent)}  ({dst.stat().st_size} bytes)')
