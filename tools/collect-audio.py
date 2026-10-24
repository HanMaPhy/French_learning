#!/usr/bin/env python3
"""Gather the recordings the Mine texts refer to into one folder, audio/<book>/, so « Choose the folder » in the app has one obvious
target: only the files a text names (the .mp3 when a .wma was converted), nothing else from the books. Hard links where possible, so
no disk space is used twice; a copy otherwise. audio/ is ignored by git like the rest of the corpus.
Run from the project folder after tools/extract-dialogues.py:  python3 tools/collect-audio.py"""
import io, os, re, json, shutil, unicodedata
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CORPUS = os.path.join(ROOT, 'french', 'French', 'en Dialogues')
OUT = os.path.join(ROOT, 'audio')
BOOKS = {'civilisation': 'Civilisation/A0-A1 Civilisation en Dialogues Niveau Débutant', 'vocabulaire-a1': 'Vocabulaire/A0-A1 Vocabulaire en Dialogues Niveau Débutant',
         'vocabulaire-b1': 'Vocabulaire/A2-B1 Vocabulaire en Dialogues Niveau Intermédiaire', 'phonetique': 'Phonétique/A0-A1 Phonétique en Dialogues Niveua Débutnat'}
nfc = lambda s: unicodedata.normalize('NFC', s)
stem = lambda s: re.sub(r'\.[a-z0-9]{2,4}$', '', nfc(s).lower())
total = 0
for book, folder in BOOKS.items():
    fn = os.path.join(ROOT, 'library', 'en-dialogues-%s.json' % book)
    if not os.path.exists(fn): print('no', fn); continue
    src = os.path.join(CORPUS, folder); have = {}
    for f in os.listdir(src):  # the playable file for each stem: .mp3 or .m4a first, .wma only if nothing else
        if re.search(r'\.(mp3|m4a|wma)$', f, re.I): have.setdefault(stem(f), []).append(f)
    dst = os.path.join(OUT, book); os.makedirs(dst, exist_ok=True); n = 0
    for t in json.load(io.open(fn, encoding='utf8'))['texts']:
        cands = sorted(have.get(stem(t['audio']), []), key=lambda f: (f.lower().endswith('.wma'), f))
        if not cands: print('  missing recording for « %s »: %s' % (t['title'], t['audio'])); continue
        f = cands[0]; target = os.path.join(dst, nfc(f))
        if os.path.exists(target): n += 1; continue
        try: os.link(os.path.join(src, f), target)
        except OSError: shutil.copy2(os.path.join(src, f), target)
        n += 1
    wma = [f for f in os.listdir(dst) if f.lower().endswith('.wma')]
    print('  audio/%s: %d files%s' % (book, n, ' (%d still .wma: convert them, see the README)' % len(wma) if wma else '')); total += n
print('%d recordings in %s' % (total, os.path.relpath(OUT, ROOT)))
