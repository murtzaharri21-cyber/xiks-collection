#!/usr/bin/env python3
"""
add-photos.py — swap YOUR real Instagram photos into the site.

How to use
1. Make a folder called  photos/  next to this file (it already exists).
2. Drop your Instagram images in — JPG, PNG or WEBP, any size.
3. Name them so the script knows where each one goes:

      hero.jpg   -> the big hero card on the landing screen
      p1.jpg     -> product 1  (Apricot Blossom Linen Dress)
      p2.jpg     -> product 2  (Blush Silk Drape Blouse)
      p3.jpg     -> product 3  (Valley Wool Longline Coat)
      p4.jpg     -> product 4  (Hand-knit Oat Sweater)
      p5.jpg     -> product 5  (Sand Wide-Leg Trousers)
      p6.jpg     -> product 6  (Rosé Satin Evening Gown)
      p7.jpg     -> product 7  (Structured Leather Tote)
      p8.jpg     -> product 8  (Pearl Drop Earrings)
      p9.jpg     -> product 9  (Handwoven Hunza Wool Shawl)

   No names? That's fine too — unnamed files are assigned in filename order
   starting at p1 (the first one becomes the hero if it is called hero*).

4. Run:   python3 add-photos.py
   It crops every photo to a clean 4:5 portrait, converts to fast WEBP and
   rebuilds index.html + deploy/.

Tip: anything not 4:5 gets centre-cropped (a little tighter at the top so
heads are not cut off). Portrait photos work best — but a square image
(like the hero poster) is kept square and uncropped.
"""
import pathlib, shutil, subprocess, sys

ROOT   = pathlib.Path(__file__).parent
PHOTOS = ROOT / 'photos'
DST    = ROOT / 'assets' / 'images'
SLOTS  = ['hero'] + [f'p{i}' for i in range(1, 10)]
EXTS   = {'.jpg', '.jpeg', '.png', '.webp', '.JPG', '.JPEG', '.PNG'}

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow is required:  pip install pillow")

PHOTOS.mkdir(exist_ok=True)
files = sorted([f for f in PHOTOS.iterdir() if f.suffix in EXTS])
if not files:
    sys.exit(f"No photos found. Put your Instagram images into:\n  {PHOTOS}\n"
             f"then run this script again.")

plan = {}
# 1) honour explicit names (hero.jpg, p3.png, ...)
for f in files:
    if f.stem.lower() in SLOTS:
        plan[f.stem.lower()] = f
# 2) fill the remaining slots in order
rest = [f for f in files if f not in plan.values()]
for slot in SLOTS:
    if slot not in plan and rest:
        plan[slot] = rest.pop(0)

def to_slot(src, slot):
    im = Image.open(src).convert('RGB')
    # A square poster (the hero artwork) is kept square and whole — cropping it to
    # 4:5 would cut off its colour panels and side text.
    if abs(im.width - im.height) / max(im.width, im.height) < 0.05:
        im = im.resize((1080, 1080), Image.LANCZOS)
        out = DST / f'{slot}.webp'
        im.save(out, 'WEBP', quality=86, method=6)
        im.save(DST / f'{slot}.jpg', 'JPEG', quality=90)
        return out
    tw, th = 4 / 5, im.width / im.height
    if th > tw:                      # too wide -> crop the sides
        nw = int(im.height * tw)
        x = (im.width - nw) // 2
        im = im.crop((x, 0, x + nw, im.height))
    else:                            # too tall -> crop top/bottom (favours the top)
        nh = int(im.width / tw)
        y = int((im.height - nh) * 0.34)
        im = im.crop((0, y, im.width, y + nh))
    im = im.resize((900, 1125), Image.LANCZOS)
    out = DST / f'{slot}.webp'
    im.save(out, 'WEBP', quality=82, method=6)
    return out

print("Swapping in your photos\n" + "-" * 46)
for slot in SLOTS:
    if slot in plan:
        out = to_slot(plan[slot], slot)
        print(f"  {plan[slot].name:28s} -> {out.relative_to(ROOT)}  ({out.stat().st_size // 1024} KB)")
    else:
        print(f"  {'(kept generated placeholder)':28s} -> assets/images/{slot}.webp")

print("-" * 46)
subprocess.run([sys.executable, str(ROOT / 'build.py')], check=True)
print("\nDone. Open index.html (single file) or upload the deploy/ folder.")
