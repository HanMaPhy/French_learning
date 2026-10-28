#!/usr/bin/env python3
"""Build the standalone site. index.html is kept as an Artifact fragment (no doctype, no <html>); this turns it into a complete site. No
dependencies (the public build uses macOS's own openssl). Run from the project folder.

  python3 build.py                 → docs/   the public build for GitHub Pages (branch main, folder /docs), behind the password: the page, the
                                             scripts and the course are sealed into docs/allons-y.enc and docs/index.html is the lock page
                                             (gate.html). Needs gate.json; see tools/gate.py.
  python3 build.py --set-password  → asks for a new password, writes gate.json, then builds docs/ (GATE_PASSWORD in the environment skips the
                                             prompt, for scripts). Publish, and every device asks for the new password once.
  python3 build.py --open          → docs/   the public build without a password: readable by anyone who finds the address.
  python3 build.py --private       → local/  the open build plus your own corpus: library/*.json bundled as preloaded Mine texts, and audio/
                                             linked next to the page so recordings play without picking a folder. Never committed (see
                                             .gitignore); serve it with serve-private.command or  cd local && python3 -m http.server 8000.
  --out DIR / --gate FILE          → elsewhere than docs|local / another gate file (both for tests)."""
import os, shutil, io, sys, json, re, unicodedata, urllib.parse
root = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.join(root, 'tools')); import gate as G
args = sys.argv[1:]
opt = lambda name: args[args.index(name) + 1] if name in args and args.index(name) + 1 < len(args) else None
private = '--private' in args; gated = not private and '--open' not in args
out = opt('--out') or os.path.join(root, 'local' if private else 'docs'); gate_file = opt('--gate') or G.DEFAULT
frag = io.open(os.path.join(root, 'index.html'), encoding='utf8').read()
ver = int((re.search(r'app-core\.js\?v=(\d+)', frag) or [None, '0'])[1])
head = ('<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
        '<style>:root{color-scheme:light;box-sizing:border-box}body{margin:0;padding:0;font:14px -apple-system,BlinkMacSystemFont,sans-serif;background:#fff;color:#000}'
        'img{max-width:100%}[hidden]:not([hidden=until-found i]){display:none!important}</style></head><body>\n')
os.makedirs(out, exist_ok=True)
if '--set-password' in args:
    g = G.set_password(gate_file, os.environ.get('GATE_PASSWORD'))
    print('new password set (%s holds the derived key, not the password; it is not committed)' % os.path.relpath(gate_file, root))

if gated:
    g = G.load(gate_file) or sys.exit('no %s: run  python3 build.py --set-password  to choose the password for the public site, or  --open  to publish it readable by anyone' % os.path.relpath(gate_file, root))
    # the fragment without its script tags, plus every script it named, in order, each read from the source tree
    scripts = []
    def take(m):
        name = m.group(1); scripts.append({'name': name, 'code': io.open(os.path.join(root, name), encoding='utf8').read()}); return ''
    html = re.sub(r'<script src="([^"?]+)(?:\?v=\d+)?"></script>\n?', take, frag)
    payload = json.dumps({'build': ver, 'html': html, 'scripts': scripts}, ensure_ascii=False).encode('utf8')
    blob = G.seal(g, payload)
    assert G.unseal(g, blob) == payload  # openssl did what we think
    io.open(os.path.join(out, 'allons-y.enc'), 'wb').write(blob)
    page = io.open(os.path.join(root, 'gate.html'), encoding='utf8').read()
    if '{{BUILD}}' not in page: sys.exit('gate.html has no {{BUILD}} placeholder')
    io.open(os.path.join(out, 'index.html'), 'w', encoding='utf8').write(page.replace('{{BUILD}}', str(ver)))
    # nothing readable may stay from an open build: the plain scripts and data, and a plain progress backup (sealed instead)
    for f in os.listdir(out):
        if f.startswith('app-') and f.endswith('.js'): os.remove(os.path.join(out, f))
    shutil.rmtree(os.path.join(out, 'data'), ignore_errors=True)
    plain = os.path.join(out, 'backup.json')
    if os.path.exists(plain):
        io.open(os.path.join(out, 'backup.enc'), 'wb').write(G.seal(g, io.open(plain, 'rb').read())); os.remove(plain); print('sealed the plain backup.json into backup.enc')
    print('public build behind the password set %s: %d scripts and %d KB of page sealed into %s/allons-y.enc (%d KB)' % (g.get('set', '?'), len(scripts), len(payload) // 1024, os.path.relpath(out, root), len(blob) // 1024))
else:
    os.makedirs(os.path.join(out, 'data'), exist_ok=True)
    for f in sorted(os.listdir(root)):
        if f.startswith('app-') and f.endswith('.js'): shutil.copy(os.path.join(root, f), os.path.join(out, f))
    for f in sorted(os.listdir(os.path.join(root, 'data'))):
        if f.endswith('.js'): shutil.copy(os.path.join(root, 'data', f), os.path.join(out, 'data', f))
    for f in ('allons-y.enc', 'backup.enc'):
        if os.path.exists(os.path.join(out, f)): os.remove(os.path.join(out, f))
    if private:
        nfc = lambda s: unicodedata.normalize('NFC', s)
        # the corpus: every import file in library/, in name order, as one preloaded list
        lib = os.path.join(root, 'library'); texts = []
        for f in sorted(os.listdir(lib)) if os.path.isdir(lib) else []:
            if not f.endswith('.json'): continue
            d = json.load(io.open(os.path.join(lib, f), encoding='utf8'))
            texts += d['texts'] if isinstance(d, dict) and isinstance(d.get('texts'), list) else d if isinstance(d, list) else []
        io.open(os.path.join(out, 'data', 'private-texts.js'), 'w', encoding='utf8').write('/* the learner\'s own corpus, bundled by build.py --private; never published */\nwindow.FR_PRIVATE_TEXTS = ' + json.dumps(texts, ensure_ascii=False) + ';\n')
        # the recordings: audio/<book>/<file> linked next to the page, and a map from each file's stem to its URL
        src = os.path.join(root, 'audio'); amap = {}; n = 0
        for book in sorted(os.listdir(src)) if os.path.isdir(src) else []:
            bd = os.path.join(src, book)
            if not os.path.isdir(bd): continue
            od = os.path.join(out, 'audio', book); os.makedirs(od, exist_ok=True)
            for f in sorted(os.listdir(bd)):
                if not re.search(r'\.(mp3|m4a|aac|wav|ogg|oga|opus|flac|webm)$', f, re.I): continue
                target = os.path.join(od, nfc(f))
                if not os.path.exists(target):
                    try: os.link(os.path.join(bd, f), target)
                    except OSError: shutil.copy2(os.path.join(bd, f), target)
                amap[re.sub(r'\.[a-z0-9]{2,4}$', '', nfc(f).lower())] = 'audio/' + urllib.parse.quote(book) + '/' + urllib.parse.quote(nfc(f)); n += 1
        io.open(os.path.join(out, 'data', 'private-audio.js'), 'w', encoding='utf8').write('/* the recordings served next to the page, by stem; written by build.py --private */\nwindow.FR_PRIVATE_AUDIO = ' + json.dumps(amap, ensure_ascii=False, indent=0) + ';\n')
        frag = frag.replace('<script src="app-core.js?v=', '<script src="data/private-texts.js?v=%s"></script>\n<script src="data/private-audio.js?v=%s"></script>\n<script src="app-core.js?v=' % (ver, ver), 1)
        print('private build: %d texts from library/, %d recordings from audio/' % (len(texts), n))
    else: print('OPEN public build: anyone who finds the address can use it; run without --open to put it behind the password')
    io.open(os.path.join(out, 'index.html'), 'w', encoding='utf8').write(head + frag + '\n</body></html>\n')
    print('built %s/ with %d scripts and %d data files' % (os.path.relpath(out, root), len([f for f in os.listdir(out) if f.endswith('.js')]), len(os.listdir(os.path.join(out, 'data')))))
io.open(os.path.join(out, '.nojekyll'), 'w').write('')
io.open(os.path.join(out, 'version.json'), 'w').write(json.dumps({'build': ver}))  # the app polls this to offer a reload when a newer build is published
