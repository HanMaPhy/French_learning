#!/usr/bin/env python3
"""Build the standalone site in docs/: index.html is kept as an Artifact fragment (no doctype, no <html>), so this wraps it in a
complete document with the same reset the Artifact viewer adds, and copies the scripts and data next to it. No dependencies.
Run from the project folder:  python3 build.py   then open docs/index.html, or serve docs/ (GitHub Pages: branch main, folder /docs)."""
import os, shutil, io
root = os.path.dirname(os.path.abspath(__file__)); out = os.path.join(root, 'docs')
frag = io.open(os.path.join(root, 'index.html'), encoding='utf8').read()
head = ('<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
        '<style>:root{color-scheme:light;box-sizing:border-box}body{margin:0;padding:0;font:14px -apple-system,BlinkMacSystemFont,sans-serif;background:#fff;color:#000}'
        'img{max-width:100%}[hidden]:not([hidden=until-found i]){display:none!important}</style></head><body>\n')
os.makedirs(os.path.join(out, 'data'), exist_ok=True)
io.open(os.path.join(out, 'index.html'), 'w', encoding='utf8').write(head + frag + '\n</body></html>\n')
for f in sorted(os.listdir(root)):
    if f.startswith('app-') and f.endswith('.js'): shutil.copy(os.path.join(root, f), os.path.join(out, f))
for f in sorted(os.listdir(os.path.join(root, 'data'))):
    if f.endswith('.js'): shutil.copy(os.path.join(root, 'data', f), os.path.join(out, 'data', f))
io.open(os.path.join(out, '.nojekyll'), 'w').write('')
print('built docs/ with', len([f for f in os.listdir(out) if f.endswith('.js')]), 'scripts and', len(os.listdir(os.path.join(out, 'data'))), 'data files')
