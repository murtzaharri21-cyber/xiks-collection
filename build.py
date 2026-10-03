#!/usr/bin/env python3
"""
build.py — assembles the Xiks Collection site.

Outputs
  1. ./index.html          single self-contained file (images inlined as data URIs)
                           -> the file to preview / share / open offline
  2. ./deploy/             the same site as separate files (fast to host on any static host)
"""
import base64, os, re, shutil, pathlib

ROOT = pathlib.Path(__file__).parent
SRC  = ROOT / 'src'
IMG  = ROOT / 'assets' / 'images'
OUT  = ROOT / 'deploy'

html  = (SRC / 'index.html').read_text(encoding='utf-8')
css   = (SRC / 'styles.css').read_text(encoding='utf-8')
js    = (SRC / 'app.js').read_text(encoding='utf-8')

images = sorted(IMG.glob('*.webp'))

# ---------- 1. deploy copy (separate files) ----------
if OUT.exists():
    shutil.rmtree(OUT)
(OUT / 'assets' / 'css').mkdir(parents=True)
(OUT / 'assets' / 'js').mkdir(parents=True)
shutil.copytree(IMG, OUT / 'assets' / 'images')
# extra pages that only make sense on the store server
for extra in ('admin.html', 'track.html'):
    src = SRC / extra
    if src.exists():
        shutil.copy(src, OUT / extra)
(OUT / 'assets' / 'css' / 'styles.css').write_text(css, encoding='utf-8')
(OUT / 'assets' / 'js' / 'app.js').write_text(js, encoding='utf-8')
(OUT / 'index.html').write_text(html, encoding='utf-8')

# ---------- 2. single-file build ----------
data = {f.stem: 'data:image/webp;base64,' + base64.b64encode(f.read_bytes()).decode()
        for f in images}

single = html
single = single.replace('<link rel="stylesheet" href="assets/css/styles.css">',
                        '<style>\n' + css + '\n</style>')
single = single.replace('<script src="assets/js/app.js"></script>',
                        '<script>\n' + js + '\n</script>')

# image paths in markup: assets/images/<name>.webp
single = re.sub(r'assets/images/([A-Za-z0-9_-]+)\.webp',
                lambda m: data.get(m.group(1), m.group(0)), single)

# image path helper inside app.js
single = single.replace("const path = n => `assets/images/${n}.webp`;",
                        "const IMG = " + repr(data) + ";\n  const path = n => IMG[n];")

(ROOT / 'index.html').write_text(single, encoding='utf-8')

# ---------- 3. guard: syntax-check every inline script ----------
# (a stray brace once shipped a dead admin panel — catch it here instead)
import subprocess, tempfile
def check_inline_scripts(pages):
    bad = 0
    for page in pages:
        for i, s in enumerate(re.findall(r'<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>', page, re.S)):
            if not s.strip():
                continue
            with tempfile.NamedTemporaryFile('w', suffix='.js', delete=False, encoding='utf-8') as t:
                t.write(s); tmp = t.name
            r = subprocess.run(['node', '--check', tmp], capture_output=True, text=True)
            os.unlink(tmp)
            if r.returncode:
                name = 'index.html' if page is pages[0] else f'page {i}'
                print(f"  JS SYNTAX ERROR in {name}:\n{r.stderr.strip().splitlines()[:3]}")
                bad += 1
    return bad

pages = [single] + [p.read_text(encoding='utf-8') for p in sorted((ROOT / 'src').glob('*.html')) if p.name != 'index.html']
bad = check_inline_scripts(pages)
print("  inline scripts:", "all valid" if not bad else f"{bad} BROKEN - fix before shipping")

size = (ROOT / 'index.html').stat().st_size / 1024 / 1024
print(f"single-file  index.html        {size:.2f} MB")
print(f"deploy/      index.html + assets/ ({len(images)} images)")
missing = [m for m in re.findall(r'assets/images/([A-Za-z0-9_-]+)\.webp', single)]
print("  unresolved image refs:", missing or "none")
