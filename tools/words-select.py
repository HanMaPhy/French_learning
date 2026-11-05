#!/usr/bin/env python3
"""Choose the word bank's lemmas (app-words.js, data/words-*.js) and cut them into annotation chunks.

  python3 tools/words-select.py FleLex_TT_Beacco.tsv Lexique383.tsv OUTDIR

Sources (download them yourself; neither is kept in this repository):
  FLELex-TT, Beacco version — https://cental.uclouvain.be/cefrlex/flelex/download/ — CC BY-NC-SA 4.0. Frequencies of lemmas in French-as-a-
    foreign-language textbooks per CEFR level, with a level per lemma inferred from them and the Beacco reference lists
    (Pintard & François 2020, READI workshop; FLELex: François, Gala, Watrin & Fairon, LREC 2014).
  Lexique 3.83 — http://www.lexique.org (Boris New & Christophe Pallier) — CC BY-SA 4.0. Frequencies in films and books; noun genders.

The level of a word is FLELex's. Inside a level the words are ordered by Lexique frequency (mean of films and books, per million), which is also
the order a learner meets them in. FLELex's upper levels are noisy (words of one textbook's topic), so B2, C1 and C2 keep only words that are
also reasonably common in French at large: at least 8, 2.5 and 2.5 per million. Articles, possessive determiners and A1 pronouns are left out.
Each chunk lists id, lemma, tag, Lexique's gender, level, whether this is the word's lowest-level entry, and its other entries; the annotators
(see the brief in README → Word bank) write a gloss and a model sentence for each, or drop it."""
import csv, collections, os, sys

LV = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
MIN = {'A1': 0, 'A2': 1, 'B1': 2, 'B2': 8, 'C1': 2.5, 'C2': 2.5}
TAGMAP = {'NOM': ('NOM',), 'VER': ('VER', 'AUX'), 'ADJ': ('ADJ', 'ADJ:num', 'ADJ:ind', 'ADJ:pos', 'ADJ:int', 'ADJ:dem'), 'ADV': ('ADV',), 'PRP': ('PRE',),
          'KON': ('CON',), 'INT': ('ONO',), 'PRO': ('PRO:per', 'PRO:ind', 'PRO:rel', 'PRO:int', 'PRO:dem', 'PRO:pos')}
STOP = {'de', 'à', 'en', 'et', 'ne', 'que', 'le', 'un', 'du', 'au', 'se', 'y'}

def main(fle_path, lex_path, out):
    lex = collections.defaultdict(lambda: {'f': 0.0, 'g': collections.Counter()})
    for r in csv.DictReader(open(lex_path, encoding='utf-8'), delimiter='\t'):
        e = lex[(r['lemme'], r['cgram'])]
        e['f'] = max(e['f'], (float(r['freqlemfilms2'] or 0) + float(r['freqlemlivres'] or 0)) / 2)
        if r['cgram'] == 'NOM' and r['genre']: e['g'][r['genre']] += float(r['freqfilms2'] or 0) + float(r['freqlivres'] or 0) + 0.001
    sel = []
    for r in csv.DictReader(open(fle_path, encoding='utf-8'), delimiter='\t'):
        w, tag, L = r['word'], r['tag'], r['level']
        if tag.startswith('DET') or tag == 'PRP:det' or (L == 'A1' and tag == 'PRO') or w in STOP or w.startswith('-'): continue
        f, g = 0.0, ''
        for c in TAGMAP.get(tag, ()):
            e = lex.get((w, c))
            if not e: continue
            f = max(f, e['f'])
            if c == 'NOM' and e['g']: g = ''.join(sorted(x for x, v in e['g'].items() if v > 0.2 * sum(e['g'].values())))
        f = round(f, 2)
        multi = any(ch in w for ch in " '-")
        if (f >= MIN[L] and (f > 0 or L == 'A1')) or (multi and float(r['freq_total']) >= 1): sel.append({'w': w, 't': tag, 'lv': L, 'f': f, 'g': g})
    by = collections.defaultdict(list)
    for x in sel: by[x['w']].append(x)
    for xs in by.values():
        xs.sort(key=lambda x: (LV.index(x['lv']), -x['f']))
        for i, x in enumerate(xs): x['primary'] = i == 0; x['others'] = ', '.join('%s %s' % (y['t'], y['lv']) for y in xs if y is not x)
    os.makedirs(out, exist_ok=True)
    for L in LV:
        rs = sorted([x for x in sel if x['lv'] == L], key=lambda x: -x['f'])
        k = max(1, round(len(rs) / 680)); size = -(-len(rs) // k)
        for c in range(k):
            name = '%s-%d' % (L.lower(), c + 1); part = rs[c * size:(c + 1) * size]
            with open(os.path.join(out, name + '.tsv'), 'w', encoding='utf-8') as f:
                f.write('id\tword\ttag\tgender\tlevel\tprimary\tother_entries_of_same_word\n')
                for i, x in enumerate(part): f.write('%s.%d\t%s\t%s\t%s\t%s\t%s\t%s\n' % (name, i + 1, x['w'], x['t'], x['g'], L, 'yes' if x['primary'] else 'no', x['others']))
            print(name, len(part))

if __name__ == '__main__':
    if len(sys.argv) != 4: sys.exit(__doc__)
    main(*sys.argv[1:])
