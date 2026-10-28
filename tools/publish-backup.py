#!/usr/bin/env python3
"""Publish a progress-only backup next to the public site, so another device can pull it with Settings → Backup → Import from the site.
Takes an Export file (Settings → Backup → Export everything) and keeps only the word boxes, passage and dictée scores, read marks and
counters: no texts, no device settings, nothing from the corpus. With gate.json present (the site is behind the password) it is sealed into
docs/backup.enc with the same key, so it is as unreadable as the app; without one it is written plain as docs/backup.json. Then commit and push.
  python3 tools/publish-backup.py ~/Downloads/allons-y-2026-10-25.json      (no argument: the newest allons-y-*.json in ~/Downloads or backups/)"""
import io, os, sys, json, glob, time
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); sys.path.insert(0, os.path.join(ROOT, 'tools')); import gate as G
src = sys.argv[1] if len(sys.argv) > 1 else None
if not src:
    cands = glob.glob(os.path.expanduser('~/Downloads/allons-y-*.json')) + glob.glob(os.path.join(ROOT, 'backups', 'allons-y-*.json'))
    if not cands: sys.exit('no allons-y-*.json in ~/Downloads or backups/: export one from Settings → Backup first')
    src = max(cands, key=os.path.getmtime)
o = json.load(io.open(src, encoding='utf8'))
st = o.get('state') if isinstance(o, dict) and isinstance(o.get('state'), dict) else o
if not isinstance(st, dict) or 'words' not in st: sys.exit('%s is not an Allons-y backup' % src)
keep = {k: st[k] for k in ('v', 'words', 'listen', 'read', 'dictee', 'stats', 'updated') if k in st}
out = json.dumps({'app': 'allons-y', 'exported': int(time.time() * 1000), 'from': os.path.basename(src), 'progressOnly': True, 'state': keep}, ensure_ascii=False, separators=(',', ':')).encode('utf8')
g = G.load()
fn = os.path.join(ROOT, 'docs', 'backup.enc' if g else 'backup.json')
io.open(fn, 'wb').write(G.seal(g, out) if g else out)
for stale in ('backup.json' if g else 'backup.enc',):
    if os.path.exists(os.path.join(ROOT, 'docs', stale)): os.remove(os.path.join(ROOT, 'docs', stale))
print('wrote docs/%s from %s: %d words, %d passage scores, %d dictées, %d bytes%s; no texts, no settings' % (os.path.basename(fn), os.path.basename(src), len(keep.get('words', {})), len(keep.get('listen', {})), len(keep.get('dictee', {})), os.path.getsize(fn), ', sealed with the site password' if g else ', PLAIN: the site has no password'))
print('now:  git add docs && git commit -m "progress backup" && git push   then on the other device: Settings → Backup → Import from the site')
