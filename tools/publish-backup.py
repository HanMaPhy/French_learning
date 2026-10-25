#!/usr/bin/env python3
"""Publish a progress-only backup next to the public site, so another device can pull it with Settings → Backup → Import from the site.
Takes an Export file (Settings → Backup → Export everything) and writes docs/backup.json with the texts and the device settings removed:
only the word boxes, passage and dictée scores, read marks and counters go out, nothing from the corpus. The repository is public, so this is
all that may leave the computer. Then commit and push docs/backup.json.
  python3 tools/publish-backup.py ~/Downloads/allons-y-2026-10-25.json      (no argument: the newest allons-y-*.json in ~/Downloads or backups/)"""
import io, os, sys, json, glob, time
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = sys.argv[1] if len(sys.argv) > 1 else None
if not src:
    cands = glob.glob(os.path.expanduser('~/Downloads/allons-y-*.json')) + glob.glob(os.path.join(ROOT, 'backups', 'allons-y-*.json'))
    if not cands: sys.exit('no allons-y-*.json in ~/Downloads or backups/: export one from Settings → Backup first')
    src = max(cands, key=os.path.getmtime)
o = json.load(io.open(src, encoding='utf8'))
st = o.get('state') if isinstance(o, dict) and isinstance(o.get('state'), dict) else o
if not isinstance(st, dict) or 'words' not in st: sys.exit('%s is not an Allons-y backup' % src)
keep = {k: st[k] for k in ('v', 'words', 'listen', 'read', 'dictee', 'stats', 'updated') if k in st}
out = {'app': 'allons-y', 'exported': int(time.time() * 1000), 'from': os.path.basename(src), 'progressOnly': True, 'state': keep}
fn = os.path.join(ROOT, 'docs', 'backup.json')
io.open(fn, 'w', encoding='utf8').write(json.dumps(out, ensure_ascii=False, separators=(',', ':')))
print('wrote docs/backup.json from %s: %d words, %d passage scores, %d dictées, %d bytes; no texts, no settings' % (os.path.basename(src), len(keep.get('words', {})), len(keep.get('listen', {})), len(keep.get('dictee', {})), os.path.getsize(fn)))
print('now:  git add docs/backup.json && git commit -m "progress backup" && git push   then on the other device: Settings → Backup → Import from the site')
