#!/usr/bin/env python3
"""Turn the annotated word-bank chunks into data/words-<level>.js (see tools/words-select.py for where the chunks come from).

  python3 tools/words-assemble.py CHUNKDIR ANNOTDIR

CHUNKDIR holds the chunks (<name>.tsv: id, word, tag, gender, level, …). ANNOTDIR holds the annotations, <name>.p01.tsv, <name>.p02.tsv, …,
one line per id: id, headword, pos, english, example, translation — or id, DROP, reason (tools/words-check.py checks one chunk's files).
Entries keep the chunk order (level, then frequency). A headword + pos that occurs twice is kept once, at its lowest level."""
import csv, glob, io, json, os, re, sys

LV = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
POS = {'n.m.', 'n.f.', 'n.m./f.', 'n.m.pl.', 'n.f.pl.', 'v.', 'adj.', 'adv.', 'prep.', 'conj.', 'pron.', 'interj.', 'num.', 'phrase'}
# FLELex writes œ as oe (coeur, oeuvre, écoeurer); French spelling has the ligature in -oeu- and -oei- and a few learned words, never in moelle, coefficient
lig = lambda t: re.sub(r'(?<=\bf)oe(?=t)|oe(?=u|il|d[eè]m|soph|cum)', 'œ', re.sub(r'\bOe(?=u|il)', 'Œ', t))
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HEAD = '''/* Allons-y word bank, %s: %d words, most common first (app-words.js). Entry: [french, pos, english, example, translation].
   Level: FLELex-TT, Beacco version (Pintard & François 2020; François, Gala, Watrin & Fairon 2014), CC BY-NC-SA 4.0,
   https://cental.uclouvain.be/cefrlex/flelex/ . Order: frequency in Lexique 3.83 (Boris New & Christophe Pallier), CC BY-SA 4.0,
   http://www.lexique.org . Meanings and sentences written for this app; this file is shared under CC BY-NC-SA 4.0. */
window.FR_BANK = window.FR_BANK || {};
window.FR_BANK.%s = [
'''

def main(chunkdir, annotdir):
    order, meta = {}, {}
    for path in sorted(glob.glob(os.path.join(chunkdir, '*.tsv'))):
        name = os.path.basename(path)[:-4]
        for r in csv.DictReader(open(path, encoding='utf-8'), delimiter='\t'):
            order[r['id']] = (LV.index(r['level']), name, int(r['id'].rsplit('.', 1)[1])); meta[r['id']] = r
    rows, dropped, bad = {}, 0, []
    for path in sorted(glob.glob(os.path.join(annotdir, '*.tsv'))):
        for line in io.open(path, encoding='utf-8'):
            f = line.rstrip('\r\n').split('\t')
            if not f[0] or f[0] == 'id': continue
            if f[0] not in order: bad.append('%s: unknown id %s' % (path, f[0])); continue
            if len(f) >= 2 and f[1] == 'DROP': dropped += 1; rows[f[0]] = None; continue
            if len(f) != 6 or f[2] not in POS or not all(x.strip() for x in f[1:]): bad.append('%s: %s' % (f[0], line.strip()[:120])); continue
            if re.search('[’‘“”  —–]', '\t'.join(f[1:])) or '"' in f[1] + f[4]: bad.append('%s: typography' % f[0]); continue
            rows[f[0]] = [lig(x) for x in f[1:3]] + [f[3], lig(f[4]), f[5]]
    missing = [i for i in order if i not in rows]
    if bad or missing:
        print('\n'.join(bad[:40])); print('%d bad lines, %d ids without a line (first: %s)' % (len(bad), len(missing), ', '.join(missing[:10]))); sys.exit(1)
    seen, out, dups = {}, {L: [] for L in LV}, []
    for i in sorted(rows, key=lambda i: order[i]):
        e = rows[i]
        if not e: continue
        k = e[0] + '|' + e[1]
        if k in seen: dups.append('%s = %s (%s)' % (i, seen[k], k)); continue
        seen[k] = i; out[LV[order[i][0]]].append(e)
    for L in LV:
        p = os.path.join(root, 'data', 'words-%s.js' % L.lower())
        with io.open(p, 'w', encoding='utf-8') as fh:
            fh.write(HEAD % (L, len(out[L]), L))
            fh.write(',\n'.join(json.dumps(e, ensure_ascii=False) for e in out[L]))
            fh.write('\n];\n')
    print('kept %d (%s), dropped %d, %d duplicate headword+pos left out%s' % (sum(len(v) for v in out.values()), ' '.join('%s:%d' % (L, len(out[L])) for L in LV), dropped, len(dups), (': ' + '; '.join(dups[:30])) if dups else ''))

if __name__ == '__main__':
    if len(sys.argv) != 3: sys.exit(__doc__)
    main(*sys.argv[1:])
