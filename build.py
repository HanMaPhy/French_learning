#!/usr/bin/env python3
"""Build the standalone site. index.html is kept as an Artifact fragment (no doctype, no <html>), so this wraps it in a complete document
with the same reset the Artifact viewer adds, and copies the scripts and data next to it. No dependencies. Run from the project folder.

  python3 build.py            → docs/   the public build: the course only, for GitHub Pages (branch main, folder /docs); phone and computer
  python3 build.py --private  → local/  the same app plus your own corpus: library/*.json bundled as preloaded Mine texts, and audio/
                                 linked next to the page so recordings play without picking a folder. Never committed (see .gitignore).
                                 Serve it:  cd local && python3 -m http.server 8000   then open http://localhost:8000 (a phone on the
                                 same Wi-Fi can use http://<this computer's IP>:8000)."""
import os, shutil, io, sys, json, re, unicodedata, urllib.parse
private = '--private' in sys.argv
root = os.path.dirname(os.path.abspath(__file__)); out = os.path.join(root, 'local' if private else 'docs')
frag = io.open(os.path.join(root, 'index.html'), encoding='utf8').read()
head = ('<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
        '<style>:root{color-scheme:light;box-sizing:border-box}body{margin:0;padding:0;font:14px -apple-system,BlinkMacSystemFont,sans-serif;background:#fff;color:#000}'
        'img{max-width:100%}[hidden]:not([hidden=until-found i]){display:none!important}</style></head><body>\n')
os.makedirs(os.path.join(out, 'data'), exist_ok=True)
for f in sorted(os.listdir(root)):
    if f.startswith('app-') and f.endswith('.js'): shutil.copy(os.path.join(root, f), os.path.join(out, f))
for f in sorted(os.listdir(os.path.join(root, 'data'))):
    if f.endswith('.js'): shutil.copy(os.path.join(root, 'data', f), os.path.join(out, 'data', f))
if private:
    ver = (re.search(r'app-core\.js\?v=(\d+)', frag) or [None, '0'])[1]
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
io.open(os.path.join(out, 'index.html'), 'w', encoding='utf8').write(head + frag + '\n</body></html>\n')
io.open(os.path.join(out, '.nojekyll'), 'w').write('')
print('built %s/ with %d scripts and %d data files' % (os.path.relpath(out, root), len([f for f in os.listdir(out) if f.endswith('.js')]), len(os.listdir(os.path.join(out, 'data')))))
